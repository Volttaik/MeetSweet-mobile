/**
 * AppLayout - Responsive Navigation Shell with Top Bar, Desktop Sidebar & Mobile Bottom Nav.
 */

import React from 'react';
import { Home, Compass, Film, MessageSquare, Wallet, User as UserIcon, LogOut, Heart } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';

interface AppLayoutProps {
  currentTab: 'feed' | 'explore' | 'shorts' | 'messages' | 'wallet' | 'profile';
  onSelectTab: (tab: 'feed' | 'explore' | 'shorts' | 'messages' | 'wallet' | 'profile') => void;
  children: React.ReactNode;
}

export const AppLayout: React.FC<AppLayoutProps> = ({
  currentTab,
  onSelectTab,
  children,
}) => {
  const { user, logout } = useAuth();

  const navItems = [
    { id: 'feed', label: 'Feed', icon: Home },
    { id: 'explore', label: 'Explore', icon: Compass },
    { id: 'shorts', label: 'Shorts', icon: Film },
    { id: 'messages', label: 'Messages', icon: MessageSquare },
    { id: 'wallet', label: 'Wallet', icon: Wallet },
  ] as const;

  return (
    <div className="flex flex-col h-screen w-screen bg-stone-50 dark:bg-stone-950 text-stone-900 dark:text-stone-100 overflow-hidden">
      {/* Top Header */}
      <header className="h-14 border-b border-stone-200 dark:border-stone-800 bg-white/90 dark:bg-stone-900/90 backdrop-blur-md px-4 flex items-center justify-between shrink-0 z-30">
        <div className="flex items-center gap-2 cursor-pointer" onClick={() => onSelectTab('feed')}>
          <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-rose-500 to-purple-600 flex items-center justify-center text-white shadow-sm">
            <Heart className="w-4 h-4 fill-current" />
          </div>
          <span className="font-black text-lg tracking-tight bg-gradient-to-r from-rose-600 to-purple-600 bg-clip-text text-transparent">
            MeetSweet
          </span>
        </div>

        {/* User Info / Logout */}
        <div className="flex items-center gap-3">
          {user ? (
            <div className="flex items-center gap-2">
              <img
                src={user.avatarUrl || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150'}
                alt={user.name}
                onClick={() => onSelectTab('profile')}
                className="w-8 h-8 rounded-full object-cover border border-stone-200 dark:border-stone-700 cursor-pointer"
                referrerPolicy="no-referrer"
              />
              <button
                type="button"
                onClick={logout}
                className="p-1.5 text-stone-400 hover:text-rose-600 transition-colors"
                title="Logout"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => onSelectTab('feed')}
              className="px-3.5 py-1.5 rounded-full bg-rose-600 text-white font-bold text-xs"
            >
              Sign In
            </button>
          )}
        </div>
      </header>

      {/* Main Workspace Body */}
      <div className="flex-1 flex overflow-hidden">
        {/* Desktop Sidebar */}
        <aside className="hidden md:flex flex-col w-56 border-r border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 p-3 space-y-1 shrink-0">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = currentTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onSelectTab(item.id)}
                className={`flex items-center gap-3 w-full px-3.5 py-2.5 rounded-2xl font-bold text-xs transition-all cursor-pointer ${
                  isActive
                    ? 'bg-rose-600 text-white shadow-sm'
                    : 'text-stone-600 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800'
                }`}
              >
                <Icon className="w-4 h-4" />
                <span>{item.label}</span>
              </button>
            );
          })}
        </aside>

        {/* Content View */}
        <main className="flex-1 overflow-y-auto relative">{children}</main>
      </div>

      {/* Mobile Bottom Navigation Bar */}
      <nav className="md:hidden h-16 border-t border-stone-200 dark:border-stone-800 bg-white/95 dark:bg-stone-900/95 backdrop-blur-md px-2 flex items-center justify-around shrink-0 z-30">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = currentTab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onSelectTab(item.id)}
              className={`flex flex-col items-center gap-1 p-2 rounded-xl text-[10px] font-bold transition-colors ${
                isActive ? 'text-rose-600' : 'text-stone-400 hover:text-stone-700'
              }`}
            >
              <Icon className="w-5 h-5" />
              <span>{item.label}</span>
            </button>
          );
        })}
      </nav>
    </div>
  );
};
