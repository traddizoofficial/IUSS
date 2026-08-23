import React, { useState, useEffect } from 'react';
import { collection, query, getDocs, doc, setDoc, deleteDoc, updateDoc } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../../lib/firebase';
import { Student } from '../../types';
import { Search, Plus, Trash2, Edit } from 'lucide-react';

export default function Students() {
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [isDeletingAll, setIsDeletingAll] = useState(false);
  
  const [formData, setFormData] = useState({
    studentId: '',
    rollNumber: '',
    studentName: '',
    fatherName: '',
    class: '',
    section: '',
  });

  const fetchStudents = async () => {
    setLoading(true);
    try {
      const q = query(collection(db, 'students'));
      const snapshot = await getDocs(q);
      const data = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Student));
      setStudents(data);
    } catch (e) {
      handleFirestoreError(e, OperationType.GET, 'students');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStudents();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const newStudent: Student = {
        studentId: formData.studentId,
        rollNumber: formData.rollNumber,
        studentName: formData.studentName,
        fatherName: formData.fatherName,
        class: formData.class,
        section: formData.section,
        active: true,
        createdAt: editingId ? (students.find(s => s.id === editingId)?.createdAt || Date.now()) : Date.now(),
        updatedAt: Date.now(),
      };

      if (editingId) {
        await updateDoc(doc(db, 'students', editingId), newStudent as any);
      } else {
        const newDocRef = doc(collection(db, 'students'));
        await setDoc(newDocRef, newStudent);
      }
      
      setIsModalOpen(false);
      setEditingId(null);
      setFormData({ studentId: '', rollNumber: '', studentName: '', fatherName: '', class: '', section: '' });
      fetchStudents();
    } catch (e) {
      handleFirestoreError(e, OperationType.WRITE, 'students');
    }
  };

  const handleEdit = (student: Student) => {
    setEditingId(student.id!);
    setFormData({
      studentId: student.studentId,
      rollNumber: student.rollNumber,
      studentName: student.studentName,
      fatherName: student.fatherName || '',
      class: student.class,
      section: student.section || '',
    });
    setIsModalOpen(true);
  };

  const confirmDelete = async () => {
    if (!deletingId) return;
    try {
      await deleteDoc(doc(db, 'students', deletingId));
      fetchStudents();
      setDeletingId(null);
    } catch (e) {
      handleFirestoreError(e, OperationType.DELETE, 'students');
    }
  };

  const confirmDeleteAll = async () => {
    try {
      setLoading(true);
      const snapshot = await getDocs(collection(db, 'students'));
      const promises = snapshot.docs.map(d => deleteDoc(doc(db, 'students', d.id)));
      await Promise.all(promises);
      setIsDeletingAll(false);
      fetchStudents();
    } catch (e) {
      handleFirestoreError(e, OperationType.DELETE, 'students');
      setLoading(false);
    }
  };

  const filteredStudents = students.filter(s => 
    s.studentName.toLowerCase().includes(searchTerm.toLowerCase()) || 
    s.rollNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
    s.studentId.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-slate-800">Students</h2>
        <div className="flex space-x-3">
          <button
            onClick={() => setIsDeletingAll(true)}
            className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg font-medium flex items-center space-x-2 transition-colors"
          >
            <Trash2 className="w-4 h-4" />
            <span>Delete All Students</span>
          </button>
          <button
            onClick={() => {
              setEditingId(null);
              setFormData({ studentId: '', rollNumber: '', studentName: '', fatherName: '', class: '', section: '' });
              setIsModalOpen(true);
            }}
            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-medium flex items-center space-x-2 transition-colors"
          >
            <Plus className="w-4 h-4" />
            <span>Add Student</span>
          </button>
        </div>
      </div>

      <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-5 h-5" />
          <input
            type="text"
            placeholder="Search by Name, Roll Number, or ID..."
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
                <th className="px-6 py-4">ID / Roll No</th>
                <th className="px-6 py-4">Name</th>
                <th className="px-6 py-4">Class</th>
                <th className="px-6 py-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {loading ? (
                <tr><td colSpan={4} className="px-6 py-8 text-center">Loading...</td></tr>
              ) : filteredStudents.length === 0 ? (
                <tr><td colSpan={4} className="px-6 py-8 text-center text-slate-500">No students found.</td></tr>
              ) : (
                filteredStudents.map(student => (
                  <tr key={student.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-6 py-4">
                      <div className="font-medium text-slate-800">{student.studentId}</div>
                      <div className="text-xs text-slate-500">Roll: {student.rollNumber}</div>
                    </td>
                    <td className="px-6 py-4 font-medium text-slate-800">{student.studentName}</td>
                    <td className="px-6 py-4">{student.class} {student.section && `(${student.section})`}</td>
                    <td className="px-6 py-4 text-right space-x-3 whitespace-nowrap">
                      <button onClick={() => handleEdit(student)} className="text-blue-600 hover:text-blue-800 p-2"><Edit className="w-5 h-5 inline" /></button>
                      <button onClick={() => setDeletingId(student.id!)} className="text-red-600 hover:text-red-800 p-2"><Trash2 className="w-5 h-5 inline" /></button>
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
            <h3 className="text-xl font-bold mb-6 text-slate-800">{editingId ? 'Edit Student' : 'Add Student'}</h3>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1">Student ID</label>
                  <input required type="text" value={formData.studentId} onChange={e => setFormData({...formData, studentId: e.target.value})} className="w-full rounded-lg border-slate-300 p-2" />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1">Roll Number</label>
                  <input required type="text" value={formData.rollNumber} onChange={e => setFormData({...formData, rollNumber: e.target.value})} className="w-full rounded-lg border-slate-300 p-2" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">Student Name</label>
                <input required type="text" value={formData.studentName} onChange={e => setFormData({...formData, studentName: e.target.value})} className="w-full rounded-lg border-slate-300 p-2" />
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">Father Name</label>
                <input type="text" value={formData.fatherName} onChange={e => setFormData({...formData, fatherName: e.target.value})} className="w-full rounded-lg border-slate-300 p-2" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1">Class</label>
                  <input required type="text" value={formData.class} onChange={e => setFormData({...formData, class: e.target.value})} className="w-full rounded-lg border-slate-300 p-2" />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1">Section</label>
                  <input type="text" value={formData.section} onChange={e => setFormData({...formData, section: e.target.value})} className="w-full rounded-lg border-slate-300 p-2" />
                </div>
              </div>
              <div className="flex justify-end space-x-3 mt-8">
                <button type="button" onClick={() => setIsModalOpen(false)} className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg font-medium">Cancel</button>
                <button type="submit" className="px-4 py-2 bg-blue-600 text-white hover:bg-blue-700 rounded-lg font-medium">Save Student</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {deletingId && (
        <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl p-8 max-w-sm w-full shadow-2xl text-center">
            <Trash2 className="w-12 h-12 text-red-500 mx-auto mb-4" />
            <h3 className="text-xl font-bold mb-2 text-slate-800">Delete Student?</h3>
            <p className="text-slate-600 mb-6 text-sm">Are you sure you want to delete this student? This action cannot be undone.</p>
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
            <h3 className="text-xl font-bold mb-2 text-slate-800">Delete ALL Students?</h3>
            <p className="text-slate-600 mb-6 text-sm">Are you sure you want to delete ALL students in the system? This action cannot be undone and will wipe the entire student database.</p>
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
