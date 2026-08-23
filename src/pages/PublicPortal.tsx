import React, { useState, useEffect } from 'react';
import { Helmet } from 'react-helmet-async';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { Exam, Result } from '../types';
import ResultCard from '../components/result/ResultCard';
import { Search, GraduationCap } from 'lucide-react';
import { Link } from 'react-router-dom';

export default function PublicPortal() {
  const [exams, setExams] = useState<Exam[]>([]);
  const [selectedExamId, setSelectedExamId] = useState('');
  const [identifier, setIdentifier] = useState('');
  const [identifierType, setIdentifierType] = useState<'rollNumber' | 'studentId'>('rollNumber');
  
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<Result | null>(null);

  useEffect(() => {
    const fetchExams = async () => {
      try {
        const q = query(collection(db, 'exams'));
        const snapshot = await getDocs(q);
        const fetchedExams = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Exam)).filter(e => e.status === 'Published');
        setExams(fetchedExams);
      } catch (err) {
        // Just fail silently for exams on public portal if offline, but ideally show error.
        console.error('Error fetching exams', err);
      }
    };
    fetchExams();
  }, []);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedExamId || !identifier) {
      setError('Please provide both an examination and an identifier.');
      return;
    }

    setLoading(true);
    setError('');
    setResult(null);

    try {
      const q = query(
        collection(db, 'results'),
        where('examId', '==', selectedExamId)
      );
      
      const snapshot = await getDocs(q);
      
      const matchedResults = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Result)).filter(r => {
        const valToMatch = identifierType === 'rollNumber' ? r.rollNumber : r.studentId;
        return String(valToMatch).trim().toLowerCase() === String(identifier).trim().toLowerCase();
      });
      
      if (matchedResults.length === 0) {
        setError('No result is available for this student and examination.');
      } else {
        const foundResult = matchedResults[0];
        if (foundResult.status !== 'Published') {
          setError('This result has not been published yet.');
        } else {
          setResult(foundResult);
        }
      }
    } catch (err: any) {
      setError('An error occurred while searching for the result. Please try again.');
      try {
        handleFirestoreError(err, OperationType.GET, 'results');
      } catch (e) {} // already handled via state
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-800 flex flex-col">
      <Helmet>
        <title>Student Result Portal - Ibn-e-Umar School System</title>
        <meta name="description" content="Check your child's examination result securely and instantly on the Ibn-e-Umar School System & Academy student portal." />
        <meta property="og:title" content="Student Result Portal - Ibn-e-Umar School System" />
        <meta property="og:description" content="Check your child's examination result securely and instantly." />
      </Helmet>
      
      <header className="bg-white border-b border-slate-200 shadow-sm py-4">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex justify-between items-center">
          <div className="flex items-center space-x-3">
            <GraduationCap className="h-8 w-8 text-blue-800" />
            <h1 className="text-xl font-bold text-blue-900 tracking-tight uppercase">
              Ibn-e-Umar <span className="font-medium text-slate-600 hidden sm:inline">School System & Academy</span>
            </h1>
          </div>
          <Link to="/admin/login" className="text-sm font-medium text-blue-700 hover:text-blue-900 transition-colors">
            Admin Login
          </Link>
        </div>
      </header>

      <main className="flex-1 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 w-full flex flex-col items-center">
        {!result ? (
          <div className="w-full max-w-2xl bg-white shadow-xl rounded-2xl overflow-hidden border border-slate-100">
            <div className="bg-blue-900 text-white p-8 text-center">
              <h2 className="text-3xl font-bold mb-2">Student Result Portal</h2>
              <p className="text-blue-200">Check Your Child’s Result securely and instantly.</p>
            </div>
            
            <div className="p-8">
              <form onSubmit={handleSearch} className="space-y-6">
                <div>
                  <label htmlFor="exam" className="block text-sm font-semibold text-slate-700 mb-1">Select Examination</label>
                  <select
                    id="exam"
                    value={selectedExamId}
                    onChange={(e) => setSelectedExamId(e.target.value)}
                    className="w-full rounded-lg border-slate-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-slate-700 p-3 bg-slate-50"
                  >
                    <option value="">-- Choose Exam --</option>
                    {exams.map(ex => (
                      <option key={ex.id} value={ex.id}>{ex.examName}</option>
                    ))}
                  </select>
                </div>

                <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-4">
                  <div className="flex space-x-4">
                    <label className="flex items-center space-x-2 cursor-pointer">
                      <input 
                        type="radio" 
                        name="idType" 
                        value="rollNumber"
                        checked={identifierType === 'rollNumber'}
                        onChange={() => setIdentifierType('rollNumber')}
                        className="text-blue-600 focus:ring-blue-500"
                      />
                      <span className="text-sm font-medium text-slate-700">Roll Number</span>
                    </label>
                    <label className="flex items-center space-x-2 cursor-pointer">
                      <input 
                        type="radio" 
                        name="idType" 
                        value="studentId"
                        checked={identifierType === 'studentId'}
                        onChange={() => setIdentifierType('studentId')}
                        className="text-blue-600 focus:ring-blue-500"
                      />
                      <span className="text-sm font-medium text-slate-700">Student ID</span>
                    </label>
                  </div>
                  
                  <div>
                    <input
                      type="text"
                      placeholder={identifierType === 'rollNumber' ? 'Enter Roll Number' : 'Enter Student ID'}
                      value={identifier}
                      onChange={(e) => setIdentifier(e.target.value)}
                      className="w-full rounded-lg border-slate-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 p-3"
                    />
                  </div>
                </div>

                {error && (
                  <div className="p-4 bg-red-50 text-red-700 rounded-lg text-sm border border-red-200">
                    {error}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full flex items-center justify-center space-x-2 bg-blue-700 hover:bg-blue-800 text-white p-4 rounded-xl font-bold transition-all shadow-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-70"
                >
                  {loading ? (
                    <div className="h-5 w-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  ) : (
                    <>
                      <Search className="w-5 h-5" />
                      <span>CHECK RESULT</span>
                    </>
                  )}
                </button>
              </form>
            </div>
          </div>
        ) : (
          <div className="w-full">
            <Helmet>
              <title>{result.studentName} - Exam Result | Ibn-e-Umar School</title>
              <meta name="description" content={`View examination result for ${result.studentName} (${result.rollNumber}).`} />
            </Helmet>
            <div className="mb-6 flex justify-between items-center bg-white p-4 rounded-xl shadow-sm border border-slate-200">
              <button 
                type="button"
                onClick={() => setResult(null)}
                className="text-blue-600 hover:text-blue-800 font-medium text-sm flex items-center"
              >
                &larr; Back to Search
              </button>
              <div className="flex space-x-3">
                <button 
                  type="button"
                  onClick={() => window.print()}
                  className="bg-slate-100 hover:bg-slate-200 text-slate-700 px-4 py-2 rounded-lg text-sm font-medium transition-colors"
                >
                  Print Result
                </button>
              </div>
            </div>
            <div className="bg-white shadow-2xl rounded-lg overflow-hidden border border-slate-200 p-4 sm:p-8 w-full overflow-x-auto print:shadow-none print:border-none print:p-0">
              <div className="min-w-[800px] mx-auto print:min-w-0">
                <ResultCard result={result} exam={exams.find(e => e.id === result.examId)} />
              </div>
            </div>
          </div>
        )}
      </main>

      <footer className="bg-slate-900 text-slate-400 py-8 mt-auto">
        <div className="max-w-7xl mx-auto px-4 text-center text-sm">
          <p>&copy; {new Date().getFullYear()} Ibn-e-Umar School System & Academy. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}
