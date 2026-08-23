import React, { useState } from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { auth } from '../lib/firebase';
import { signOut } from 'firebase/auth';
import { LayoutDashboard, Users, FileSpreadsheet, Settings, LogOut, FileText, Upload, GraduationCap, KeyRound, Menu, X } from 'lucide-react';
import { cn } from '../lib/utils';

export default function AdminDashboard() {
  const navigate = useNavigate();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const handleLogout = async () => {
    await signOut(auth);
    navigate('/');
  };

  const navLinks = [
    { to: '/admin/students', icon: Users, label: 'Students' },
    { to: '/admin/exams', icon: FileText, label: 'Exams' },
    { to: '/admin/results', icon: FileSpreadsheet, label: 'Results' },
    { to: '/admin/import', icon: Upload, label: 'Excel Import' },
    { to: '/admin/settings', icon: Settings, label: 'Settings' },
    { to: '/admin/password', icon: KeyRound, label: 'Change Password' },
  ];

  return (
    <div className="flex h-screen bg-slate-50 font-sans text-slate-800 overflow-hidden">
      {/* Mobile Overlay */}
      {isMobileMenuOpen && (
        <div 
          className="fixed inset-0 bg-black/50 z-40 md:hidden" 
          onClick={() => setIsMobileMenuOpen(false)} 
        />
      )}

      {/* Sidebar */}
      <aside 
        className={cn(
          "bg-slate-900 text-slate-300 flex flex-col shadow-xl flex-shrink-0 z-50 fixed inset-y-0 left-0 transform transition-transform duration-300 md:relative md:translate-x-0 w-64",
          isMobileMenuOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <div className="h-20 flex items-center justify-between px-6 bg-slate-950 border-b border-slate-800">
          <div className="flex items-center">
            <GraduationCap className="w-8 h-8 text-blue-400 mr-3" />
            <div>
              <h2 className="text-white font-bold tracking-wider uppercase text-sm">Ibn-e-Umar</h2>
              <p className="text-[10px] text-slate-500 uppercase tracking-widest">Admin Panel</p>
            </div>
          </div>
          <button className="md:hidden text-slate-400 hover:text-white" onClick={() => setIsMobileMenuOpen(false)}>
            <X className="w-6 h-6" />
          </button>
        </div>
        
        <nav className="flex-1 overflow-y-auto py-6 space-y-2 px-3">
          {navLinks.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              onClick={() => setIsMobileMenuOpen(false)}
              className={({ isActive }) =>
                cn(
                  "flex items-center space-x-3 px-4 py-3 rounded-lg transition-colors font-medium text-sm",
                  isActive 
                    ? "bg-blue-600 text-white shadow-md shadow-blue-900/20" 
                    : "hover:bg-slate-800 hover:text-white"
                )
              }
            >
              <link.icon className="w-5 h-5" />
              <span>{link.label}</span>
            </NavLink>
          ))}
        </nav>
        
        <div className="p-4 border-t border-slate-800">
          <button
            onClick={handleLogout}
            className="flex items-center space-x-3 w-full px-4 py-3 text-slate-400 hover:text-red-400 hover:bg-slate-800 rounded-lg transition-colors text-sm font-medium"
          >
            <LogOut className="w-5 h-5" />
            <span>Logout</span>
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col h-full overflow-hidden w-full relative">
        <header className="h-20 bg-white border-b border-slate-200 flex items-center px-4 md:px-8 shadow-sm justify-between shrink-0">
          <div className="flex items-center">
            <button 
              className="md:hidden mr-4 text-slate-600 hover:text-slate-900"
              onClick={() => setIsMobileMenuOpen(true)}
            >
              <Menu className="w-6 h-6" />
            </button>
            <h1 className="text-xl font-bold text-slate-800 truncate">Dashboard</h1>
          </div>
          <div className="text-xs md:text-sm font-medium text-slate-500 bg-slate-100 px-3 py-2 md:px-4 rounded-full border border-slate-200 truncate max-w-[150px] md:max-w-none">
            {auth.currentUser?.email}
          </div>
        </header>
        
        <div className="flex-1 overflow-y-auto p-4 md:p-8 w-full">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
