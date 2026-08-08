'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { User } from '@supabase/supabase-js';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  signOut: () => Promise<void>;
  isAdmin: boolean;
  loginAsGuest: () => void;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  signOut: async () => {},
  isAdmin: false,
  loginAsGuest: () => {},
});

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // 1. Check if guest session is active in localStorage
    if (typeof window !== 'undefined') {
      const isGuest = localStorage.getItem('guest_session') === 'true';
      if (isGuest) {
        setUser({
          id: '00000000-0000-0000-0000-000000000000',
          email: 'localadmin@saintg.com',
          role: 'authenticated',
        } as User);
        setLoading(false);
        return;
      }
    }

    // 2. Check active Supabase sessions
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        setUser(session.user);
      } else {
        setUser(null);
      }
      setLoading(false);
    });

    // 3. Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      // Only set user from supabase if guest session is not active
      if (typeof window !== 'undefined' && localStorage.getItem('guest_session') === 'true') {
        return;
      }
      setUser(session?.user ?? null);
      setLoading(false);
    });

    // Register Service Worker for PWA
    if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
      window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js').then(
          (registration) => console.log('SW registered: ', registration.scope),
          (err) => console.error('SW registration failed: ', err)
        );
      });
    }

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const loginAsGuest = () => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('guest_session', 'true');
    }
    setUser({
      id: '00000000-0000-0000-0000-000000000000',
      email: 'localadmin@saintg.com',
      role: 'authenticated',
    } as User);
  };

  const signOut = async () => {
    setLoading(true);
    try {
      if (typeof window !== 'undefined') {
        localStorage.removeItem('guest_session');
      }
      await supabase.auth.signOut();
      setUser(null);
    } catch (error) {
      console.error('Error signing out:', error);
    } finally {
      setLoading(false);
    }
  };

  const isAdmin = !!user; // In this application, any authenticated user is treated as admin/staff

  return (
    <AuthContext.Provider value={{ user, loading, signOut, isAdmin, loginAsGuest }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
