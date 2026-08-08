'use client';

import React, { useState, useEffect } from 'react';
import { CheckCircle, AlertCircle, Info, AlertTriangle, X } from 'lucide-react';

export type ToastType = 'success' | 'error' | 'warning' | 'info';

export interface ToastMessage {
  id: string;
  message: string;
  type: ToastType;
}

let toastListeners: Array<(message: ToastMessage) => void> = [];

export const showToast = (message: string, type: ToastType = 'info') => {
  const toast: ToastMessage = {
    id: Math.random().toString(36).substring(2, 9),
    message,
    type
  };
  toastListeners.forEach(listener => listener(toast));
};

export function ToastContainer() {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  useEffect(() => {
    const handleNewToast = (toast: ToastMessage) => {
      setToasts(prev => [...prev, toast]);
      
      // Auto dismiss after 3 seconds
      setTimeout(() => {
        setToasts(prev => prev.filter(t => t.id !== toast.id));
      }, 3000);
    };

    toastListeners.push(handleNewToast);

    return () => {
      toastListeners = toastListeners.filter(listener => listener !== handleNewToast);
    };
  }, []);

  const removeToast = (id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  };

  const getToastIcon = (type: ToastType) => {
    switch (type) {
      case 'success':
        return <CheckCircle className="w-5 h-5 text-emerald-500" />;
      case 'error':
        return <AlertCircle className="w-5 h-5 text-rose-500" />;
      case 'warning':
        return <AlertTriangle className="w-5 h-5 text-amber-500" />;
      default:
        return <Info className="w-5 h-5 text-blue-500" />;
    }
  };

  const getToastStyles = (type: ToastType) => {
    switch (type) {
      case 'success':
        return 'border-emerald-500/20 bg-emerald-500/10 dark:bg-emerald-950/20 text-emerald-600 dark:text-emerald-400';
      case 'error':
        return 'border-rose-500/20 bg-rose-500/10 dark:bg-rose-950/20 text-rose-600 dark:text-rose-400';
      case 'warning':
        return 'border-amber-500/20 bg-amber-500/10 dark:bg-amber-950/20 text-amber-600 dark:text-amber-400';
      default:
        return 'border-blue-500/20 bg-blue-500/10 dark:bg-blue-950/20 text-blue-600 dark:text-blue-400';
    }
  };

  return (
    <div className="fixed bottom-5 right-5 z-50 flex flex-col gap-3 max-w-sm w-full pointer-events-none">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`flex items-start justify-between gap-3 p-4 rounded-xl border shadow-lg backdrop-blur-md pointer-events-auto animate-in slide-in-from-bottom-5 duration-200 ${getToastStyles(
            toast.type
          )}`}
        >
          <div className="flex gap-3">
            <span className="shrink-0 mt-0.5">{getToastIcon(toast.type)}</span>
            <p className="text-xs font-semibold leading-relaxed">{toast.message}</p>
          </div>
          <button
            onClick={() => removeToast(toast.id)}
            className="p-0.5 rounded-lg hover:bg-slate-500/10 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-all shrink-0 ml-1 active:scale-95"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      ))}
    </div>
  );
}
