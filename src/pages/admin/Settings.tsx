import React, { useState, useEffect } from 'react';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../../lib/firebase';
import { SchoolSettings } from '../../types';

export default function Settings() {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [settings, setSettings] = useState<SchoolSettings>({
    schoolName: 'Ibn-e-Umar School System & Academy',
    address: '',
    phone: '',
    email: '',
    principalName: '',
    academicSession: '2026-2027',
    resultCardTitle: 'Student Progress Report',
    updatedAt: Date.now()
  });

  useEffect(() => {
    const fetchSettings = async () => {
      setLoading(true);
      try {
        const snap = await getDoc(doc(db, 'settings', 'general'));
        if (snap.exists()) {
          setSettings(snap.data() as SchoolSettings);
        }
      } catch (e) {
        handleFirestoreError(e, OperationType.GET, 'settings');
      } finally {
        setLoading(false);
      }
    };
    fetchSettings();
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await setDoc(doc(db, 'settings', 'general'), {
        ...settings,
        updatedAt: Date.now()
      });
      alert('Settings saved successfully!');
    } catch (e) {
      handleFirestoreError(e, OperationType.WRITE, 'settings');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div>Loading settings...</div>;

  return (
    <div className="space-y-6 max-w-4xl">
      <h2 className="text-2xl font-bold text-slate-800">School Settings</h2>

      <div className="bg-white p-8 rounded-xl shadow-sm border border-slate-200">
        <form onSubmit={handleSave} className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">School Name</label>
              <input required type="text" value={settings.schoolName} onChange={e => setSettings({...settings, schoolName: e.target.value})} className="w-full rounded-lg border-slate-300 p-2 bg-slate-50" />
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">Academic Session</label>
              <input type="text" value={settings.academicSession} onChange={e => setSettings({...settings, academicSession: e.target.value})} className="w-full rounded-lg border-slate-300 p-2 bg-slate-50" />
            </div>
            <div className="md:col-span-2">
              <label className="block text-sm font-semibold text-slate-700 mb-1">Address</label>
              <input type="text" value={settings.address} onChange={e => setSettings({...settings, address: e.target.value})} className="w-full rounded-lg border-slate-300 p-2 bg-slate-50" />
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">Phone Number</label>
              <input type="text" value={settings.phone} onChange={e => setSettings({...settings, phone: e.target.value})} className="w-full rounded-lg border-slate-300 p-2 bg-slate-50" />
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">Email</label>
              <input type="email" value={settings.email} onChange={e => setSettings({...settings, email: e.target.value})} className="w-full rounded-lg border-slate-300 p-2 bg-slate-50" />
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">Principal Name</label>
              <input type="text" value={settings.principalName} onChange={e => setSettings({...settings, principalName: e.target.value})} className="w-full rounded-lg border-slate-300 p-2 bg-slate-50" />
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">Result Card Title</label>
              <input type="text" value={settings.resultCardTitle} onChange={e => setSettings({...settings, resultCardTitle: e.target.value})} className="w-full rounded-lg border-slate-300 p-2 bg-slate-50" />
            </div>
          </div>
          
          <div className="pt-6 border-t border-slate-200">
            <button
              type="submit"
              disabled={saving}
              className="bg-blue-600 hover:bg-blue-700 text-white px-8 py-3 rounded-lg font-bold shadow-md disabled:opacity-50"
            >
              {saving ? 'Saving...' : 'Save Settings'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
