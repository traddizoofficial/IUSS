/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import React, { useEffect, useState } from 'react';
import { onAuthStateChanged, User } from 'firebase/auth';
import { auth, db } from './lib/firebase';
import { doc, getDoc } from 'firebase/firestore';

import PublicPortal from './pages/PublicPortal';
import AdminLogin from './pages/AdminLogin';
import AdminDashboard from './pages/AdminDashboard';
import Students from './pages/admin/Students';
import Exams from './pages/admin/Exams';
import Results from './pages/admin/Results';
import ExcelImport from './pages/admin/ExcelImport';
import Settings from './pages/admin/Settings';
import ChangePassword from './pages/admin/ChangePassword';

function ProtectedRoute({ children, user, isAdmin }: { children: React.ReactNode, user: User | null, isAdmin: boolean | null }) {
  if (user === null) return <div>Loading...</div>;
  if (!user || isAdmin === false) return <Navigate to="/admin/login" replace />;
  return <>{children}</>;
}

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      if (currentUser) {
        try {
          // Check if admin
          const adminDoc = await getDoc(doc(db, 'admins', currentUser.uid));
          setIsAdmin(adminDoc.exists());
        } catch (e) {
          setIsAdmin(false);
        }
      } else {
        setIsAdmin(null);
      }
    });
    return () => unsubscribe();
  }, []);

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<PublicPortal />} />
        <Route path="/admin/login" element={<AdminLogin user={user} isAdmin={isAdmin} />} />
        
        <Route path="/admin" element={
          <ProtectedRoute user={user} isAdmin={isAdmin}>
            <AdminDashboard />
          </ProtectedRoute>
        }>
          <Route index element={<Navigate to="students" replace />} />
          <Route path="students" element={<Students />} />
          <Route path="exams" element={<Exams />} />
          <Route path="results" element={<Results />} />
          <Route path="import" element={<ExcelImport />} />
          <Route path="settings" element={<Settings />} />
          <Route path="password" element={<ChangePassword />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
