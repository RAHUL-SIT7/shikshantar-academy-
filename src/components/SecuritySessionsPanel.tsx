import React, { useState, useEffect, useCallback } from 'react';
import {
  MonitorSmartphone,
  Laptop,
  Smartphone,
  Tablet,
  Globe,
  MapPin,
  Clock,
  ShieldCheck,
  ShieldAlert,
  LogOut,
  RefreshCw,
  History,
  Trash2,
  CheckCircle2,
  AlertTriangle,
  KeyRound,
  X
} from 'lucide-react';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { auth, db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import { formatBSDateTime } from '../lib/nepaliDate';

export interface SessionRecord {
  sessionId: string;
  userUid: string;
  email: string;
  userName: string;
  role: string;
  status: string;
  browser: string;
  operatingSystem: string;
  deviceType: string;
  deviceName: string;
  compositeName: string;
  approximateLocation: string;
  ipAddress: string;
  loginAt: string | null;
  lastActiveAt: string | null;
  logoutAt: string | null;
  revokedAt: string | null;
  verifiedAt: string | null;
  trustedDeviceMatched: boolean;
  isCurrent: boolean;
}

export interface TrustedDeviceRecord {
  deviceId: string;
  browser: string;
  os: string;
  deviceName: string;
  lastLocation: string;
  lastIp: string;
  revoked: boolean;
  createdAt: string | null;
  lastUsedAt: string | null;
  expiresAtMs: number;
  isCurrentDevice: boolean;
}

export interface SecuritySessionsSummary {
  deviceVerificationEnforced: boolean;
  otpProtectionEligible: boolean;
  totalActiveSessions: number;
  totalTrustedDevices: number;
  lastLoginAt: string | null;
  lastLoginDevice: string | null;
  lastLoginLocation: string | null;
}

interface SecuritySessionsPanelProps {
  targetUid?: string;
  readOnly?: boolean;
  title?: string;
  onSummaryLoaded?: (summary: SecuritySessionsSummary) => void;
}

type ConfirmAction =
  | { type: 'revoke_session'; sessionId: string; label: string }
  | { type: 'logout_others' }
  | { type: 'revoke_trust'; deviceId: string; label: string; isCurrentDevice: boolean }
  | { type: 'revoke_all_trust' };

function toValidDate(val: any): Date | null {
  if (!val) return null;
  if (val instanceof Date) return Number.isNaN(val.getTime()) ? null : val;
  if (typeof val === 'number') {
    const d = new Date(val);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  if (typeof val === 'string') {
    const d = new Date(val);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  if (typeof val?.toDate === 'function') {
    const d = val.toDate();
    return Number.isNaN(d.getTime()) ? null : d;
  }
  if (typeof val?.seconds === 'number') {
    return new Date(val.seconds * 1000);
  }
  return null;
}

function formatFullTimestamp(val: any): { bs: string; ad: string; relative: string } {
  const d = toValidDate(val);
  if (!d) {
    return { bs: 'Unknown time', ad: '', relative: '' };
  }

  let bs = '';
  try {
    bs = formatBSDateTime(d);
  } catch {
    bs = d.toLocaleString('en-US', { timeZone: 'Asia/Kathmandu' });
  }

  let ad = '';
  try {
    ad = d.toLocaleString('en-US', {
      timeZone: 'Asia/Kathmandu',
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    }) + ' NPT';
  } catch {
    ad = d.toLocaleString();
  }

  const diffMs = Date.now() - d.getTime();
  let relative = 'Just now';
  if (diffMs < 0) {
    const aheadDays = Math.ceil(Math.abs(diffMs) / (1000 * 60 * 60 * 24));
    relative = `in ${aheadDays}d`;
  } else if (diffMs >= 60_000) {
    const mins = Math.floor(diffMs / 60_000);
    if (mins < 60) relative = `${mins}m ago`;
    else {
      const hrs = Math.floor(mins / 60);
      if (hrs < 24) relative = `${hrs}h ago`;
      else {
        const days = Math.floor(hrs / 24);
        relative = `${days}d ago`;
      }
    }
  }

  return { bs, ad, relative };
}

function renderDeviceIcon(deviceType?: string, className = 'w-5 h-5') {
  const dt = String(deviceType || '').toLowerCase();
  if (dt.includes('mobile') || dt.includes('phone') || dt.includes('iphone') || dt.includes('android')) {
    return <Smartphone className={className} />;
  }
  if (dt.includes('tablet') || dt.includes('ipad')) {
    return <Tablet className={className} />;
  }
  return <Laptop className={className} />;
}

export default function SecuritySessionsPanel({
  targetUid,
  readOnly = false,
  title = 'Active Sessions, Login History & Trusted Browsers',
  onSummaryLoaded
}: SecuritySessionsPanelProps) {
  const { user, sessionId, clearCurrentDeviceTrust } = useAuth();
  const [activeTab, setActiveTab] = useState<'active' | 'history' | 'trusted'>('active');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [fallbackNotice, setFallbackNotice] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [statusToast, setStatusToast] = useState<string | null>(null);
  const [confirmAction, setConfirmAction] = useState<ConfirmAction | null>(null);

  const [activeSessions, setActiveSessions] = useState<SessionRecord[]>([]);
  const [loginHistory, setLoginHistory] = useState<SessionRecord[]>([]);
  const [trustedDevices, setTrustedDevices] = useState<TrustedDeviceRecord[]>([]);
  const [summary, setSummary] = useState<SecuritySessionsSummary | null>(null);

  const effectiveUid = targetUid || user?.uid || '';
  const isSelf = !targetUid || targetUid === user?.uid;

  const getLocalTrustToken = useCallback(() => {
    if (!user?.uid || !isSelf) return '';
    try {
      return (localStorage.getItem(`shikshantar_device_trust_${user.uid}`) || '').trim();
    } catch {
      return '';
    }
  }, [user?.uid, isSelf]);

  const showNoticeToast = (msg: string) => {
    setStatusToast(msg);
    setTimeout(() => setStatusToast(null), 4500);
  };

  const fetchSessions = useCallback(async (isManualRefresh = false) => {
    if (!auth.currentUser || !effectiveUid) {
      setLoading(false);
      return;
    }
    if (isManualRefresh) setRefreshing(true);
    else setLoading(true);
    setErrorMsg(null);
    setFallbackNotice(null);

    const currentSessionId = sessionId || localStorage.getItem('localSessionId') || '';
    const trustToken = getLocalTrustToken();

    try {
      const idToken = await auth.currentUser.getIdToken();
      const queryUrl = targetUid && targetUid !== auth.currentUser.uid
        ? `/api/auth/sessions?uid=${encodeURIComponent(targetUid)}`
        : '/api/auth/sessions';

      const headers: Record<string, string> = {
        Authorization: `Bearer ${idToken}`
      };
      if (currentSessionId) headers['x-shikshantar-session-id'] = currentSessionId;
      if (trustToken) headers['x-shikshantar-device-token'] = trustToken;

      const res = await fetch(queryUrl, { headers, credentials: 'include' });
      const data = await res.json().catch(() => ({}));

      if (!res.ok || !data.success) {
        throw new Error(data.error || `Server returned ${res.status}`);
      }

      setActiveSessions(Array.isArray(data.activeSessions) ? data.activeSessions : []);
      setLoginHistory(Array.isArray(data.loginHistory) ? data.loginHistory : []);
      setTrustedDevices(Array.isArray(data.trustedDevices) ? data.trustedDevices : []);

      if (data.securitySummary) {
        setSummary(data.securitySummary);
        onSummaryLoaded?.(data.securitySummary);
      }
    } catch (apiErr: any) {
      // Fallback: read directly from Firestore user_sessions (allowed by firestore.rules for self & admin)
      try {
        const snap = await getDocs(
          query(collection(db, 'user_sessions'), where('userUid', '==', effectiveUid))
        );
        const rows: SessionRecord[] = snap.docs.map((dSnap) => {
          const d = dSnap.data() || {};
          return {
            sessionId: d.sessionId || dSnap.id,
            userUid: d.userUid || effectiveUid,
            email: d.email || '',
            userName: d.userName || '',
            role: d.role || '',
            status: String(d.status || 'UNKNOWN').toUpperCase(),
            browser: d.browser || 'Unknown Browser',
            operatingSystem: d.operatingSystem || d.os || 'Unknown OS',
            deviceType: d.deviceType || 'Device',
            deviceName: d.deviceName || 'Unknown Device',
            compositeName: d.compositeName || `${d.browser || 'Browser'} on ${d.operatingSystem || d.os || 'Device'}`,
            approximateLocation: d.approximateLocation || 'Location unavailable',
            ipAddress: d.ipAddress || '',
            loginAt: d.loginAt || d.createdAt || d.updatedAt || null,
            lastActiveAt: d.lastActiveAt || d.updatedAt || d.loginAt || null,
            logoutAt: d.logoutAt || null,
            revokedAt: d.revokedAt || null,
            verifiedAt: d.verifiedAt || null,
            trustedDeviceMatched: Boolean(d.trustedDeviceMatched),
            isCurrent: Boolean(isSelf && currentSessionId && (d.sessionId === currentSessionId || dSnap.id === currentSessionId))
          };
        });

        const toMs = (v: any) => toValidDate(v)?.getTime() || 0;
        const active = rows
          .filter((r) => r.status === 'ACTIVE' || r.status === 'PENDING_VERIFICATION')
          .sort((a, b) => (a.isCurrent ? -1 : b.isCurrent ? 1 : toMs(b.lastActiveAt || b.loginAt) - toMs(a.lastActiveAt || a.loginAt)));
        const history = rows
          .filter((r) => r.status !== 'ACTIVE' && r.status !== 'PENDING_VERIFICATION' && Boolean(r.loginAt || r.browser !== 'Unknown Browser'))
          .sort((a, b) => toMs(b.loginAt || b.lastActiveAt || b.revokedAt) - toMs(a.loginAt || a.lastActiveAt || a.revokedAt))
          .slice(0, 30);

        setActiveSessions(active);
        setLoginHistory(history);
        setTrustedDevices([]);

        const latest = [...active, ...history].sort((a, b) => toMs(b.loginAt) - toMs(a.loginAt))[0] || null;
        const fallbackSummary: SecuritySessionsSummary = {
          deviceVerificationEnforced: false,
          otpProtectionEligible: true,
          totalActiveSessions: active.length,
          totalTrustedDevices: 0,
          lastLoginAt: latest?.loginAt || null,
          lastLoginDevice: latest?.compositeName || null,
          lastLoginLocation: latest?.approximateLocation || null
        };
        setSummary(fallbackSummary);
        onSummaryLoaded?.(fallbackSummary);
        setFallbackNotice(
          'Showing saved login records in read-only mode because the backend security API could not be reached. Remote sign-out and trusted browser management require the server security connection.'
        );
      } catch (fsErr: any) {
        setErrorMsg(apiErr?.message || fsErr?.message || 'Unable to load login sessions right now.');
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [effectiveUid, targetUid, sessionId, isSelf, getLocalTrustToken, onSummaryLoaded]);

  useEffect(() => {
    fetchSessions(false);
  }, [fetchSessions]);

  const executeConfirmedAction = async () => {
    if (!confirmAction || !auth.currentUser) return;
    const action = confirmAction;
    setConfirmAction(null);
    setErrorMsg(null);

    const currentSessionId = sessionId || localStorage.getItem('localSessionId') || '';
    const trustToken = getLocalTrustToken();

    try {
      const idToken = await auth.currentUser.getIdToken();
      const baseHeaders: Record<string, string> = {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${idToken}`
      };
      if (currentSessionId) baseHeaders['x-shikshantar-session-id'] = currentSessionId;
      if (trustToken) baseHeaders['x-shikshantar-device-token'] = trustToken;

      if (action.type === 'revoke_session') {
        setBusyKey(action.sessionId);
        const res = await fetch('/api/auth/revoke-session', {
          method: 'POST',
          headers: baseHeaders,
          credentials: 'include',
          body: JSON.stringify({
            sessionId: action.sessionId,
            currentSessionId
          })
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data.success) {
          throw new Error(data.error || 'Failed to revoke session.');
        }
        showNoticeToast(`Signed out "${action.label}" successfully.`);
        await fetchSessions(true);
      } else if (action.type === 'logout_others') {
        setBusyKey('logout_others');
        const res = await fetch('/api/auth/logout-other-sessions', {
          method: 'POST',
          headers: baseHeaders,
          credentials: 'include',
          body: JSON.stringify({ currentSessionId })
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data.success) {
          throw new Error(data.error || 'Failed to sign out other devices.');
        }
        showNoticeToast('All other active devices have been signed out.');
        await fetchSessions(true);
      } else if (action.type === 'revoke_trust') {
        setBusyKey(action.deviceId);
        const res = await fetch('/api/auth/revoke-trusted-device', {
          method: 'POST',
          headers: baseHeaders,
          credentials: 'include',
          body: JSON.stringify({ deviceId: action.deviceId })
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data.success) {
          throw new Error(data.error || 'Failed to remove trusted browser.');
        }
        if (data.clearedCurrentDeviceTrust || action.isCurrentDevice) {
          clearCurrentDeviceTrust();
        }
        showNoticeToast(
          data.message || 'Trusted browser removed. Next sign-in from that browser will require a 6-digit code.'
        );
        await fetchSessions(true);
      } else if (action.type === 'revoke_all_trust') {
        setBusyKey('revoke_all_trust');
        const res = await fetch('/api/auth/revoke-trusted-device', {
          method: 'POST',
          headers: baseHeaders,
          credentials: 'include',
          body: JSON.stringify({ revokeAll: true })
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data.success) {
          throw new Error(data.error || 'Failed to clear trusted browsers.');
        }
        clearCurrentDeviceTrust();
        showNoticeToast(
          data.message || 'All trusted browsers removed. Your next login will require a 6-digit verification code.'
        );
        await fetchSessions(true);
      }
    } catch (err: any) {
      setErrorMsg(err?.message || 'Security action failed. Please try again.');
    } finally {
      setBusyKey(null);
    }
  };

  const otherActiveCount = activeSessions.filter((s) => !s.isCurrent).length;

  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-[0_2px_8px_rgba(0,0,0,0.08)] border border-gray-100 dark:border-slate-800 overflow-hidden">
      {/* Header */}
      <div className="p-5 border-b border-gray-100 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-[15px] font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <MonitorSmartphone className="w-5 h-5 text-primary dark:text-blue-400" />
            {title}
          </h2>
          <p className="text-xs text-gray-500 dark:text-slate-400 mt-0.5">
            Track where and when this account is signed in, inspect exact timestamps & locations, and manage trusted browsers.
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {summary?.otpProtectionEligible && (
            <span className="inline-flex items-center gap-1.5 text-[11px] font-bold px-2.5 py-1 rounded-full bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
              <ShieldCheck className="w-3.5 h-3.5" />
              New-Device Email OTP Active
            </span>
          )}
          <button
            type="button"
            onClick={() => fetchSessions(true)}
            disabled={refreshing || loading}
            className="inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-gray-700 dark:text-slate-200 hover:bg-gray-50 dark:hover:bg-slate-700 transition-colors cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      {/* Inline Feedback Banners */}
      {statusToast && (
        <div className="mx-5 mt-4 p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200 text-xs font-bold flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
          <span>{statusToast}</span>
        </div>
      )}

      {fallbackNotice && (
        <div className="mx-5 mt-4 p-3 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-200 text-xs font-medium flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-amber-600" />
          <span>{fallbackNotice}</span>
        </div>
      )}

      {errorMsg && (
        <div className="mx-5 mt-4 p-3 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 text-xs font-bold flex items-start gap-2">
          <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Tabs */}
      <div className="px-5 pt-4 border-b border-gray-100 dark:border-slate-800 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setActiveTab('active')}
          className={`px-3.5 py-2 text-xs font-bold rounded-t-lg border-b-2 transition-colors flex items-center gap-1.5 cursor-pointer ${
            activeTab === 'active'
              ? 'border-primary text-primary dark:border-blue-400 dark:text-blue-400 bg-blue-50/40 dark:bg-blue-950/30'
              : 'border-transparent text-gray-500 dark:text-slate-400 hover:text-gray-800 dark:hover:text-slate-200'
          }`}
        >
          <MonitorSmartphone className="w-3.5 h-3.5" />
          Active Sessions
          <span className="px-1.5 py-0.5 rounded-full text-[10px] font-black bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300">
            {activeSessions.length}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('history')}
          className={`px-3.5 py-2 text-xs font-bold rounded-t-lg border-b-2 transition-colors flex items-center gap-1.5 cursor-pointer ${
            activeTab === 'history'
              ? 'border-primary text-primary dark:border-blue-400 dark:text-blue-400 bg-blue-50/40 dark:bg-blue-950/30'
              : 'border-transparent text-gray-500 dark:text-slate-400 hover:text-gray-800 dark:hover:text-slate-200'
          }`}
        >
          <History className="w-3.5 h-3.5" />
          Login History
          <span className="px-1.5 py-0.5 rounded-full text-[10px] font-black bg-gray-100 dark:bg-slate-800 text-gray-700 dark:text-slate-300">
            {loginHistory.length}
          </span>
        </button>

        {(!readOnly || trustedDevices.length > 0) && (
          <button
            type="button"
            onClick={() => setActiveTab('trusted')}
            className={`px-3.5 py-2 text-xs font-bold rounded-t-lg border-b-2 transition-colors flex items-center gap-1.5 cursor-pointer ${
              activeTab === 'trusted'
                ? 'border-primary text-primary dark:border-blue-400 dark:text-blue-400 bg-blue-50/40 dark:bg-blue-950/30'
                : 'border-transparent text-gray-500 dark:text-slate-400 hover:text-gray-800 dark:hover:text-slate-200'
            }`}
          >
            <KeyRound className="w-3.5 h-3.5" />
            Trusted Browsers
            <span className="px-1.5 py-0.5 rounded-full text-[10px] font-black bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300">
              {trustedDevices.length}
            </span>
          </button>
        )}
      </div>

      {/* Tab Body */}
      <div className="p-5">
        {loading ? (
          <div className="py-10 text-center text-xs font-bold text-gray-500 dark:text-slate-400 animate-pulse">
            Loading device & login records...
          </div>
        ) : activeTab === 'active' ? (
          <div className="space-y-4">
            {!readOnly && otherActiveCount > 0 && !fallbackNotice && (
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-3 rounded-xl bg-red-50/60 dark:bg-red-950/20 border border-red-100 dark:border-red-900/50">
                <p className="text-xs font-semibold text-red-800 dark:text-red-300">
                  {otherActiveCount} other {otherActiveCount === 1 ? 'device is' : 'devices are'} currently signed in to this account.
                </p>
                <button
                  type="button"
                  disabled={busyKey === 'logout_others'}
                  onClick={() => setConfirmAction({ type: 'logout_others' })}
                  className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg bg-white dark:bg-slate-900 border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 hover:bg-red-600 hover:text-white text-xs font-bold transition-colors cursor-pointer disabled:opacity-50"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  {busyKey === 'logout_others' ? 'Signing out...' : 'Logout All Other Devices'}
                </button>
              </div>
            )}

            {activeSessions.length === 0 ? (
              <div className="py-8 text-center text-xs font-semibold text-gray-500 dark:text-slate-400">
                No active sessions recorded yet for this account.
              </div>
            ) : (
              <div className="space-y-3">
                {activeSessions.map((sess) => {
                  const loginTs = formatFullTimestamp(sess.loginAt);
                  const activeTs = formatFullTimestamp(sess.lastActiveAt || sess.loginAt);
                  const isPending = sess.status === 'PENDING_VERIFICATION';
                  return (
                    <div
                      key={sess.sessionId}
                      className={`rounded-xl border p-4 transition-colors ${
                        sess.isCurrent
                          ? 'bg-blue-50/50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-800/80'
                          : isPending
                            ? 'bg-amber-50/50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-800/80'
                            : 'bg-gray-50/60 dark:bg-slate-800/50 border-gray-200/80 dark:border-slate-700/80'
                      }`}
                    >
                      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                        <div className="flex items-start gap-3 min-w-0">
                          <div
                            className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                              sess.isCurrent
                                ? 'bg-blue-100 dark:bg-blue-900/60 text-primary dark:text-blue-300'
                                : 'bg-white dark:bg-slate-800 text-gray-600 dark:text-slate-300 border border-gray-200 dark:border-slate-700'
                            }`}
                          >
                            {renderDeviceIcon(sess.deviceType)}
                          </div>

                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <p className="text-sm font-black text-gray-900 dark:text-white">
                                {sess.compositeName}
                              </p>
                              {sess.isCurrent && (
                                <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full bg-blue-600 text-white">
                                  This Device
                                </span>
                              )}
                              <span
                                className={`text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full ${
                                  isPending
                                    ? 'bg-amber-100 dark:bg-amber-900/60 text-amber-800 dark:text-amber-300'
                                    : 'bg-emerald-100 dark:bg-emerald-900/60 text-emerald-700 dark:text-emerald-300'
                                }`}
                              >
                                {isPending ? 'Awaiting 6-Digit Code' : 'Active'}
                              </span>
                              {sess.trustedDeviceMatched && (
                                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200/70 dark:border-indigo-800">
                                  Trusted Browser
                                </span>
                              )}
                            </div>

                            <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1.5 text-xs text-gray-600 dark:text-slate-300">
                              <div className="flex items-start gap-1.5">
                                <Clock className="w-3.5 h-3.5 text-gray-400 shrink-0 mt-0.5" />
                                <div>
                                  <span className="font-bold text-gray-800 dark:text-slate-200">Signed in:</span>{' '}
                                  <span>{loginTs.bs}</span>
                                  {loginTs.ad && (
                                    <span className="block text-[11px] text-gray-500 dark:text-slate-400">
                                      {loginTs.ad} ({loginTs.relative})
                                    </span>
                                  )}
                                </div>
                              </div>

                              <div className="flex items-start gap-1.5">
                                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0 mt-0.5" />
                                <div>
                                  <span className="font-bold text-gray-800 dark:text-slate-200">Last active:</span>{' '}
                                  <span>{sess.isCurrent ? 'Active now' : activeTs.relative || activeTs.bs}</span>
                                  {activeTs.ad && (
                                    <span className="block text-[11px] text-gray-500 dark:text-slate-400">
                                      {activeTs.ad}
                                    </span>
                                  )}
                                </div>
                              </div>

                              <div className="flex items-center gap-1.5">
                                <MapPin className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                                <span className="truncate">
                                  <span className="font-bold text-gray-800 dark:text-slate-200">Location:</span>{' '}
                                  {sess.approximateLocation || 'Location unavailable'}
                                </span>
                              </div>

                              <div className="flex items-center gap-1.5">
                                <Globe className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                                <span className="font-mono text-[11px]">
                                  <span className="font-sans font-bold text-gray-800 dark:text-slate-200">IP:</span>{' '}
                                  {sess.ipAddress || 'Unavailable'}
                                </span>
                              </div>
                            </div>
                          </div>
                        </div>

                        {!readOnly && !sess.isCurrent && !fallbackNotice && (
                          <button
                            type="button"
                            disabled={busyKey === sess.sessionId}
                            onClick={() =>
                              setConfirmAction({
                                type: 'revoke_session',
                                sessionId: sess.sessionId,
                                label: `${sess.compositeName} (${sess.approximateLocation})`
                              })
                            }
                            className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg bg-white dark:bg-slate-900 border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 hover:bg-red-600 hover:text-white text-xs font-bold transition-colors shrink-0 cursor-pointer disabled:opacity-50"
                          >
                            <LogOut className="w-3.5 h-3.5" />
                            {busyKey === sess.sessionId ? 'Revoking...' : 'Log Out'}
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        ) : activeTab === 'history' ? (
          <div className="space-y-2.5">
            {loginHistory.length === 0 ? (
              <div className="py-8 text-center text-xs font-semibold text-gray-500 dark:text-slate-400">
                No past sign-in history found yet.
              </div>
            ) : (
              loginHistory.map((sess) => {
                const loginTs = formatFullTimestamp(sess.loginAt);
                const endedVal = sess.revokedAt || sess.logoutAt;
                const endedTs = endedVal ? formatFullTimestamp(endedVal) : null;
                return (
                  <div
                    key={sess.sessionId}
                    className="rounded-xl border border-gray-200/80 dark:border-slate-800 bg-gray-50/40 dark:bg-slate-800/30 p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                  >
                    <div className="flex items-start gap-3 min-w-0">
                      <div className="w-9 h-9 rounded-lg bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 flex items-center justify-center text-gray-500 dark:text-slate-400 shrink-0">
                        {renderDeviceIcon(sess.deviceType, 'w-4 h-4')}
                      </div>
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-xs font-black text-gray-900 dark:text-white">
                            {sess.compositeName}
                          </p>
                          <span
                            className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-full ${
                              sess.status === 'REVOKED'
                                ? 'bg-red-100 dark:bg-red-950/60 text-red-700 dark:text-red-300'
                                : 'bg-gray-200 dark:bg-slate-700 text-gray-700 dark:text-slate-300'
                            }`}
                          >
                            {sess.status === 'REVOKED' ? 'Revoked' : 'Signed Out'}
                          </span>
                        </div>
                        <p className="text-[11px] text-gray-600 dark:text-slate-300 mt-1">
                          <span className="font-bold">Login:</span> {loginTs.bs}
                          {loginTs.ad ? ` (${loginTs.ad})` : ''}
                        </p>
                        {endedTs && (
                          <p className="text-[11px] text-gray-500 dark:text-slate-400">
                            <span className="font-bold">{sess.status === 'REVOKED' ? 'Revoked:' : 'Signed out:'}</span>{' '}
                            {endedTs.bs} {endedTs.ad ? `(${endedTs.ad})` : ''}
                          </p>
                        )}
                        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1 text-[11px] text-gray-500 dark:text-slate-400">
                          <span className="inline-flex items-center gap-1">
                            <MapPin className="w-3 h-3" /> {sess.approximateLocation || 'Location unavailable'}
                          </span>
                          {sess.ipAddress && (
                            <span className="inline-flex items-center gap-1 font-mono">
                              <Globe className="w-3 h-3" /> {sess.ipAddress}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        ) : (
          <div className="space-y-4">
            <div className="p-3.5 rounded-xl bg-indigo-50/60 dark:bg-indigo-950/30 border border-indigo-100 dark:border-indigo-900/60 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="text-xs text-indigo-900 dark:text-indigo-200">
                <p className="font-bold">How Trusted Browsers Work</p>
                <p className="text-indigo-800/80 dark:text-indigo-300/80 mt-0.5">
                  Verified browsers stay trusted for 30 days so you are not asked for a 6-digit email code every login. Removing trust forces a fresh 6-digit email OTP verification on the next login.
                </p>
              </div>
              {!readOnly && trustedDevices.length > 0 && !fallbackNotice && (
                <button
                  type="button"
                  disabled={busyKey === 'revoke_all_trust'}
                  onClick={() => setConfirmAction({ type: 'revoke_all_trust' })}
                  className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-white dark:bg-slate-900 border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 hover:bg-red-600 hover:text-white text-xs font-bold transition-colors shrink-0 cursor-pointer disabled:opacity-50"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  {busyKey === 'revoke_all_trust' ? 'Removing...' : 'Untrust All Browsers'}
                </button>
              )}
            </div>

            {trustedDevices.length === 0 ? (
              <div className="py-8 text-center text-xs font-semibold text-gray-500 dark:text-slate-400">
                No trusted browsers saved. Any new sign-in will require a 6-digit email verification code.
              </div>
            ) : (
              <div className="space-y-3">
                {trustedDevices.map((dev) => {
                  const createdTs = formatFullTimestamp(dev.createdAt);
                  const lastUsedTs = formatFullTimestamp(dev.lastUsedAt || dev.createdAt);
                  const expiresTs = dev.expiresAtMs ? formatFullTimestamp(dev.expiresAtMs) : null;
                  return (
                    <div
                      key={dev.deviceId}
                      className={`rounded-xl border p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                        dev.isCurrentDevice
                          ? 'bg-indigo-50/40 dark:bg-indigo-950/20 border-indigo-200 dark:border-indigo-800'
                          : 'bg-gray-50/50 dark:bg-slate-800/40 border-gray-200/80 dark:border-slate-700'
                      }`}
                    >
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-sm font-black text-gray-900 dark:text-white">
                            {dev.browser} on {dev.os}
                          </p>
                          {dev.isCurrentDevice && (
                            <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-indigo-600 text-white">
                              Current Browser
                            </span>
                          )}
                        </div>
                        <div className="mt-1.5 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1 text-[11px] text-gray-600 dark:text-slate-300">
                          <p>
                            <span className="font-bold">Trusted on:</span> {createdTs.bs}
                          </p>
                          <p>
                            <span className="font-bold">Last used:</span> {lastUsedTs.bs} ({lastUsedTs.relative})
                          </p>
                          <p>
                            <span className="font-bold">Location:</span> {dev.lastLocation || 'Location unavailable'}
                          </p>
                          {expiresTs && (
                            <p>
                              <span className="font-bold">Expires:</span> {expiresTs.bs}
                            </p>
                          )}
                        </div>
                      </div>

                      {!readOnly && !fallbackNotice && (
                        <button
                          type="button"
                          disabled={busyKey === dev.deviceId}
                          onClick={() =>
                            setConfirmAction({
                              type: 'revoke_trust',
                              deviceId: dev.deviceId,
                              label: `${dev.browser} on ${dev.os}`,
                              isCurrentDevice: dev.isCurrentDevice
                            })
                          }
                          className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg bg-white dark:bg-slate-900 border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 hover:bg-red-600 hover:text-white text-xs font-bold transition-colors shrink-0 cursor-pointer disabled:opacity-50"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          {busyKey === dev.deviceId ? 'Removing...' : 'Remove Trust'}
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* In-App Confirmation Modal (No window.confirm) */}
      {confirmAction && (
        <div className="fixed inset-0 z-[120] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-gray-200 dark:border-slate-700 w-full max-w-md overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100 dark:border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2 text-red-600 dark:text-red-400">
                <ShieldAlert className="w-5 h-5" />
                <h3 className="text-sm font-black uppercase tracking-wide">Confirm Security Action</h3>
              </div>
              <button
                type="button"
                onClick={() => setConfirmAction(null)}
                className="p-1 text-gray-400 hover:text-gray-700 dark:hover:text-slate-200 rounded-lg cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-5 text-xs text-gray-700 dark:text-slate-300 leading-relaxed">
              {confirmAction.type === 'revoke_session' && (
                <p>
                  Sign out <strong>{confirmAction.label}</strong>? That device will be immediately logged out on its next activity.
                </p>
              )}
              {confirmAction.type === 'logout_others' && (
                <p>
                  Sign out from <strong>all other active devices</strong>? You will stay signed in on this device.
                </p>
              )}
              {confirmAction.type === 'revoke_trust' && (
                <p>
                  Remove trust for <strong>{confirmAction.label}</strong>? The next time you sign in from that browser, a <strong>6-digit email verification code</strong> will be required.
                </p>
              )}
              {confirmAction.type === 'revoke_all_trust' && (
                <p>
                  Remove trust from <strong>all saved browsers</strong>? Every browser (including this one) will require a <strong>6-digit email verification code</strong> on the next sign-in.
                </p>
              )}
            </div>
            <div className="px-5 py-3.5 bg-gray-50 dark:bg-slate-800/60 border-t border-gray-100 dark:border-slate-800 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmAction(null)}
                className="px-4 py-2 rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-bold text-gray-700 dark:text-slate-300 hover:bg-gray-100 dark:hover:bg-slate-800 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={executeConfirmedAction}
                className="px-4 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white text-xs font-bold cursor-pointer"
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
