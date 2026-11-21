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
  completeDeviceVerification: (newTrustToken?: string | null) => void;
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

  const logout = useCallback(async (_redirectReason?: string) => {
    try {
      if (auth.currentUser) {
        const currentSid = localStorage.getItem('localSessionId') || sessionId;
        const token = await auth.currentUser.getIdToken().catch(() => null);
        if (token && currentSid) {
          await fetch('/api/auth/logout', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`
            },
            body: JSON.stringify({ sessionId: currentSid })
          }).catch(() => {});
        }
      }
    } finally {
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
      setAuthError(resolved.reason);
      return;
    }
    setUserProfile(resolved.profile);
    setUserRole(resolved.role);
    setAdminTier(resolved.tier);
    setIsAuthenticated(true);
    setAuthError(null);
  }, [clearClientSessionStorage, resolveAuthoritativeState]);

  useEffect(() => {
    // Scrub any leftover insecure role keys immediately
    localStorage.removeItem('userRole');
    localStorage.removeItem('userRoleOverride');

    let unsubDoc: (() => void) | null = null;
    let isCancelled = false;

    const unsubAuth = onAuthStateChanged(auth, async (fbUser) => {
      if (unsubDoc) {
        unsubDoc();
        unsubDoc = null;
      }

      if (!fbUser) {
        clearClientSessionStorage();
        inFlightSessionsRef.current.clear();
        serverConfirmedSessionsRef.current.clear();
        sawCurrentSidInActiveSessionsRef.current.clear();
        if (!isCancelled) {
          setUser(null);
          setUserProfile(null);
          setUserRole('guest');
          setAdminTier('');
          setIsAuthenticated(false);
          setVerifyingDeviceSession(false);
          setDeviceVerificationRequired(false);
          setDeviceVerificationMeta(null);
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
        if (isCancelled) return;

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

        const isPrivilegedRole = resolved.role === 'admin' || resolved.role === 'teacher';
        const sessionKey = `${fbUser.uid}:${currentSid}`;

        setUser(fbUser);
        setUserProfile(resolved.profile);
        setUserRole(resolved.role);
        setAdminTier(resolved.tier);
        setIsAuthenticated(true);
        setAuthError(null);
        // Hold privileged roles on a brief verification check until record-login confirms trusted device or OTP gate
        if (isPrivilegedRole && !serverConfirmedSessionsRef.current.has(sessionKey)) {
          setVerifyingDeviceSession(true);
        }
        setLoading(false);

        if (!inFlightSessionsRef.current.has(sessionKey)) {
          inFlightSessionsRef.current.add(sessionKey);
          const storedTrustToken = getStoredDeviceTrustToken(fbUser.uid);

          fbUser.getIdToken().then(token => {
            fetch('/api/auth/record-login', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${token}`
              },
              body: JSON.stringify({
                sessionId: currentSid,
                deviceTrustToken: storedTrustToken || undefined
              })
            }).then(async (res) => {
              if (isCancelled) return;
              if (res.status === 423) {
                setAuthError('Account is temporarily locked due to repeated failed login attempts.');
                setVerifyingDeviceSession(false);
                signOut(auth).catch(() => {});
                return;
              }
              const body = await res.json().catch(() => ({}));
              if (res.status === 401 && body?.revoked) {
                setVerifyingDeviceSession(false);
                signOut(auth).catch(() => {});
                return;
              }
              if (res.ok && body?.success) {
                if (body?.deviceTrustToken && typeof body.deviceTrustToken === 'string') {
                  setStoredDeviceTrustToken(fbUser.uid, body.deviceTrustToken);
                }

                if (body?.requiresDeviceVerification === true && body?.verification) {
                  setDeviceVerificationMeta(body.verification);
                  setDeviceVerificationRequired(true);
                  setVerifyingDeviceSession(false);
                  return;
                }

                setDeviceVerificationRequired(false);
                setDeviceVerificationMeta(null);
                setVerifyingDeviceSession(false);
                serverConfirmedSessionsRef.current.add(sessionKey);
              } else {
                inFlightSessionsRef.current.delete(sessionKey);
                setVerifyingDeviceSession(false);
              }
            }).catch(() => {
              inFlightSessionsRef.current.delete(sessionKey);
              if (!isCancelled) {
                setVerifyingDeviceSession(false);
              }
            });
          }).catch(() => {
            inFlightSessionsRef.current.delete(sessionKey);
            if (!isCancelled) {
              setVerifyingDeviceSession(false);
            }
          });
        }

        let docExisted = userSnap.exists();
        unsubDoc = onSnapshot(
          doc(db, 'users', fbUser.uid),
          (snap) => {
            if (isCancelled) return;
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

            // Enforce cross-device revocation ONLY after server confirmed registration
            // AND on a live server snapshot where currentSid was seen or omitted without pending writes
            if (
              !snap.metadata.fromCache &&
              serverConfirmedSessionsRef.current.has(sessionKey) &&
              (sawCurrentSidInActiveSessionsRef.current.has(sessionKey) || !snap.metadata.hasPendingWrites) &&
              Array.isArray(d.activeSessions) &&
              d.activeSessions.length > 0 &&
              !d.activeSessions.includes(currentSid)
            ) {
              signOut(auth).catch(() => {});
            }
          },
          (err) => {
            console.warn('AuthContext profile listener warning:', err?.message);
          }
        );
      } catch (err: any) {
        console.error('AuthContext authoritative verification failed (failing closed):', err);
        if (!isCancelled) {
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
          setAuthError('Unable to verify authoritative user profile.');
          setLoading(false);
        }
      }
    });

    return () => {
      isCancelled = true;
      unsubAuth();
      if (unsubDoc) unsubDoc();
    };
  }, [clearClientSessionStorage, resolveAuthoritativeState]);

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
    completeDeviceVerification,
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
