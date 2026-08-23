import React, { useState, useEffect } from 'react';
import { collection, query, where, getDocs, doc, setDoc, deleteDoc, updateDoc } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../../lib/firebase';
import { Exam } from '../../types';
import { Plus, Trash2, Edit } from 'lucide-react';
import { cn } from '../../lib/utils';

export default function Exams() {
  const [exams, setExams] = useState<Exam[]>([]);
  const [loading, setLoading] = useState(false);
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [clearingResultsId, setClearingResultsId] = useState<string | null>(null);
  
  const [formData, setFormData] = useState({
    examName: '',
    examCategory: '',
    academicSession: '',
    class: '',
    status: 'Draft' as 'Draft' | 'Published' | 'Unpublished',
  });

  const fetchExams = async () => {
    setLoading(true);
    try {
      const q = query(collection(db, 'exams'));
      const snapshot = await getDocs(q);
      const data = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Exam));
      setExams(data);
    } catch (e) {
      handleFirestoreError(e, OperationType.GET, 'exams');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchExams();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const newExam: Exam = {
        examName: formData.examName,
        examCategory: formData.examCategory,
        academicSession: formData.academicSession,
        class: formData.class,
        status: formData.status,
        createdAt: editingId ? (exams.find(ex => ex.id === editingId)?.createdAt || Date.now()) : Date.now(),
        updatedAt: Date.now(),
      };

      if (editingId) {
        await updateDoc(doc(db, 'exams', editingId), newExam as any);
      } else {
        const newDocRef = doc(collection(db, 'exams'));
        await setDoc(newDocRef, newExam);
      }
      
      setIsModalOpen(false);
      setEditingId(null);
      setFormData({ examName: '', examCategory: '', academicSession: '', class: '', status: 'Draft' });
      fetchExams();
    } catch (e) {
      handleFirestoreError(e, OperationType.WRITE, 'exams');
    }
  };

  const handleEdit = (exam: Exam) => {
    setEditingId(exam.id!);
    setFormData({
      examName: exam.examName,
      examCategory: exam.examCategory || '',
      academicSession: exam.academicSession,
      class: exam.class || '',
      status: exam.status,
    });
    setIsModalOpen(true);
  };

  const confirmDelete = async () => {
    if (!deletingId) return;
    try {
      // Find all results for this exam
      const q = query(collection(db, 'results'), where('examId', '==', deletingId));
      const snapshot = await getDocs(q);
      
      // Delete all associated results
      const deletePromises = snapshot.docs.map(resultDoc => deleteDoc(doc(db, 'results', resultDoc.id)));
      await Promise.all(deletePromises);

      // Delete the exam itself
      await deleteDoc(doc(db, 'exams', deletingId));
      fetchExams();
      setDeletingId(null);
    } catch (e) {
      handleFirestoreError(e, OperationType.DELETE, 'exams');
    }
  };

  const confirmClearResults = async () => {
    if (!clearingResultsId) return;
    try {
      // Find all results for this exam
      const q = query(collection(db, 'results'), where('examId', '==', clearingResultsId));
      const snapshot = await getDocs(q);
      
      // Delete all associated results
      const deletePromises = snapshot.docs.map(resultDoc => deleteDoc(doc(db, 'results', resultDoc.id)));
      await Promise.all(deletePromises);

      setClearingResultsId(null);
      alert('All results for this exam have been successfully cleared.');
    } catch (e) {
      handleFirestoreError(e, OperationType.DELETE, 'results');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-slate-800">Examinations</h2>
        <button
          onClick={() => {
            setEditingId(null);
            setFormData({ examName: '', examCategory: '', academicSession: '', class: '', status: 'Draft' });
            setIsModalOpen(true);
          }}
          className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-medium flex items-center space-x-2 transition-colors"
        >
          <Plus className="w-4 h-4" />
          <span>Create Exam</span>
        </button>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-slate-600">
            <thead className="bg-slate-50 text-slate-700 font-semibold border-b border-slate-200 uppercase text-xs tracking-wider">
              <tr>
                <th className="px-6 py-4 whitespace-nowrap">Exam Name</th>
                <th className="px-6 py-4 whitespace-nowrap">Session</th>
                <th className="px-6 py-4 whitespace-nowrap">Class</th>
                <th className="px-6 py-4 whitespace-nowrap">Status</th>
                <th className="px-6 py-4 text-right whitespace-nowrap">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {loading ? (
                <tr><td colSpan={5} className="px-6 py-8 text-center">Loading...</td></tr>
              ) : exams.length === 0 ? (
                <tr><td colSpan={5} className="px-6 py-8 text-center text-slate-500">No exams found.</td></tr>
              ) : (
                exams.map(exam => (
                  <tr key={exam.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-6 py-4 font-medium text-slate-800 whitespace-nowrap">
                      {exam.examName}
                      {exam.examCategory && <div className="text-xs text-slate-500 font-normal">{exam.examCategory}</div>}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">{exam.academicSession}</td>
                    <td className="px-6 py-4 whitespace-nowrap">{exam.class || 'All'}</td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={cn(
                        "px-2.5 py-1 text-xs font-bold rounded-full",
                        exam.status === 'Published' ? "bg-green-100 text-green-700" :
                        exam.status === 'Unpublished' ? "bg-red-100 text-red-700" :
                        "bg-yellow-100 text-yellow-700"
                      )}>
                        {exam.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right space-x-3 whitespace-nowrap">
                      <button onClick={() => setClearingResultsId(exam.id!)} className="text-orange-600 hover:text-orange-800 p-2 text-xs font-bold bg-orange-50 rounded" title="Clear all imported results for this exam">Clear Results</button>
                      <button onClick={() => handleEdit(exam)} className="text-blue-600 hover:text-blue-800 p-2"><Edit className="w-5 h-5 inline" /></button>
                      <button onClick={() => setDeletingId(exam.id!)} className="text-red-600 hover:text-red-800 p-2"><Trash2 className="w-5 h-5 inline" /></button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl p-8 max-w-lg w-full shadow-2xl">
            <h3 className="text-xl font-bold mb-6 text-slate-800">{editingId ? 'Edit Exam' : 'Create Exam'}</h3>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">Exam Name (e.g., First Term 2026)</label>
                <input required type="text" value={formData.examName} onChange={e => setFormData({...formData, examName: e.target.value})} className="w-full rounded-lg border-slate-300 p-2 bg-slate-50" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1">Category (e.g., Monthly)</label>
                  <input type="text" value={formData.examCategory} onChange={e => setFormData({...formData, examCategory: e.target.value})} className="w-full rounded-lg border-slate-300 p-2 bg-slate-50" />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1">Academic Session</label>
                  <input required type="text" value={formData.academicSession} onChange={e => setFormData({...formData, academicSession: e.target.value})} className="w-full rounded-lg border-slate-300 p-2 bg-slate-50" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">Class Filter (Optional)</label>
                <input type="text" value={formData.class} onChange={e => setFormData({...formData, class: e.target.value})} className="w-full rounded-lg border-slate-300 p-2 bg-slate-50" />
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">Publish Status</label>
                <select value={formData.status} onChange={e => setFormData({...formData, status: e.target.value as any})} className="w-full rounded-lg border-slate-300 p-2 bg-slate-50">
                  <option value="Draft">Draft</option>
                  <option value="Published">Published</option>
                  <option value="Unpublished">Unpublished</option>
                </select>
              </div>
              <div className="flex justify-end space-x-3 mt-8">
                <button type="button" onClick={() => setIsModalOpen(false)} className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg font-medium">Cancel</button>
                <button type="submit" className="px-4 py-2 bg-blue-600 text-white hover:bg-blue-700 rounded-lg font-medium">Save Exam</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {deletingId && (
        <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl p-8 max-w-sm w-full shadow-2xl text-center">
            <Trash2 className="w-12 h-12 text-red-500 mx-auto mb-4" />
            <h3 className="text-xl font-bold mb-2 text-slate-800">Delete Exam?</h3>
            <p className="text-slate-600 mb-6 text-sm">Are you sure you want to delete this exam? This will also delete ALL imported results for this exam. This action cannot be undone.</p>
            <div className="flex justify-center space-x-3">
              <button onClick={() => setDeletingId(null)} className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg font-medium w-full">Cancel</button>
              <button onClick={confirmDelete} className="px-4 py-2 bg-red-600 text-white hover:bg-red-700 rounded-lg font-medium w-full">Delete</button>
            </div>
          </div>
        </div>
      )}

      {clearingResultsId && (
        <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl p-8 max-w-sm w-full shadow-2xl text-center">
            <Trash2 className="w-12 h-12 text-orange-500 mx-auto mb-4" />
            <h3 className="text-xl font-bold mb-2 text-slate-800">Clear All Results?</h3>
            <p className="text-slate-600 mb-6 text-sm">Are you sure you want to delete ALL imported results for this exam? The exam itself will not be deleted. This is useful if you want to re-import a fixed Excel sheet.</p>
            <div className="flex justify-center space-x-3">
              <button onClick={() => setClearingResultsId(null)} className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg font-medium w-full">Cancel</button>
              <button onClick={confirmClearResults} className="px-4 py-2 bg-orange-600 text-white hover:bg-orange-700 rounded-lg font-medium w-full">Clear Results</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
