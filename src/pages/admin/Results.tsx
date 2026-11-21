import React, { useState, useEffect, useMemo } from 'react';
import { collection, query, getDocs, doc, deleteDoc, updateDoc } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../../lib/firebase';
import { Result, Exam } from '../../types';
import { Trash2, Search, BookOpen, X } from 'lucide-react';
import ResultCard from '../../components/result/ResultCard';
import {
  BOOK_NAME_SUGGESTIONS,
  isNonSubjectColumn,
  loadBookMappings,
  normalizeClassKey,
  saveBookMappings,
  sortSubjectNames,
} from '../../lib/subjectBookMappings';

export default function Results() {
  const [results, setResults] = useState<Result[]>([]);
  const [exams, setExams] = useState<Exam[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedExamFilter, setSelectedExamFilter] = useState('');
  
  const [viewResult, setViewResult] = useState<Result | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [isDeletingAll, setIsDeletingAll] = useState(false);

  const [isBookModalOpen, setIsBookModalOpen] = useState(false);
  const [bookExamId, setBookExamId] = useState('');
  const [bookClass, setBookClass] = useState('');
  const [classSubjectInputs, setClassSubjectInputs] = useState<Record<string, string>>({});
  const [updatingBooks, setUpdatingBooks] = useState(false);
  const [bookUpdateMsg, setBookUpdateMsg] = useState('');

  const fetchData = async () => {
    setLoading(true);
    try {
      const [resultsSnap, examsSnap] = await Promise.all([
        getDocs(query(collection(db, 'results'))),
        getDocs(query(collection(db, 'exams')))
      ]);
      setResults(resultsSnap.docs.map(d => ({ id: d.id, ...d.data() } as Result)));
      setExams(examsSnap.docs.map(d => ({ id: d.id, ...d.data() } as Exam)));
    } catch (e) {
      handleFirestoreError(e, OperationType.GET, 'results');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const confirmDelete = async () => {
    if (!deletingId) return;
    try {
      await deleteDoc(doc(db, 'results', deletingId));
      fetchData();
      setDeletingId(null);
    } catch (e) {
      handleFirestoreError(e, OperationType.DELETE, 'results');
    }
  };

  const confirmDeleteAll = async () => {
    try {
      setLoading(true);
      const snapshot = await getDocs(collection(db, 'results'));
      const promises = snapshot.docs.map(d => deleteDoc(doc(db, 'results', d.id)));
      await Promise.all(promises);
      setIsDeletingAll(false);
      fetchData();
    } catch (e) {
      handleFirestoreError(e, OperationType.DELETE, 'results');
      setLoading(false);
    }
  };

  const handleTogglePublish = async (result: Result) => {
    try {
      const newStatus = result.status === 'Published' ? 'Draft' : 'Published';
      await updateDoc(doc(db, 'results', result.id!), { status: newStatus, updatedAt: Date.now() });
      fetchData();
    } catch (e) {
      handleFirestoreError(e, OperationType.UPDATE, 'results');
    }
  };

  const filteredResults = results.filter(r => {
    if (selectedExamFilter && r.examId !== selectedExamFilter) return false;
    const q = searchTerm.toLowerCase();
    return (
      (r.studentName || '').toLowerCase().includes(q) ||
      (r.rollNumber || '').toLowerCase().includes(q) ||
      (r.studentId || '').toLowerCase().includes(q) ||
      (r.className || '').toLowerCase().includes(q)
    );
  });

  const availableClassesForBookModal = useMemo(() => {
    const clsSet = new Set<string>();
    results.forEach(r => {
      if (bookExamId && r.examId !== bookExamId) return;
      clsSet.add((r.className || '').trim() || 'General');
    });
    return Array.from(clsSet).sort((a, b) => a.localeCompare(b));
  }, [results, bookExamId]);

  const subjectsInSelectedBookClass = useMemo(() => {
    if (!bookClass) return [] as { name: string; totalSample: number }[];
    const subTotals = new Map<string, number>();
    results.forEach(r => {
      if (bookExamId && r.examId !== bookExamId) return;
      const cls = (r.className || '').trim() || 'General';
      if (cls !== bookClass) return;
      (r.subjects || []).forEach(s => {
        const name = (s.subjectName || '').trim();
        if (isNonSubjectColumn(name)) return;
        if (!subTotals.has(name)) subTotals.set(name, s.totalMarks);
      });
    });
    return sortSubjectNames(Array.from(subTotals.keys())).map(name => ({
      name,
      totalSample: subTotals.get(name) || 100,
    }));
  }, [results, bookExamId, bookClass]);

  const openBookModal = () => {
    setBookExamId(selectedExamFilter || '');
    setBookUpdateMsg('');
    setIsBookModalOpen(true);
  };

  useEffect(() => {
    if (!isBookModalOpen) return;
    if (availableClassesForBookModal.length > 0 && !availableClassesForBookModal.includes(bookClass)) {
      setBookClass(availableClassesForBookModal[0]);
    }
  }, [isBookModalOpen, availableClassesForBookModal, bookClass]);

  useEffect(() => {
    if (!isBookModalOpen || !bookClass) return;
    const saved = loadBookMappings();
    const clsMap = saved[normalizeClassKey(bookClass)] || {};
    const initial: Record<string, string> = {};
    subjectsInSelectedBookClass.forEach(s => {
      initial[s.name] = clsMap[s.name] || '';
    });
    setClassSubjectInputs(initial);
  }, [isBookModalOpen, bookClass, subjectsInSelectedBookClass]);

  const handleSaveBookNames = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!bookClass) return;

    const activeRenames: Record<string, string> = {};
    for (const [oldName, newName] of Object.entries(classSubjectInputs)) {
      const trimmed = String(newName ?? '').trim();
      if (trimmed && trimmed !== oldName) {
        activeRenames[oldName] = trimmed;
      }
    }

    if (Object.keys(activeRenames).length === 0) {
      setBookUpdateMsg('Please enter at least one new book name before saving.');
      return;
    }

    setUpdatingBooks(true);
    setBookUpdateMsg('');

    try {
      const targets = results.filter(r => {
        if (bookExamId && r.examId !== bookExamId) return false;
        const cls = (r.className || '').trim() || 'General';
        return cls === bookClass && Boolean(r.id);
      });

      let updatedCount = 0;
      const now = Date.now();

      for (let i = 0; i < targets.length; i += 15) {
        const batch = targets.slice(i, i + 15);
        await Promise.all(
          batch.map(async (r) => {
            let changed = false;
            const updatedSubjects = (r.subjects || []).map(sub => {
              const replacement = activeRenames[sub.subjectName];
              if (replacement) {
                changed = true;
                return { ...sub, subjectName: replacement };
              }
              return sub;
            });
            if (changed && r.id) {
              await updateDoc(doc(db, 'results', r.id), {
                subjects: updatedSubjects,
                updatedAt: now,
              });
              updatedCount++;
            }
          })
        );
      }

      // Persist mappings for future Excel imports
      const saved = loadBookMappings();
      const clsKey = normalizeClassKey(bookClass);
      saved[clsKey] = { ...(saved[clsKey] || {}), ...activeRenames };
      saveBookMappings(saved);

      setBookUpdateMsg(`Successfully updated book names for ${updatedCount} student result(s) in ${bookClass}.`);
      await fetchData();
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, 'results');
    } finally {
      setUpdatingBooks(false);
    }
  };

  if (viewResult) {
    const exam = exams.find(e => e.id === viewResult.examId);
    return (
      <div className="space-y-4">
        <button onClick={() => setViewResult(null)} className="text-blue-600 font-medium hover:underline mb-4 block">
          &larr; Back to Results
        </button>
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          <ResultCard result={viewResult} exam={exam} />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap justify-between items-center gap-3">
        <h2 className="text-2xl font-bold text-slate-800">Results Management</h2>
        <div className="flex flex-wrap gap-3">
          <button
            onClick={openBookModal}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-blue-700 transition-colors flex items-center shadow-sm"
          >
            <BookOpen className="w-5 h-5 mr-2" /> Set Book Names
          </button>
          <button
            onClick={() => setIsDeletingAll(true)}
            className="bg-red-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-red-700 transition-colors flex items-center shadow-sm"
          >
            <Trash2 className="w-5 h-5 mr-2" /> Delete All Results
          </button>
        </div>
      </div>

      <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 flex flex-col md:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-5 h-5" />
          <input
            type="text"
            placeholder="Search by Student Name, Roll No, Class ID, or Class..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-3 rounded-lg border-slate-300 focus:border-blue-500 focus:ring-blue-500 bg-slate-50"
          />
        </div>
        <select
          value={selectedExamFilter}
          onChange={(e) => setSelectedExamFilter(e.target.value)}
          className="rounded-lg border-slate-300 focus:border-blue-500 focus:ring-blue-500 bg-slate-50 px-4 py-3 text-sm text-slate-700 md:w-72"
        >
          <option value="">All Examinations ({results.length})</option>
          {exams.map(ex => (
            <option key={ex.id} value={ex.id}>{ex.examName}</option>
          ))}
        </select>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-slate-600">
            <thead className="bg-slate-50 text-slate-700 font-semibold border-b border-slate-200 uppercase text-xs tracking-wider">
              <tr>
                <th className="px-6 py-4">Student</th>
                <th className="px-6 py-4">Class</th>
                <th className="px-6 py-4">Exam</th>
                <th className="px-6 py-4">Percentage</th>
                <th className="px-6 py-4">Status</th>
                <th className="px-6 py-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {loading ? (
                <tr><td colSpan={6} className="px-6 py-8 text-center">Loading...</td></tr>
              ) : filteredResults.length === 0 ? (
                <tr><td colSpan={6} className="px-6 py-8 text-center text-slate-500">No results found.</td></tr>
              ) : (
                filteredResults.map(result => {
                  const exam = exams.find(e => e.id === result.examId);
                  return (
                    <tr key={result.id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-6 py-4">
                        <div className="font-medium text-slate-800">{result.studentName || 'Unknown'}</div>
                        <div className="text-xs text-slate-500">
                          Roll: {result.rollNumber} {result.studentId && result.studentId !== result.rollNumber ? `| ID: ${result.studentId}` : ''}
                        </div>
                      </td>
                      <td className="px-6 py-4">{result.className || '-'} {result.section ? `(${result.section})` : ''}</td>
                      <td className="px-6 py-4">{exam?.examName || 'Unknown Exam'}</td>
                      <td className="px-6 py-4 font-bold text-slate-800">{result.percentage != null ? `${result.percentage.toFixed(1)}%` : '-'}</td>
                      <td className="px-6 py-4">
                        <button 
                          onClick={() => handleTogglePublish(result)}
                          className={`px-2.5 py-1 text-xs font-bold rounded-full ${result.status === 'Published' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}
                        >
                          {result.status}
                        </button>
                      </td>
                      <td className="px-6 py-4 text-right space-x-3 whitespace-nowrap">
                        <button onClick={() => setViewResult(result)} className="text-blue-600 hover:text-blue-800 text-sm font-medium p-2">View</button>
                        <button onClick={() => setDeletingId(result.id!)} className="text-red-600 hover:text-red-800 p-2"><Trash2 className="w-5 h-5 inline" /></button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {deletingId && (
        <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl p-8 max-w-sm w-full shadow-2xl text-center">
            <Trash2 className="w-12 h-12 text-red-500 mx-auto mb-4" />
            <h3 className="text-xl font-bold mb-2 text-slate-800">Delete Result?</h3>
            <p className="text-slate-600 mb-6 text-sm">Are you sure you want to delete this result? This action cannot be undone.</p>
            <div className="flex justify-center space-x-3">
              <button onClick={() => setDeletingId(null)} className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg font-medium w-full">Cancel</button>
              <button onClick={confirmDelete} className="px-4 py-2 bg-red-600 text-white hover:bg-red-700 rounded-lg font-medium w-full">Delete</button>
            </div>
          </div>
        </div>
      )}

      {isDeletingAll && (
        <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl p-8 max-w-sm w-full shadow-2xl text-center">
            <Trash2 className="w-12 h-12 text-red-500 mx-auto mb-4" />
            <h3 className="text-xl font-bold mb-2 text-slate-800">Delete ALL Results?</h3>
            <p className="text-slate-600 mb-6 text-sm">Are you sure you want to delete ALL results in the system? This action cannot be undone and will wipe all imported sheets.</p>
            <div className="flex justify-center space-x-3">
              <button onClick={() => setIsDeletingAll(false)} className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg font-medium w-full">Cancel</button>
              <button onClick={confirmDeleteAll} className="px-4 py-2 bg-red-600 text-white hover:bg-red-700 rounded-lg font-medium w-full">Delete All</button>
            </div>
          </div>
        </div>
      )}

      {isBookModalOpen && (
        <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl p-6 max-w-2xl w-full shadow-2xl max-h-[90vh] flex flex-col">
            <div className="flex justify-between items-center border-b border-slate-200 pb-3 mb-4">
              <div>
                <h3 className="text-lg font-bold text-slate-800">Set Subject Book Names (Per Class)</h3>
                <p className="text-xs text-slate-500">Rename Subject 1, 2, 3... to real book names for already imported results.</p>
              </div>
              <button onClick={() => setIsBookModalOpen(false)} className="text-slate-400 hover:text-slate-700">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveBookNames} className="space-y-4 overflow-y-auto pr-1">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-600 uppercase mb-1">Examination</label>
                  <select
                    value={bookExamId}
                    onChange={(e) => setBookExamId(e.target.value)}
                    className="w-full rounded-lg border-slate-300 text-sm p-2.5 bg-slate-50"
                  >
                    <option value="">All Examinations</option>
                    {exams.map(ex => (
                      <option key={ex.id} value={ex.id}>{ex.examName}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-600 uppercase mb-1">Select Class</label>
                  <select
                    value={bookClass}
                    onChange={(e) => setBookClass(e.target.value)}
                    className="w-full rounded-lg border-slate-300 text-sm p-2.5 bg-slate-50"
                  >
                    {availableClassesForBookModal.length === 0 ? (
                      <option value="">No classes found</option>
                    ) : (
                      availableClassesForBookModal.map(cls => (
                        <option key={cls} value={cls}>{cls}</option>
                      ))
                    )}
                  </select>
                </div>
              </div>

              {subjectsInSelectedBookClass.length === 0 ? (
                <div className="p-4 bg-slate-50 rounded-lg text-sm text-slate-500 text-center">
                  No subjects found for this class.
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {subjectsInSelectedBookClass.map(({ name, totalSample }) => (
                    <div key={name} className="bg-slate-50 p-3 rounded-lg border border-slate-200">
                      <label className="block text-xs font-bold text-slate-600 mb-1">
                        {name} <span className="font-normal text-slate-400">({totalSample} marks)</span>
                      </label>
                      <input
                        type="text"
                        list="results-book-suggestions"
                        placeholder={`Book name for ${name}`}
                        value={classSubjectInputs[name] || ''}
                        onChange={(e) => setClassSubjectInputs({ ...classSubjectInputs, [name]: e.target.value })}
                        className="w-full rounded border-slate-300 text-sm px-2.5 py-1.5 bg-white focus:border-blue-500"
                      />
                    </div>
                  ))}
                </div>
              )}

              <datalist id="results-book-suggestions">
                {BOOK_NAME_SUGGESTIONS.map(book => (
                  <option key={book} value={book} />
                ))}
              </datalist>

              {bookUpdateMsg && (
                <div className={`p-3 rounded-lg text-xs font-semibold ${bookUpdateMsg.startsWith('Successfully') ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-amber-50 text-amber-800 border border-amber-200'}`}>
                  {bookUpdateMsg}
                </div>
              )}

              <div className="flex justify-end space-x-3 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setIsBookModalOpen(false)}
                  className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg font-medium text-sm"
                >
                  Close
                </button>
                <button
                  type="submit"
                  disabled={updatingBooks || subjectsInSelectedBookClass.length === 0}
                  className="px-5 py-2 bg-blue-600 text-white hover:bg-blue-700 rounded-lg font-bold text-sm disabled:opacity-50"
                >
                  {updatingBooks ? 'Updating...' : `Update All Students in ${bookClass || 'Class'}`}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
