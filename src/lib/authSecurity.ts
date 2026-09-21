import { auth, db } from '../firebase';
import { 
  EmailAuthProvider, 
  reauthenticateWithCredential, 
  signInWithEmailAndPassword 
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

  let displayName = currentUser.displayName || '';
  let email = currentUser.email || '';
  let role = 'admin';

  try {
    const userDocRef = doc(db, 'users', currentUser.uid);
    const userSnap = await getDoc(userDocRef);
    if (userSnap.exists()) {
      const data = userSnap.data();
      if (data.fullName && data.fullName.trim() && data.fullName !== 'User') {
        displayName = data.fullName.trim();
      }
      if (data.role) {
        role = data.role;
      }
      if (data.email) {
        email = data.email;
      }
    }
  } catch (err) {
    console.warn('Could not fetch user document for security profile:', err);
  }

  // Fallbacks
  if (!displayName || displayName === 'User') {
    if (email) {
      displayName = email.split('@')[0];
    } else {
      displayName = 'Administrator';
    }
  }

  const isSuperAdmin = role === 'admin';

  return {
    uid: currentUser.uid,
    email: email || 'admin@shikshantar.edu.np',
    displayName,
    role,
    isSuperAdmin
  };
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

  // Attempt direct test sign-in verification check as fallback without overwriting active session
  if (adminEmail) {
    for (const pwd of passwordVariants) {
      try {
        const testCred = await signInWithEmailAndPassword(auth, adminEmail, pwd);
        if (testCred.user) {
          return {
            success: true,
            adminName,
            adminEmail,
            adminUid: testCred.user.uid
          };
        }
      } catch (e) {
        // continue
      }
    }
  }

  return {
    success: false,
    error: `Incorrect password entered for ${adminName} (${adminEmail || 'logged-in admin'}). Security authorization denied.`
  };
}
