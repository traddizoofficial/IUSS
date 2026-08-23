import React, { useState } from 'react';
import { updatePassword } from 'firebase/auth';
import { auth } from '../../lib/firebase';

export default function ChangePassword() {
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    if (newPassword.length < 6) {
      setError('Password must be at least 6 characters long.');
      return;
    }

    try {
      setLoading(true);
      setError('');
      setSuccess(false);
      if (auth.currentUser) {
        await updatePassword(auth.currentUser, newPassword);
        setSuccess(true);
        setNewPassword('');
        setConfirmPassword('');
      } else {
        setError('No user is currently signed in.');
      }
    } catch (err: any) {
      if (err.code === 'auth/requires-recent-login') {
        setError('This operation is sensitive and requires recent authentication. Please log out and log back in before trying again.');
      } else {
        setError(err.message || 'Failed to update password.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6 max-w-xl">
      <h2 className="text-2xl font-bold text-slate-800">Change Password</h2>

      <div className="bg-white p-8 rounded-xl shadow-sm border border-slate-200">
        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg font-medium">
            {error}
          </div>
        )}
        {success && (
          <div className="mb-6 p-4 bg-green-50 border border-green-200 text-green-700 text-sm rounded-lg font-medium">
            Password updated successfully!
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1">New Password</label>
            <input 
              type="password" 
              value={newPassword}
              onChange={e => setNewPassword(e.target.value)}
              required
              className="w-full rounded-lg border-slate-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 p-3 bg-slate-50"
            />
          </div>
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1">Confirm New Password</label>
            <input 
              type="password" 
              value={confirmPassword}
              onChange={e => setConfirmPassword(e.target.value)}
              required
              className="w-full rounded-lg border-slate-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 p-3 bg-slate-50"
            />
          </div>

          <div className="pt-4 border-t border-slate-200">
            <button
              type="submit"
              disabled={loading}
              className="bg-blue-600 hover:bg-blue-700 text-white px-8 py-3 rounded-lg font-bold shadow-md disabled:opacity-50"
            >
              {loading ? 'Updating...' : 'Update Password'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
