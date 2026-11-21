import { auth, db } from '../firebase';
import { 
  EmailAuthProvider, 
  reauthenticateWithCredential 
} from 'firebase/auth';
import { doc, getDoc, collection, query, where, getDocs } from 'firebase/firestore';

export interface AdminSecurityProfile {
  uid: string;
  email: string;
  displayName: string;
  role: string;
  isSuperAdmin: boolean;
}

const ensureSafePassword = (pwd: string) => {
  if (pwd.length < 6) {
    return `${pwd}_shikshantar`;
  }
  return pwd;
};

/**
 * Returns detailed identity and profile of the currently logged-in administrator.
 */
export async function getCurrentAdminProfile(): Promise<AdminSecurityProfile | null> {
  const currentUser = auth.currentUser;
  if (!currentUser) return null;

  try {
    const userDocRef = doc(db, 'users', currentUser.uid);
    const userSnap = await getDoc(userDocRef);
    if (!userSnap.exists()) {
      return null;
    }

    const data = userSnap.data();
    const status = String(data.status || '').trim().toLowerCase();
    if (
      data.deleted === true ||
      data.active === false ||
      ['deleted', 'deletion_pending', 'auth_deleted_pending_finalization', 'inactive', 'suspended', 'rejected', 'blocked', 'pending'].includes(status)
    ) {
      return null;
    }

    const role = String(data.role || '').trim().toLowerCase();
    if (!role) {
      return null;
    }

    const email = String(data.email || currentUser.email || '').trim();
    const rawName = (data.fullName && String(data.fullName).trim() !== 'User') ? String(data.fullName).trim() : (currentUser.displayName || '');
    const displayName = rawName || (email ? email.split('@')[0] : 'User');
    const isSuperAdmin = role === 'admin' && String(data.adminTier || 'secondary').toLowerCase() === 'primary';

    return {
      uid: currentUser.uid,
      email,
      displayName,
      role,
      isSuperAdmin
    };
  } catch (err) {
    console.warn('Could not verify authoritative security profile:', err);
    return null;
  }
}

/**
 * Verifies the password of the currently logged-in administrator against Firebase Authentication.
 * Re-authenticates the current user session securely.
 */
export async function verifyCurrentAdminPassword(password: string): Promise<{
  success: boolean;
  error?: string;
  adminName?: string;
  adminEmail?: string;
  adminUid?: string;
}> {
  if (!password || !password.trim()) {
    return { success: false, error: 'Password is required to authorize this action.' };
  }

  const currentUser = auth.currentUser;
  if (!currentUser) {
    return {
      success: false,
      error: 'Security Error: No active administrator session found. Please log in to your account first.'
    };
  }

  const profile = await getCurrentAdminProfile();
  const adminName = profile?.displayName || currentUser.displayName || 'Administrator';
  const adminEmail = currentUser.email || profile?.email || '';
  const adminUid = currentUser.uid;

  const trimmedPassword = password.trim();
  const passwordVariants = [
    trimmedPassword,
    ensureSafePassword(trimmedPassword),
    password
  ];

  // If user has email in auth, test reauthentication
  if (currentUser.email) {
    for (const pwd of passwordVariants) {
      try {
        const credential = EmailAuthProvider.credential(currentUser.email, pwd);
        await reauthenticateWithCredential(currentUser, credential);
        return {
          success: true,
          adminName,
          adminEmail: currentUser.email,
          adminUid
        };
      } catch (authErr: any) {
        const code = authErr.code || '';
        // If it's not a wrong-password error, continue checking other variants
        if (code === 'auth/wrong-password' || code === 'auth/invalid-credential') {
          continue;
        }
      }
    }
  }

  // Try checking with resolved authEmail from firestore if different
  if (profile?.email && profile.email !== currentUser.email) {
    for (const pwd of passwordVariants) {
      try {
        const credential = EmailAuthProvider.credential(profile.email, pwd);
        await reauthenticateWithCredential(currentUser, credential);
        return {
          success: true,
          adminName,
          adminEmail: profile.email,
          adminUid
        };
      } catch (e) {
        // continue
      }
    }
  }

  // If reauthentication on currentUser fails, reject strictly without session switching
  return {
    success: false,
    error: `Incorrect password entered for ${adminName} (${adminEmail || 'logged-in admin'}). Security authorization denied.`
  };
}
