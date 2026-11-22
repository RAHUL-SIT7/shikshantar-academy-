import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { onAuthStateChanged, signOut, User as FirebaseUser } from 'firebase/auth';
import { doc, getDoc, onSnapshot } from 'firebase/firestore';
import { auth, db } from '../firebase';

export type AuthoritativeRole = 'admin' | 'teacher' | 'student' | 'guest';
export type AdminTier = 'primary' | 'secondary' | '';

export interface DeviceVerificationMeta {
  sessionId: string;
  maskedEmail: string;
  senderEmail: string;
  reason: 'NEW_BROWSER_OR_DEVICE' | 'NEW_LOCATION' | 'DEVICE_MISMATCH' | string;
  browser: string;
  os: string;
  deviceName: string;
  location: string;
  ipAddress: string;
  expiresInSeconds: number;
  resendCooldownSeconds: number;
  emailDispatched: boolean;
  emailAuthFailed?: boolean;
  emailErrorHint?: string;
  smtpNotConfigured?: boolean;
  challengeToken?: string;
}

export interface AuthContextValue {
  user: FirebaseUser | null;
  userProfile: Record<string, any> | null;
  userRole: AuthoritativeRole;
  adminTier: AdminTier;
  isPrimaryAdmin: boolean;
  isSecondaryAdmin: boolean;
  isAuthenticated: boolean;
  loading: boolean;
  authError: string | null;
  sessionId: string;
  verifyingDeviceSession: boolean;
  deviceVerificationRequired: boolean;
  deviceVerificationMeta: DeviceVerificationMeta | null;
  deviceVerificationError: string | null;
  completeDeviceVerification: (newTrustToken?: string | null) => void;
  retryDeviceVerification: () => void;
  clearCurrentDeviceTrust: () => void;
  logout: (redirectReason?: string) => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const BOOTSTRAP_OWNER_EMAIL = 'rahulsah4534@gmail.com';
const INACTIVE_STATUSES = new Set([
  'DELETED',
  'AUTH_DELETED_PENDING_FINALIZATION',
  'DELETION_PENDING',
  'INACTIVE',
  'SUSPENDED',
  'BLOCKED',
  'REJECTED',
  'PENDING',
  'ARCHIVED'
]);

function isDeliverableEmail(email?: string | null): boolean {
  const clean = String(email || '').trim().toLowerCase();
  if (!clean || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean)) return false;
  if (clean.endsWith('@shikshantar.edu.np')) return false;
  return true;
}

async function detectClientBrowser(): Promise<string> {
  try {
    const nav = navigator as any;
    if (nav?.brave && typeof nav.brave.isBrave === 'function') {
      const isBrave = await nav.brave.isBrave().catch(() => false);
      if (isBrave) return 'Brave';
    }
  } catch {}
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent || '' : '';
  if (ua.includes('Edg/')) return 'Edge';
  if (ua.includes('OPR/') || ua.includes('Opera/')) return 'Opera';
  if (ua.includes('Vivaldi/')) return 'Vivaldi';
  if (ua.includes('SamsungBrowser/')) return 'Samsung Internet';
  if (ua.includes('Firefox/')) return 'Firefox';
  if (ua.includes('Chrome/') && !ua.includes('Edg/')) return 'Chrome';
  if (ua.includes('Safari/') && !ua.includes('Chrome/')) return 'Safari';
  return '';
}

function isProfileInactive(data: any): boolean {
  if (!data || typeof data !== 'object') return true;
  if (data.deleted === true) return true;
  if (data.active === false) return true;
  const st = String(data.status || '').trim().toUpperCase();
  return Boolean(st && INACTIVE_STATUSES.has(st));
}

function getOrCreateSessionId(): string {
  const existing = localStorage.getItem('localSessionId');
  if (existing && existing.trim()) return existing.trim();
  const created = `sess_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
  localStorage.setItem('localSessionId', created);
  return created;
}

function getDeviceTrustStorageKey(uid: string): string {
  return `shikshantar_device_trust_${uid}`;
}

function getStoredDeviceTrustToken(uid: string): string {
  try {
    return (localStorage.getItem(getDeviceTrustStorageKey(uid)) || '').trim();
  } catch {
    return '';
  }
}

function setStoredDeviceTrustToken(uid: string, token: string): void {
  try {
    if (uid && token) {
      localStorage.setItem(getDeviceTrustStorageKey(uid), token);
    }
  } catch {}
}

function removeStoredDeviceTrustToken(uid: string): void {
  try {
    if (uid) {
      localStorage.removeItem(getDeviceTrustStorageKey(uid));
    }
  } catch {}
}

// Install once: attach session & trusted-device headers to same-origin /api/* calls
let apiFetchInterceptorInstalled = false;
function installApiSessionFetchInterceptor() {
  if (apiFetchInterceptorInstalled || typeof window === 'undefined' || typeof window.fetch !== 'function') {
    return;
  }
  apiFetchInterceptorInstalled = true;
  const originalFetch = window.fetch.bind(window);
  const wrappedFetch: typeof window.fetch = (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    try {
      const rawUrl = typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.toString()
          : input.url;
      const isSameOriginApi =
        rawUrl.startsWith('/api/') ||
        rawUrl.startsWith(`${window.location.origin}/api/`);

      if (isSameOriginApi) {
        const sid = (localStorage.getItem('localSessionId') || '').trim();
        const uid = auth.currentUser?.uid || (localStorage.getItem('lastUserUid') || '').trim();
        const deviceToken = uid ? getStoredDeviceTrustToken(uid) : '';

        if (sid || deviceToken) {
          const baseHeaders = new Headers(
            init?.headers || (input instanceof Request ? input.headers : undefined)
          );
          if (sid && !baseHeaders.has('X-Shikshantar-Session-Id')) {
            baseHeaders.set('X-Shikshantar-Session-Id', sid);
          }
          if (deviceToken && !baseHeaders.has('X-Shikshantar-Device-Token')) {
            baseHeaders.set('X-Shikshantar-Device-Token', deviceToken);
          }
          return originalFetch(input, { ...init, headers: baseHeaders });
        }
      }
    } catch {}
    return originalFetch(input, init);
  };

  try {
    const desc = Object.getOwnPropertyDescriptor(window, 'fetch');
    if (!desc || desc.writable) {
      window.fetch = wrappedFetch;
    } else if (desc.configurable) {
      Object.defineProperty(window, 'fetch', {
        value: wrappedFetch,
        writable: true,
        configurable: true,
      });
    }
  } catch {
    // Sandboxed environments with non-configurable getter-only window.fetch rely on server HttpOnly session cookies.
  }
}

if (typeof window !== 'undefined') {
  installApiSessionFetchInterceptor();
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [userProfile, setUserProfile] = useState<Record<string, any> | null>(null);
  const [userRole, setUserRole] = useState<AuthoritativeRole>('guest');
  const [adminTier, setAdminTier] = useState<AdminTier>('');
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string>(() => getOrCreateSessionId());
  const [verifyingDeviceSession, setVerifyingDeviceSession] = useState(false);
  const [deviceVerificationRequired, setDeviceVerificationRequired] = useState(false);
  const [deviceVerificationMeta, setDeviceVerificationMeta] = useState<DeviceVerificationMeta | null>(null);
  const [deviceVerificationError, setDeviceVerificationError] = useState<string | null>(null);
  const [verificationAttemptNonce, setVerificationAttemptNonce] = useState(0);

  const inFlightSessionsRef = useRef<Set<string>>(new Set());
  const serverConfirmedSessionsRef = useRef<Set<string>>(new Set());
  const sawCurrentSidInActiveSessionsRef = useRef<Set<string>>(new Set());

  const clearClientSessionStorage = useCallback(() => {
    localStorage.removeItem('userRole');
    localStorage.removeItem('userRoleOverride');
    localStorage.removeItem('studentId');
    localStorage.removeItem('studentClass');
    localStorage.removeItem('adminSearchStudentId');
    localStorage.removeItem('isGuest');
    localStorage.removeItem('teacherSubjects');
    localStorage.removeItem('lastUserUid');
    localStorage.removeItem('localSessionId');
    localStorage.removeItem('shikshantar_last_activity');
    // Note: intentionally preserve per-UID shikshantar_device_trust_${uid} across logouts
  }, []);

  const clearCurrentDeviceTrust = useCallback(() => {
    const uid = auth.currentUser?.uid || user?.uid;
    if (uid) {
      removeStoredDeviceTrustToken(uid);
    }
  }, [user]);

  const retryDeviceVerification = useCallback(() => {
    const uid = auth.currentUser?.uid || user?.uid;
    const currentSid = localStorage.getItem('localSessionId') || sessionId;
    if (uid && currentSid) {
      const key = `${uid}:${currentSid}`;
      inFlightSessionsRef.current.delete(key);
      serverConfirmedSessionsRef.current.delete(key);
    }
    setDeviceVerificationError(null);
    setVerifyingDeviceSession(true);
    setVerificationAttemptNonce((n) => n + 1);
  }, [sessionId, user]);

  const completeDeviceVerification = useCallback((newTrustToken?: string | null) => {
    const uid = auth.currentUser?.uid || user?.uid;
    const currentSid = localStorage.getItem('localSessionId') || sessionId;
    if (uid && newTrustToken) {
      setStoredDeviceTrustToken(uid, newTrustToken);
    }
    if (uid && currentSid) {
      serverConfirmedSessionsRef.current.add(`${uid}:${currentSid}`);
    }
    try {
      localStorage.setItem('shikshantar_last_activity', Date.now().toString());
    } catch {}
    setDeviceVerificationRequired(false);
    setDeviceVerificationMeta(null);
    setDeviceVerificationError(null);
    setVerifyingDeviceSession(false);
  }, [sessionId, user]);

  const resolveAuthoritativeState = useCallback((fbUser: FirebaseUser, data: Record<string, any> | null) => {
    const emailLower = (fbUser.email || '').trim().toLowerCase();
    const isVerifiedOwner = emailLower === BOOTSTRAP_OWNER_EMAIL && fbUser.emailVerified === true;

    if (!data) {
      if (isVerifiedOwner) {
        return {
          valid: true as const,
          role: 'admin' as AuthoritativeRole,
          tier: 'primary' as AdminTier,
          profile: {
            uid: fbUser.uid,
            email: fbUser.email || BOOTSTRAP_OWNER_EMAIL,
            fullName: fbUser.displayName || 'Administrator',
            role: 'admin',
            adminTier: 'primary',
            active: true,
            status: 'approved'
          }
        };
      }
      return { valid: false as const, reason: 'User profile record does not exist.' };
    }

    if (isProfileInactive(data)) {
      return { valid: false as const, reason: 'User account is inactive, pending, or deleted.' };
    }

    const rawRole = String(data.role || '').trim().toLowerCase();
    let role: AuthoritativeRole | '' = '';
    if (rawRole === 'admin') role = 'admin';
    else if (rawRole === 'teacher' || rawRole === 'class_teacher') role = 'teacher';
    else if (rawRole === 'student') role = 'student';
    else if (rawRole === 'guest') role = 'guest';

    if (!role && isVerifiedOwner) {
      role = 'admin';
    }

    if (!role) {
      return { valid: false as const, reason: 'User account lacks a valid authoritative role.' };
    }

    let tier: AdminTier = '';
    if (role === 'admin') {
      const rawTier = String(data.adminTier || '').trim().toLowerCase();
      tier = rawTier === 'primary' || isVerifiedOwner ? 'primary' : 'secondary';
    }

    return {
      valid: true as const,
      role,
      tier,
      profile: { id: fbUser.uid, ...data }
    };
  }, []);

  const logout = useCallback(async (redirectReason?: string) => {
    const currentUser = auth.currentUser;
    const currentSid = localStorage.getItem('localSessionId') || sessionId;

    // Grab ID token quickly (cached token is instantaneous) before signing out locally
    let token: string | null = null;
    if (currentUser && currentSid) {
      token = await Promise.race([
        currentUser.getIdToken().catch(() => null),
        new Promise<null>((resolve) => setTimeout(() => resolve(null), 250))
      ]);
    }

    // Fire server session-logout cleanup in background (keepalive) so UI never hangs
    if (token && currentSid) {
      const controller = new AbortController();
      const abortTimer = window.setTimeout(() => controller.abort(), 3000);
      fetch('/api/auth/logout', {
        method: 'POST',
        credentials: 'include',
        keepalive: true,
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ sessionId: currentSid })
      })
        .catch(() => {})
        .finally(() => window.clearTimeout(abortTimer));
    }

    // Clear client state and Firebase Auth immediately so sign-out feels instant
    clearClientSessionStorage();
    inFlightSessionsRef.current.clear();
    serverConfirmedSessionsRef.current.clear();
    sawCurrentSidInActiveSessionsRef.current.clear();
    setUser(null);
    setUserProfile(null);
    setUserRole('guest');
    setAdminTier('');
    setIsAuthenticated(false);
    setVerifyingDeviceSession(false);
    setDeviceVerificationRequired(false);
    setDeviceVerificationMeta(null);
    setDeviceVerificationError(null);

    await signOut(auth).catch(() => {});

    if (
      typeof window !== 'undefined' &&
      (redirectReason === 'device_verification_cancelled' || redirectReason === 'device_verification_error')
    ) {
      const target = `/login?reason=${encodeURIComponent(redirectReason)}`;
      if (window.location.pathname + window.location.search !== target) {
        window.location.replace(target);
      }
    }
  }, [clearClientSessionStorage, sessionId]);

  const refreshProfile = useCallback(async () => {
    const current = auth.currentUser;
    if (!current) return;
    const snap = await getDoc(doc(db, 'users', current.uid));
    const resolved = resolveAuthoritativeState(current, snap.exists() ? snap.data() : null);
    if (!resolved.valid) {
      await signOut(auth);
      clearClientSessionStorage();
      setUser(null);
      setUserProfile(null);
      setUserRole('guest');
      setAdminTier('');
      setIsAuthenticated(false);
      setVerifyingDeviceSession(false);
      setDeviceVerificationRequired(false);
      setDeviceVerificationMeta(null);
      setDeviceVerificationError(null);
      setAuthError(resolved.reason);
      return;
    }
    setUserProfile(resolved.profile);
    setUserRole(resolved.role);
    setAdminTier(resolved.tier);
    setIsAuthenticated(true);
    setAuthError(null);
  }, [clearClientSessionStorage, resolveAuthoritativeState]);

  const runRecordLoginHandshake = useCallback(
    async (
      fbUser: FirebaseUser,
      currentSid: string,
      requiresStrictDeviceCheck: boolean,
      isCancelledRef: { current: boolean }
    ) => {
      const sessionKey = `${fbUser.uid}:${currentSid}`;
      if (inFlightSessionsRef.current.has(sessionKey)) return;
      inFlightSessionsRef.current.add(sessionKey);

      const storedTrustToken = getStoredDeviceTrustToken(fbUser.uid);
      const clientBrowser = await detectClientBrowser();

      const attemptRequest = async (): Promise<{
        ok: boolean;
        status: number;
        body: any;
        networkError?: boolean;
      }> => {
        try {
          const token = await fbUser.getIdToken();
          const res = await fetch('/api/auth/record-login', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`
            },
            body: JSON.stringify({
              sessionId: currentSid,
              deviceTrustToken: storedTrustToken || undefined,
              clientBrowser: clientBrowser || undefined
            })
          });
          const body = await res.json().catch(() => ({}));
          return { ok: res.ok, status: res.status, body };
        } catch {
          return { ok: false, status: 0, body: {}, networkError: true };
        }
      };

      try {
        let result = await attemptRequest();
        if (!result.ok && (result.status === 0 || result.status >= 500) && !isCancelledRef.current) {
          await new Promise((r) => setTimeout(r, 800));
          if (!isCancelledRef.current) {
            result = await attemptRequest();
          }
        }

        if (isCancelledRef.current) return;

        if (result.status === 423) {
          setAuthError('Account is temporarily locked due to repeated failed login attempts.');
          setVerifyingDeviceSession(false);
          signOut(auth).catch(() => {});
          return;
        }
        if (result.status === 401 && result.body?.revoked) {
          setVerifyingDeviceSession(false);
          signOut(auth).catch(() => {});
          return;
        }

        if (result.ok && result.body?.success) {
          if (result.body?.deviceTrustToken && typeof result.body.deviceTrustToken === 'string') {
            setStoredDeviceTrustToken(fbUser.uid, result.body.deviceTrustToken);
          }

          if (result.body?.requiresDeviceVerification === true && result.body?.verification) {
            setDeviceVerificationMeta(result.body.verification);
            setDeviceVerificationRequired(true);
            setDeviceVerificationError(null);
            setVerifyingDeviceSession(false);
            return;
          }

          setDeviceVerificationRequired(false);
          setDeviceVerificationMeta(null);
          setDeviceVerificationError(null);
          setVerifyingDeviceSession(false);
          serverConfirmedSessionsRef.current.add(sessionKey);
          return;
        }

        // Fail-closed for OTP-protected accounts: NEVER silently bypass device security verification!
        inFlightSessionsRef.current.delete(sessionKey);
        setVerifyingDeviceSession(false);
        if (requiresStrictDeviceCheck) {
          const serverErrMsg = result.body?.error
            ? String(result.body.error)
            : result.networkError
              ? 'Unable to reach the security verification server. Please check your connection and retry.'
              : `Security verification server returned HTTP ${result.status || 500}. Please ensure backend server credentials are configured and retry.`;
          setDeviceVerificationError(serverErrMsg);
        }
      } catch {
        inFlightSessionsRef.current.delete(sessionKey);
        if (!isCancelledRef.current) {
          setVerifyingDeviceSession(false);
          if (requiresStrictDeviceCheck) {
            setDeviceVerificationError('Unable to verify device security. Please retry or sign out.');
          }
        }
      }
    },
    []
  );

  // Trigger retry handshake when user clicks "Retry Verification"
  useEffect(() => {
    if (verificationAttemptNonce === 0) return;
    const current = auth.currentUser;
    if (!current || !isAuthenticated) return;
    const currentSid = localStorage.getItem('localSessionId') || sessionId;
    const requiresStrict =
      (userRole === 'admin' || userRole === 'teacher' || userRole === 'student') &&
      isDeliverableEmail(current.email || userProfile?.email);
    const cancelledRef = { current: false };
    runRecordLoginHandshake(current, currentSid, requiresStrict, cancelledRef);
    return () => {
      cancelledRef.current = true;
    };
  }, [verificationAttemptNonce, isAuthenticated, userRole, userProfile?.email, sessionId, runRecordLoginHandshake]);

  // Periodic authenticated heartbeat to keep lastActiveAt accurate & detect remote session revocation
  useEffect(() => {
    if (!isAuthenticated || !user || deviceVerificationRequired || verifyingDeviceSession || deviceVerificationError) {
      return;
    }

    const sendHeartbeat = async () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
      const current = auth.currentUser;
      if (!current) return;
      const currentSid = localStorage.getItem('localSessionId') || sessionId;
      if (!currentSid) return;
      try {
        const token = await current.getIdToken();
        const res = await fetch('/api/auth/heartbeat', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`
          },
          body: JSON.stringify({ sessionId: currentSid })
        });
        const data = await res.json().catch(() => ({}));
        if (data?.revoked === true || (res.status === 401 && data?.revoked)) {
          signOut(auth).catch(() => {});
        }
      } catch {
        // Non-fatal network hiccup during background heartbeat
      }
    };

    const intervalId = window.setInterval(sendHeartbeat, 2 * 60 * 1000);
    return () => window.clearInterval(intervalId);
  }, [isAuthenticated, user, sessionId, deviceVerificationRequired, verifyingDeviceSession, deviceVerificationError]);

  useEffect(() => {
    // Scrub any leftover insecure role keys immediately
    localStorage.removeItem('userRole');
    localStorage.removeItem('userRoleOverride');

    let unsubDoc: (() => void) | null = null;
    let unsubSessionDoc: (() => void) | null = null;
    const isCancelledRef = { current: false };

    const unsubAuth = onAuthStateChanged(auth, async (fbUser) => {
      if (unsubDoc) {
        unsubDoc();
        unsubDoc = null;
      }
      if (unsubSessionDoc) {
        unsubSessionDoc();
        unsubSessionDoc = null;
      }

      if (!fbUser) {
        clearClientSessionStorage();
        inFlightSessionsRef.current.clear();
        serverConfirmedSessionsRef.current.clear();
        sawCurrentSidInActiveSessionsRef.current.clear();
        if (!isCancelledRef.current) {
          setUser(null);
          setUserProfile(null);
          setUserRole('guest');
          setAdminTier('');
          setIsAuthenticated(false);
          setVerifyingDeviceSession(false);
          setDeviceVerificationRequired(false);
          setDeviceVerificationMeta(null);
          setDeviceVerificationError(null);
          setLoading(false);
        }
        return;
      }

      const lastUid = localStorage.getItem('lastUserUid');
      if (lastUid && lastUid !== fbUser.uid) {
        clearClientSessionStorage();
      }
      localStorage.setItem('lastUserUid', fbUser.uid);
      const currentSid = getOrCreateSessionId();
      setSessionId(currentSid);

      try {
        const userSnap = await Promise.race([
          getDoc(doc(db, 'users', fbUser.uid)),
          new Promise<never>((_, reject) => setTimeout(() => reject(new Error('Profile lookup timeout')), 15000))
        ]);
        if (isCancelledRef.current) return;

        const resolved = resolveAuthoritativeState(fbUser, userSnap.exists() ? userSnap.data() : null);
        if (!resolved.valid) {
          await signOut(auth);
          clearClientSessionStorage();
          setUser(null);
          setUserProfile(null);
          setUserRole('guest');
          setAdminTier('');
          setIsAuthenticated(false);
          setVerifyingDeviceSession(false);
          setDeviceVerificationRequired(false);
          setDeviceVerificationMeta(null);
          setDeviceVerificationError(null);
          setAuthError(resolved.reason);
          setLoading(false);
          return;
        }

        // Update UI cache values (non-authoritative)
        const prof: any = resolved.profile || {};
        if (prof.children?.length > 0 && prof.children[0]?.studentId) {
          localStorage.setItem('studentId', prof.children[0].studentId);
        } else if (prof.studentId) {
          localStorage.setItem('studentId', prof.studentId);
        }
        if (prof.class || prof.studentClass) {
          localStorage.setItem('studentClass', prof.class || prof.studentClass);
        }

        // Mark fresh activity timestamp so SessionTimeoutHandler never expires immediately after sign-in
        try {
          localStorage.setItem('shikshantar_last_activity', Date.now().toString());
        } catch {}

        const requiresStrictDeviceCheck =
          (resolved.role === 'admin' || resolved.role === 'teacher' || resolved.role === 'student') &&
          isDeliverableEmail(fbUser.email || prof.email);
        const sessionKey = `${fbUser.uid}:${currentSid}`;

        setUser(fbUser);
        setUserProfile(resolved.profile);
        setUserRole(resolved.role);
        setAdminTier(resolved.tier);
        setIsAuthenticated(true);
        setAuthError(null);
        setDeviceVerificationError(null);
        // Hold OTP-eligible accounts on verification check until record-login confirms trusted device or OTP gate
        if (requiresStrictDeviceCheck && !serverConfirmedSessionsRef.current.has(sessionKey)) {
          setVerifyingDeviceSession(true);
        }
        setLoading(false);

        runRecordLoginHandshake(fbUser, currentSid, requiresStrictDeviceCheck, isCancelledRef);

        let docExisted = userSnap.exists();
        unsubDoc = onSnapshot(
          doc(db, 'users', fbUser.uid),
          (snap) => {
            if (isCancelledRef.current) return;
            if (!snap.exists()) {
              if (docExisted) {
                signOut(auth).catch(() => {});
              }
              return;
            }
            docExisted = true;
            const d = snap.data();
            const liveResolved = resolveAuthoritativeState(fbUser, d);
            if (!liveResolved.valid) {
              signOut(auth).catch(() => {});
              return;
            }
            setUserProfile(liveResolved.profile);
            setUserRole(liveResolved.role);
            setAdminTier(liveResolved.tier);

            if (Array.isArray(d.activeSessions) && d.activeSessions.includes(currentSid)) {
              sawCurrentSidInActiveSessionsRef.current.add(sessionKey);
            }

            // Enforce cross-device revocation via users.activeSessions ONLY if this session
            // was observed inside activeSessions first and subsequently removed.
            if (
              !snap.metadata.fromCache &&
              serverConfirmedSessionsRef.current.has(sessionKey) &&
              sawCurrentSidInActiveSessionsRef.current.has(sessionKey) &&
              Array.isArray(d.activeSessions) &&
              !d.activeSessions.includes(currentSid)
            ) {
              signOut(auth).catch(() => {});
            }
          },
          (err) => {
            console.warn('AuthContext profile listener warning:', err?.message);
          }
        );

        // Real-time session revocation watcher (works identically on both Vercel REST & Admin SDK modes)
        unsubSessionDoc = onSnapshot(
          doc(db, 'user_sessions', currentSid),
          (sessSnap) => {
            if (isCancelledRef.current || !sessSnap.exists()) return;
            const sData = sessSnap.data();
            if (
              !sessSnap.metadata.fromCache &&
              sData?.userUid === fbUser.uid &&
              String(sData?.status || '').toUpperCase() === 'REVOKED'
            ) {
              signOut(auth).catch(() => {});
            }
          },
          () => {
            // Non-fatal if session doc isn't created yet
          }
        );
      } catch (err: any) {
        console.error('AuthContext authoritative verification failed (failing closed):', err);
        if (!isCancelledRef.current) {
          await signOut(auth).catch(() => {});
          clearClientSessionStorage();
          setUser(null);
          setUserProfile(null);
          setUserRole('guest');
          setAdminTier('');
          setIsAuthenticated(false);
          setVerifyingDeviceSession(false);
          setDeviceVerificationRequired(false);
          setDeviceVerificationMeta(null);
          setDeviceVerificationError(null);
          setAuthError('Unable to verify authoritative user profile.');
          setLoading(false);
        }
      }
    });

    return () => {
      isCancelledRef.current = true;
      unsubAuth();
      if (unsubDoc) unsubDoc();
      if (unsubSessionDoc) unsubSessionDoc();
    };
  }, [clearClientSessionStorage, resolveAuthoritativeState, runRecordLoginHandshake]);

  const value: AuthContextValue = {
    user,
    userProfile,
    userRole,
    adminTier,
    isPrimaryAdmin: userRole === 'admin' && adminTier === 'primary',
    isSecondaryAdmin: userRole === 'admin' && adminTier === 'secondary',
    isAuthenticated,
    loading,
    authError,
    sessionId,
    verifyingDeviceSession,
    deviceVerificationRequired,
    deviceVerificationMeta,
    deviceVerificationError,
    completeDeviceVerification,
    retryDeviceVerification,
    clearCurrentDeviceTrust,
    logout,
    refreshProfile
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return ctx;
}
