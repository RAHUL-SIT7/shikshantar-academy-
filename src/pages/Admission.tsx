import React, { useState, useEffect, useCallback } from "react";
import { Helmet } from 'react-helmet-async';
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { db } from "../firebase";
import AdmissionIntro from "../components/AdmissionIntro";
import { sendAdmissionEmail } from "../lib/emailService";
import {
  collection,
  addDoc,
  serverTimestamp,
  doc,
  getDoc,
  query,
  where,
  getDocs,
  setDoc,
} from "firebase/firestore";
import {
  CheckCircle2,
  AlertCircle,
  Send,
  Loader2,
  Search,
  FileText,
  Settings,
  X,
  Plus,
  Save,
  User,
  GraduationCap,
  MapPin,
  Phone,
  Mail,
  Building,
  Clock,
  ChevronRight,
  Sparkles,
  Award,
  ShieldCheck,
  FileCheck,
  LifeBuoy,
  RefreshCw,
  Check,
  Shield
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { auth } from "../firebase";
import logoImage from "../assets/logo.png";

export default function Admission() {
  const navigate = useNavigate();
  const [formData, setFormData] = useState<Record<string, any>>({});
  const [formFields, setFormFields] = useState<any[]>([]);
  const [isAdmissionOpen, setIsAdmissionOpen] = useState(true);
  const [admissionClosedMessage, setAdmissionClosedMessage] = useState(
    "Admission Closed for this Academic Year",
  );
  const [isLoadingFields, setIsLoadingFields] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [focusedField, setFocusedField] = useState<string | null>(null);
  const [showIntro, setShowIntro] = useState(true);

  // reCAPTCHA states
  const [isCaptchaVerified, setIsCaptchaVerified] = useState(false);
  const [isCheckingRobot, setIsCheckingRobot] = useState(false);
  const [showChallenge, setShowChallenge] = useState(false);

  // Ref to scroll to the top of the form on error
  const formTopRef = React.useRef<HTMLDivElement>(null);

  const scrollToTop = () => {
    if (formTopRef.current) {
      // scroll-mt-24 gives some nice header padding
      formTopRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
    } else {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  };

  // Helper to determine if user has started filling the form (ignores pre-selected default options)
  const hasStartedFilling = Object.keys(formData).some((k) => {
    if (k === "gender" || k === "gradeAppliedFor") return false;
    const val = formData[k];
    return val !== undefined && val !== null && String(val).trim() !== "";
  });

  // BOT Prevention CAPTCHA Guard
  const canvasRef = React.useRef<HTMLCanvasElement>(null);
  const [captchaCode, setCaptchaCode] = useState("");
  const [captchaInput, setCaptchaInput] = useState("");
  const [captchaError, setCaptchaError] = useState("");

  const drawCaptcha = useCallback((code: string, canvas: HTMLCanvasElement | null) => {
    if (!canvas || !code) return;
    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Gradient BG
      const grad = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
      grad.addColorStop(0, '#f8fafc');
      grad.addColorStop(1, '#e2e8f0');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Noise lines
      for (let i = 0; i < 6; i++) {
        ctx.strokeStyle = `rgba(${Math.floor(Math.random() * 100 + 50)}, ${Math.floor(Math.random() * 100 + 50)}, ${Math.floor(Math.random() * 150 + 100)}, 0.45)`;
        ctx.lineWidth = Math.random() * 1.5 + 1;
        ctx.beginPath();
        ctx.moveTo(Math.random() * canvas.width, Math.random() * canvas.height);
        ctx.lineTo(Math.random() * canvas.width, Math.random() * canvas.height);
        ctx.stroke();
      }

      // Noise dots
      for (let i = 0; i < 40; i++) {
        ctx.fillStyle = `rgba(${Math.floor(Math.random() * 150)}, ${Math.floor(Math.random() * 150)}, ${Math.floor(Math.random() * 150)}, 0.3)`;
        ctx.beginPath();
        ctx.arc(Math.random() * canvas.width, Math.random() * canvas.height, Math.random() * 1.5 + 0.5, 0, Math.PI * 2);
        ctx.fill();
      }

      // Characters
      ctx.font = "bold 24px 'Space Grotesk', 'Courier New', monospace";
      ctx.textBaseline = "middle";
      for (let i = 0; i < code.length; i++) {
        const char = code[i];
        const x = 14 + i * 26 + Math.random() * 4;
        const y = canvas.height / 2 + (Math.random() * 6 - 3);
        ctx.save();
        ctx.translate(x, y);
        const angle = ((Math.random() * 30) - 15) * Math.PI / 180;
        ctx.rotate(angle);
        ctx.fillStyle = `rgb(${Math.floor(Math.random() * 80)}, ${Math.floor(Math.random() * 60)}, ${Math.floor(Math.random() * 120)})`;
        ctx.fillText(char, 0, 0);
        ctx.restore();
      }
    }
  }, []);

  const generateNewCaptcha = useCallback((preserveError = false) => {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; 
    let code = "";
    for (let i = 0; i < 5; i++) {
       code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    setCaptchaCode(code);
    setCaptchaInput("");
    if (!preserveError) {
      setCaptchaError("");
    }
  }, []);

  const handleVerifyCaptcha = () => {
    if (captchaInput.trim().toUpperCase() === captchaCode) {
      setIsCaptchaVerified(true);
      setShowChallenge(false);
      setCaptchaError("");
    } else {
      generateNewCaptcha(true);
      setCaptchaError("Incorrect verification code. Please try again.");
    }
  };

  // Callback Ref triggered on DOM mount
  const canvasRefCallback = useCallback((canvas: HTMLCanvasElement | null) => {
    (canvasRef as any).current = canvas;
    if (canvas && captchaCode) {
      drawCaptcha(captchaCode, canvas);
    }
  }, [captchaCode, drawCaptcha]);

  useEffect(() => {
    if (captchaCode && canvasRef.current) {
      drawCaptcha(captchaCode, canvasRef.current);
    }
  }, [captchaCode, drawCaptcha]);

  useEffect(() => {
    generateNewCaptcha();
  }, [generateNewCaptcha]);

  // Form Config State
  const [isFormConfigOpen, setIsFormConfigOpen] = useState(false);
  const [savingConfig, setSavingConfig] = useState(false);
  const [trackingId, setTrackingId] = useState<string>("");
  const [submittedValues, setSubmittedValues] = useState<Record<string, any>>({});

  // DOB Custom Calendar states (AD / BS toggle)
  const [dobSystem, setDobSystem] = useState<"BS" | "AD">("BS");
  const [dobBSYear, setDobBSYear] = useState<string>("");
  const [dobBSMonth, setDobBSMonth] = useState<string>("");
  const [dobBSDay, setDobBSDay] = useState<string>("");
  const [dobADDate, setDobADDate] = useState<string>("");

  useEffect(() => {
    if (dobSystem === "BS") {
      if (dobBSYear && dobBSMonth && dobBSDay) {
        setFormData(prev => ({
          ...prev,
          dateOfBirth: `${dobBSYear}-${dobBSMonth}-${dobBSDay} B.S.`
        }));
      } else {
        setFormData(prev => ({
          ...prev,
          dateOfBirth: ""
        }));
      }
    } else {
      if (dobADDate) {
        setFormData(prev => ({
          ...prev,
          dateOfBirth: `${dobADDate} A.D.`
        }));
      } else {
        setFormData(prev => ({
          ...prev,
          dateOfBirth: ""
        }));
      }
    }
  }, [dobSystem, dobBSYear, dobBSMonth, dobBSDay, dobADDate]);

  useEffect(() => {
    if (formData.dateOfBirth === "") {
      setDobBSYear("");
      setDobBSMonth("");
      setDobBSDay("");
      setDobADDate("");
    }
  }, [formData.dateOfBirth]);

  useEffect(() => {
    // Check if user is admin
    const checkAdmin = async () => {
      try {
        const user = auth.currentUser;
        if (user) {
          const userDoc = await getDoc(doc(db, "users", user.uid));
          if (userDoc.exists() && userDoc.data().role === "admin") {
            setIsAdmin(true);
          }
        }
      } catch (err) {
        console.warn("Could not check admin status, continuing as non-admin:", err);
      }
    };
    checkAdmin();

    const fetchFields = async () => {
      const defaultFields = [
        {
          id: "studentName",
          label: "Student Full Name",
          type: "text",
          required: true,
        },
        {
          id: "dateOfBirth",
          label: "Date of Birth",
          type: "date",
          required: true,
        },
        {
          id: "gender",
          label: "Gender",
          type: "select",
          options: ["Male", "Female", "Other"],
          required: true,
        },
        {
          id: "parentName",
          label: "Parent/Guardian Name",
          type: "text",
          required: true,
        },
        {
          id: "contactNumber",
          label: "Contact Number",
          type: "tel",
          required: true,
        },
        {
          id: "email",
          label: "Email Address",
          type: "email",
          required: false,
        },
        {
          id: "address",
          label: "Residential Address",
          type: "textarea",
          required: true,
        },
        {
          id: "gradeAppliedFor",
          label: "Grade Applied For",
          type: "select",
          options: [
            "Play Group",
            "Nursery",
            "LKG",
            "UKG",
            "Class 1",
            "Class 2",
            "Class 3",
            "Class 4",
            "Class 5",
            "Class 6",
            "Class 7",
            "Class 8",
            "Class 9",
          ],
          required: true,
        },
        {
          id: "previousSchool",
          label: "Previous School Attended (If any)",
          type: "text",
          required: false,
        },
      ];

      try {
        const docRef = doc(db, "settings", "admissionFormConfig");
        const docSnap = await getDoc(docRef);

        if (docSnap.exists() && docSnap.data().fields) {
          const data = docSnap.data();
          let fetchedFields = data.fields;
          // Ensure gradeAppliedFor is up to Class 9 and has Play Group setup correctly
          fetchedFields = fetchedFields.map((f: any) => {
            if (f.id === 'gradeAppliedFor') {
                return { ...f, options: ['Play Group', 'Nursery', 'LKG', 'UKG', 'Class 1', 'Class 2', 'Class 3', 'Class 4', 'Class 5', 'Class 6', 'Class 7', 'Class 8', 'Class 9'] };
            }
            return f;
          });
          setFormFields(fetchedFields);
          setIsAdmissionOpen(data.isAdmissionOpen !== false);
          setAdmissionClosedMessage(
            data.admissionClosedMessage ||
              "Admission Closed for this Academic Year",
          );
          // Initialize state with empty strings for all fields
          const initialData: Record<string, string> = {};
          docSnap.data().fields.forEach((f: any) => {
            initialData[f.id] = "";
            if (f.type === "select" && f.options?.length > 0) {
              initialData[f.id] = f.options[0];
            }
          });
          setFormData(initialData);
        } else {
          // Fallback Default Fields
          setFormFields(defaultFields);
          const initialData: Record<string, string> = {
            gender: "Male",
            gradeAppliedFor: "Play Group",
          };
          defaultFields.forEach((f) => {
            if (f.type !== "select") initialData[f.id] = "";
          });
          setFormData(initialData);
        }
      } catch (error) {
        console.error("Error fetching form fields, falling back to static schema defaultFields:", error);
        setFormFields(defaultFields);
        const initialData: Record<string, string> = {
          gender: "Male",
          gradeAppliedFor: "Play Group",
        };
        defaultFields.forEach((f) => {
          if (f.type !== "select") initialData[f.id] = "";
        });
        setFormData(initialData);
      } finally {
        setIsLoadingFields(false);
      }
    };
    fetchFields();
  }, []);

  const [status, setStatus] = useState<{
    type: "success" | "error" | null;
    message: string;
  }>({ type: null, message: "" });
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleCancel = () => {
    // Reset form data to defaults
    const resetData: Record<string, string> = {};
    formFields.forEach((f: any) => {
      resetData[f.id] = "";
      if (f.type === "select" && f.options?.length > 0) {
        resetData[f.id] = f.options[0];
      }
    });
    setFormData(resetData);

    // Reset custom DOB state
    setDobBSYear("");
    setDobBSMonth("");
    setDobBSDay("");
    setDobADDate("");

    // Clear captcha errors and generate a new code
    setCaptchaInput("");
    setCaptchaError("");
    setIsCaptchaVerified(false);
    setIsCheckingRobot(false);
    setShowChallenge(false);
    generateNewCaptcha();

    // Clear alert banner
    setStatus({ type: null, message: "" });

    // Scroll to top of form
    scrollToTop();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setStatus({ type: null, message: "" });

    // CAPTCHA check - always applies for human users to strictly prevent bots
    const isCaptchaActive = !isAdmin;
    if (isCaptchaActive && !isCaptchaVerified) {
      setStatus({
        type: "error",
        message: "Please complete the security reCAPTCHA ('I'm not a robot') to submit your form.",
      });
      setIsSubmitting(false);
      scrollToTop();
      return;
    }

    // Contact Number Validation if present in dynamic fields
    if (formData.contactNumber) {
      const cleanNumber = formData.contactNumber?.replace(/[\s-]/g, "") || "";
      if (cleanNumber.length > 0 && cleanNumber.length < 10) {
        setStatus({
          type: "error",
          message: "Please enter a valid contact number (at least 10 digits).",
        });
        setIsSubmitting(false);
        scrollToTop();
        return;
      }
    }

    // Previous School conditional compulsory validations
    const prevSchoolVal = (formData.previousSchool || "").trim();
    const isPlayGroup = formData.gradeAppliedFor === "Play Group" || formData.gradeAppliedFor === "Playgroup";

    if (isPlayGroup) {
      if (!prevSchoolVal) {
        setStatus({
          type: "error",
          message: "Previous School is required. For Play Group, please write 'N/A' or specify a preschool name.",
        });
        setIsSubmitting(false);
        scrollToTop();
        return;
      }
    } else {
      if (!prevSchoolVal) {
        setStatus({
          type: "error",
          message: `Previous School is compulsory for grade "${formData.gradeAppliedFor}". Please enter your child's previous institution.`,
        });
        setIsSubmitting(false);
        scrollToTop();
        return;
      }
      const checkLower = prevSchoolVal.toLowerCase();
      if (["n/a", "na", "none", "not applicable", "nil", "no", "no previous", "vacant", "blank", "nan"].includes(checkLower)) {
        setStatus({
          type: "error",
          message: `Previous School name must be a real institution for grade "${formData.gradeAppliedFor}". Placeholder '${prevSchoolVal}' is not accepted.`,
        });
        setIsSubmitting(false);
        scrollToTop();
        return;
      }
    }

    // Prepare data for submission, ensuring tel fields have +977 prefix
    const submissionData = { ...formData };
    formFields.forEach((field) => {
      if (field.type === "tel" && submissionData[field.id]) {
        submissionData[field.id] = `+977 ${submissionData[field.id]}`;
      }
    });

    try {
      const currentBSYear = new Date().getFullYear() + 57;
      const generatedTrackingId = `SA-${currentBSYear}-${Date.now().toString().slice(-6)}`;
      await addDoc(collection(db, "admissions"), {
        ...submissionData,
        trackingId: generatedTrackingId,
        status: "Pending",
        submittedAt: serverTimestamp(),
      });

      // Dispatch EmailJS notification to Admin/Principal
      sendAdmissionEmail(submissionData, generatedTrackingId).catch(err => {
        console.warn("EmailJS auto-dispatch warning:", err);
      });

      setSubmittedValues(submissionData);
      setTrackingId(generatedTrackingId);

      setStatus({
        type: "success",
        message:
          "Admission form submitted successfully! We will contact you soon.",
      });

      // Construct beautiful detailed summary of all filled fields for WhatsApp
      let fieldSummary = "";
      formFields.forEach((field) => {
        const val = submissionData[field.id];
        if (val !== undefined && val !== null && String(val).trim() !== "") {
          fieldSummary += `*${field.label}:* ${val}\n`;
        }
      });

      const whatsappText = `*New Admission Application - Shikshantar Academy*
---------------------------------------
*Tracking ID:* ${generatedTrackingId}
${fieldSummary}---------------------------------------
Submitted via Digital Admission Portal.`;

      const encodedMessage = encodeURIComponent(whatsappText);
      const whatsappNumber = "9713688926"; // Official school real WhatsApp number
      const whatsappUrl = `https://api.whatsapp.com/send?phone=${whatsappNumber}&text=${encodedMessage}`;

      // Automatically try to open in a new tab/window
      try {
        window.open(whatsappUrl, "_blank", "noopener,noreferrer");
      } catch (err) {
        console.warn("Automated WhatsApp popup blocked:", err);
      }

      // Reset form
      const resetData: Record<string, string> = {};
      formFields.forEach((f: any) => {
        resetData[f.id] = "";
        if (f.type === "select" && f.options?.length > 0) {
          resetData[f.id] = f.options[0];
        }
      });
      setFormData(resetData);
    } catch (error) {
      console.error("Error submitting form: ", error);
      setStatus({
        type: "error",
        message:
          "Failed to submit form. Please make sure database rules allow writing to admissions collection, or try again later.",
      });
    }

    setIsSubmitting(false);
  };

  const handleChange = (
    e: React.ChangeEvent<
      HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
    >,
  ) => {
    setFormData((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleAddField = () => {
    setFormFields([
      ...formFields,
      {
        id: `field_${Date.now()}`,
        label: "New Field",
        type: "text",
        required: false,
        options: [],
      },
    ]);
  };

  const handleUpdateField = (index: number, key: string, value: any) => {
    const newFields = [...formFields];
    newFields[index] = { ...newFields[index], [key]: value };
    if (key === "label" && newFields[index].id.startsWith("field_")) {
      newFields[index].id =
        value.replace(/[^a-zA-Z0-9]/g, "").toLowerCase() ||
        `field_${Date.now()}`;
    }
    setFormFields(newFields);
  };

  const handleRemoveField = (index: number) => {
    setFormFields(formFields.filter((_, i) => i !== index));
  };

  const handleSaveConfig = async () => {
    setSavingConfig(true);
    try {
      await setDoc(doc(db, "settings", "admissionFormConfig"), {
        fields: formFields,
        isAdmissionOpen,
        admissionClosedMessage,
      });
      alert("Form layout updated successfully!");
      setIsFormConfigOpen(false);
    } catch (error) {
      console.error("Error saving form config", error);
      alert("Failed to save layout.");
    } finally {
      setSavingConfig(false);
    }
  };

  const logoUrl = logoImage;

  const labelStyles = "block text-xs font-bold text-slate-605 dark:text-slate-400 uppercase tracking-widest mb-1.5";

  const getFieldIcon = (fieldId: string) => {
    const iconClass = "w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none transition-colors group-focus-within:text-[#1B4F72] dark:group-focus-within:text-sky-400 z-10";
    if (fieldId.toLowerCase().includes("name")) {
      return <User className={iconClass} />;
    }
    if (fieldId.toLowerCase().includes("email")) {
      return <Mail className={iconClass} />;
    }
    if (fieldId.toLowerCase().includes("phone") || fieldId.toLowerCase().includes("contact") || fieldId.toLowerCase().includes("tel")) {
      return <Phone className={iconClass} />;
    }
    if (fieldId.toLowerCase().includes("address") || fieldId.toLowerCase().includes("location")) {
      return <MapPin className={iconClass} />;
    }
    if (fieldId.toLowerCase().includes("grade") || fieldId.toLowerCase().includes("class")) {
      return <GraduationCap className={iconClass} />;
    }
    if (fieldId.toLowerCase().includes("school")) {
      return <Building className={iconClass} />;
    }
    return <FileText className={iconClass} />;
  };

  if (isLoadingFields) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
      <Helmet>
        <title>Admissions | Shikshantar Academy</title>
        <meta name="description" content="Apply for admission to Shikshantar Academy. Check fee structures, requirements, and enroll online." />
        <link rel="canonical" href="https://www.shikshantaracademy.edu.np/admission" />
      </Helmet>
      
        <Loader2 className="w-8 h-8 animate-spin text-primary mb-4" />
        <p className="text-gray-500 font-medium">Loading Form Layout...</p>
      </div>
    );
  }

  return (
    <div className="relative w-full select-none">
      <AnimatePresence mode="wait">
        {showIntro ? (
          <motion.div
            key="intro"
            initial={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -40, scale: 0.95 }}
            transition={{ duration: 0.8, ease: "easeInOut" }}
            className="max-w-4xl mx-auto px-4 py-8"
          >
            <AdmissionIntro
              onComplete={() => {
                sessionStorage.setItem("admission_intro_completed", "true");
                setShowIntro(false);
              }}
            />
          </motion.div>
        ) : (
          <motion.div
            key="form"
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.85, ease: [0.16, 1, 0.3, 1] }}
            className="relative max-w-6xl mx-auto px-1 sm:px-2 py-6 select-none"
          >
            <div className="relative z-10 space-y-6">
        
        {/* Top Floating Controls */}
        <div className="flex justify-between items-center bg-slate-50 dark:bg-slate-900/60 p-3 px-4 rounded-2xl border border-slate-100 dark:border-slate-800/80 shadow-sm">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <span className="inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
              <span className="text-xs font-bold text-slate-705 dark:text-slate-350 uppercase tracking-widest leading-none font-mono">
                Academic Session 2083 B.S.
              </span>
            </div>

            {/* Replay Bus Intro Button */}
            <button
              onClick={() => {
                sessionStorage.removeItem("admission_intro_completed");
                setShowIntro(true);
              }}
              className="flex items-center gap-1.5 px-3 py-1 text-[10px] font-bold text-slate-600 dark:text-slate-300 hover:text-[#F0A500] dark:hover:text-[#F0A500] hover:border-[#F0A500]/50 transition-all border border-slate-200 dark:border-slate-800 rounded-full bg-white dark:bg-slate-950 shadow-2xs cursor-pointer active:scale-95 group"
            >
              <RefreshCw className="w-3 h-3 text-slate-400 group-hover:rotate-180 transition-transform duration-500" /> Replay Bus Intro
            </button>
          </div>
          {isAdmin && (
            <button
              onClick={() => setIsFormConfigOpen(true)}
              className="bg-white hover:bg-slate-50 text-slate-800 border border-slate-200 px-3 py-1.5 rounded-xl flex items-center gap-1.5 text-xs font-bold transition-all shadow-sm active:scale-[0.98]"
            >
              <Settings className="w-3.5 h-3.5 text-slate-500" /> Form Settings
            </button>
          )}
        </div>

        {/* 12-Column Responsive Portal Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          
          {/* Side Panel Column: Column 1-4 */}
          <div className="lg:col-span-4 flex flex-col gap-6">
            
            {/* Info Card */}
            <div className="w-full bg-gradient-to-br from-[#1B4F72] to-[#123851] text-white rounded-3xl p-6 shadow-xl relative overflow-hidden flex flex-col gap-6">
            
            <div className="absolute top-0 right-0 w-32 h-32 bg-white/5 rounded-full blur-2xl -mr-10 -mt-10 pointer-events-none" />

            {/* School Profile brand */}
            <div className="flex items-center gap-3 border-b border-white/10 pb-4">
              <img
                src={logoUrl}
                alt="Shikshantar Academy Logo"
                className="w-12 h-12 object-contain rounded-full bg-white p-0.5 border border-white/20 shadow-sm"
              />
              <div>
                <h1 className="text-base font-black tracking-wide uppercase leading-tight font-sans text-white">
                  Shikshantar
                </h1>
                <p className="text-[10px] text-white/60 font-mono tracking-widest font-semibold">
                  ACADEMY
                </p>
              </div>
            </div>

            {/* Quick Pitch */}
            <div className="space-y-1.5">
              <h2 className="text-sm font-bold text-[#F0A500] uppercase tracking-wider">
                Digital Admission Portal
              </h2>
              <p className="text-xs text-slate-200/90 leading-relaxed">
                Experience high-fidelity school management and creative Nepalese pedagogy. Registered entries are directly processed for classroom seat-allotments.
              </p>
            </div>

            {/* Application Walkthrough Tracker representation */}
            <div className="space-y-3.5">
              <h3 className="text-[11px] font-bold uppercase tracking-wider text-slate-300">
                Application Intake Steps
              </h3>

              <div className="flex gap-2.5">
                <span className="w-5 h-5 rounded-full bg-[#F0A500] text-slate-950 font-black text-[10px] flex items-center justify-center shrink-0">
                  1
                </span>
                <div>
                  <p className="text-[11px] font-bold text-slate-100">Portal Register</p>
                  <p className="text-[10px] text-slate-300">Submit secure candidate attributes today.</p>
                </div>
              </div>

              <div className="flex gap-2.5">
                <span className="w-5 h-5 rounded-full bg-white/10 text-white/50 border border-white/10 font-bold text-[10px] flex items-center justify-center shrink-0">
                  2
                </span>
                <div>
                  <p className="text-[11px] font-bold text-slate-300">Credential Review</p>
                  <p className="text-[10px] text-white/55">Our registrar screens the records within 48h.</p>
                </div>
              </div>

              <div className="flex gap-2.5">
                <span className="w-5 h-5 rounded-full bg-white/10 text-white/50 border border-white/10 font-bold text-[10px] flex items-center justify-center shrink-0">
                  3
                </span>
                <div>
                  <p className="text-[11px] font-bold text-slate-303">Interactive Meet</p>
                  <p className="text-[10px] text-white/55">Visit Bastipur-5 for classroom integration.</p>
                </div>
              </div>
            </div>

            {/* Document Check list */}
            <div className="bg-white/5 border border-white/10 rounded-2xl p-4 space-y-2">
              <h4 className="text-[10px] font-bold uppercase tracking-wider text-[#F0A500] flex items-center gap-1">
                <FileCheck className="w-3.5 h-3.5" /> Admission Files To Prepare
              </h4>
              <ul className="space-y-1 text-[10.5px] text-slate-200">
                <li className="flex items-center gap-1.5">
                  <span className="text-emerald-400">✔</span> 2x Child Passport size photograph
                </li>
                <li className="flex items-center gap-1.5">
                  <span className="text-emerald-400">✔</span> Authentic Birth Register (Janma Darta)
                </li>
                <li className="flex items-center gap-1.5">
                  <span className="text-emerald-400">✔</span> Transfer details from previous school
                </li>
              </ul>
            </div>

            {/* Contact Support details info card block */}
            <div className="border-t border-white/10 pt-4 space-y-1.5 text-xs text-slate-300">
              <p className="text-[10px] uppercase font-bold tracking-widest text-white/40">SUPPORT DESK</p>
              <p className="font-bold text-slate-100 flex items-center gap-1.5 leading-none">
                <Phone className="w-3 h-3 text-[#F0A500]" /> +977 9709867048, +977 9807790805
              </p>
              <p className="text-[11px] flex items-center gap-1.5 font-medium text-slate-350">
                <MapPin className="w-3 h-3 text-[#F0A500]" /> Karjanha-05, Bastipur, Siraha
              </p>
            </div>

          </div>

        </div>

          {/* Form Content / Success panel: Column 5-12 */}
          <div className="lg:col-span-8 relative rounded-3xl group transition-all duration-300">
            {/* Outer Glow Bloom aura */}
            <div className="absolute inset-2 bg-gradient-to-r from-[#0a3d62] via-[#0284c7] to-[#F0A500] opacity-0 group-hover:opacity-30 blur-2xl transition-all duration-500 rounded-3xl -z-10 group-hover:scale-102 pointer-events-none" />

            {/* Boundary box with rotating gradient for lightning border effect */}
            <div className="relative w-full h-full rounded-3xl overflow-hidden p-[2.5px] bg-gray-150 dark:bg-slate-800 transition-colors duration-300 group-hover:bg-transparent flex flex-col shadow-xl">
              {/* Spinning lightning border */}
              <div className="absolute inset-[-180%] bg-[conic-gradient(from_0deg,#0a3d62,#0284c7,#F0A500,#fbbf24,#0ea5e9,#0a3d62)] animate-[spin_4s_linear_infinite] opacity-25 group-hover:opacity-100 transition-opacity duration-300 z-0 pointer-events-none" />

              {/* Inner masked content card */}
              <div className="relative w-full h-full bg-white dark:bg-slate-900 rounded-[22px] p-6 md:p-8 flex flex-col z-10 overflow-hidden flex-1 min-h-[455px]">
                
                {/* Background Watermark decoration */}
                <div
                  className="absolute inset-0 z-0 opacity-[0.035] dark:opacity-[0.015] pointer-events-none select-none"
                  style={{
                    backgroundImage: `url('${logoUrl}')`,
                    backgroundPosition: "center",
                    backgroundSize: "40%",
                    backgroundRepeat: "no-repeat",
                  }}
                />
            
            {status.type === "success" ? (
              <motion.div
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                className="text-center py-6 space-y-6 relative z-10"
              >
                {/* Green Animated Success Tick */}
                <div className="w-16 h-16 rounded-full bg-emerald-50 dark:bg-emerald-950/20 text-emerald-500 mx-auto flex items-center justify-center shadow-inner">
                  <CheckCircle2 className="w-8 h-8 animate-pulse text-emerald-500" />
                </div>

                <div className="space-y-2">
                  <h2 className="text-2xl font-bold text-slate-800 dark:text-white">
                    Application Registered Successfully!
                  </h2>
                  <p className="text-sm text-slate-500 max-w-md mx-auto">
                    The registration file has been generated and queued for academic evaluation. Below is your official receipt.
                  </p>
                </div>

                {/* Digital Receipt Card layout representation */}
                <div className="bg-slate-50/50 dark:bg-slate-950/20 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 text-left max-w-md mx-auto relative overflow-hidden shadow-sm">
                  <div className="absolute top-0 right-0 bg-[#F0A500] text-slate-950 text-[9px] font-black uppercase tracking-widest px-2.5 py-1 rounded-bl-xl leading-none">
                    Digital Carbon COPY
                  </div>

                  <div className="flex items-center gap-2 border-b border-slate-100 dark:border-slate-800 pb-3 mb-4">
                    <img src={logoUrl} className="w-7 h-7 rounded-full bg-white border" />
                    <div>
                      <p className="text-[11px] font-bold text-slate-800 dark:text-slate-200 uppercase leading-none">
                        Shikshantar Academy
                      </p>
                      <p className="text-[9px] text-slate-400 font-mono tracking-wider mt-0.5">
                        REGISTRATION RECEIPT
                      </p>
                    </div>
                  </div>

                  <div className="space-y-3 font-sans text-xs text-slate-700 dark:text-slate-355">
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <p className="text-[9px] text-slate-400 uppercase font-semibold">CANDIDATE NAME</p>
                        <p className="font-bold text-slate-800 dark:text-slate-100 mt-0.5">
                          {submittedValues.studentName || "N/A"}
                        </p>
                      </div>
                      <div>
                        <p className="text-[9px] text-slate-400 uppercase font-semibold">APPLIED GRADE</p>
                        <p className="font-bold text-slate-800 dark:text-slate-100 mt-0.5">
                          {submittedValues.gradeAppliedFor || "N/A"}
                        </p>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-100 dark:border-slate-800/80">
                      <div>
                        <p className="text-[9px] text-slate-400 uppercase font-semibold">GUARDIAN CONTACT</p>
                        <p className="font-bold text-slate-800 dark:text-slate-100 mt-0.5">
                          {submittedValues.contactNumber || "N/A"}
                        </p>
                      </div>
                      <div>
                        <p className="text-[9px] text-slate-400 uppercase font-semibold">TRACKING REF ID</p>
                        <p className="font-mono font-bold text-[#1B4F72] dark:text-sky-400 mt-0.5 select-all">
                          {trackingId}
                        </p>
                      </div>
                    </div>
                  </div>

                  <p className="mt-4 pt-3 border-t border-dashed border-slate-200 dark:border-slate-800 text-[10px] text-slate-450 leading-relaxed">
                    💡 Please take a quick screenshot of this code. Our admin office will review school capabilities and phone you as soon as seats are secured.
                  </p>
                </div>

                {/* Send via WhatsApp Call-To-Action */}
                <div className="max-w-md mx-auto p-5 bg-emerald-50/40 dark:bg-emerald-950/10 border border-emerald-200/50 dark:border-emerald-900/30 rounded-2xl flex flex-col items-center text-center gap-2.5">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
                    <p className="text-[10px] font-bold text-emerald-800 dark:text-emerald-400 uppercase tracking-wider">
                      Real School WhatsApp Contact
                    </p>
                  </div>
                  <p className="text-[11.5px] text-slate-600 dark:text-slate-350 leading-normal max-w-sm">
                    This is our real WhatsApp number (<span className="font-extrabold text-emerald-600 dark:text-emerald-400">9713688926</span>) to chat with us directly. Please tap the button below to instantly submit all your filled admission details on WhatsApp.
                  </p>
                  <a
                    href={`https://api.whatsapp.com/send?phone=9713688926&text=${encodeURIComponent(
                      `*New Admission Application - Shikshantar Academy*\n---------------------------------------\n*Tracking ID:* ${trackingId}\n` +
                      formFields
                        .map((field) => {
                          const val = submittedValues[field.id];
                          return val ? `*${field.label}:* ${val}` : null;
                        })
                        .filter(Boolean)
                        .join("\n") +
                      `\n---------------------------------------\nSubmitted via Digital Admission Portal.`
                    )}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-full sm:w-auto px-5 py-2.5 bg-[#25D366] hover:bg-[#20ba59] active:bg-[#1ca34e] text-white rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 shadow-md hover:scale-[1.02] active:scale-[0.98] cursor-pointer"
                  >
                    <Send className="w-3.5 h-3.5 text-white" />
                    Chat with Us & Send Details
                  </a>
                </div>

                {/* Admin Dashboard Management Panel Card - ONLY visible if logged-in user is an administrator */}
                {isAdmin && (
                  <div className="max-w-md mx-auto p-5 bg-blue-50/45 dark:bg-slate-900/40 border border-blue-200/50 dark:border-slate-800 rounded-2xl flex flex-col items-center text-center gap-2.5">
                    <div className="flex items-center gap-2">
                      <Building className="w-4 h-4 text-[#1B4F72] dark:text-sky-400 shrink-0" />
                      <p className="text-[10px] font-bold text-blue-800 dark:text-sky-400 uppercase tracking-wider">
                        Admissions Administration Panel
                      </p>
                    </div>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-normal max-w-sm">
                      This form application is now synchronized in the database. Open the Admin Admissions Panel to manage, review, schedule interviews, or update its status.
                    </p>
                    <button
                      type="button"
                      onClick={() => navigate("/admin-admissions")}
                      className="w-full sm:w-auto px-5 py-2.5 bg-[#1B4F72] hover:bg-[#123851] text-white rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 shadow-md hover:scale-[1.02] active:scale-[0.98] cursor-pointer"
                    >
                      <Settings className="w-3.5 h-3.5 text-white" />
                      Manage in Admin Dashboard
                    </button>
                  </div>
                )}

                {/* Print button & Reset control */}
                <div className="flex gap-3 justify-center">
                  {isAdmin && (
                    <button
                      type="button"
                      onClick={() => window.print()}
                      className="px-4 py-2 border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-xl text-xs font-bold font-sans text-slate-700 dark:text-slate-100 flex items-center gap-1.5 shadow-sm active:scale-[0.98] transition-all"
                    >
                      <FileText className="w-3.5 h-3.5" /> Print Copy
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      setStatus({ type: null, message: "" });
                      setTrackingId("");
                      setSubmittedValues({});
                    }}
                    className="px-4 py-2 bg-[#1B4F72] hover:bg-[#123851] rounded-xl text-xs font-bold font-sans text-white flex items-center gap-1.5 shadow-sm active:scale-[0.98] transition-all"
                  >
                    <Sparkles className="w-3.5 h-3.5 text-amber-300" /> Apply Again
                  </button>
                </div>
              </motion.div>
            ) : (
              <div className="space-y-6 relative z-10">
                {/* Invisible Form Scroll Top Target */}
                <div ref={formTopRef} className="scroll-mt-24" />
                
                {/* Form Heading description */}
                <div>
                  <h2 className="text-xl md:text-2xl font-black text-slate-800 dark:text-white leading-none font-sans uppercase tracking-tight">
                    Online Admission Form
                  </h2>
                  <p className="text-xs text-slate-400 mt-1.5 leading-normal font-sans">
                    Register online to accelerate physical screening. Please guarantee that contact information details are perfectly functional.
                  </p>
                </div>

                {/* Alerts block */}
                {status.type === "error" && (
                  <div className="bg-red-50 border border-red-200 text-red-800 p-3.5 rounded-xl text-xs flex items-start gap-2.5 shadow-sm">
                    <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                    <div>
                      <p className="font-bold">Check Application Fields</p>
                      <p className="text-red-700/80 mt-0.5 text-[11px]">{status.message}</p>
                    </div>
                  </div>
                )}

                {/* Closed block warning */}
                {!isAdmissionOpen && !isAdmin ? (
                  <div className="py-10 px-4 text-center bg-slate-50 dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800">
                    <AlertCircle className="w-10 h-10 text-slate-400 mx-auto mb-2" />
                    <h3 className="text-base font-bold text-slate-700 dark:text-slate-100">
                      {admissionClosedMessage}
                    </h3>
                    <p className="text-xs text-slate-450 max-w-xs mx-auto leading-relaxed mt-1">
                      Online admissions are temporarily closed. Please phone our registrars directly for seat status query or offline application.
                    </p>
                  </div>
                ) : (
                  <form onSubmit={handleSubmit} className="space-y-6">
                    
                    {/* Admin Alert closed status indicator banner */}
                    {!isAdmissionOpen && isAdmin && (
                      <div className="bg-amber-50 border border-amber-200 p-3 rounded-xl text-xs text-amber-800 flex items-start gap-2">
                        <AlertCircle className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
                        <div>
                          <strong className="font-semibold block">Admin Panel Informer:</strong> Admissions is toggled OFF for regular parents. Parents only see: <em>"{admissionClosedMessage}"</em>
                        </div>
                      </div>
                    )}

                    {/* Section 1: Academic & Info */}
                    <div className="space-y-4">
                      <div className="flex items-center gap-1.5 border-b border-slate-100 dark:border-slate-800/80 pb-1.5">
                        <span className="p-1 px-1.5 text-[10px] bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded font-bold font-mono">1</span>
                        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-450">
                          Academic Particulars
                        </h3>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {formFields
                          .filter((field) => ["studentName", "dateOfBirth", "gender", "gradeAppliedFor"].includes(field.id))
                          .map((field) => (
                            <div
                              key={field.id}
                              className={field.id === "studentName" ? "md:col-span-2" : ""}
                            >
                              <label htmlFor={field.id} className={labelStyles}>
                                {field.label} {field.required && <span className="text-red-500">*</span>}
                              </label>

                              {field.id === "dateOfBirth" ? (
                                <div className="space-y-2.5 bg-slate-50/50 dark:bg-slate-800/20 p-3.5 rounded-2xl border border-slate-200/50 dark:border-slate-800">
                                  
                                  {/* Custom DOB System Tabs Switcher */}
                                  <div className="flex p-0.5 bg-slate-100 dark:bg-slate-800 rounded-lg max-w-xs shadow-inner">
                                    <button
                                      type="button"
                                      onClick={() => setDobSystem("BS")}
                                      className={`flex-1 py-1 px-2.5 rounded-md text-[10.5px] font-bold transition-all ${
                                        dobSystem === "BS"
                                          ? "bg-white text-slate-850 shadow-sm border border-slate-200/40"
                                          : "text-slate-500 hover:text-slate-850 dark:text-slate-400 dark:hover:text-slate-200"
                                      }`}
                                    >
                                      Bikram Sambat (B.S.)
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => setDobSystem("AD")}
                                      className={`flex-1 py-1 px-2.5 rounded-md text-[10.5px] font-bold transition-all ${
                                        dobSystem === "AD"
                                          ? "bg-white text-slate-850 shadow-sm border border-slate-200/40"
                                          : "text-slate-500 hover:text-slate-850 dark:text-slate-400 dark:hover:text-slate-200"
                                      }`}
                                    >
                                      Gregorian (A.D.)
                                    </button>
                                  </div>

                                  {/* Controls aligned with Dob Toggle system */}
                                  {dobSystem === "BS" ? (
                                    <div className="grid grid-cols-3 gap-1.5">
                                      <select
                                        value={dobBSYear}
                                        id="dobBSYear"
                                        onChange={(e) => setDobBSYear(e.target.value)}
                                        onFocus={() => setFocusedField("dateOfBirth")}
                                        onBlur={() => setFocusedField(null)}
                                        required={field.required}
                                        disabled={isSubmitting}
                                        className="w-full px-2 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg text-slate-705 dark:text-slate-105 text-xs focus:outline-none focus:ring-1 focus:ring-[#1B4F72] transition-colors"
                                      >
                                        <option value="">Year</option>
                                        {Array.from({ length: 45 }, (_, i) => 2085 - i).map((yr) => (
                                          <option key={yr} value={yr}>
                                            {yr} B.S.
                                          </option>
                                        ))}
                                      </select>

                                      <select
                                        value={dobBSMonth}
                                        id="dobBSMonth"
                                        onChange={(e) => setDobBSMonth(e.target.value)}
                                        onFocus={() => setFocusedField("dateOfBirth")}
                                        onBlur={() => setFocusedField(null)}
                                        required={field.required}
                                        disabled={isSubmitting}
                                        className="w-full px-2 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg text-slate-705 dark:text-slate-105 text-xs focus:outline-none focus:ring-1 focus:ring-[#1B4F72] transition-colors"
                                      >
                                        <option value="">Month</option>
                                        {[
                                          { val: "01", name: "Baisakh" },
                                          { val: "02", name: "Jestha" },
                                          { val: "03", name: "Ashadh" },
                                          { val: "04", name: "Shrawan" },
                                          { val: "05", name: "Bhadra" },
                                          { val: "06", name: "Ashwin" },
                                          { val: "07", name: "Kartik" },
                                          { val: "08", name: "Mangsir" },
                                          { val: "09", name: "Poush" },
                                          { val: "10", name: "Magh" },
                                          { val: "11", name: "Falgun" },
                                          { val: "12", name: "Chaitra" },
                                        ].map((m) => (
                                          <option key={m.val} value={m.val}>
                                            {m.name}
                                          </option>
                                        ))}
                                      </select>

                                      <select
                                        value={dobBSDay}
                                        id="dobBSDay"
                                        onChange={(e) => setDobBSDay(e.target.value)}
                                        onFocus={() => setFocusedField("dateOfBirth")}
                                        onBlur={() => setFocusedField(null)}
                                        required={field.required}
                                        disabled={isSubmitting}
                                        className="w-full px-2 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg text-slate-705 dark:text-slate-105 text-xs focus:outline-none focus:ring-1 focus:ring-[#1B4F72] transition-colors"
                                      >
                                        <option value="">Day</option>
                                        {Array.from({ length: 32 }, (_, i) => {
                                          const dayNum = String(i + 1).padStart(2, "0");
                                          return (
                                            <option key={dayNum} value={dayNum}>
                                              {dayNum}
                                            </option>
                                          );
                                        })}
                                      </select>
                                    </div>
                                  ) : (
                                    <div className="relative flex items-center">
                                      <Clock className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 pointer-events-none" />
                                      <input
                                        type="date"
                                        id={field.id}
                                        name={field.id}
                                        value={dobADDate}
                                        onChange={(e) => setDobADDate(e.target.value)}
                                        onFocus={() => setFocusedField("dateOfBirth")}
                                        onBlur={() => setFocusedField(null)}
                                        required={field.required}
                                        disabled={isSubmitting}
                                        className="w-full pl-8 pr-3 py-2 bg-white dark:bg-slate-900 border border-[#d1d5db] dark:border-slate-800 rounded-lg text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-[#1B4F72] text-xs transition-colors"
                                      />
                                    </div>
                                  )}

                                  {/* Result preview line */}
                                  <p className="text-[10px] text-slate-400 leading-none">
                                    Selected DOB Mapped: <span className="font-bold text-[#1B4F72] dark:text-sky-400 font-mono">{formData[field.id] || "No date defined"}</span>
                                  </p>

                                </div>
                              ) : field.type === "select" ? (
                                <div className="relative group">
                                  {getFieldIcon(field.id)}
                                  <select
                                    id={field.id}
                                    name={field.id}
                                    value={formData[field.id] || ""}
                                    onChange={handleChange}
                                    onFocus={() => setFocusedField(field.id)}
                                    onBlur={() => setFocusedField(null)}
                                    required={field.required}
                                    disabled={isSubmitting}
                                    className="w-full pl-9 pr-8 py-2 bg-slate-50/50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-[#1B4F72]/15 focus:border-[#1B4F72] transition-all text-xs appearance-none"
                                  >
                                    {(field.options || []).map((opt: string) => (
                                      <option key={opt} value={opt}>
                                        {opt}
                                      </option>
                                    ))}
                                  </select>
                                  <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-slate-450 opacity-80">
                                    <ChevronRight className="w-3.5 h-3.5 rotate-90" />
                                  </div>
                                </div>
                              ) : (
                                <div className="relative group">
                                  {getFieldIcon(field.id)}
                                  <input
                                    type={field.type}
                                    id={field.id}
                                    name={field.id}
                                    value={formData[field.id] || ""}
                                    onChange={handleChange}
                                    onFocus={() => setFocusedField(field.id)}
                                    onBlur={() => setFocusedField(null)}
                                    required={field.required}
                                    disabled={isSubmitting}
                                    className="w-full pl-9 pr-4 py-2 bg-slate-50/50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-slate-800 dark:text-slate-105 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#1B4F72]/15 focus:border-[#1B4F72] transition-all text-xs"
                                    placeholder={`Enter student's ${field.label.toLowerCase()}`}
                                  />
                                </div>
                              )}
                            </div>
                          ))}
                      </div>
                    </div>

                    {/* Section 2: Contact & Family */}
                    <div className="space-y-4 pt-2">
                      <div className="flex items-center gap-1.5 border-b border-slate-100 dark:border-slate-800/80 pb-1.5">
                        <span className="p-1 px-1.5 text-[10px] bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded font-bold font-mono">2</span>
                        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-450">
                          Guardian Information & Residence
                        </h3>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {formFields
                          .filter((field) => !["studentName", "dateOfBirth", "gender", "gradeAppliedFor"].includes(field.id))
                          .map((field) => {
                            const isPlayGroup = formData.gradeAppliedFor === "Play Group" || formData.gradeAppliedFor === "Playgroup";
                            return (
                              <div
                                key={field.id}
                                className={field.type === "textarea" ? "md:col-span-2" : ""}
                              >
                                <label htmlFor={field.id} className={labelStyles}>
                                  {field.label} {(field.required || field.id === "previousSchool") && <span className="text-red-500">*</span>}
                                </label>

                                {field.id === "previousSchool" ? (
                                  <motion.div 
                                    layout
                                    className="space-y-2.5 bg-slate-50/50 dark:bg-slate-900/10 p-3 rounded-2xl border border-dashed border-slate-205 dark:border-slate-800 transition-all"
                                    initial={{ opacity: 0, y: 5 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ duration: 0.3 }}
                                  >
                                    <div className="relative group">
                                      {getFieldIcon(field.id)}
                                      <input
                                        type="text"
                                        id={field.id}
                                        name={field.id}
                                        value={formData[field.id] || ""}
                                        onChange={handleChange}
                                        onFocus={() => setFocusedField(field.id)}
                                        onBlur={() => setFocusedField(null)}
                                        required={true}
                                        disabled={isSubmitting}
                                        className="w-full pl-9 pr-4 py-2 bg-slate-50/30 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-slate-850 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#1B4F72]/15 focus:border-[#1B4F72] transition-all text-xs"
                                        placeholder={
                                          isPlayGroup
                                            ? "Type 'N/A' or enter your previous preschool name..."
                                            : "Enter details of your child's previous school..."
                                        }
                                      />
                                    </div>
                                    
                                    <AnimatePresence mode="wait">
                                      {isPlayGroup ? (
                                        <motion.div
                                          key="pg-hint"
                                          initial={{ opacity: 0, height: 0 }}
                                          animate={{ opacity: 1, height: "auto" }}
                                          exit={{ opacity: 0, height: 0 }}
                                          className="text-[11px] bg-amber-50/50 dark:bg-amber-955/15 text-amber-800 dark:text-amber-400 p-2.5 rounded-xl border border-amber-100/50 dark:border-amber-900/30 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 leading-normal"
                                        >
                                          <div className="flex items-center gap-1.5 font-semibold text-[10.5px]">
                                            <span>👶</span>
                                            <span>Play Group: Click quick N/A if child hasn't attended preschool.</span>
                                          </div>
                                          <button
                                            type="button"
                                            onClick={() => setFormData(prev => ({ ...prev, previousSchool: "N/A" }))}
                                            className="shrink-0 px-2.5 py-1 text-[10.5px] font-black bg-white dark:bg-amber-950/40 text-amber-800 dark:text-amber-300 hover:bg-amber-50 dark:hover:bg-amber-900/30 rounded-lg transition-all border border-amber-200 dark:border-amber-900/40 active:scale-95 flex items-center justify-center gap-1 cursor-pointer shadow-sm"
                                          >
                                            ✨ Auto-fill N/A
                                          </button>
                                        </motion.div>
                                      ) : (
                                        <motion.div
                                          key="other-hint"
                                          initial={{ opacity: 0, height: 0 }}
                                          animate={{ opacity: 1, height: "auto" }}
                                          exit={{ opacity: 0, height: 0 }}
                                          className="text-[10.5px] bg-sky-50/30 dark:bg-sky-950/10 text-[#1B4F72] dark:text-sky-400 p-2.5 rounded-xl border border-sky-100/50 dark:border-sky-900/20 font-semibold flex items-center gap-1.5 leading-normal"
                                        >
                                          <span className="text-sm">🏫</span>
                                          <span>Previous School is <strong>required</strong> for admission to {formData.gradeAppliedFor}.</span>
                                        </motion.div>
                                      )}
                                    </AnimatePresence>
                                  </motion.div>
                                ) : field.type === "textarea" ? (
                                <div className="relative group">
                                  <MapPin className="w-4 h-4 text-slate-400 absolute left-3 top-2.5 pointer-events-none group-focus-within:text-[#1B4F72]" />
                                  <textarea
                                    id={field.id}
                                    name={field.id}
                                    value={formData[field.id] || ""}
                                    onChange={handleChange}
                                    onFocus={() => setFocusedField(field.id)}
                                    onBlur={() => setFocusedField(null)}
                                    required={field.required}
                                    className="w-full pl-9 pr-4 py-2 bg-slate-50/50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-slate-805 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#1B4F72]/15 focus:border-[#1B4F72] transition-all text-xs"
                                    rows={2}
                                    placeholder={`Provide details of ${field.label.toLowerCase()}`}
                                    disabled={isSubmitting}
                                  />
                                </div>
                              ) : field.type === "tel" ? (
                                <div className="flex group rounded-xl overflow-hidden">
                                  <span className="inline-flex items-center px-3 border border-r-0 border-slate-200 dark:border-slate-805 bg-slate-100 dark:bg-slate-850 text-slate-550 text-xs font-bold font-mono">
                                    +977
                                  </span>
                                  <div className="relative flex-1 group">
                                    <Phone className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none group-focus-within:text-[#1B4F72] z-10" />
                                    <input
                                      type="tel"
                                      id={field.id}
                                      name={field.id}
                                      value={formData[field.id] || ""}
                                      onChange={(e) => {
                                        const val = e.target.value.replace(/\D/g, "").slice(0, 10);
                                        setFormData((prev) => ({ ...prev, [field.id]: val }));
                                      }}
                                      onFocus={() => setFocusedField(field.id)}
                                      onBlur={() => setFocusedField(null)}
                                      required={field.required}
                                      disabled={isSubmitting}
                                      maxLength={10}
                                      className="w-full pl-9 pr-4 py-2 bg-slate-50/50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-r-xl text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-[#1B4F72]/15 focus:border-[#1B4F72] transition-all text-xs font-mono"
                                      placeholder="10-digit number"
                                    />
                                  </div>
                                </div>
                              ) : field.type === "select" ? (
                                <div className="relative group">
                                  {getFieldIcon(field.id)}
                                  <select
                                    id={field.id}
                                    name={field.id}
                                    value={formData[field.id] || ""}
                                    onChange={handleChange}
                                    onFocus={() => setFocusedField(field.id)}
                                    onBlur={() => setFocusedField(null)}
                                    required={field.required}
                                    disabled={isSubmitting}
                                    className="w-full pl-9 pr-8 py-2 bg-slate-50/50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-[#1B4F72]/15 focus:border-[#1B4F72] transition-all text-xs appearance-none"
                                  >
                                    {(field.options || []).map((opt: string) => (
                                      <option key={opt} value={opt}>
                                        {opt}
                                      </option>
                                    ))}
                                  </select>
                                  <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-slate-450 opacity-80">
                                    <ChevronRight className="w-3.5 h-3.5 rotate-90" />
                                  </div>
                                </div>
                              ) : (
                                <div className="relative group">
                                  {getFieldIcon(field.id)}
                                  <input
                                    type={field.type}
                                    id={field.id}
                                    name={field.id}
                                    value={formData[field.id] || ""}
                                    onChange={handleChange}
                                    onFocus={() => setFocusedField(field.id)}
                                    onBlur={() => setFocusedField(null)}
                                    required={field.required}
                                    disabled={isSubmitting}
                                    className="w-full pl-9 pr-4 py-2 bg-slate-50/50 dark:bg-slate-900 border border-slate-200 dark:border-[#e5e7eb]/80 rounded-xl text-slate-800 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#1B4F72]/15 focus:border-[#1B4F72] transition-all text-xs"
                                    placeholder={`Enter parent's ${field.label.toLowerCase()}`}
                                  />
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* BOT PREVENTION RECAPTCHA SHIELD */}
                    {!isAdmin && (
                      <div className="space-y-4 mt-6">
                        {/* The reCAPTCHA Box */}
                        <div className="flex items-center justify-between border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/40 p-3.5 rounded-xl max-w-sm shadow-sm">
                          <div className="flex items-center gap-3">
                            {/* Checkbox */}
                            <button
                              type="button"
                              onClick={() => {
                                if (isCaptchaVerified || isCheckingRobot) return;
                                setIsCheckingRobot(true);
                                setCaptchaError("");
                                setTimeout(() => {
                                  setIsCheckingRobot(false);
                                  setShowChallenge(true);
                                }, 800);
                              }}
                              className={`w-6 h-6 border-2 rounded transition-all flex items-center justify-center relative outline-none ${
                                isCaptchaVerified
                                  ? "border-emerald-500 bg-emerald-500 text-white animate-bounce"
                                  : "border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 hover:border-slate-450 focus:ring-2 focus:ring-[#1B4F72]/10"
                              }`}
                            >
                              {isCheckingRobot && (
                                <Loader2 className="w-4 h-4 animate-spin text-[#1B4F72] dark:text-sky-400" />
                              )}
                              {isCaptchaVerified && (
                                <Check className="w-4 h-4 stroke-[3px]" />
                              )}
                            </button>
                            
                            <span className="text-xs font-bold text-slate-700 dark:text-slate-300">
                              I'm not a robot
                            </span>
                          </div>

                          <div className="flex flex-col items-end opacity-75">
                            <div className="flex items-center gap-1 text-[#1B4F72] dark:text-sky-400">
                              <Shield className="w-3.5 h-3.5 fill-current/10" />
                              <span className="text-[9px] font-black tracking-wider uppercase">reCAPTCHA</span>
                            </div>
                            <span className="text-[7px] text-slate-400 font-medium">Privacy • Terms</span>
                          </div>
                        </div>

                        {/* Interactive Puzzle Challenge Dropdown */}
                        {showChallenge && (
                          <div className="border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 p-5 rounded-2xl max-w-md shadow-lg space-y-4 animate-in fade-in slide-in-from-top-2 duration-200">
                            <div className="border-b border-slate-100 dark:border-slate-900 pb-2 flex justify-between items-center">
                              <div>
                                <h4 className="text-xs font-extrabold text-slate-800 dark:text-slate-200 uppercase tracking-wider">
                                  Verification Challenge
                                </h4>
                                <p className="text-[10px] text-slate-400 mt-0.5">
                                  Type the 5 characters shown in the graphic card below.
                                </p>
                              </div>
                              <button
                                type="button"
                                onClick={() => setShowChallenge(false)}
                                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-900 transition-colors"
                              >
                                <X className="w-4 h-4" />
                              </button>
                            </div>

                            <div className="flex flex-col gap-4">
                              <div className="flex items-center gap-2 bg-slate-50 dark:bg-slate-900/50 p-1.5 border border-slate-200 dark:border-slate-800/80 rounded-xl shadow-inner shrink-0 w-fit">
                                <canvas
                                  ref={canvasRefCallback}
                                  width="140"
                                  height="44"
                                  onClick={() => generateNewCaptcha()}
                                  className="rounded-lg bg-white dark:bg-slate-950 shadow-sm cursor-pointer hover:opacity-85 active:scale-95 transition-all"
                                  title="Click image to reload code"
                                />
                                <button
                                  type="button"
                                  onClick={() => generateNewCaptcha()}
                                  className="p-2.5 hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-500 hover:text-slate-700 dark:hover:text-slate-200 rounded-lg transition-colors shrink-0"
                                  title="Click to draw a different code"
                                >
                                  <RefreshCw className="w-3.5 h-3.5" />
                                </button>
                              </div>

                              <div className="w-full space-y-1.5">
                                <label className="text-[9px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest block ml-1">
                                  Enter code here
                                </label>
                                <div className="flex gap-2">
                                  <input
                                    type="text"
                                    value={captchaInput}
                                    onChange={(e) => {
                                      setCaptchaInput(e.target.value);
                                      if (captchaError) setCaptchaError("");
                                    }}
                                    onKeyDown={(e) => {
                                      if (e.key === "Enter") {
                                        e.preventDefault();
                                        handleVerifyCaptcha();
                                      }
                                    }}
                                    placeholder="5-char code"
                                    className="flex-1 min-w-0 px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-slate-800 dark:text-slate-100 placeholder-slate-400 text-xs focus:ring-2 focus:ring-[#1B4F72]/15 focus:border-[#1B4F72] outline-none transition-all font-mono tracking-widest font-black uppercase text-center"
                                  />
                                  <button
                                    type="button"
                                    onClick={handleVerifyCaptcha}
                                    className="px-5 py-2 bg-[#1B4F72] hover:bg-[#123851] text-white font-bold text-xs rounded-xl shadow transition-all active:scale-95 shrink-0"
                                  >
                                    Verify
                                  </button>
                                </div>
                              </div>
                            </div>

                            {captchaError && (
                              <div className="flex items-center gap-2 p-2.5 bg-rose-50/85 dark:bg-rose-950/20 border border-rose-100 dark:border-rose-900/40 rounded-xl text-rose-700 dark:text-rose-400 text-[11px] font-bold animate-in fade-in duration-250 shadow-sm">
                                <AlertCircle className="w-3.5 h-3.5 text-rose-500 shrink-0" />
                                <span>{captchaError}</span>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Bottom buttons actions footer */}
                    <div className="border-t border-slate-100 dark:border-slate-800 pt-5 mt-2">

                      {!isAdmin && (
                        <div className={`flex items-center w-full gap-4 ${hasStartedFilling ? "justify-between" : "justify-end"}`}>
                          {/* Cancel Button on the far left */}
                          {hasStartedFilling && (
                            <button
                              type="button"
                              onClick={handleCancel}
                              className="px-5 py-2.5 rounded-xl text-xs font-bold transition-all border border-slate-200 dark:border-slate-800 bg-white hover:bg-slate-50 dark:bg-slate-950 dark:hover:bg-slate-900 text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 active:scale-[0.98] cursor-pointer inline-flex items-center gap-1.5 shadow-sm animate-in fade-in duration-200"
                              title="Cancel and clear all form inputs"
                            >
                              <X className="w-3.5 h-3.5" />
                              Cancel
                            </button>
                          )}

                          {/* Submit Button on the right */}
                          <button
                            type="submit"
                            disabled={isSubmitting}
                            className="px-6 py-2.5 rounded-xl text-xs font-bold transition-all bg-[#1B4F72] hover:bg-[#123851] text-white active:scale-[0.98] cursor-pointer shadow-md flex items-center gap-1.5"
                          >
                            {isSubmitting ? (
                              <>
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                Submitting...
                              </>
                            ) : (
                              <>
                                Submit Form
                                <Send className="w-3.5 h-3.5" />
                              </>
                            )}
                          </button>
                        </div>
                      )}
                    </div>

                  </form>
                )}

              </div>
            )}
              </div>
            </div>
          </div>

        </div>

      </div>

        {/* Form Configuration Modal (Admin Only) */}
        {isAdmin && isFormConfigOpen && createPortal(
          <div className="fixed inset-0 bg-black/60 z-[9999] flex items-center justify-center p-4 text-left">
            <div className="bg-white rounded-xl shadow-xl w-full max-w-3xl max-h-[90vh] flex flex-col relative z-[10000]">
              <div className="p-5 border-b border-gray-100 flex justify-between items-center text-primary rounded-t-xl">
                <div>
                  <h2 className="text-lg font-bold text-gray-800">
                    Configure Admission Form
                  </h2>
                  <p className="text-xs text-gray-500">
                    Customize the fields parents will see on this application.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setIsFormConfigOpen(false)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>

              <div className="p-5 overflow-y-auto flex-1 text-primary">
                <div className="mb-6 bg-gray-50 p-4 rounded-xl border border-gray-200 shadow-sm flex flex-col gap-4">
                  <h3 className="text-sm font-bold text-gray-700 border-b border-gray-200 pb-2">
                    Admission Status Settings
                  </h3>
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-bold text-sm text-gray-800">
                        Accept Admissions
                      </div>
                      <div className="text-xs text-gray-500">
                        Enable or disable new admission applications.
                      </div>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        className="sr-only peer"
                        checked={isAdmissionOpen}
                        onChange={(e) => setIsAdmissionOpen(e.target.checked)}
                      />
                      <div className="w-11 h-6 bg-gray-300 rounded-full peer peer-focus:ring-2 peer-focus:ring-primary peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"></div>
                    </label>
                  </div>

                  {!isAdmissionOpen && (
                    <div className="mt-2">
                      <label className="text-xs font-bold text-gray-500 uppercase block mb-1">
                        Admission Closed Message
                      </label>
                      <input
                        type="text"
                        value={admissionClosedMessage}
                        onChange={(e) =>
                          setAdmissionClosedMessage(e.target.value)
                        }
                        className="w-full text-sm border-b border-gray-300 py-1 outline-none focus:border-blue-500 bg-transparent"
                        placeholder="e.g. Admission Closed for this Academic Year"
                      />
                    </div>
                  )}
                </div>

                <div className="space-y-4">
                  {formFields.map((field, idx) => (
                    <div
                      key={idx}
                      className="bg-white p-4 rounded-lg border border-gray-200 shadow-sm flex flex-wrap gap-4 items-start relative group"
                    >
                      <button
                        type="button"
                        onClick={() => handleRemoveField(idx)}
                        className="absolute -top-2 -right-2 bg-red-100 text-red-600 rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity z-10"
                      >
                        <X className="w-3 h-3" />
                      </button>

                      <div className="flex-1 min-w-[200px]">
                        <label className="text-xs font-bold text-gray-500 uppercase block mb-1">
                          Field Label
                        </label>
                        <input
                          type="text"
                          value={field.label}
                          onChange={(e) =>
                            handleUpdateField(idx, "label", e.target.value)
                          }
                          className="w-full text-sm border-b border-gray-300 py-1 outline-none focus:border-blue-500 font-bold"
                        />
                      </div>

                      <div className="w-32 shrink-0">
                        <label className="text-xs font-bold text-gray-500 uppercase block mb-1">
                          Input Type
                        </label>
                        <select
                          value={field.type}
                          onChange={(e) =>
                            handleUpdateField(idx, "type", e.target.value)
                          }
                          className="w-full text-sm border-b border-gray-300 py-1 outline-none focus:border-blue-500 bg-transparent"
                        >
                          <option value="text">Text (Short)</option>
                          <option value="textarea">Text (Long)</option>
                          <option value="tel">Phone (+977)</option>
                          <option value="email">Email</option>
                          <option value="date">Date</option>
                          <option value="select">Dropdown</option>
                        </select>
                      </div>

                      <div className="flex items-center gap-2 mt-4 shrink-0">
                        <input
                          type="checkbox"
                          id={`req-${idx}`}
                          checked={field.required}
                          onChange={(e) =>
                            handleUpdateField(idx, "required", e.target.checked)
                          }
                          className="rounded text-blue-600 focus:ring-blue-500"
                        />
                        <label
                          htmlFor={`req-${idx}`}
                          className="text-sm font-bold text-gray-700"
                        >
                          Required
                        </label>
                      </div>

                      {field.type === "select" && (
                        <div className="w-full mt-2 border-primary text-primary p-2 rounded border border-gray-100">
                          <label className="text-xs font-bold text-gray-500 uppercase block mb-1">
                            Dropdown Options (Comma separated)
                          </label>
                          <input
                            type="text"
                            value={(field.options || []).join(", ")}
                            onChange={(e) =>
                              handleUpdateField(
                                idx,
                                "options",
                                e.target.value
                                  .split(",")
                                  .map((s: string) => s.trim())
                                  .filter((s: string) => s),
                              )
                            }
                            className="w-full text-sm border-b border-gray-300 py-1 outline-none focus:border-blue-500 bg-transparent"
                            placeholder="Option 1, Option 2, Option 3..."
                          />
                        </div>
                      )}
                    </div>
                  ))}
                </div>

                <button
                  type="button"
                  onClick={handleAddField}
                  className="mt-6 w-full border-2 border-dashed border-gray-300 text-gray-500 font-bold py-3 rounded-lg flex items-center justify-center gap-2 hover:bg-gray-100 hover:border-gray-400 transition-colors"
                >
                  <Plus className="w-4 h-4" /> Add New Form Field
                </button>
              </div>

              <div className="p-4 border-t border-gray-100 flex justify-end gap-3 bg-white rounded-b-xl">
                <button
                  type="button"
                  onClick={() => setIsFormConfigOpen(false)}
                  className="px-4 py-2 font-bold text-gray-600 hover:bg-gray-100 rounded"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={savingConfig}
                  onClick={handleSaveConfig}
                  className="bg-primary text-white px-5 py-2 font-bold rounded flex items-center gap-2 hover:bg-primary-dark disabled:opacity-50"
                >
                  <Save className="w-4 h-4" />{" "}
                  {savingConfig ? "Saving..." : "Save Configuration"}
                </button>
              </div>
            </div>
          </div>
        , document.body)}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
