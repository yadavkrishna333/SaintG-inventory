'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/auth-context';
import { LogIn, Key, Mail, ShieldAlert, Sparkles, UserPlus } from 'lucide-react';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSignUp, setIsSignUp] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const { user, loading, loginAsGuest } = useAuth();
  const router = useRouter();

  const handleBypass = () => {
    setErrorMsg('');
    setSuccessMsg('');
    const password = prompt('Enter the Local Admin Bypass password:');
    if (password === null) return;
    
    if (password !== '6396119962') {
      setErrorMsg('Incorrect bypass password!');
      return;
    }
    
    loginAsGuest();
    setSuccessMsg('Logged in successfully!');
    setTimeout(() => router.push('/dashboard'), 500);
  };

  useEffect(() => {
    if (!loading && user) {
      router.push('/dashboard');
    }
  }, [user, loading, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');
    setSubmitting(true);

    try {
      if (isSignUp) {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
        });
        if (error) throw error;
        if (data.user && data.session === null) {
          setSuccessMsg('Registration successful! Please check your email to confirm your account.');
        } else {
          setSuccessMsg('Registration successful! Redirecting...');
          setTimeout(() => router.push('/dashboard'), 1500);
        }
      } else {
        // Intercept user's credentials for fallback authentication bypass
        if (email.toLowerCase().trim() === 'krishan@gmail.com' && password === 'Krishan@123') {
          loginAsGuest();
          setSuccessMsg('Logged in successfully!');
          setTimeout(() => router.push('/dashboard'), 500);
          return;
        }

        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (error) {
          // If Supabase authentication fails (e.g. server down or user not confirmed), check credentials again for bypass safety
          if (email.toLowerCase().trim() === 'krishan@gmail.com' && password === 'Krishan@123') {
            loginAsGuest();
            setSuccessMsg('Logged in successfully!');
            setTimeout(() => router.push('/dashboard'), 500);
            return;
          }
          throw error;
        }
        router.push('/dashboard');
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'An error occurred during authentication.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center bg-slate-900 min-h-screen">
        <div className="animate-pulse text-indigo-400 font-semibold">Checking credentials...</div>
      </div>
    );
  }

  return (
    <div className="relative flex flex-1 items-center justify-center min-h-screen bg-slate-950 overflow-hidden font-sans select-none">
      {/* Background decoration */}
      <div className="absolute top-[-20%] left-[-10%] w-[500px] h-[500px] rounded-full bg-indigo-500/10 blur-[120px] pointer-events-none animate-pulse"></div>
      <div className="absolute bottom-[-20%] right-[-10%] w-[600px] h-[600px] rounded-full bg-emerald-500/10 blur-[150px] pointer-events-none"></div>

      <div className="relative w-full max-w-md p-8 m-4 rounded-2xl border border-slate-800 bg-slate-900/80 backdrop-blur-xl shadow-2xl transition-all duration-300">
        <div className="flex flex-col items-center mb-8">
          <div className="flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-tr from-violet-600 via-indigo-600 to-cyan-500 shadow-xl border border-white/10 mb-4 shadow-[0_8px_30px_rgba(99,102,241,0.3)]">
            <span className="font-black text-2xl text-white tracking-tighter animate-pulse">KY</span>
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight bg-gradient-to-r from-white via-indigo-200 to-emerald-400 bg-clip-text text-transparent">
            KY Inventory
          </h1>
          <p className="text-sm text-slate-400 mt-2 text-center">
            {isSignUp ? 'Create administrator credentials' : 'Secure Admin Portal Access'}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          {errorMsg && (
            <div className="flex items-center gap-3 p-3 rounded-lg border border-red-500/30 bg-red-500/10 text-red-400 text-xs">
              <ShieldAlert className="w-5 h-5 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {successMsg && (
            <div className="flex items-center gap-3 p-3 rounded-lg border border-emerald-500/30 bg-emerald-500/10 text-emerald-400 text-xs">
              <Sparkles className="w-5 h-5 shrink-0" />
              <span>{successMsg}</span>
            </div>
          )}

          <div className="space-y-1">
            <label className="text-xs font-semibold tracking-wider uppercase text-slate-400">Email Address</label>
            <div className="relative">
              <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-slate-500">
                <Mail className="w-4 h-4" />
              </span>
              <input
                type="email"
                required
                className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-slate-800 bg-slate-950 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
                placeholder="admin@ky.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-semibold tracking-wider uppercase text-slate-400">Password</label>
            <div className="relative">
              <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-slate-500">
                <Key className="w-4 h-4" />
              </span>
              <input
                type="password"
                required
                className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-slate-800 bg-slate-950 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-lg bg-gradient-to-r from-indigo-600 to-emerald-600 hover:from-indigo-500 hover:to-emerald-500 active:scale-[0.98] text-white font-semibold shadow-lg shadow-indigo-500/10 transition-all duration-150 disabled:opacity-50 disabled:pointer-events-none"
          >
            {submitting ? (
              <div className="w-5 h-5 rounded-full border-2 border-white border-t-transparent animate-spin"></div>
            ) : isSignUp ? (
              <>
                <UserPlus className="w-5 h-5" />
                Register Admin Account
              </>
            ) : (
              <>
                <LogIn className="w-5 h-5" />
                Access Dashboard
              </>
            )}
          </button>

          {!isSignUp && (
            <button
              type="button"
              onClick={handleBypass}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-lg border border-slate-800 hover:border-slate-750 bg-slate-950/30 hover:bg-slate-950/70 active:scale-[0.98] text-slate-400 hover:text-slate-200 font-semibold text-sm transition-all duration-150"
            >
              Enter as Local Admin (Bypass Login)
            </button>
          )}
        </form>

        <div className="mt-6 pt-6 border-t border-slate-800 text-center">
          <button
            onClick={() => {
              setIsSignUp(!isSignUp);
              setErrorMsg('');
              setSuccessMsg('');
            }}
            className="text-xs text-indigo-400 hover:text-indigo-300 font-medium transition-all"
          >
            {isSignUp ? 'Already have an admin account? Sign In' : "Don't have an admin account? Register one"}
          </button>
        </div>
      </div>
    </div>
  );
}
