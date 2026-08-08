'use client';

import React, { useState, useEffect } from 'react';
import { 
  Laptop, 
  Smartphone, 
  MapPin, 
  Clock, 
  Trash2, 
  UserX, 
  RefreshCw, 
  ShieldAlert,
  Globe,
  Wifi,
  CheckCircle2,
  AlertTriangle
} from 'lucide-react';
import { showToast } from '@/components/ui/toast';
import { useAuth } from '@/context/auth-context';
import { 
  getActiveSessions, 
  registerCurrentSession, 
  revokeSession, 
  deleteSessionRecord, 
  UserSessionRecord 
} from '@/lib/session-tracker';

export default function AdminSessionsPage() {
  const { user } = useAuth();
  
  // Active Sessions State
  const [sessions, setSessions] = useState<UserSessionRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentToken, setCurrentToken] = useState<string>('');

  const loadData = async () => {
    try {
      setLoading(true);
      const savedEmail = (typeof window !== 'undefined' && localStorage.getItem('ky_admin_email')) || user?.email || 'admin@saintg.com';
      const token = await registerCurrentSession(savedEmail);
      setCurrentToken(token);
      
      const sessionList = getActiveSessions();
      setSessions(sessionList);
    } catch (err) {
      console.error('Error loading active sessions data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [user]);

  // Session Handlers
  const handleRevoke = (sessionId: string, deviceName: string) => {
    if (!confirm(`Are you sure you want to terminate / revoke session on "${deviceName}"? The user on that device will be logged out.`)) {
      return;
    }

    const updated = revokeSession(sessionId);
    setSessions(updated);
    showToast(`Session on ${deviceName} revoked successfully!`, 'success');
  };

  const handleDeleteSession = (sessionId: string) => {
    if (!confirm('Remove this session log record permanently?')) return;
    const updated = deleteSessionRecord(sessionId);
    setSessions(updated);
    showToast('Session record deleted.', 'info');
  };

  const computerCount = sessions.filter(s => s.device_type === 'Computer' && s.status === 'active').length;
  const mobileCount = sessions.filter(s => s.device_type === 'Mobile Phone' && s.status === 'active').length;
  const activeTotal = sessions.filter(s => s.status === 'active').length;

  return (
    <div className="flex flex-col gap-6 select-none font-sans">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white">Admin Portal - Active Login Sessions</h1>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-black bg-indigo-500/10 border border-indigo-500/20 text-indigo-600 dark:text-indigo-400">
              LIVE MONITORING
            </span>
          </div>
          <p className="text-sm text-slate-500 mt-1">
            Track logged-in user accounts, device types (Computer vs Mobile), IP geolocation, and terminate unauthorized sessions.
          </p>
        </div>

        <button
          onClick={loadData}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-900 dark:bg-slate-800 hover:bg-slate-800 dark:hover:bg-slate-700 text-white font-bold text-xs uppercase tracking-wider shadow-md transition-all cursor-pointer"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh Live Sessions
        </button>
      </div>

      {/* Stats Ribbon */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="flex items-center gap-4 p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm">
          <div className="w-12 h-12 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-500">
            <CheckCircle2 className="w-6 h-6" />
          </div>
          <div>
            <div className="text-2xl font-black text-slate-900 dark:text-white">{activeTotal}</div>
            <div className="text-xs font-bold text-slate-500">Total Active Sessions</div>
          </div>
        </div>

        <div className="flex items-center gap-4 p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm">
          <div className="w-12 h-12 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-500">
            <Laptop className="w-6 h-6" />
          </div>
          <div>
            <div className="text-2xl font-black text-slate-900 dark:text-white">{computerCount}</div>
            <div className="text-xs font-bold text-slate-500">Computer / Desktops</div>
          </div>
        </div>

        <div className="flex items-center gap-4 p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm">
          <div className="w-12 h-12 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-500">
            <Smartphone className="w-6 h-6" />
          </div>
          <div>
            <div className="text-2xl font-black text-slate-900 dark:text-white">{mobileCount}</div>
            <div className="text-xs font-bold text-slate-500">Mobile Phones</div>
          </div>
        </div>

        <div className="flex items-center gap-4 p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm">
          <div className="w-12 h-12 rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-500">
            <Globe className="w-6 h-6" />
          </div>
          <div>
            <div className="text-2xl font-black text-slate-900 dark:text-white">
              {new Set(sessions.map(s => s.location)).size || 1}
            </div>
            <div className="text-xs font-bold text-slate-500">Unique IP Locations</div>
          </div>
        </div>
      </div>

      {/* Sessions Table */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm overflow-hidden">
        <div className="p-5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShieldAlert className="w-5 h-5 text-indigo-500" />
            <h2 className="font-extrabold text-base text-slate-900 dark:text-white">Active Logged-In Device Sessions</h2>
          </div>
          <span className="text-xs text-slate-400 font-medium">Real-time live tracker</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-100 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 text-slate-500 uppercase tracking-wider font-extrabold">
                <th className="py-3.5 px-4">User / Email</th>
                <th className="py-3.5 px-4">Device Type & Model</th>
                <th className="py-3.5 px-4">IP Address & Geolocation</th>
                <th className="py-3.5 px-4">Login Time</th>
                <th className="py-3.5 px-4">Status</th>
                <th className="py-3.5 px-4 text-right">Action / Revoke</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800 text-slate-700 dark:text-slate-200">
              {sessions.map((s) => {
                const isCurrent = s.session_token === currentToken;
                const isRevoked = s.status === 'revoked';

                return (
                  <tr 
                    key={s.id}
                    className={`transition-colors ${isCurrent ? 'bg-indigo-500/5 dark:bg-indigo-500/10' : 'hover:bg-slate-50 dark:hover:bg-slate-800/40'}`}
                  >
                    {/* User Email */}
                    <td className="py-4 px-4 font-bold">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-full bg-slate-800 text-white flex items-center justify-center font-black text-xs uppercase">
                          {s.user_email.slice(0, 2)}
                        </div>
                        <div className="flex flex-col">
                          <span className="text-slate-900 dark:text-white font-extrabold">{s.user_email}</span>
                          {isCurrent && (
                            <span className="text-[10px] text-indigo-500 font-extrabold flex items-center gap-1">
                              <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-pulse"></span> THIS DEVICE
                            </span>
                          )}
                        </div>
                      </div>
                    </td>

                    {/* Device Type & Model */}
                    <td className="py-4 px-4">
                      <div className="flex items-center gap-2.5">
                        {s.device_type === 'Computer' ? (
                          <div className="p-2 rounded-lg bg-indigo-500/10 text-indigo-500 border border-indigo-500/20">
                            <Laptop className="w-4 h-4" />
                          </div>
                        ) : (
                          <div className="p-2 rounded-lg bg-amber-500/10 text-amber-500 border border-amber-500/20">
                            <Smartphone className="w-4 h-4" />
                          </div>
                        )}
                        <div>
                          <div className="font-bold text-slate-800 dark:text-slate-200">{s.device_name}</div>
                          <div className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider">{s.device_type}</div>
                        </div>
                      </div>
                    </td>

                    {/* IP Address & Location */}
                    <td className="py-4 px-4">
                      <div className="flex flex-col">
                        <div className="flex items-center gap-1.5 font-mono font-bold text-slate-800 dark:text-slate-200">
                          <Wifi className="w-3.5 h-3.5 text-cyan-500" />
                          <span>{s.ip_address}</span>
                        </div>
                        <div className="flex items-center gap-1 text-[11px] text-slate-400 font-semibold mt-0.5">
                          <MapPin className="w-3 h-3 text-rose-500" />
                          <span>{s.location}</span>
                        </div>
                      </div>
                    </td>

                    {/* Login Time */}
                    <td className="py-4 px-4 text-slate-500 font-medium whitespace-nowrap">
                      <div className="flex items-center gap-1.5">
                        <Clock className="w-3.5 h-3.5 text-slate-400" />
                        <span>{new Date(s.login_at).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}</span>
                      </div>
                    </td>

                    {/* Status Badge */}
                    <td className="py-4 px-4">
                      {isRevoked ? (
                        <span className="px-2.5 py-1 rounded-full text-[11px] font-extrabold bg-rose-500/10 border border-rose-500/20 text-rose-500 flex items-center gap-1 w-max">
                          <AlertTriangle className="w-3 h-3" /> REVOKED
                        </span>
                      ) : (
                        <span className="px-2.5 py-1 rounded-full text-[11px] font-extrabold bg-emerald-500/10 border border-emerald-500/20 text-emerald-500 flex items-center gap-1 w-max">
                          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span> ACTIVE
                        </span>
                      )}
                    </td>

                    {/* Actions */}
                    <td className="py-4 px-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        {!isRevoked ? (
                          <button
                            onClick={() => handleRevoke(s.id, s.device_name)}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 active:scale-95 text-white font-bold text-xs shadow-sm transition-all cursor-pointer"
                            title="Kick out / terminate this session"
                          >
                            <UserX className="w-3.5 h-3.5" />
                            Revoke Session
                          </button>
                        ) : (
                          <button
                            onClick={() => handleDeleteSession(s.id)}
                            className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-800 hover:bg-rose-500/10 hover:text-rose-500 text-slate-400 transition-all cursor-pointer"
                            title="Delete Log Record"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
