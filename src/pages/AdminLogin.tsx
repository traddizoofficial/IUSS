import React, { useState, useEffect } from 'react';
import { signInWithEmailAndPassword, createUserWithEmailAndPassword, User } from 'firebase/auth';
import { auth, db } from '../lib/firebase';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { useNavigate } from 'react-router-dom';
import { GraduationCap } from 'lucide-react';

interface Props {
  user: User | null;
  isAdmin: boolean | null;
}

export default function AdminLogin({ user, isAdmin }: Props) {
  const navigate = useNavigate();
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [isSetupMode, setIsSetupMode] = useState(false);
  
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  useEffect(() => {
    if (user && isAdmin) {
      navigate('/admin/students');
    }
  }, [user, isAdmin, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      setError('Please enter email and password.');
      return;
    }

    try {
      setLoading(true);
      setError('');
      
      let currentUser: User;

      if (isSetupMode) {
        const result = await createUserWithEmailAndPassword(auth, email, password);
        currentUser = result.user;
        // Create admin doc for the first user
        await setDoc(doc(db, 'admins', currentUser.uid), {
          email: currentUser.email,
          createdAt: Date.now()
        });
        window.location.reload();
      } else {
        const result = await signInWithEmailAndPassword(auth, email, password);
        currentUser = result.user;
        
        // Check if admin exists
        const adminDoc = await getDoc(doc(db, 'admins', currentUser.uid));
        if (!adminDoc.exists()) {
          await auth.signOut();
          setError('You do not have administrative privileges.');
        }
      }
    } catch (e: any) {
      if (e.code === 'auth/invalid-credential' || e.code === 'auth/user-not-found' || e.code === 'auth/wrong-password') {
        setError('Invalid email or password.');
      } else if (e.code === 'auth/email-already-in-use') {
        setError('This email is already registered. Please login.');
      } else if (e.code === 'auth/operation-not-allowed') {
        setError('Email/Password login is not enabled in Firebase. Please enable it in the Firebase Console under Authentication -> Sign-in method.');
      } else {
        setError(e.message || 'Authentication failed.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-xl border border-slate-100 overflow-hidden">
        <div className="bg-blue-900 p-8 text-center flex flex-col items-center">
          <div className="bg-white p-3 rounded-full mb-4 shadow-md">
            <GraduationCap className="h-10 w-10 text-blue-900" />
          </div>
          <h2 className="text-2xl font-bold text-white tracking-wide">ADMIN PORTAL</h2>
          <p className="text-blue-200 mt-2 text-sm">Ibn-e-Umar School System</p>
        </div>
        
        <div className="p-8">
          {error && (
            <div className="mb-6 p-4 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg text-center font-medium">
              {error}
            </div>
          )}
          
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">Email / Username</label>
              <input 
                type="email" 
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                className="w-full rounded-lg border-slate-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 p-3 bg-slate-50"
                placeholder="admin@school.com"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">Password</label>
              <input 
                type="password" 
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                className="w-full rounded-lg border-slate-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 p-3 bg-slate-50"
                placeholder="••••••••"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full flex items-center justify-center space-x-2 bg-blue-700 hover:bg-blue-800 text-white font-bold py-3 px-4 rounded-xl transition-all shadow-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-70 mt-2"
            >
              {loading ? (
                <div className="h-5 w-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
              ) : (
                <span>{isSetupMode ? 'Create Admin Account' : 'Login'}</span>
              )}
            </button>
          </form>
          
          <div className="mt-6 text-center">
            <button 
              type="button" 
              onClick={() => setIsSetupMode(!isSetupMode)}
              className="text-xs text-blue-600 hover:text-blue-800 font-medium"
            >
              {isSetupMode ? 'Already have an account? Login here.' : 'First time setup? Create admin account.'}
            </button>
          </div>

          <p className="mt-6 text-center text-xs text-slate-500">
            By signing in, you agree to access a protected administrative system. Unauthorized access is prohibited.
          </p>
        </div>
      </div>
    </div>
  );
}
