'use client';

import React from 'react';
import { useTheme } from '@/context/theme-context';
import { Sun, Moon } from 'lucide-react';

export default function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();

  return (
    <button
      onClick={toggleTheme}
      className="relative flex items-center justify-center w-10 h-10 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 transition-all border border-slate-200 dark:border-slate-700 active:scale-95"
      aria-label="Toggle dark mode"
    >
      <div className="relative w-5 h-5 overflow-hidden">
        <div
          className={`absolute inset-0 flex items-center justify-center transition-transform duration-300 ${
            theme === 'dark' ? 'translate-y-0 opacity-100' : 'translate-y-8 opacity-0'
          }`}
        >
          <Sun className="w-5 h-5 text-amber-400" />
        </div>
        <div
          className={`absolute inset-0 flex items-center justify-center transition-transform duration-300 ${
            theme === 'light' ? 'translate-y-0 opacity-100' : '-translate-y-8 opacity-0'
          }`}
        >
          <Moon className="w-5 h-5 text-indigo-600" />
        </div>
      </div>
    </button>
  );
}
