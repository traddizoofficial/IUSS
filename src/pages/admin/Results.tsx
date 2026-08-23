import React, { useState, useEffect } from 'react';
import { collection, query, getDocs, doc, deleteDoc, updateDoc } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../../lib/firebase';
import { Result, Exam } from '../../types';
import { Trash2, Edit, Search } from 'lucide-react';
import ResultCard from '../../components/result/ResultCard';

export default function Results() {
  const [results, setResults] = useState<Result[]>([]);
  const [exams, setExams] = useState<Exam[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  
  const [viewResult, setViewResult] = useState<Result | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [isDeletingAll, setIsDeletingAll] = useState(false);

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

  const filteredResults = results.filter(r => 
    (r.studentName || '').toLowerCase().includes(searchTerm.toLowerCase()) || 
    r.rollNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
    r.studentId.toLowerCase().includes(searchTerm.toLowerCase())
  );

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
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-slate-800">Results Management</h2>
        <button
          onClick={() => setIsDeletingAll(true)}
          className="bg-red-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-red-700 transition-colors flex items-center shadow-sm"
        >
          <Trash2 className="w-5 h-5 mr-2" /> Delete All Results
        </button>
      </div>

      <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-5 h-5" />
          <input
            type="text"
            placeholder="Search by Student Name, Roll No, or ID..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-3 rounded-lg border-slate-300 focus:border-blue-500 focus:ring-blue-500 bg-slate-50"
          />
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-slate-600">
            <thead className="bg-slate-50 text-slate-700 font-semibold border-b border-slate-200 uppercase text-xs tracking-wider">
              <tr>
                <th className="px-6 py-4">Student</th>
                <th className="px-6 py-4">Exam</th>
                <th className="px-6 py-4">Percentage</th>
                <th className="px-6 py-4">Status</th>
                <th className="px-6 py-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {loading ? (
                <tr><td colSpan={5} className="px-6 py-8 text-center">Loading...</td></tr>
              ) : filteredResults.length === 0 ? (
                <tr><td colSpan={5} className="px-6 py-8 text-center text-slate-500">No results found.</td></tr>
              ) : (
                filteredResults.map(result => {
                  const exam = exams.find(e => e.id === result.examId);
                  return (
                    <tr key={result.id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-6 py-4">
                        <div className="font-medium text-slate-800">{result.studentName || 'Unknown'}</div>
                        <div className="text-xs text-slate-500">Roll: {result.rollNumber}</div>
                      </td>
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
    </div>
  );
}
