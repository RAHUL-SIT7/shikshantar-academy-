import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { 
  GraduationCap, 
  Lock, 
  Mail, 
  User, 
  Phone, 
  MapPin, 
  Calendar, 
  BookOpen, 
  ArrowLeft, 
  Eye, 
  EyeOff,
  ShieldCheck,
  Sparkles,
  CheckCircle2,
  School,
  ShieldAlert,
  Users
} from 'lucide-react';
import { auth } from '../firebase';
import RecaptchaBotShield from '../components/ui/RecaptchaBotShield';
import { 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  sendEmailVerification,
  sendPasswordResetEmail,
  confirmPasswordReset,
  signOut,
  RecaptchaVerifier,
  signInWithPhoneNumber,
  signInAnonymously
} from 'firebase/auth';
import { doc, setDoc, getDoc, updateDoc, arrayUnion, collection, query, where, getDocs, deleteDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { motion, AnimatePresence } from 'motion/react';
import SpotlightCard from '../components/SpotlightCard';
import LiquidButton from '../components/ui/LiquidButton';
import logoImageSrc from '../assets/logo.png';

const logoImage = logoImageSrc || "/logo.png";
const logoFallback = "/logo.png";

const ensureSafePassword = (pwd: string) => {
  if (pwd.length < 6) {
    return `${pwd}_shikshantar`;
  }
  return pwd;
};

// Animated Border & Rotating Gradient Wrapper for Fields when selected/focused
function AnimatedField({
  children,
  className = "",
  roundedClass = "rounded-xl",
  innerBgClass = "bg-white",
}: {
  children: React.ReactNode;
  className?: string;
  roundedClass?: string;
  innerBgClass?: string;
}) {
  return (
    <div className={`relative ${roundedClass} overflow-hidden p-[2px] bg-slate-300/80 transition-all duration-300 group/field focus-within:!bg-transparent focus-within:shadow-[0_0_18px_rgba(240,165,0,0.35)] hover:shadow-xs ${className}`}>
      {/* Rotating conic gradient appears brightly when focused/selected and subtly on hover */}
      <div className="absolute inset-[-180%] bg-[conic-gradient(from_0deg,#0a3d62,#0284c7,#F0A500,#fbbf24,#0ea5e9,#0a3d62)] animate-[spin_5s_linear_infinite] opacity-0 group-hover/field:opacity-30 focus-within:!opacity-100 transition-opacity duration-300 pointer-events-none z-0" />
      <div className={`relative w-full h-full ${innerBgClass} ${roundedClass === 'rounded-xl' ? 'rounded-[10px]' : 'rounded-[14px]'} z-10 overflow-hidden flex items-center`}>
        {children}
      </div>
    </div>
  );
}

// Fluid Interactive Liquid Button for all actions on Login page
function AnimatedButton({
  children,
  onClick,
  type = "button",
  disabled = false,
  className = "",
  buttonClassName = "",
  variant = "primary",
  ...rest
}: {
  children: React.ReactNode;
  onClick?: (e?: any) => void;
  type?: "button" | "submit" | "reset";
  disabled?: boolean;
  className?: string;
  buttonClassName?: string;
  variant?: "primary" | "guest" | "secondary" | "danger" | "outline";
  [key: string]: any;
}) {
  return (
    <LiquidButton
      type={type}
      disabled={disabled}
      onClick={onClick}
      variant={variant === "outline" ? "guest" : variant}
      className={className}
      buttonClassName={buttonClassName}
      {...rest}
    >
      {children}
    </LiquidButton>
  );
}

type Role = 'student' | 'teacher' | 'admin';
type View = 'login' | 'register' | 'verify' | 'forgot' | 'reset' | 'register_otp';

export default function Login({ setIsAuthenticated }: { setIsAuthenticated: (val: boolean) => void }) {
  const [searchParams] = useSearchParams();
  const logoUrl = logoImage;
  const [view, setView] = useState<View>('login');
  const [role, setRole] = useState<Role>('student');
  const [isRecaptchaVerified, setIsRecaptchaVerified] = useState(false);
  const [mousePos, setMousePos] = useState({ x: 50, y: 50 });
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [oobCode, setOobCode] = useState<string | null>(null);
  const [isFieldFocused, setIsFieldFocused] = useState(false);
  const [isUsernameFocused, setIsUsernameFocused] = useState(false);
  const [isPasswordFocused, setIsPasswordFocused] = useState(false);
  const [isLoginHovered, setIsLoginHovered] = useState(false);
  const [isLoginFocused, setIsLoginFocused] = useState(false);

  const showUsernameEffect = isUsernameFocused || email.length > 0;
  const showPasswordEffect = isPasswordFocused || password.length > 0;
  const showLoginEffect = isLoginHovered || isLoginFocused;
  const isFormActive = showUsernameEffect || showPasswordEffect || showLoginEffect;
  
  // OTP State
  const [resetMethod, setResetMethod] = useState<'email' | 'phone'>('email');
  const [otpCode, setOtpCode] = useState('');
  const [confirmationResult, setConfirmationResult] = useState<any>(null);
  
  // Registration specific fields
  const [name, setName] = useState('');
  const [fatherName, setFatherName] = useState('');
  const [motherName, setMotherName] = useState('');
  const [dob, setDob] = useState('');
  const [studentClass, setStudentClass] = useState('');
  const [address, setAddress] = useState('');
  const [phone, setPhone] = useState('');
  const [teachingLevel, setTeachingLevel] = useState('');
  const [studentIdInput, setStudentIdInput] = useState('');
  const [secretCode, setSecretCode] = useState('');

  const navigate = useNavigate();

  useEffect(() => {
    const handleGlobalMouseMove = (e: MouseEvent) => {
      const x = (e.clientX / window.innerWidth) * 100;
      const y = (e.clientY / window.innerHeight) * 100;
      setMousePos({ x, y });
    };
    window.addEventListener('mousemove', handleGlobalMouseMove);
    return () => window.removeEventListener('mousemove', handleGlobalMouseMove);
  }, []);

  useEffect(() => {
    const mode = searchParams.get('mode');
    const code = searchParams.get('oobCode');
    if (mode === 'resetPassword' && code) {
      setOobCode(code);
      setView('reset');
    }
    
    const reason = searchParams.get('reason');
    if (reason === 'expired') {
      setError('Your session has expired due to inactivity. Please sign in again.');
    } else if (reason === 'manual') {
      setMessage('You have been signed out successfully.');
    }
  }, [searchParams]);

  const validatePhone = (num: string) => {
    return /^(98|97)\d{8}$/.test(num);
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    
    // Bot check prevention
    if (!isRecaptchaVerified) {
      setError("Security Verification Required: Please check the 'I'm not a robot' reCAPTCHA box to prevent automated bot access.");
      return;
    }

    // Clear residual session data to prevent state bleed between accounts
    localStorage.removeItem('userRole');
    localStorage.removeItem('studentId');
    localStorage.removeItem('studentClass');
    localStorage.removeItem('adminSearchStudentId');
    localStorage.removeItem('isGuest');
    localStorage.removeItem('teacherSubjects');
    
    setLoading(true);

    try {
      const emailInput = email.trim();
      let emailToAuth = emailInput;
      let resolvedUserDoc: any = null;
      
      // Look up custom authEmail or full email from plain username in firestore
      try {
        const usersRef = collection(db, 'users');
        
        if (emailInput.includes('@')) {
          // Exact match query for full email
          const q = query(usersRef, where('email', '==', emailInput));
          const querySnapshot = await getDocs(q);
          if (!querySnapshot.empty) {
            resolvedUserDoc = querySnapshot.docs[0];
          } else {
            // Case-insensitive fallback query
            const allUsersSnap = await getDocs(usersRef);
            const found = allUsersSnap.docs.find(doc => doc.data().email?.toLowerCase() === emailInput.toLowerCase());
            if (found) resolvedUserDoc = found;
          }
        } else {
          // It's a plain username. Try prefix match on Firestore
          const lowerInput = emailInput.toLowerCase();
          const qPrefix = query(
            usersRef, 
            where('email', '>=', lowerInput + '@'), 
            where('email', '<=', lowerInput + '@\uf8ff')
          );
          const qPrefixSnap = await getDocs(qPrefix);
          if (!qPrefixSnap.empty) {
            resolvedUserDoc = qPrefixSnap.docs[0];
          } else {
            // Try prefix matching with exact case
            const qPrefixExact = query(
              usersRef,
              where('email', '>=', emailInput + '@'),
              where('email', '<=', emailInput + '@\uf8ff')
            );
            const qPrefixExactSnap = await getDocs(qPrefixExact);
            if (!qPrefixExactSnap.empty) {
              resolvedUserDoc = qPrefixExactSnap.docs[0];
            } else {
              // Fallback: search standard prefix range
              const qGeneral = query(
                usersRef,
                where('email', '>=', lowerInput),
                where('email', '<=', lowerInput + '\uf8ff')
              );
              const qGeneralSnap = await getDocs(qGeneral);
              if (!qGeneralSnap.empty) {
                resolvedUserDoc = qGeneralSnap.docs[0];
              } else {
                // In-memory case-insensitive scan fallback
                const allUsersSnap = await getDocs(usersRef);
                const found = allUsersSnap.docs.find(doc => {
                  const docEmail = (doc.data().email || '').toLowerCase();
                  const docAuthEmail = (doc.data().authEmail || '').toLowerCase();
                  const usernamePart = docEmail.split('@')[0];
                  const authUsernamePart = docAuthEmail.split('@')[0];
                  return usernamePart === lowerInput || authUsernamePart === lowerInput;
                });
                if (found) resolvedUserDoc = found;
              }
            }
          }
        }
        
        const lowerInput = emailInput.toLowerCase();
        const isSuperAdmin = lowerInput === 'rahulsah4534@gmail.com' || lowerInput === 'rahulsah4534';
        const isWhitelistedRole = 
          lowerInput === 'admin' || 
          lowerInput === 'teacher' || 
          lowerInput === 'student' ||
          lowerInput === 'admin@shikshantar.edu.np' || 
          lowerInput === 'teacher@shikshantar.edu.np' || 
          lowerInput === 'student@shikshantar.edu.np';

        if (resolvedUserDoc) {
          const docData = resolvedUserDoc.data();
          if (docData.authEmail) {
            emailToAuth = docData.authEmail;
          } else if (docData.email) {
            emailToAuth = docData.email;
          }
        } else if (isSuperAdmin) {
          emailToAuth = 'rahulsah4534@gmail.com';
        } else if (isWhitelistedRole) {
          emailToAuth = emailInput;
        } else {
          // If user document is not found in Firestore and is not a whitelisted bootstrap role, reject with proper Error
          const errObj = new Error('Email or password is incorrect.') as any;
          errObj.code = 'auth/invalid-credential';
          throw errObj;
        }

        // Always format resolved emailToAuth to contain a valid domain if it is a plain username
        if (!emailToAuth.includes('@')) {
          emailToAuth = `${emailToAuth.toLowerCase()}@shikshantar.edu.np`;
        }
      } catch (dbErr: any) {
        if (dbErr && dbErr.code === 'auth/invalid-credential') {
          throw dbErr;
        }
        if (!emailToAuth.includes('@')) {
          emailToAuth = `${emailInput.toLowerCase()}@shikshantar.edu.np`;
        }
      }

      let userCredential;
      try {
        userCredential = await signInWithEmailAndPassword(auth, emailToAuth, ensureSafePassword(password));
      } catch (signInErr: any) {
        // Self-healing recovery mechanism:
        // If sign-in fails, auto-create the Auth account if the user exists in Firestore,
        // is the super admin, or matches one of the primary bootstrap whitelisted roles.
        const lowerInput = emailInput.toLowerCase();
        const isSuperAdmin = lowerInput === 'rahulsah4534@gmail.com' || lowerInput === 'rahulsah4534';
        const isWhitelistedRole = 
          lowerInput === 'admin' || 
          lowerInput === 'teacher' || 
          lowerInput === 'student' ||
          lowerInput === 'admin@shikshantar.edu.np' || 
          lowerInput === 'teacher@shikshantar.edu.np' || 
          lowerInput === 'student@shikshantar.edu.np';

        const canAutoCreate = (resolvedUserDoc !== null) || isSuperAdmin || isWhitelistedRole;

        if (canAutoCreate && (
            signInErr.code === 'auth/user-not-found' || 
            signInErr.code === 'auth/invalid-credential' || 
            String(signInErr.message).includes('auth/invalid-credential') ||
            String(signInErr.message).includes('user-not-found')
        )) {
          try {
            userCredential = await createUserWithEmailAndPassword(auth, emailToAuth, ensureSafePassword(password));
          } catch (createErr: any) {
            // If creation fails with email-already-in-use, they do exist in Auth but entered wrong password.
            if (createErr.code === 'auth/email-already-in-use' || String(createErr.message).includes('email-already-in-use')) {
              throw signInErr;
            } else {
              throw createErr;
            }
          }
        } else {
          throw signInErr;
        }
      }
      
      // Fetch user data from firestore
      let userSnap = await getDoc(doc(db, 'users', userCredential.user.uid));
      
      if (!userSnap.exists()) {
        // Since the document doesn't exist under this UID, let's search if there is an orphaned document
        // associated with this email under an old UID.
        try {
          const usersRef = collection(db, 'users');
          const q = query(usersRef, where('email', '==', email));
          const querySnapshot = await getDocs(q);
          
          if (!querySnapshot.empty) {
            // Found existing user document! Copy the fields to the new UID document.
            const oldDoc = querySnapshot.docs[0];
            const oldData = oldDoc.data();
            await setDoc(doc(db, 'users', userCredential.user.uid), {
              ...oldData,
              updatedAt: new Date().toISOString()
            });
            
            // Attempt to clean up the old orphaned document
            try {
              if (oldDoc.id !== userCredential.user.uid) {
                await deleteDoc(doc(db, 'users', oldDoc.id));
              }
            } catch (delErr) {
              console.warn("Failed to clean up old orphaned user doc:", delErr);
            }
            
            // Re-fetch the snap
            userSnap = await getDoc(doc(db, 'users', userCredential.user.uid));
          }
        } catch (queryErr) {
          console.error("Failed to query and migrate orphaned user doc:", queryErr);
        }
      }

      if (userSnap.exists()) {
        const userData = userSnap.data();
        
        if (userData.status === 'pending') {
          await signOut(auth);
          setError('Your account is pending admin approval. Please wait for an administrator to approve your account.');
          setLoading(false);
          return;
        }

        if (userData.children && userData.children.length > 0) {
          // Set primary child student ID to local storage automatically
          localStorage.setItem('studentId', userData.children[0].studentId);
          // BACKFILL studentIds if missing for legacy users
          if (!userData.studentIds) {
            const ids = userData.children.map((c: any) => c.studentId);
            try {
              await updateDoc(doc(db, 'users', userCredential.user.uid), { studentIds: ids });
            } catch (e) {
              console.warn("Failed to backfill studentIds:", e);
            }
          }
        }
        if (userData.role) {
          localStorage.setItem('userRole', userData.role);
        } else {
          localStorage.setItem('userRole', "student"); // Default
        }
      } else {
        if (email !== 'rahulsah4534@gmail.com') {
          // Self-healing recovery mechanism:
          // If the user's Auth account is valid but their Firestore document is missing,
          // automatically recreate it so they can log in successfully.
          try {
            const fallbackRole = email.includes('admin') 
              ? 'admin' 
              : (email.includes('teacher') || email.includes('susmita') ? 'teacher' : 'student');
            
            const fallbackData = {
              email: email,
              fullName: email.split('@')[0],
              role: fallbackRole,
              status: 'approved',
              active: true,
              createdAt: new Date().toISOString()
            };
            
            await setDoc(doc(db, 'users', userCredential.user.uid), fallbackData);
            localStorage.setItem('userRole', fallbackRole);
          } catch (createErr) {
            console.error("Failed to auto-create missing user document:", createErr);
            await signOut(auth);
            setError('Your account has been deleted or disabled by the administrator.');
            setLoading(false);
            return;
          }
        } else {
          // Auto-create document for super admin if it doesn't exist
          try {
            const adminData = {
              email: 'rahulsah4534@gmail.com',
              fullName: 'Rahul Sah',
              role: 'admin',
              adminTier: 'primary',
              status: 'approved',
              active: true,
              createdAt: new Date().toISOString()
            };
            await setDoc(doc(db, 'users', userCredential.user.uid), adminData);
            localStorage.setItem('userRole', "admin");
          } catch (createErr) {
            console.error("Failed to auto-create admin document:", createErr);
            localStorage.setItem('userRole', "admin");
          }
        }
      }

      localStorage.removeItem('isGuest');
      setIsAuthenticated(true);
      navigate('/');
    } catch (err: any) {
      console.error("Login failed:", err);
      // Show actual error message if possible to help the user debug
      if (err.code === 'auth/wrong-password' || err.code === 'auth/user-not-found' || err.code === 'auth/invalid-credential' || String(err.message).includes('auth/invalid-credential')) {
         setError('Invalid credentials (auth/invalid-credential). Please verify your username/email and password.');
      } else if (err.code === 'auth/network-request-failed' || String(err.message).includes('network-request-failed')) {
         setError('Network connection failed due to browser IndexedDB freeze or tracker-blocking. Please refresh the page, enable third-party cookies, or open the app in a new window to login.');
      } else if (err.code === 'auth/too-many-requests' || String(err.message).includes('too-many-requests')) {
         setError('Access to this account has been temporarily disabled due to many failed login attempts. Please try again later.');
      } else {
         setError(err.message || 'Login failed. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  const saveStudentToFirestore = async (uid: string, isNewUser: boolean = false, authEmail?: string) => {
    const userRef = doc(db, 'users', uid);
    const userSnap = await getDoc(userRef);
    
    let extractedRoll = '';
    const match = studentIdInput.match(/^SA\d+([A-Z]*\d*)*$/i);
    if (match) {
        const numPart = studentIdInput.replace(/^SA/i, '');
        let clsStr = studentClass || '';
        if (numPart.startsWith(clsStr)) {
            extractedRoll = numPart.substring(clsStr.length);
        } else if (numPart.startsWith('0' + clsStr)) {
            extractedRoll = numPart.substring(clsStr.length + 1);
        } else {
            extractedRoll = numPart;
        }
    } else {
        extractedRoll = studentIdInput;
    }

    const studentData = {
      name,
      fatherName,
      motherName,
      dob,
      studentClass,
      address,
      phone,
      studentId: studentIdInput,
      rollNumber: extractedRoll,
      rollNo: extractedRoll
    };

    if (userSnap.exists()) {
      await updateDoc(userRef, {
        children: arrayUnion(studentData),
        studentIds: arrayUnion(studentIdInput)
      });
    } else {
      await setDoc(userRef, {
        role: "student", // Force everyone to student by default on registration
        email: email,
        ...(authEmail ? { authEmail } : {}),
        phone: phone,
        fullName: name, // Save root attributes so UI easily picks it up
        dob: dob,
        guardianName: fatherName,
        address: address,
        studentId: studentIdInput,
        class: studentClass,
        status: "pending", // New users go to pending state
        children: [studentData],
        studentIds: [studentIdInput],
        rollNumber: extractedRoll,
        rollNo: extractedRoll
      });
    }
  };

  const finalizeRegistration = async () => {
    setLoading(true);
    try {
      let isExistingUser = false;
      let userCredential;
      let emailToRegister = email;
      let usedSubAddress = false;

      // Try creating new user
      try {
        userCredential = await createUserWithEmailAndPassword(auth, emailToRegister, ensureSafePassword(password));
        await sendEmailVerification(userCredential.user);
      } catch (err: any) {
        if (err.code === 'auth/email-already-in-use' || String(err.message).includes('auth/email-already-in-use')) {
          // Check if there is an active profile document in the users database.
          try {
            const usersRef = collection(db, 'users');
            const q = query(usersRef, where('email', '==', email));
            const docSnap = await getDocs(q);
            if (docSnap.empty) {
              // Firestore profile does NOT exist! It's an orphan auth account! Let's register using sub-addressing.
              const parts = email.split('@');
              emailToRegister = `${parts[0]}+reg${Math.floor(Date.now() / 1000)}@${parts[1]}`;
              usedSubAddress = true;
              userCredential = await createUserWithEmailAndPassword(auth, emailToRegister, ensureSafePassword(password));
              await sendEmailVerification(userCredential.user);
            } else {
              // It's a parent adding a 2nd/3rd child. Let's log them in and append!
              isExistingUser = true;
              try {
                userCredential = await signInWithEmailAndPassword(auth, email, ensureSafePassword(password));
              } catch (signInErr: any) {
                setError('Email already exists, but the password provided is incorrect. Please use your exact password to add another child.');
                setLoading(false);
                return;
              }
            }
          } catch (dbErr) {
            throw err;
          }
        } else {
          throw err;
        }
      }

      if (userCredential && userCredential.user) {
        await saveStudentToFirestore(userCredential.user.uid, !isExistingUser, usedSubAddress ? emailToRegister : undefined);
        
        if (!isExistingUser) {
           await signOut(auth);
           setMessage('Registration complete! Your account is pending admin approval. Please wait until your account is approved before logging in.');
           setTimeout(() => {
             setView('login');
           }, 3000);
           return;
        }

        // Temporarily store the latest StudentId in local storage for instant dashboard lookup
        if (studentIdInput) {
          localStorage.setItem('studentId', studentIdInput);
        }
        localStorage.setItem('userRole', "student");
        
        setMessage(isExistingUser ? 'New child added successfully to your account!' : 'Registration complete! Logging in...');
        
        setTimeout(() => {
          localStorage.removeItem('isGuest');
          setIsAuthenticated(true);
          navigate('/');
        }, 1500);
      }
    } catch (err: any) {
      if (err.code === 'auth/email-already-in-use' || String(err.message).includes('auth/email-already-in-use')) {
        setError('An account with this email address already exists. Please use a different email or log in.');
      } else if (err.code === 'auth/network-request-failed') {
        setError('Network connection failed. Please check your internet connection or try disabling any ad-blockers/VPNs.');
      } else {
        setError(err.message || 'Failed to complete registration.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleRegisterOtpVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      if (confirmationResult) {
        await confirmationResult.confirm(otpCode);
        setMessage('Phone verified successfully! Finalizing account...');
        await finalizeRegistration();
      }
    } catch (err: any) {
      setError('Invalid OTP code. Please try again.');
      setLoading(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (/\d/.test(name)) {
      setError('Full Name cannot contain numbers');
      return;
    }
    if (/\d/.test(fatherName)) {
      setError("Father's Name cannot contain numbers");
      return;
    }
    if (/\d/.test(motherName)) {
      setError("Mother's Name cannot contain numbers");
      return;
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    const validatePasswordRule = (pass: string) => {
      if (pass.length < 8) return 'Password must be at least 8 characters long';
      if (!/[A-Z]/.test(pass)) return 'Password must contain at least one uppercase letter';
      if (!/[a-z]/.test(pass)) return 'Password must contain at least one lowercase letter';
      if (!/[0-9]/.test(pass)) return 'Password must contain at least one number';
      if (!/[!@#$%^&*(),.?":{}|<>]/.test(pass)) return 'Password must contain at least one special character';
      return null;
    };

    const passwordValidationError = validatePasswordRule(password);
    if (passwordValidationError) {
      setError(passwordValidationError);
      return;
    }

    if (!validatePhone(phone)) {
      setError('Phone number must be exactly 10 digits and start with 98 or 97');
      return;
    }

    if (!studentIdInput) {
      setError('Please provide a valid Student ID / Roll No');
      return;
    }

    setLoading(true);
    try {
      setupRecaptcha();
      const appVerifier = (window as any).recaptchaVerifier;
      const formattedPhone = phone.startsWith('+') ? phone : `+977${phone}`;
      const result = await signInWithPhoneNumber(auth, formattedPhone, appVerifier);
      setConfirmationResult(result);
      setMessage('OTP sent to your phone! Please complete verification to finish setting up.');
      setView('register_otp');
    } catch (err: any) {
      setError(err.message || 'Failed to send OTP for Registration Verification.');
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setMessage('');
    
    const inputIdentifier = email.trim();
    if (!inputIdentifier) {
      setError('Please enter your registered email address or username');
      return;
    }

    setLoading(true);
    try {
      const lowerInput = inputIdentifier.toLowerCase();
      const usersRef = collection(db, 'users');
      let matchedEmail = '';
      let isAllowed = false;

      // Handle super admin bootstrapping
      if (lowerInput === 'rahulsah4534@gmail.com' || lowerInput === 'rahulsah4534') {
        matchedEmail = 'rahulsah4534@gmail.com';
        isAllowed = true;
      } else {
        // Query users in Firestore
        if (inputIdentifier.includes('@')) {
          const q = query(usersRef, where('email', '==', inputIdentifier));
          const snap = await getDocs(q);
          if (!snap.empty) {
            const data = snap.docs[0].data();
            matchedEmail = data.authEmail || data.email || inputIdentifier;
            isAllowed = data.status !== 'blocked' && data.status !== 'rejected';
          } else {
            // Case-insensitive / authEmail fallback scan
            const allUsersSnap = await getDocs(usersRef);
            const found = allUsersSnap.docs.find(doc => {
              const d = doc.data();
              return d.email?.toLowerCase() === lowerInput || d.authEmail?.toLowerCase() === lowerInput;
            });
            if (found) {
              const data = found.data();
              matchedEmail = data.authEmail || data.email || inputIdentifier;
              isAllowed = data.status !== 'blocked' && data.status !== 'rejected';
            }
          }
        } else {
          // Plain username entered
          const allUsersSnap = await getDocs(usersRef);
          const found = allUsersSnap.docs.find(doc => {
            const d = doc.data();
            const docEmail = (d.email || '').toLowerCase();
            const docAuthEmail = (d.authEmail || '').toLowerCase();
            const usernamePart = docEmail.split('@')[0];
            const authUsernamePart = docAuthEmail.split('@')[0];
            return usernamePart === lowerInput || authUsernamePart === lowerInput;
          });
          if (found) {
            const data = found.data();
            matchedEmail = data.authEmail || data.email;
            isAllowed = data.status !== 'blocked' && data.status !== 'rejected';
          }
        }
      }

      if (!isAllowed || !matchedEmail) {
        setError('This email address or username is not registered in the school database. Please check your credentials or contact school administration.');
        return;
      }

      // Format plain username to domain if needed
      if (!matchedEmail.includes('@')) {
        matchedEmail = `${matchedEmail.toLowerCase()}@shikshantar.edu.np`;
      }

      await sendPasswordResetEmail(auth, matchedEmail);
      setMessage(`Password reset email has been sent! Please check your inbox and spam folder.`);
    } catch (err: any) {
      if (err.code === 'auth/user-not-found') {
        setError('This account is not found in the authentication system. Please contact the administrator.');
      } else {
        setError(err.message || 'Failed to send password reset email. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setMessage('');

    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    const validatePasswordRule = (pass: string) => {
      if (pass.length < 8) return 'Password must be at least 8 characters long';
      if (!/[A-Z]/.test(pass)) return 'Password must contain at least one uppercase letter';
      if (!/[a-z]/.test(pass)) return 'Password must contain at least one lowercase letter';
      if (!/[0-9]/.test(pass)) return 'Password must contain at least one number';
      if (!/[!@#$%^&*(),.?":{}|<>]/.test(pass)) return 'Password must contain at least one special character';
      return null;
    };

    const passwordValidationError = validatePasswordRule(password);
    if (passwordValidationError) {
      setError(passwordValidationError);
      return;
    }

    if (!oobCode) {
      setError('Invalid or missing reset code.');
      return;
    }

    setLoading(true);
    try {
      await confirmPasswordReset(auth, oobCode, ensureSafePassword(password));
      setMessage('Password has been reset successfully! You can now log in.');
      setTimeout(() => {
        setView('login');
        setPassword('');
        setConfirmPassword('');
        setMessage('');
      }, 3000);
    } catch (err: any) {
      setError(err.message || 'Failed to reset password. The link might be expired.');
    } finally {
      setLoading(false);
    }
  };

  const setupRecaptcha = () => {
    if (!(window as any).recaptchaVerifier) {
      (window as any).recaptchaVerifier = new RecaptchaVerifier(auth, 'recaptcha-container', {
        size: 'invisible',
      });
    }
  };

  const handleSendPhoneOTP = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setMessage('');
    
    if (!phone) {
      setError('Please enter your phone number');
      return;
    }

    if (!validatePhone(phone)) {
      setError('Phone number must be exactly 10 digits and start with 98 or 97');
      return;
    }

    setLoading(true);
    try {
      // Check if phone number exists in db
      const usersRef = collection(db, 'users');
      const q = query(usersRef, where('phone', '==', phone));
      const querySnapshot = await getDocs(q);

      if (querySnapshot.empty) {
        setError('No account is associated with this phone number.');
        setLoading(false);
        return;
      }

      const userData = querySnapshot.docs[0].data();
      const userRole = userData.role;
      if (!['student', 'teacher', 'admin'].includes(userRole)) {
         setError('This account does not have sufficient privileges.');
         setLoading(false);
         return;
      }

      setupRecaptcha();
      const appVerifier = (window as any).recaptchaVerifier;
      const formattedPhone = phone.startsWith('+') ? phone : `+977${phone}`;
      const result = await signInWithPhoneNumber(auth, formattedPhone, appVerifier);
      setConfirmationResult(result);
      setMessage('OTP sent to your phone!');
    } catch (err: any) {
      setError(err.message || 'Failed to send OTP');
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOTP = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await confirmationResult.confirm(otpCode);
      setMessage('Phone verified successfully! You can now reset your password.');
      setView('reset');
    } catch (err: any) {
      setError('Invalid OTP code.');
    } finally {
      setLoading(false);
    }
  };

  if (view === 'verify') {
    return (
      <div className="flex items-center justify-center min-h-screen relative text-primary py-12 px-4 sm:px-6 lg:px-8 bg-[#edf1f5] overflow-hidden">
        {/* Professional Background Pattern/Logo */}
        <div className="absolute inset-0 z-0 flex items-center justify-center opacity-[0.15] pointer-events-none overflow-hidden">
          <motion.img 
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 1, ease: "easeOut" }}
            src={logoUrl} 
            alt="School Background Pattern" 
            className="w-[150%] max-w-[800px] h-auto object-contain drop-shadow-md sm:w-full mix-blend-multiply"
          />
        </div>
      
        <AnimatePresence mode="wait">
          <motion.div 
            key="verify"
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: -10 }}
            transition={{ duration: 0.3 }}
            className="w-full max-w-md relative z-10 mx-4 group transition-all duration-300"
          >
            {/* Outer Glow Bloom aura */}
            <div className="absolute inset-2 bg-gradient-to-r from-[#0a3d62] via-[#0284c7] to-[#F0A500] opacity-30 group-hover:opacity-60 blur-2xl transition-all duration-500 rounded-3xl -z-10 group-hover:scale-102 pointer-events-none" />

            {/* Boundary box with rotating gradient for animated border effect */}
            <div className="relative w-full h-full rounded-3xl overflow-hidden p-[2.5px] bg-slate-200/80 dark:bg-slate-800 transition-colors duration-300 group-hover:bg-transparent flex flex-col shadow-2xl">
              {/* Spinning lightning border */}
              <div className="absolute inset-[-180%] bg-[conic-gradient(from_0deg,#0a3d62,#0284c7,#F0A500,#fbbf24,#0ea5e9,#0a3d62)] animate-[spin_4s_linear_infinite] opacity-40 group-hover:opacity-100 transition-opacity duration-300 z-0 pointer-events-none" />

              {/* Inner masked content card */}
              <div className="relative w-full h-full bg-white/95 dark:bg-slate-900/95 backdrop-blur-md rounded-[22px] p-8 text-center z-10 overflow-hidden flex flex-col">
                <Mail className="w-16 h-16 text-[#0a3d62] mx-auto mb-4" />
                <h2 className="text-2xl font-black text-slate-800 mb-2">Verify Your Email</h2>
                <p className="text-sm text-slate-500 mb-6 font-medium">
                  We have sent you a verification email to <span className="font-bold text-[#1f2937]">{email}</span>. Please verify it and log in.
                </p>
                <AnimatedButton
                  variant="primary"
                  onClick={() => {
                    setView('login');
                    setPassword('');
                  }}
                  className="w-full mt-2"
                >
                  Go to Login
                </AnimatedButton>
              </div>
            </div>
          </motion.div>
        </AnimatePresence>
      </div>
    );
  }

  return (
    <div 
      className="flex items-center justify-center min-h-screen relative text-slate-800 py-10 px-4 sm:px-6 lg:px-8 overflow-hidden bg-gradient-to-br from-[#07243c] via-[#0a3d62] to-[#041525]"
    >
      {/* Interactive Ambient Spotlight Effect following cursor */}
      <div 
        className="absolute inset-0 pointer-events-none z-0 transition-opacity duration-700 opacity-60"
        style={{
          background: `radial-gradient(600px circle at ${mousePos.x}% ${mousePos.y}%, rgba(240, 165, 0, 0.18), rgba(59, 130, 246, 0.12) 40%, transparent 80%)`
        }}
      />

      {/* Futuristic Geometric Mesh / Constellation Lines in Background */}
      <div className="absolute inset-0 z-0 opacity-15 pointer-events-none bg-[radial-gradient(#F0A500_1px,transparent_1px)] [background-size:24px_24px]" />

      {/* Floating Ambient Glowing Light Spheres */}
      <div className="absolute top-10 left-10 w-72 h-72 rounded-full bg-blue-500/20 blur-[90px] pointer-events-none animate-pulse" />
      <div className="absolute bottom-10 right-10 w-80 h-80 rounded-full bg-amber-500/20 blur-[100px] pointer-events-none animate-pulse" />
      
      {/* Centered Large Background Watermark Logo with Subtle Glow */}
      <div className="absolute inset-0 z-0 flex items-center justify-center select-none pointer-events-none p-4 opacity-[0.08]">
        <img 
          src={logoUrl} 
          alt="Shikshantar Academy Watermark" 
          className="w-full h-full max-w-[680px] max-h-[680px] object-contain select-none pointer-events-none"
          referrerPolicy="no-referrer"
          onError={(e) => {
            const target = e.currentTarget;
            if (target.src !== logoFallback) {
              target.src = logoFallback;
            }
          }}
        />
      </div>

      <AnimatePresence mode="wait">
        <motion.div 
          key={view}
          initial={{ opacity: 0, scale: 0.96, y: 15 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, y: -15 }}
          transition={{ duration: 0.3, ease: "easeOut" }}
          className="w-full max-w-[475px] relative z-10 group transition-all duration-300"
        >
          {/* Radiant Multi-Color Ambient Bloom Aura */}
          <div className="absolute -inset-1 bg-gradient-to-r from-blue-500 via-[#F0A500] to-emerald-400 opacity-40 group-hover:opacity-75 blur-2xl transition-all duration-500 rounded-[2.5rem] -z-10 group-hover:scale-105 pointer-events-none" />

          {/* Boundary box with ultra-crisp rotating lightning gradient */}
          <div className="relative w-full h-full rounded-[2.4rem] overflow-hidden p-[2.5px] bg-slate-200/50 dark:bg-slate-700/50 transition-colors duration-300 group-hover:bg-transparent flex flex-col shadow-[0_25px_60px_rgba(0,0,0,0.4)]">
            {/* Spinning Conic Rainbow Lightning Border */}
            <div className="absolute inset-[-180%] bg-[conic-gradient(from_0deg,#0a3d62,#0284c7,#F0A500,#fbbf24,#0ea5e9,#0a3d62)] animate-[spin_5s_linear_infinite] opacity-45 group-hover:opacity-100 transition-opacity duration-300 z-0 pointer-events-none" />

            {/* Inner Masked Glassmorphic Card Container */}
            <div className="relative w-full h-full bg-white/98 dark:bg-slate-900/98 backdrop-blur-xl rounded-[2.25rem] p-7 sm:p-9 z-10 overflow-hidden flex flex-col border border-white/60 dark:border-slate-800 text-[#0a3d62] dark:text-slate-100">
              <div className="text-left mb-5 relative z-10">
                <div className="mb-5 flex items-center justify-start gap-3.5">
                  <div className="w-[60px] h-[60px] bg-white rounded-2xl p-1 shadow-md flex items-center justify-center border-2 border-amber-400/60 shadow-[0_0_20px_rgba(240,165,0,0.25)] shrink-0 select-none overflow-hidden transform group-hover:scale-105 transition-transform duration-300">
                    <img 
                      src={logoUrl} 
                      alt="Shikshantar Academy Logo" 
                      className="w-full h-full object-contain"
                      referrerPolicy="no-referrer"
                      onError={(e) => {
                        const target = e.currentTarget;
                        if (target.src !== logoFallback) {
                          target.src = logoFallback;
                        }
                      }}
                    />
                  </div>
                  <div className="flex flex-col justify-center leading-tight">
                    <div className="flex items-center gap-1.5">
                      <h1 className="text-[17px] font-black text-[#0a3d62] dark:text-white uppercase tracking-[0.04em] font-sans">
                        SHIKSHANTAR<br />ACADEMY
                      </h1>
                    </div>
                    <p className="text-[10px] text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider mt-0.5">
                      KARJANHA MUNICIPALITY, BASTIPUR -05, SIRAHA
                    </p>
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-2xl sm:text-3xl font-black text-[#0a3d62] dark:text-white tracking-tight mb-0.5">
                      {view === 'forgot' && 'Reset Password'}
                      {view === 'reset' && 'Create New Password'}
                      {view === 'login' && 'Welcome Back'}
                      {view === 'register' && 'Sign Up'}
                    </h2>
                    <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">
                      {view === 'login' && 'Sign in to access your academy portal securely'}
                      {view === 'register' && 'Create your new academy account'}
                      {view === 'forgot' && 'Enter your email or phone to receive a reset link'}
                      {view === 'reset' && 'Enter your new password below'}
                    </p>
                  </div>
                </div>
              </div>

              {error && (
                <div className="mb-4 p-3.5 bg-red-50 border border-red-200 text-red-700 rounded-xl text-xs text-center font-bold shadow-xs relative z-10 flex items-center justify-center gap-2">
                  <ShieldAlert className="w-4 h-4 shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              {message && (
                <div className="mb-4 p-3.5 bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-xl text-xs text-center font-bold shadow-xs relative z-10 flex items-center justify-center gap-2">
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                  <span>{message}</span>
                </div>
              )}

              {view === 'login' && (
                <form onSubmit={handleLogin} className="space-y-3.5 font-sans relative z-10">
                  <div>
                    <label className="block text-[11px] font-black text-[#0a3d62] dark:text-slate-200 tracking-wider mb-1.5 ml-1 uppercase">
                      USERNAME
                    </label>
                    <AnimatedField>
                      <div className="pl-3.5 flex items-center pointer-events-none shrink-0">
                        <User className={`h-4.5 w-4.5 transition-colors ${showUsernameEffect ? 'text-[#0a3d62]' : 'text-slate-400'}`} />
                      </div>
                      <input
                        type="text"
                        required
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        onFocus={() => { setIsUsernameFocused(true); setIsFieldFocused(true); }}
                        onBlur={() => { setIsUsernameFocused(false); setIsFieldFocused(false); }}
                        className="block w-full pl-2.5 pr-4 py-3.5 bg-transparent border-0 text-slate-800 dark:text-white text-sm font-medium focus:outline-none placeholder:text-slate-400"
                        placeholder="Enter Username"
                      />
                    </AnimatedField>
                  </div>

                  <div>
                    <label className="block text-[11px] font-black text-[#0a3d62] dark:text-slate-200 tracking-wider mb-1.5 ml-1 uppercase">PASSWORD</label>
                    <AnimatedField>
                      <div className="pl-3.5 flex items-center pointer-events-none shrink-0">
                        <Lock className={`h-4.5 w-4.5 transition-colors ${showPasswordEffect ? 'text-[#0a3d62]' : 'text-slate-400'}`} />
                      </div>
                      <input
                        type={showPassword ? "text" : "password"}
                        required
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        onFocus={() => { setIsPasswordFocused(true); setIsFieldFocused(true); }}
                        onBlur={() => { setIsPasswordFocused(false); setIsFieldFocused(false); }}
                        className="block w-full pl-2.5 pr-10 py-3.5 bg-transparent border-0 text-slate-800 dark:text-white text-sm font-medium focus:outline-none placeholder:text-slate-400"
                        placeholder="••••••••"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-white focus:outline-none transition-colors z-20 cursor-pointer"
                      >
                        {showPassword ? <EyeOff className="h-4.5 w-4.5" /> : <Eye className="h-4.5 w-4.5" />}
                      </button>
                    </AnimatedField>
                  </div>

                  <div className="flex justify-end text-xs font-bold text-[#0a3d62] dark:text-sky-400 mt-0.5 select-none pr-1">
                    <button 
                      type="button" 
                      onClick={() => { 
                        setView('forgot'); 
                        setError(''); 
                        setMessage(''); 
                      }}
                      className="hover:underline transition-all cursor-pointer"
                    >
                      Forgot Password?
                    </button>
                  </div>

                  {/* reCAPTCHA Anti-Bot Security Shield Checkbox */}
                  <div className="pt-1">
                    <RecaptchaBotShield 
                      isVerified={isRecaptchaVerified} 
                      onVerify={(val) => {
                        setIsRecaptchaVerified(val);
                        if (val && error.includes('reCAPTCHA')) {
                          setError('');
                        }
                      }}
                    />
                  </div>

                  <div className="pt-2 space-y-2.5">
                    <AnimatedButton
                      type="submit"
                      disabled={loading}
                      variant="primary"
                      className="w-full"
                      onMouseEnter={() => setIsLoginHovered(true)}
                      onMouseLeave={() => setIsLoginHovered(false)}
                      onFocus={() => setIsLoginFocused(true)}
                      onBlur={() => setIsLoginFocused(false)}
                    >
                      {loading ? 'Authenticating...' : `SIGN IN TO PORTAL`}
                    </AnimatedButton>

                    <AnimatedButton
                      type="button"
                      variant="guest"
                      className="w-full"
                      onClick={() => {
                        localStorage.removeItem('userRole');
                        localStorage.removeItem('studentId');
                        localStorage.removeItem('studentClass');
                        localStorage.removeItem('adminSearchStudentId');
                        localStorage.removeItem('teacherSubjects');
                        localStorage.setItem('isGuest', 'true');
                        window.location.href = '/';
                      }}
                    >
                      <User className="w-4 h-4 text-[#0a3d62]" />
                      Continue as Guest User
                    </AnimatedButton>
                  </div>
                </form>
              )}

          {view === 'forgot' && (
            <div className="space-y-4 font-sans animate-in fade-in duration-300">
              <div className="flex p-1.5 bg-slate-200/50 rounded-xl mb-6 shadow-sm border border-slate-300/40">
                <button
                  type="button"
                  onClick={() => { setResetMethod('email'); setError(''); setMessage(''); }}
                  className={`flex-1 py-2 text-xs font-bold rounded-xl transition-all cursor-pointer ${ resetMethod === 'email' ? 'bg-white text-[#0a3d62] shadow-sm border border-slate-200' : 'text-slate-500 hover:text-[#0a3d62]' }`}
                >
                  Reset via Email
                </button>
                <button
                  type="button"
                  onClick={() => { setResetMethod('phone'); setError(''); setMessage(''); }}
                  className={`flex-1 py-2 text-xs font-bold rounded-xl transition-all cursor-pointer ${ resetMethod === 'phone' ? 'bg-white text-[#0a3d62] shadow-sm border border-slate-200' : 'text-slate-500 hover:text-[#0a3d62]' }`}
                >
                  Reset via SMS
                </button>
              </div>

              {resetMethod === 'email' ? (
                <form onSubmit={handleForgotPassword} className="space-y-5">
                  <div>
                    <label className="block text-[11px] font-black text-[#0a3d62] tracking-widest mb-1.5 ml-1 uppercase">Email Address</label>
                    <AnimatedField>
                      <div className="pl-3.5 flex items-center pointer-events-none shrink-0">
                        <Mail className="h-4.5 w-4.5 text-[#0a3d62]/80" />
                      </div>
                      <input
                        type="email"
                        required
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="block w-full pl-2.5 pr-4 py-3.5 bg-transparent border-0 text-slate-800 text-sm font-medium focus:outline-none placeholder:text-slate-400"
                        placeholder="name@example.com"
                      />
                    </AnimatedField>
                  </div>

                  <AnimatedButton
                    type="submit"
                    disabled={loading}
                    variant="primary"
                    className="w-full mt-4"
                  >
                    {loading ? 'Sending...' : 'Send Reset Link'}
                  </AnimatedButton>
                </form>
              ) : (
                <form onSubmit={confirmationResult ? handleVerifyOTP : handleSendPhoneOTP} className="space-y-5">
                  <div id="recaptcha-container"></div>
                  {!confirmationResult ? (
                    <>
                      <div>
                        <label className="block text-[11px] font-black text-[#0a3d62] tracking-widest mb-1.5 ml-1 uppercase">Phone Number</label>
                        <AnimatedField>
                          <div className="pl-3.5 flex items-center pointer-events-none shrink-0">
                            <Phone className="h-4.5 w-4.5 text-[#0a3d62]/80" />
                          </div>
                          <input
                            type="tel"
                            required
                            value={phone}
                            onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
                            className="block w-full pl-2.5 pr-4 py-3.5 bg-transparent border-0 text-slate-800 text-sm font-medium focus:outline-none placeholder:text-slate-400"
                            placeholder="98XXXXXXXX"
                            maxLength={10}
                            pattern="^(98|97)\d{8}$"
                            title="Phone number must be exactly 10 digits and start with 98 or 97"
                          />
                        </AnimatedField>
                      </div>
                      <AnimatedButton
                        type="submit"
                        disabled={loading}
                        variant="primary"
                        className="w-full mt-4"
                      >
                        {loading ? 'Sending OTP...' : 'Send OTP'}
                      </AnimatedButton>
                    </>
                  ) : (
                    <>
                      <div>
                        <label className="block text-[11px] font-black text-[#0a3d62] tracking-widest mb-1.5 ml-1 uppercase">Enter OTP</label>
                        <AnimatedField>
                          <div className="pl-3.5 flex items-center pointer-events-none shrink-0">
                            <Lock className="h-4.5 w-4.5 text-[#0a3d62]/80" />
                          </div>
                          <input
                            type="text"
                            required
                            value={otpCode}
                            onChange={(e) => setOtpCode(e.target.value)}
                            className="block w-full pl-2.5 pr-4 py-3.5 bg-transparent border-0 text-slate-800 text-sm font-bold tracking-widest text-center focus:outline-none placeholder:text-slate-400"
                            placeholder="123456"
                            maxLength={6}
                          />
                        </AnimatedField>
                      </div>
                      <AnimatedButton
                        type="submit"
                        disabled={loading}
                        variant="primary"
                        className="w-full mt-4"
                      >
                        {loading ? 'Verifying...' : 'Verify OTP'}
                      </AnimatedButton>
                    </>
                  )}
                </form>
              )}

              <div className="text-center mt-6">
                <button 
                  type="button" 
                  onClick={() => { setView('login'); setError(''); setMessage(''); setConfirmationResult(null); }} 
                  className="text-[#0a3d62] font-semibold text-xs flex items-center justify-center gap-1.5 mx-auto hover:underline cursor-pointer"
                >
                  <ArrowLeft className="w-4 h-4" /> Back to Login
                </button>
              </div>
            </div>
          )}

          {view === 'reset' && (
            <form onSubmit={handleResetPassword} className="space-y-4 font-sans animate-in fade-in duration-300">
              <div className="bg-[#0a3d62]/10 rounded-2xl p-4 mb-4 border border-[#0a3d62]/20 flex items-start gap-3 shadow-sm">
                <div className="p-2.5 bg-[#0a3d62]/10 text-[#0a3d62] rounded-xl border border-[#0a3d62]/10 shadow-sm">
                  <Lock className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="text-xs font-black text-[#0a3d62]">Secure Your Account</h4>
                  <p className="text-[10px] text-slate-600 mt-0.5 leading-relaxed font-semibold">Please choose a strong password that you haven't used before. It must be at least 8 characters long.</p>
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-black text-[#0a3d62] tracking-widest mb-1.5 ml-1 uppercase">New Password</label>
                <AnimatedField>
                  <div className="pl-3.5 flex items-center pointer-events-none shrink-0">
                    <Lock className="h-4.5 w-4.5 text-[#0a3d62]/80" />
                  </div>
                  <input
                    type={showPassword ? "text" : "password"}
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="block w-full pl-2.5 pr-10 py-3.5 bg-transparent border-0 text-slate-800 text-sm font-medium focus:outline-none placeholder:text-slate-400"
                    placeholder="••••••••"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 focus:outline-none transition-colors z-20 cursor-pointer"
                  >
                    {showPassword ? <EyeOff className="h-4.5 w-4.5" /> : <Eye className="h-4.5 w-4.5" />}
                  </button>
                </AnimatedField>
              </div>
              
              <div>
                <label className="block text-[11px] font-black text-[#0a3d62] tracking-widest mb-1.5 ml-1 uppercase">Confirm New Password</label>
                <AnimatedField>
                  <div className="pl-3.5 flex items-center pointer-events-none shrink-0">
                    <Lock className="h-4.5 w-4.5 text-[#0a3d62]/80" />
                  </div>
                  <input
                    type={showConfirmPassword ? "text" : "password"}
                    required
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="block w-full pl-2.5 pr-10 py-3.5 bg-transparent border-0 text-slate-800 text-sm font-medium focus:outline-none placeholder:text-slate-400"
                    placeholder="••••••••"
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 focus:outline-none transition-colors z-20 cursor-pointer"
                  >
                    {showConfirmPassword ? <EyeOff className="h-4.5 w-4.5" /> : <Eye className="h-4.5 w-4.5" />}
                  </button>
                </AnimatedField>
              </div>
              
              <div className="bg-slate-200/30 border border-slate-300/30 rounded-xl p-3.5 shadow-sm">
                <ul className="text-[10px] text-slate-600 space-y-1.5 text-left font-semibold">
                  <li className="flex items-center gap-2">
                    <div className={`w-1.5 h-1.5 rounded-full ${password.length >= 8 ? 'bg-[#0a3d62]' : 'bg-slate-300'}`}></div> Minimum 8 characters
                  </li>
                  <li className="flex items-center gap-2">
                    <div className={`w-1.5 h-1.5 rounded-full ${(/[A-Z]/.test(password) && /[a-z]/.test(password)) ? 'bg-[#0a3d62]' : 'bg-slate-300'}`}></div> Uppercase & lowercase letter
                  </li>
                  <li className="flex items-center gap-2">
                    <div className={`w-1.5 h-1.5 rounded-full ${(/[0-9]/.test(password) && /[^A-Za-z0-9]/.test(password)) ? 'bg-[#0a3d62]' : 'bg-slate-300'}`}></div> Number & special character
                  </li>
                </ul>
              </div>

              <AnimatedButton
                type="submit"
                disabled={loading}
                variant="primary"
                className="w-full mt-4"
              >
                {loading ? 'Updating Password...' : 'Change Password'}
              </AnimatedButton>

              <div className="text-center mt-6">
                <button 
                  type="button" 
                  onClick={() => { setView('login'); setError(''); setMessage(''); }} 
                  className="text-[#0a3d62] font-semibold text-xs flex items-center justify-center gap-1.5 mx-auto hover:underline cursor-pointer"
                >
                  <ArrowLeft className="w-4 h-4" /> Back to Login
                </button>
              </div>
            </form>
          )}

          {view === 'register' && (
            <form onSubmit={handleRegister} className="space-y-4 max-h-[50vh] overflow-y-auto pr-2 custom-scrollbar">
              <div>
                <label className="block text-xs font-bold text-[#0a3d62] tracking-wide mb-1.5 ml-1">Full Name</label>
                <AnimatedField>
                  <div className="pl-3.5 flex items-center pointer-events-none shrink-0">
                    <User className="h-4 w-4 text-[#0a3d62]/80" />
                  </div>
                  <input 
                    type="text" 
                    required 
                    value={name} 
                    onChange={(e) => setName(e.target.value.replace(/\d/g, ''))} 
                    className="block w-full pl-2.5 pr-4 py-3 bg-transparent border-0 text-slate-800 text-sm font-medium focus:outline-none placeholder:text-slate-400" 
                    placeholder="Enter full name" 
                  />
                </AnimatedField>
              </div>

              <div>
                <label className="block text-xs font-bold text-[#0a3d62] tracking-wide mb-1.5 ml-1">Father's Name</label>
                <AnimatedField>
                  <div className="pl-3.5 flex items-center pointer-events-none shrink-0">
                    <User className="h-4 w-4 text-[#0a3d62]/80" />
                  </div>
                  <input 
                    type="text" 
                    required 
                    value={fatherName} 
                    onChange={(e) => setFatherName(e.target.value.replace(/\d/g, ''))} 
                    className="block w-full pl-2.5 pr-4 py-3 bg-transparent border-0 text-slate-800 text-sm font-medium focus:outline-none placeholder:text-slate-400" 
                    placeholder="Father's name" 
                  />
                </AnimatedField>
              </div>

              <div>
                <label className="block text-xs font-bold text-[#0a3d62] tracking-wide mb-1.5 ml-1">Mother's Name</label>
                <AnimatedField>
                  <div className="pl-3.5 flex items-center pointer-events-none shrink-0">
                    <User className="h-4 w-4 text-[#0a3d62]/80" />
                  </div>
                  <input 
                    type="text" 
                    required 
                    value={motherName} 
                    onChange={(e) => setMotherName(e.target.value.replace(/\d/g, ''))} 
                    className="block w-full pl-2.5 pr-4 py-3 bg-transparent border-0 text-slate-800 text-sm font-medium focus:outline-none placeholder:text-slate-400" 
                    placeholder="Mother's name" 
                  />
                </AnimatedField>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] sm:text-xs font-bold text-[#0a3d62] tracking-wide mb-1.5 ml-1">Date of Birth</label>
                  <AnimatedField>
                    <div className="pl-3 flex items-center pointer-events-none shrink-0">
                      <Calendar className="h-4 w-4 text-[#0a3d62]/80" />
                    </div>
                    <input 
                      type="date" 
                      required 
                      value={dob} 
                      onChange={(e) => setDob(e.target.value)} 
                      className="block w-full pl-2 pr-2 py-3 bg-transparent border-0 text-slate-800 text-xs sm:text-sm font-medium focus:outline-none" 
                    />
                  </AnimatedField>
                </div>
                <div>
                  <label className="block text-[10px] sm:text-xs font-bold text-[#0a3d62] tracking-wide mb-1.5 ml-1">Class</label>
                  <AnimatedField>
                    <div className="pl-3 flex items-center pointer-events-none shrink-0">
                      <BookOpen className="h-4 w-4 text-[#0a3d62]/80" />
                    </div>
                    <select 
                      required 
                      value={studentClass} 
                      onChange={(e) => setStudentClass(e.target.value)} 
                      className="block w-full pl-2 pr-7 py-3 bg-transparent border-0 text-slate-800 text-xs sm:text-sm font-medium focus:outline-none appearance-none"
                    >
                      <option value="" disabled style={{ backgroundColor: '#ffffff', color: '#0a3d62' }}>Class</option>
                      <option value="Playgroup" style={{ backgroundColor: '#ffffff', color: '#0a3d62' }}>Playgroup</option>
                      <option value="Nursery" style={{ backgroundColor: '#ffffff', color: '#0a3d62' }}>Nursery</option>
                      <option value="LKG" style={{ backgroundColor: '#ffffff', color: '#0a3d62' }}>LKG</option>
                      <option value="UKG" style={{ backgroundColor: '#ffffff', color: '#0a3d62' }}>UKG</option>
                      {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(num => (
                        <option key={num} value={num.toString()} style={{ backgroundColor: '#ffffff', color: '#0a3d62' }}>Class {num}</option>
                      ))}
                    </select>
                    <div className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none">
                      <svg className="h-4 w-4 text-[#0a3d62]/80" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </div>
                  </AnimatedField>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-[#0a3d62] tracking-wide mb-1.5 ml-1">Student ID / Roll No</label>
                <AnimatedField>
                  <div className="pl-3.5 flex items-center pointer-events-none shrink-0">
                    <Lock className="h-4 w-4 text-[#0a3d62]/80" />
                  </div>
                  <input 
                    type="text" 
                    required 
                    value={studentIdInput} 
                    onChange={(e) => setStudentIdInput(e.target.value)} 
                    className="block w-full pl-2.5 pr-4 py-3 bg-transparent border-0 text-slate-800 text-sm font-medium focus:outline-none placeholder:text-slate-400" 
                    placeholder="Student ID (e.g. STU123)" 
                  />
                </AnimatedField>
              </div>

              <div>
                <label className="block text-xs font-bold text-[#0a3d62] tracking-wide mb-1.5 ml-1">Address</label>
                <AnimatedField>
                  <div className="pl-3.5 flex items-center pointer-events-none shrink-0">
                    <MapPin className="h-4 w-4 text-[#0a3d62]/80" />
                  </div>
                  <input 
                    type="text" 
                    required 
                    value={address} 
                    onChange={(e) => setAddress(e.target.value)} 
                    className="block w-full pl-2.5 pr-4 py-3 bg-transparent border-0 text-slate-800 text-sm font-medium focus:outline-none placeholder:text-slate-400" 
                    placeholder="Full address" 
                  />
                </AnimatedField>
              </div>

              <div>
                <label className="block text-xs font-bold text-[#0a3d62] tracking-wide mb-1.5 ml-1">Phone Number</label>
                <AnimatedField>
                  <div className="pl-3.5 flex items-center pointer-events-none shrink-0">
                    <Phone className="h-4 w-4 text-[#0a3d62]/80" />
                  </div>
                  <input 
                    type="tel" 
                    required 
                    value={phone} 
                    onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))} 
                    className="block w-full pl-2.5 pr-4 py-3 bg-transparent border-0 text-slate-800 text-sm font-medium focus:outline-none placeholder:text-slate-400" 
                    placeholder="98XXXXXXXX or 97XXXXXXXX" 
                    maxLength={10}
                    pattern="^(98|97)\d{8}$"
                    title="Phone number must be exactly 10 digits and start with 98 or 97"
                  />
                </AnimatedField>
              </div>

              <div>
                <label className="block text-xs font-bold text-[#0a3d62] tracking-wide mb-1.5 ml-1">Email</label>
                <AnimatedField>
                  <div className="pl-3.5 flex items-center pointer-events-none shrink-0">
                    <Mail className="h-4 w-4 text-[#0a3d62]/80" />
                  </div>
                  <input 
                    type="email" 
                    required 
                    value={email} 
                    onChange={(e) => setEmail(e.target.value)} 
                    className="block w-full pl-2.5 pr-4 py-3 bg-transparent border-0 text-slate-800 text-sm font-medium focus:outline-none placeholder:text-slate-400" 
                    placeholder="Enter email" 
                  />
                </AnimatedField>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-[#0a3d62] tracking-wide mb-1.5 ml-1">Password</label>
                  <AnimatedField>
                    <div className="pl-3.5 flex items-center pointer-events-none shrink-0">
                      <Lock className="h-4 w-4 text-[#0a3d62]/80" />
                    </div>
                    <input 
                      type={showPassword ? "text" : "password"} 
                      required 
                      value={password} 
                      onChange={(e) => setPassword(e.target.value)} 
                      className="block w-full pl-2.5 pr-9 py-3 bg-transparent border-0 text-slate-800 text-sm font-medium focus:outline-none placeholder:text-slate-400" 
                      placeholder="••••••••" 
                    />
                    <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 focus:outline-none transition-colors z-20 cursor-pointer">
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </AnimatedField>
                </div>
                <div>
                  <label className="block text-xs font-bold text-[#0a3d62] tracking-wide mb-1.5 ml-1">Confirm Password</label>
                  <AnimatedField>
                    <div className="pl-3.5 flex items-center pointer-events-none shrink-0">
                      <Lock className="h-4 w-4 text-[#0a3d62]/80" />
                    </div>
                    <input 
                      type={showConfirmPassword ? "text" : "password"} 
                      required 
                      value={confirmPassword} 
                      onChange={(e) => setConfirmPassword(e.target.value)} 
                      className="block w-full pl-2.5 pr-9 py-3 bg-transparent border-0 text-slate-800 text-sm font-medium focus:outline-none placeholder:text-slate-400" 
                      placeholder="••••••••" 
                    />
                    <button type="button" onClick={() => setShowConfirmPassword(!showConfirmPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 focus:outline-none transition-colors z-20 cursor-pointer">
                      {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </AnimatedField>
                </div>
              </div>

              <div className="bg-[#0a3d62]/5 border border-[#0a3d62]/20 rounded-xl p-3 shadow-none">
                <ul className="text-[10px] text-[#0a3d62] list-disc pl-4 space-y-1 text-left font-bold">
                  <li>Minimum 8 characters</li>
                  <li>At least one uppercase & lowercase letter</li>
                  <li>At least one number & special character</li>
                </ul>
              </div>

              <div className="space-y-2.5 pt-1">
                <AnimatedButton
                  type="submit"
                  disabled={loading}
                  variant="primary"
                  className="w-full"
                >
                  {loading ? 'Registering...' : `Register Account`}
                </AnimatedButton>

                <AnimatedButton
                  type="button"
                  variant="guest"
                  className="w-full"
                  onClick={() => {
                    localStorage.removeItem('userRole');
                    localStorage.removeItem('studentId');
                    localStorage.removeItem('studentClass');
                    localStorage.removeItem('adminSearchStudentId');
                    localStorage.removeItem('teacherSubjects');
                    localStorage.setItem('isGuest', 'true');
                    window.location.href = '/';
                  }}
                >
                  <User className="w-5 h-5 text-[#0a3d62]" />
                  Continue as Guest User
                </AnimatedButton>
              </div>

              <p className="text-center text-xs font-bold text-[#0a3d62]/90 mt-5 select-none">
                Already have an account?{' '}
                <button type="button" onClick={() => { setView('login'); setError(''); }} className="text-[#0a3d62] font-black hover:text-[#072c47] hover:underline ml-1 cursor-pointer">
                  Sign in here
                </button>
              </p>
            </form>
          )}

          {view === 'register_otp' && (
            <form onSubmit={handleRegisterOtpVerify} className="space-y-5">
              <div id="recaptcha-container"></div>
              <div>
                <label className="block text-xs font-bold text-[#0a3d62]/80 tracking-wide mb-1.5 ml-1">Enter Phone Verification OTP</label>
                <AnimatedField>
                  <div className="pl-3.5 flex items-center pointer-events-none shrink-0">
                    <Lock className="h-4 w-4 text-[#0a3d62]/60" />
                  </div>
                  <input
                    type="text"
                    required
                    value={otpCode}
                    onChange={(e) => setOtpCode(e.target.value)}
                    className="block w-full pl-2.5 pr-4 py-3.5 bg-transparent border-0 text-slate-800 text-sm font-bold tracking-widest text-center focus:outline-none placeholder:text-slate-400"
                    placeholder="123456"
                    maxLength={6}
                  />
                </AnimatedField>
                <p className="text-[10px] text-[#0a3d62]/95 mt-2 text-center font-bold">We sent a 6-digit code to {phone}</p>
              </div>
              <AnimatedButton
                type="submit"
                disabled={loading}
                variant="primary"
                className="w-full mt-4"
              >
                {loading ? 'Verifying...' : 'Verify Phone & Register'}
              </AnimatedButton>
              <div className="text-center mt-4">
                <button 
                  type="button" 
                  onClick={() => { setView('register'); setError(''); setMessage(''); setConfirmationResult(null); }} 
                  className="text-[#0a3d62] font-semibold text-xs flex items-center justify-center gap-1 mx-auto hover:underline cursor-pointer"
                >
                  <ArrowLeft className="w-4 h-4" /> Cancel & Go Back
                </button>
              </div>
            </form>
          )}
            </div>
          </div>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
