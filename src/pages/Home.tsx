import React, { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { formatBSDate, getBSYearMonthDate, formatBSDateYMD } from "../lib/nepaliDate";
import {
  ArrowRight,
  BookOpen,
  Users,
  Trophy,
  MapPin,
  Edit2,
  Save,
  X,
  Calendar,
  Megaphone,
  ChevronRight,
  ChevronLeft,
  Sparkles,
  Calculator,
  PieChart as PieChartIcon,
  Bell,
  Download,
  CheckCircle2,
  AlertCircle,
  FileText,
  Upload,
  PlusCircle,
  CreditCard,
  ChevronUp,
  UserCheck,
  Search,
  HelpCircle,
  UserPlus,
  ShieldCheck,
  Image,
  Phone,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Mail,
  User,
  GraduationCap,
  Play,
  Pause,
  Volume2,
  VolumeX,
  SmilePlus,
  Maximize2,
} from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { FeeEstimator } from "../components/FeeEstimator";
import SpotlightCard from "../components/SpotlightCard";
import {
  doc,
  getDoc,
  setDoc,
  onSnapshot,
  collection,
  query,
  orderBy,
  where,
  getDocs,
  writeBatch,
} from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";
import { db, auth, handleFirestoreError, OperationType } from "../firebase";
import {
  motion,
  useMotionValue,
  animate,
  useInView,
  useTransform,
  AnimatePresence,
} from "motion/react";
import { Helmet } from "react-helmet-async";
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
  CartesianGrid,
  YAxis,
} from "recharts";
import principalImageSrc from "../assets/images/regenerated_image_1780334392921.jpg";
import logoImageSrc from "../assets/logo.png";
const logoImage = logoImageSrc || "/logo.png";
const logoFallback = "https://i.postimg.cc/nc9G7pRB/image.png";
const fallbackImg =
  "https://ui-avatars.com/api/?name=Principal&background=0D8ABC&color=fff&size=512";
const principalImg = principalImageSrc;

const mapDummyImage = (url: string): string => {
  if (!url) return '';
  if (url.includes('picsum.photos')) {
    if (url.includes('/seed/t1/')) return 'https://images.unsplash.com/photo-1544717305-2782549b5136?q=80&w=400&h=500&auto=format&fit=crop';
    if (url.includes('/seed/t2/')) return 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?q=80&w=400&h=500&auto=format&fit=crop';
    if (url.includes('/seed/t3/')) return 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?q=80&w=400&h=500&auto=format&fit=crop';
    if (url.includes('/seed/t4/')) return 'https://images.unsplash.com/photo-1580894732444-8fecef2271ff?q=80&w=400&h=500&auto=format&fit=crop';
    if (url.includes('/seed/b82/')) return 'https://images.unsplash.com/photo-1546410531-bb4caa6b424d?q=80&w=800&h=600&auto=format&fit=crop';
    if (url.includes('/seed/b81/')) return 'https://images.unsplash.com/photo-1523050854058-8df90110c9f1?q=80&w=800&h=600&auto=format&fit=crop';
    if (url.includes('/seed/e1/')) return 'https://images.unsplash.com/photo-1461896836934-ffe607ba8211?q=80&w=800&h=600&auto=format&fit=crop';
    if (url.includes('/seed/e2/')) return 'https://images.unsplash.com/photo-1532094349884-543bc11b234d?q=80&w=800&h=600&auto=format&fit=crop';
    if (url.includes('/sports/')) return 'https://images.unsplash.com/photo-1461896836934-ffe607ba8211?q=80&w=800&h=500&auto=format&fit=crop';
    if (url.includes('/sciencefair/')) return 'https://images.unsplash.com/photo-1532094349884-543bc11b234d?q=80&w=800&h=500&auto=format&fit=crop';
    if (url.includes('/cultural/')) return 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?q=80&w=800&h=500&auto=format&fit=crop';
    return 'https://images.unsplash.com/photo-1523050854058-8df90110c9f1?q=80&w=800&h=600&auto=format&fit=crop';
  }
  return url;
};

const containerVariants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: {
      staggerChildren: 0.06
    }
  }
};

const itemVariants = {
  hidden: { opacity: 0, y: 15 },
  show: { 
    opacity: 1, 
    y: 0, 
    transition: { 
      type: "spring", 
      stiffness: 260, 
      damping: 20 
    } 
  }
};

const cardHoverProps = {
  whileHover: { 
    y: -4, 
    scale: 1.015,
    boxShadow: "0 12px 24px -6px rgba(0, 0, 0, 0.08), 0 8px 16px -8px rgba(0, 0, 0, 0.08)"
  },
  whileTap: { scale: 0.985 },
  transition: { type: "spring", stiffness: 400, damping: 25 }
};

const buttonHoverProps = {
  whileHover: { scale: 1.03, y: -1 },
  whileTap: { scale: 0.97 },
  transition: { type: "spring", stiffness: 400, damping: 15 }
};

const AnimatedCounter = ({
  value,
  className,
}: {
  value: string | number;
  className?: string;
}) => {
  const strValue = String(value);
  const match = strValue.match(/^(\D*)(\d+)(\D*)$/);

  if (!match) return <span className={className}>{strValue}</span>;

  const prefix = match[1];
  const targetNumber = parseInt(match[2], 10);
  const suffix = match[3];

  const ref = React.useRef<HTMLSpanElement>(null);
  const count = useMotionValue(0);
  const rounded = useTransform(count, Math.round);
  const isInView = useInView(ref, { once: false, margin: "-20px" });

  React.useEffect(() => {
    if (isInView) {
      count.set(0);
      const controls = animate(count, targetNumber, {
        duration: 2,
        ease: "easeOut",
      });
      return controls.stop;
    }
  }, [isInView, targetNumber, count]);

  return (
    <span ref={ref} className={`inline-flex items-center ${className || ""}`}>
      {prefix && <span className="opacity-90">{prefix}</span>}
      <motion.span className="font-bold tracking-tight inline-block tabular-nums">
        {rounded}
      </motion.span>
      {suffix && <span className="opacity-90">{suffix}</span>}
    </span>
  );
};

interface Notice {
  id: string;
  title: string;
  priority: string;
  status: string;
  targets: string[];
  date: string;
  readBy?: string[];
  isAdmission?: boolean;
}

export default function Home() {
  const logoUrl = logoImage;

  const [activeCardIdx, setActiveCardIdx] = useState<number | null>(null);
  const [isTouchDevice, setIsTouchDevice] = useState(false);

  useEffect(() => {
    setIsTouchDevice('ontouchstart' in window || navigator.maxTouchPoints > 0);
  }, []);

  const [socialData, setSocialData] = useState<any>({
    facebookUrl: '',
    websiteUrl: '',
    instagramUrl: '',
    tiktokUrl: '',
    youtubeUrl: '',
    whatsappNumber: ''
  });

  useEffect(() => {
    const unsubSocial = onSnapshot(doc(db, "settings", "contact_us"), (docSnap) => {
      if (docSnap.exists()) {
        setSocialData(docSnap.data());
      }
    });
    return () => unsubSocial();
  }, []);

  const [content, setContent] = useState<any>({
    tagline1: "Empowering Minds,",
    tagline2: "Shaping Futures.",
    description:
      "Shikshantar Academy provides quality education from class Play to Ten (10) in a peaceful and nurturing environment in Karjanha Municipality, Ward No. 05, Siraha.",
    principalMessage:
      "At Shikshantar Academy, we believe in nurturing not just academic excellence, but character, creativity, and critical thinking. Our peaceful environment and modern facilities provide the perfect setting for your child to grow and thrive.",
    principalImage: principalImg,
    announcement:
      "🌟 Welcome to the new Shikshantar Academy Portal! Term 1 Examinations starting from next week. 🌟",
    admissionsBadge: "Admissions Open 2083 B.S.",
    contactPhone: "+977 9709867048, +977 9807790805",
    statsStudents: "200+",
    statsTeachers: "12+",
    statsPassRate: "90%+",
    statsLevelRange: "PG — Class 10",
    statsEstYear: "2072 B.S.",

    // Slide 1
    slide1Image: principalImg,
    slide1Badge: "Holistic Education",
    slide1Title: "Nurturing Minds, Building Character",
    slide1Desc: "Empowering students in Bastipur, Siraha with world-class education, professional educators & modern resources.",
    slide1Link: "/facilities",
    slide1Cta: "🏫 Explore Facilities →",

    // Slide 2
    slide2Image: "https://images.unsplash.com/photo-1503676260728-1c00da094a0b?q=80&w=1200&auto=format&fit=crop",
    slide2Badge: "BALA Classroom Designs",
    slide2Title: "Building as a Learning Aid (BALA)",
    slide2Desc: "Every wall has a story to teach! Custom educational paintings, Nepali Barnamala alphabets, mathematics curves, and geographical world maps are printed onto classroom walls & corridors to spark natural inquiry in our students.",
    slide2Link: "/facilities",
    slide2Cta: "🎨 Tour BALA Classrooms →",

    // Slide 3
    slide3Image: "https://images.unsplash.com/photo-1562774053-f5a02f6ef87a?q=80&w=1200&auto=format&fit=crop",
    slide3Badge: "English medium instruction",
    slide3Title: "Global Standards, Local Foundations",
    slide3Desc: "Consistently scoring high SEE success benchmarks, under active directorship of Pappu Kumar Jha and specialized teachers.",
    slide3Link: "tel:+9779807790805",
    slide3Cta: "📞 Call Academic Advisors",

    // Program Montessori
    progMontessoriTitle: "🧸 Montessori & Play Group Level",
    progMontessoriDesc: "Our pre-school program introduces toddlers to continuous sensory stimulation, audio-visual play-rooms and playful motor learning. We emphasize loving attention to keep every toddler safe, happy and motivated while building basic English phonetics, shapes and numerals.",
    progMontessoriFeat: "🎨 Dynamic creative spaces\n🧸 Sensory-toy collections\n🥪 Healthy nutrition support\n👩‍⚕️ Dedicated nurse and care staff",
    progMontessoriImg: "https://images.unsplash.com/photo-1596461404969-9ae70f2830c1?q=80&w=600&auto=format&fit=crop",

    // Program Primary
    progPrimaryTitle: "✏️ Primary Schooling (Class 1 to 5)",
    progPrimaryDesc: "At the primary level, we establish robust analytical roots. Following the CDC guidelines of Nepal, classes involve extensive writing, mathematical tables arithmetic, bilingual fluency exercises, environmental studies, and introductory computing logic.",
    progPrimaryFeat: "📖 English Medium curricula\n🧮 Abacus & mental math studies\n🏆 Inter-class debate meets\n🎨 Fine Arts & crafts coaching",
    progPrimaryImg: "https://images.unsplash.com/photo-1503676260728-1c00da094a0b?q=80&w=600&auto=format&fit=crop",

    // Program Basic
    progBasicTitle: "📐 Junior High / Basic School (Class 6 to 8)",
    progBasicDesc: "Preparing young teens for challenges with conceptual mathematics, introductory Physics, Chemistry, Biology experiments, social research assignments, physical drills, and systematic computer lab projects.",
    progBasicFeat: "🔬 Computer & science experimentation\n🧘 Active yoga class sessions\n⚽ Football & sports matches\n🤝 Cultural assemblies & events",
    progBasicImg: "https://images.unsplash.com/photo-1427504494785-3a9ca7044f45?q=80&w=600&auto=format&fit=crop",

    // Program Secondary
    progSecondaryTitle: "🚀 Secondary & SEE Preparation (Class 9 & 10)",
    progSecondaryDesc: "Our high school program targets maximum grades in Secondary Education Examinations (SEE). Under strict coaching by veteran subject specialists, pupils undergo weekly tests, pre-board exams, counseling, and detailed revision sessions.",
    progSecondaryFeat: "📊 Regular prep test assignments\n👨‍🏫 Professional review counsel\n🧠 In-depth Science laboratories\n🎯 Individual student grade targets",
    progSecondaryImg: "https://images.unsplash.com/photo-1523240795612-9a054b0db644?q=80&w=600&auto=format&fit=crop",
  });

  const [expandedImage, setExpandedImage] = useState<string | null>(null);
  const [isVideoPlaying, setIsVideoPlaying] = useState(false);
  const [isVideoMuted, setIsVideoMuted] = useState(false);
  const [isCinematicOpen, setIsCinematicOpen] = useState(false);
  const [videoProgress, setVideoProgress] = useState(0);
  const videoRef = React.useRef<HTMLVideoElement>(null);

  const formatTime = (time: number) => {
    if (isNaN(time)) return "0:00";
    const mins = Math.floor(time / 60);
    const secs = Math.floor(time % 60);
    return `${mins}:${secs < 10 ? "0" : ""}${secs}`;
  };
  const [notices, setNotices] = useState<any[]>([]);
  const [galleryImages, setGalleryImages] = useState<any[]>([]);
  const [dbBatches, setDbBatches] = useState<any[]>([]);
  const [dbEvents, setDbEvents] = useState<any[]>([]);
  const [dbTeachers, setDbTeachers] = useState<any[]>([]);
  const [activeCategory, setActiveCategory] = useState("All");
  const [pendingAdmissions, setPendingAdmissions] = useState<any[]>([]);
  const [pendingEnquiries, setPendingEnquiries] = useState<any[]>([]);
  const [pendingAlumniSubmissions, setPendingAlumniSubmissions] = useState<any[]>([]);
  const [totalStudents, setTotalStudents] = useState<number>(0);
  const [totalTeachers, setTotalTeachers] = useState<number>(0);

  const [currentSlide, setCurrentSlide] = useState(0);
  const [currentGallerySlide, setCurrentGallerySlide] = useState(0);
  const [activeTab, setActiveTab] = useState("montessori");

  const [enquiryName, setEnquiryName] = useState("");
  const [enquiryStudentName, setEnquiryStudentName] = useState("");
  const [enquiryGrade, setEnquiryGrade] = useState("");
  const [enquiryPhone, setEnquiryPhone] = useState("");
  const [enquiryEmail, setEnquiryEmail] = useState("");
  const [enquiryMessage, setEnquiryMessage] = useState("");
  const [enquiryLoading, setEnquiryLoading] = useState(false);
  const [enquirySuccess, setEnquirySuccess] = useState(false);
  const [enquiryRefId, setEnquiryRefId] = useState("");
  const [enquiryError, setEnquiryError] = useState("");

  const [isUpdatingAnnouncement, setIsUpdatingAnnouncement] = useState(false);
  const [newAnnouncementText, setNewAnnouncementText] = useState("");
  const [isNoticeEnabledLocal, setIsNoticeEnabledLocal] = useState(true);
  const [isSavingAnnouncement, setIsSavingAnnouncement] = useState(false);

  const saveAnnouncement = async () => {
    setIsSavingAnnouncement(true);
    try {
      await setDoc(doc(db, "settings", "home_content"), {
        ...content,
        announcement: newAnnouncementText,
        isNoticeEnabled: isNoticeEnabledLocal,
      }, { merge: true });
      setIsUpdatingAnnouncement(false);
    } catch (err) {
      console.error("Failed to save announcement:", err);
    } finally {
      setIsSavingAnnouncement(false);
    }
  };

  // Automatic Hero Slide Rotation with 4-second hold duration
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentSlide((prev) => (prev + 1) % 3);
    }, 4000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentGallerySlide((prev) => (prev + 1) % 5);
    }, 5000);
    return () => clearInterval(timer);
  }, []);

  const [feeCollected, setFeeCollected] = useState(0);
  const [pendingDues, setPendingDues] = useState(0);
  const [pendingDuesCount, setPendingDuesCount] = useState(0);
  const [todayCollections, setTodayCollections] = useState<any[]>([]);
  const [todayTotal, setTodayTotal] = useState(0);
  const [recentAdmissionsList, setRecentAdmissionsList] = useState<any[]>([]);
  const [studentData, setStudentData] = useState<any>(null);
  const [studentResults, setStudentResults] = useState<any[]>([]);
  const [assignedStudents, setAssignedStudents] = useState<any[]>([]);
  const [latestSalary, setLatestSalary] = useState<any>(null);
  const [teacherSalaries, setTeacherSalaries] = useState<any[]>([]);
  const [unpublishedExams, setUnpublishedExams] = useState<any[]>([]);
  const [publishStatusMessage, setPublishStatusMessage] = useState<string>("");
  const [selectedPublishExamId, setSelectedPublishExamId] = useState<string>("");
  const [class4Teacher, setClass4Teacher] = useState<any>(null);

  const [isLoading, setIsLoading] = useState(true);
  const [currentAuthUser, setCurrentAuthUser] = useState<any>(auth.currentUser);

  const urlParams = new URLSearchParams(window.location.search);
  const previewRole = urlParams.get("previewRole");
  const userRole = previewRole || (currentAuthUser ? (localStorage.getItem("userRole") || "student") : "guest");
  const isAdmin = userRole === "admin" && Boolean(currentAuthUser || previewRole);
  const navigate = useNavigate();

  useEffect(() => {
    // Determine data on load
    const loadAdminData = (user: any) => {
      if (!user) return () => {};
      if (!isAdmin) return () => {};

      let unsubTx = () => {};
      let unsubFees = () => {};
      let unsubUsers = () => {};

      // Fetch transactions
      try {
        unsubTx = onSnapshot(
          collection(db, "transactions"),
          (txSnap) => {
            let collected = 0;
            let tCollections: any[] = [];
            let tTotal = 0;
            const todayBSStr = formatBSDateYMD(new Date());
            const currentBSYear = getBSYearMonthDate(new Date()).year;

            const monthNames = [
              "Baisakh",
              "Jestha",
              "Asar",
              "Shrawan",
              "Bhadra",
              "Ashwin",
              "Kartik",
              "Mangsir",
              "Poush",
              "Magh",
              "Falgun",
              "Chaitra",
            ];
            const monthlySums: Record<string, number> = {};
            monthNames.forEach((m) => (monthlySums[m] = 0));

            txSnap.forEach((snap) => {
              const tx = snap.data();
              // Only consider SUCCESS or OVERRIDE_SUCCESS
              if (tx.status !== "SUCCESS" && tx.status !== "OVERRIDE_SUCCESS") return;

              let txYear = 0;
              let txMonthIndex = -1;
              let txYMD = "";

              if (tx.date && typeof tx.date === "string" && tx.date.includes("-")) {
                txYMD = tx.date.trim();
                const parts = txYMD.split("-");
                if (parts.length >= 3) {
                  txYear = parseInt(parts[0], 10);
                  const m = parseInt(parts[1], 10);
                  if (!isNaN(m) && m >= 1 && m <= 12) {
                    txMonthIndex = m - 1;
                  }
                }
              } else {
                try {
                  const d = tx.timestamp?.toDate ? tx.timestamp.toDate() : (tx.createdAt ? new Date(tx.createdAt) : null);
                  if (d) {
                    txYMD = formatBSDateYMD(d);
                    const parts = txYMD.split("-");
                    if (parts.length >= 3) {
                      txYear = parseInt(parts[0], 10);
                      const m = parseInt(parts[1], 10);
                      if (!isNaN(m) && m >= 1 && m <= 12) {
                        txMonthIndex = m - 1;
                      }
                    }
                  }
                } catch (e) {}
              }

              // Filter transactions to only those of the current B.S. academic year for the chart & total
              if (txYear === currentBSYear) {
                collected += tx.amount || 0;
                
                const moName = monthNames[txMonthIndex];
                if (moName) {
                  monthlySums[moName] += tx.amount || 0;
                }
              }

              // Check if it's collected today
              if (txYMD === todayBSStr) {
                tCollections.push({ id: snap.id, ...tx });
                tTotal += tx.amount || 0;
              }
            });

            setFeeChartData([
              { name: "Baisakh", collected: monthlySums["Baisakh"] },
              { name: "Jestha", collected: monthlySums["Jestha"] },
              { name: "Asar", collected: monthlySums["Asar"] },
              { name: "Shrawan", collected: monthlySums["Shrawan"] },
              { name: "Bhadra", collected: monthlySums["Bhadra"] },
              { name: "Ashwin", collected: monthlySums["Ashwin"] },
              { name: "Kartik", collected: monthlySums["Kartik"] },
              { name: "Mangsir", collected: monthlySums["Mangsir"] },
              { name: "Poush", collected: monthlySums["Poush"] },
              { name: "Magh", collected: monthlySums["Magh"] },
              { name: "Falgun", collected: monthlySums["Falgun"] },
              { name: "Chaitra", collected: monthlySums["Chaitra"] },
            ]);

            setFeeCollected(collected);
            setTodayCollections(tCollections);
            setTodayTotal(tTotal);
          },
          (err) => console.log("Could not load transactions realtime"),
        );
      } catch (err: any) {}

      // Fetch student fees
      try {
        unsubFees = onSnapshot(
          query(collection(db, "studentFees"), where("status", "==", "due")),
          (feesSnap) => {
            let pDues = 0;
            const studentsWithDues = new Set();

            feesSnap.forEach((snap) => {
              const fee = snap.data();
              pDues += Number(fee.dueAmount || 0);
              studentsWithDues.add(fee.studentId);
            });
            const dCount = studentsWithDues.size;

            setPendingDues(pDues);
            setPendingDuesCount(dCount);
          },
          (err) => console.log("Could not load student fees realtime"),
        );
      } catch (err: any) {}

      // Fetch users
      try {
        unsubUsers = onSnapshot(
          collection(db, "users"),
          (usersSnap) => {
            let sCount = 0;
            let tCount = 0;
            usersSnap.forEach((snap) => {
              const data = snap.data();
              if (data.role === "student" && data.status !== "pending")
                sCount++;
              if (data.role === "teacher" && data.status !== "pending")
                tCount++;
            });
            setTotalStudents(sCount);
            setTotalTeachers(tCount);
          },
          (err) => console.log("Could not load users realtime"),
        );
      } catch (err: any) {}

      return () => {
        unsubTx();
        unsubFees();
        unsubUsers();
      };
    };

    let cleanupAdminData = () => {};
    let isCancelled = false;
    const unsubAuth = onAuthStateChanged(auth, (user) => {
      setCurrentAuthUser(user);
      cleanupAdminData();
      cleanupAdminData = loadAdminData(user);

      if (user && userRole === "student") {
        try {
          getDoc(doc(db, "users", user.uid))
            .then((userDoc) => {
              if (isCancelled) return;
              if (userDoc.exists()) {
                setStudentData(userDoc.data());

                if (userDoc.data().status !== "pending") {
                  const fetchResults = async () => {
                    const examsSnap = await getDocs(
                      query(
                        collection(db, "exams"),
                        where("published", "==", true),
                      ),
                    );
                    const publishedExamIds = new Set<string>();
                    examsSnap.forEach((doc) => publishedExamIds.add(doc.id));

                    const studentIdVal = userDoc.data().studentId || user.uid;
                    let sumsRef;
                    try {
                      sumsRef = await getDocs(
                        query(
                          collection(db, "resultSummary"),
                          where("studentId", "==", studentIdVal),
                        ),
                      );
                    } catch (err: any) {
                      console.error(
                        "fetchResults error - failed to fetch resultSummary for studentId",
                        studentIdVal,
                        err,
                      );
                      handleFirestoreError(
                        err,
                        OperationType.LIST,
                        "resultSummary",
                      );
                    }
                    const summaryList: any[] = [];
                    if (sumsRef) {
                      sumsRef.forEach((d) => {
                        const data = d.data();
                        if (publishedExamIds.has(data.examId)) {
                          summaryList.push({ id: d.id, ...data });
                        }
                      });
                    }

                    // fetch detailed subjects
                    let resultsRef;
                    try {
                      resultsRef = await getDocs(
                        query(
                          collection(
                            db,
                            "results_secure",
                            studentIdVal,
                            "records",
                          ),
                        ),
                      );
                    } catch (err: any) {
                      console.error(
                        "fetchResults error - failed to fetch results_secure for studentId",
                        studentIdVal,
                        err,
                      );
                      handleFirestoreError(
                        err,
                        OperationType.LIST,
                        "results_secure/" + studentIdVal + "/records",
                      );
                    }
                    const resultsByExamId: Record<
                      string,
                      Record<string, any>
                    > = {};

                    if (resultsRef) {
                      resultsRef.forEach((doc) => {
                        const data = doc.data();
                        if (publishedExamIds.has(data.examId)) {
                          if (!resultsByExamId[data.examId])
                            resultsByExamId[data.examId] = {};
                          resultsByExamId[data.examId][data.subject] = {
                            fullMarks: data.fullMarks,
                            obtained: data.marks,
                          };
                        }
                      });
                    }

                    const formattedResults = summaryList.map((sum) => ({
                      examId: sum.examId,
                      examType: sum.examType,
                      percentage: sum.percentage,
                      total: sum.total,
                      subjects: resultsByExamId[sum.examId] || {},
                    }));

                    // sort by term (Terminal 1, 2, 3...)
                    formattedResults.sort((a, b) =>
                      (a.examType || "").localeCompare(b.examType || ""),
                    );

                    if (!isCancelled) setStudentResults(formattedResults);
                  };
                  fetchResults().catch((e) =>
                    console.error("fetchResults error: ", e),
                  );
                }
              } else {
                setStudentData(null);
              }
            })
            .catch((e) => {
              console.error("Could not fetch student data:", e);
              if (!isCancelled) setStudentData(null);
            });
        } catch (e) {
          console.error("Could not fetch student data:", e);
          if (!isCancelled) setStudentData(null);
        }
      } else if (user && userRole === "teacher") {
        try {
          getDoc(doc(db, "users", user.uid))
            .then((userDoc) => {
              if (isCancelled) return;
              if (userDoc.exists()) {
                const uData = userDoc.data();
                setStudentData(uData);

                // Fetch exams for publishing
                getDocs(query(collection(db, "exams")))
                  .then((examsSnap) => {
                    if (isCancelled) return;
                    const list: any[] = [];
                    examsSnap.forEach((doc) => {
                      list.push({ id: doc.id, ...doc.data() });
                    });
                    setUnpublishedExams(list);
                  });

                // Fetch latest salary
                getDocs(query(collection(db, "salary_records"), where("teacherId", "==", user.uid)))
                  .then((salarySnap) => {
                    if (isCancelled) return;
                    const dbList: any[] = [];
                    salarySnap.forEach((doc) => {
                      dbList.push({ id: doc.id, ...doc.data() });
                    });
                    
                    let mergedList = [...dbList];
                    try {
                       const localRecs = JSON.parse(localStorage.getItem('local_salary_records') || '[]');
                       const filteredLocals = localRecs.filter((r: any) => r.teacherId === user.uid);
                       const mergedMap: Record<string, any> = {};
                       filteredLocals.forEach((r: any) => {
                           mergedMap[r.id] = r;
                       });
                       dbList.forEach(r => {
                           mergedMap[r.id] = r;
                       });
                       mergedList = Object.values(mergedMap);
                    } catch(e){}

                    mergedList.sort((a, b) => new Date(b.date || "").getTime() - new Date(a.date || "").getTime());
                    setTeacherSalaries(mergedList);
                    if (mergedList.length > 0) {
                      setLatestSalary(mergedList[0]);
                    }
                  });
              } else {
                setStudentData(null);
              }
            })
            .catch((e) => {
              console.error("Could not fetch teacher data:", e);
              if (!isCancelled) setStudentData(null);
            });
        } catch (e) {
          console.error("Could not fetch teacher data:", e);
          if (!isCancelled) setStudentData(null);
        }
      } else {
        if (!isCancelled) setStudentData(null);
      }
    });

    // Simulate loading for 0.5 seconds
    const timer = setTimeout(() => {
      setIsLoading(false);
    }, 500);

    return () => {
      isCancelled = true;
      clearTimeout(timer);
      unsubAuth();
      cleanupAdminData();
    };
  }, [isAdmin]);

  useEffect(() => {
    const fetchClass4Teacher = async (user: any) => {
      if (!user) {
        setClass4Teacher({ fullName: "Sumita Saha", class: "4" });
        return;
      }
      try {
        const q = query(
          collection(db, "users"),
          where("role", "==", "teacher")
        );
        const snap = await getDocs(q);
        let foundTeacher = null;
        snap.forEach((d) => {
          const u = d.data();
          const cls = String(u.class || u.studentClass || "");
          const assigned = u.assignedClasses || [];
          if (cls === "4" || cls === "Class 4" || assigned.includes("4") || assigned.includes("Class 4")) {
            foundTeacher = { id: d.id, ...u };
          }
        });
        if (foundTeacher) {
          setClass4Teacher(foundTeacher);
        } else {
          // Fallback if none in database
          setClass4Teacher({ fullName: "Sumita Saha", class: "4" });
        }
      } catch (err) {
        // Silently fall back without logging a critical error
        setClass4Teacher({ fullName: "Sumita Saha", class: "4" });
      }
    };

    const unsub = onAuthStateChanged(auth, (user) => {
      fetchClass4Teacher(user);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    const unsub = onSnapshot(
      doc(db, "settings", "home_content"),
      (docSnap) => {
        if (docSnap.exists()) {
          const data = docSnap.data() as any;
          if (
            !data.principalImage ||
            data.principalImage === "/principal.jpg" ||
            data.principalImage.includes("ui-avatars.com") ||
            data.principalImage.includes("Jn2Qcnk6") ||
            data.principalImage.includes("TP6GTp2w")
          ) {
            data.principalImage = principalImg;
          }
          setContent((prev) => ({ ...prev, ...data }));
        }
      },
      (err) => {
        handleFirestoreError(err, OperationType.GET, "settings/home_content");
      },
    );

    const unsubGallery = onSnapshot(
      doc(db, "school_data", "gallery"),
      (docSnap) => {
        if (docSnap.exists()) {
          const data = docSnap.data();
          const currentBatches = (data.batches || []).map((b: any) => ({
            image: mapDummyImage(b.image),
            caption: b.year || b.caption || "Shikshantar Batch",
          }));
          const currentEvents = (data.events || []).map((e: any) => ({
            image: mapDummyImage(e.image),
            caption: e.title || e.caption || "Academic Event Details",
          }));
          const currentTeachers = (data.teachers || []).map((t: any) => ({
            image: mapDummyImage(t.image),
            caption: t.name || t.caption || "Shikshantar Faculty Member",
            role: t.role || "",
          }));
          
          setGalleryImages([...currentBatches, ...currentEvents, ...currentTeachers]);
          setDbBatches((data.batches || []).map((b: any) => ({ ...b, image: mapDummyImage(b.image) })));
          setDbEvents((data.events || []).map((e: any) => ({ ...e, image: mapDummyImage(e.image) })));
          setDbTeachers((data.teachers || []).map((t: any) => ({ ...t, image: mapDummyImage(t.image) })));
        }
      },
      (err) => {
        console.warn("Home gallery fetch error:", err.message);
      },
    );

    return () => {
      unsub();
      unsubGallery();
    };
  }, []);

  useEffect(() => {
    let unsubNotices = () => {};
    let unsubAdmissions = () => {};
    let unsubRecentAdmissions = () => {};
    let unsubEnquiries = () => {};
    let unsubAlumni = () => {};

    const unsubAuth = onAuthStateChanged(auth, (user) => {
      unsubNotices();
      unsubAdmissions();
      unsubRecentAdmissions();
      unsubEnquiries();
      unsubAlumni();

      const isPrivileged = user && (isAdmin || userRole === "teacher");

      let q = query(collection(db, "notices"), orderBy("date", "desc"));

      unsubNotices = onSnapshot(
        q,
        (snap) => {
          const studentClass = localStorage.getItem("studentClass") || "";
          let docs = snap.docs.map((d) => ({
            id: d.id,
            ...d.data(),
          })) as Notice[];

          // Home page should only ever display Published notices
          docs = docs.filter((d) => d.status === "Published");

          if (!isAdmin) {
            if (userRole === "teacher") {
              docs = docs.filter(
                (n) =>
                  Array.isArray(n.targets) &&
                  (n.targets.includes("All") ||
                    n.targets.includes("Teachers Only")),
              );
            } else {
              // For students or guests
              docs = docs.filter(
                (n) =>
                  Array.isArray(n.targets) &&
                  (n.targets.includes("All") ||
                    (user && n.targets.includes("Students Only")) ||
                    n.targets.includes(`Class ${studentClass}`)),
              );
            }
          }
          setNotices(docs);
        },
        (err: any) => {
          if (
            isPrivileged &&
            err?.message?.includes("Missing or insufficient permissions")
          ) {
            localStorage.removeItem("userRole");
            // window.location.reload();
          } else {
            handleFirestoreError(err, OperationType.LIST, "notices");
          }
        },
      );

      if (user && isAdmin) {
        const qAdmissions = query(
          collection(db, "admissions"),
          where("status", "==", "Pending"),
        );
        unsubAdmissions = onSnapshot(
          qAdmissions,
          (snap) => {
            setPendingAdmissions(
              snap.docs.map((d) => ({ id: d.id, ...d.data() })),
            );
          },
          (err: any) => {
            if (err?.message?.includes("Missing or insufficient permissions")) {
              localStorage.removeItem("userRole");
              // window.location.reload();
            } else {
              handleFirestoreError(err, OperationType.LIST, "admissions");
            }
          },
        );

        const qRecentAdmissions = query(
          collection(db, "admissions"),
          orderBy("submittedAt", "desc"),
        );
        unsubRecentAdmissions = onSnapshot(
          qRecentAdmissions,
          (snap) => {
            setRecentAdmissionsList(
              snap.docs.map((d) => ({ id: d.id, ...d.data() })),
            );
          },
          (err: any) => {
            if (err?.message?.includes("Missing or insufficient permissions")) {
              localStorage.removeItem("userRole");
              // window.location.reload();
            } else {
              handleFirestoreError(err, OperationType.LIST, "admissions");
            }
          },
        );

        const qEnquiries = query(
          collection(db, "contact_enquiries"),
          where("status", "==", "unread")
        );
        unsubEnquiries = onSnapshot(
          qEnquiries,
          (snap) => {
            setPendingEnquiries(
              snap.docs.map((d) => ({ id: d.id, ...d.data() }))
            );
          },
          (err: any) => {
            console.warn("Home page enquiries subscription error:", err);
          }
        );

        const qAlumni = query(
          collection(db, "alumni_submissions"),
          where("status", "==", "pending")
        );
        unsubAlumni = onSnapshot(
          qAlumni,
          (snap) => {
            setPendingAlumniSubmissions(
              snap.docs.map((d) => ({ id: d.id, ...d.data() }))
            );
          },
          (err: any) => {
            console.warn("Home page alumni subscription error:", err);
          }
        );
      } else {
        setPendingAdmissions([]);
        setRecentAdmissionsList([]);
        setPendingEnquiries([]);
        setPendingAlumniSubmissions([]);
      }
    });

    return () => {
      unsubNotices();
      unsubAdmissions();
      unsubRecentAdmissions();
      unsubEnquiries();
      unsubAlumni();
      unsubAuth();
    };
  }, [userRole, isAdmin]);

  const combinedNotices = [
    ...pendingAdmissions.map((a) => ({
      id: a.id,
      title: `Admission Request: ${a.studentName || "Student"}`,
      priority: "Urgent",
      date:
        a.submittedAt?.toDate?.()?.toISOString() || new Date().toISOString(),
      isAdmission: true,
      isPinned: false,
    })),
    ...notices,
  ]
    .sort((a, b) => {
      if (a.isPinned !== b.isPinned) return a.isPinned ? -1 : 1;
      if (a.priority === "Urgent" && b.priority !== "Urgent") return -1;
      if (b.priority === "Urgent" && a.priority !== "Urgent") return 1;
      return new Date(b.date).getTime() - new Date(a.date).getTime();
    })
    .slice(0, 3);

  const handleAdmissionAction = async (id: string, newStatus: string) => {
    try {
      await setDoc(
        doc(db, "admissions", id),
        { status: newStatus },
        { merge: true },
      );
    } catch (err) {
      console.error(err);
    }
  };

  // Setup NPT Date
  const getNPTDate = () => {
    const now = new Date();
    const utcTime = now.getTime() + now.getTimezoneOffset() * 60000;
    return new Date(utcTime + 345 * 60000);
  };
  const [currentTime, setCurrentTime] = useState(getNPTDate());

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(getNPTDate()), 1000);
    return () => clearInterval(timer);
  }, []);

  const currentGregorianYear = currentTime.getFullYear();
  const currentGregorianMonth = currentTime.getMonth() + 1;
  const currentGregorianDate = currentTime.getDate();
  let currentBSYear = currentGregorianYear + 56;
  try {
    currentBSYear = getBSYearMonthDate(currentTime).year;
  } catch (e) {}
  const dateString = formatBSDate(currentTime);
  const bsString = `${currentBSYear} B.S.`;

  const hour = currentTime.getHours();
  let greeting = "Evening";
  if (hour < 12) greeting = "Morning";
  else if (hour < 17) greeting = "Afternoon";

  // State for Chart Data
  const [feeChartData, setFeeChartData] = useState([
    { name: "Baisakh", collected: 0 },
    { name: "Jestha", collected: 0 },
    { name: "Asar", collected: 0 },
    { name: "Shrawan", collected: 0 },
    { name: "Bhadra", collected: 0 },
    { name: "Ashwin", collected: 0 },
    { name: "Kartik", collected: 0 },
    { name: "Mangsir", collected: 0 },
    { name: "Poush", collected: 0 },
    { name: "Magh", collected: 0 },
    { name: "Falgun", collected: 0 },
    { name: "Chaitra", collected: 0 },
  ]);

  const admissionsApproved = recentAdmissionsList.filter(
    (a) => a.status === "Admitted",
  ).length;
  const admissionsRejected = recentAdmissionsList.filter(
    (a) => a.status === "Rejected",
  ).length;

  const admissionsChartData = [
    {
      name: "Admitted",
      value: admissionsApproved > 0 ? admissionsApproved : 0,
      color: "#10b981",
    },
    {
      name: "Pending",
      value: pendingAdmissions.length > 0 ? pendingAdmissions.length : 0,
      color: "var(--accent)",
    },
    {
      name: "Rejected",
      value: admissionsRejected > 0 ? admissionsRejected : 0,
      color: "#ef4444",
    },
  ];

  const renderNoticeEditorModal = () => {
    if (!isUpdatingAnnouncement) return null;
    return createPortal(
      <div className="fixed inset-0 z-[100000] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl p-6 w-full max-w-lg space-y-4 relative">
          <button
            onClick={() => setIsUpdatingAnnouncement(false)}
            className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-2 text-orange-500 font-bold text-sm uppercase tracking-wider">
            <Megaphone className="w-5 h-5" />
            <span>Update Global Notice</span>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
            This message will scroll globally across the top banner of the public website and all logged-in user dashboards (Admin, Student, Teacher) in real-time.
          </p>
          <textarea
            className="w-full h-32 p-3 text-sm border border-slate-200 dark:border-slate-800 rounded-xl bg-slate-50 dark:bg-slate-950 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-orange-500 font-medium"
            placeholder="Type your official global notice or scrolling announcement here..."
            value={newAnnouncementText}
            onChange={(e) => setNewAnnouncementText(e.target.value)}
          />

          {/* Toggle option to stop the notice from displaying */}
          <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50 dark:bg-slate-950/50 border border-slate-100 dark:border-slate-800">
            <div className="flex flex-col">
              <span className="text-xs font-bold text-slate-700 dark:text-slate-200">
                Notice Ticker Status
              </span>
              <span className="text-[10px] text-slate-500 dark:text-slate-400">
                Turn off to temporarily hide the notice from everyone
              </span>
            </div>
            <label className="relative inline-flex items-center cursor-pointer select-none">
              <input
                type="checkbox"
                className="sr-only peer"
                checked={isNoticeEnabledLocal}
                onChange={(e) => setIsNoticeEnabledLocal(e.target.checked)}
              />
              <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer dark:bg-slate-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-orange-500"></div>
            </label>
          </div>

          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={() => setIsUpdatingAnnouncement(false)}
              className="px-4 py-2 text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-all"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={saveAnnouncement}
              disabled={isSavingAnnouncement}
              className="px-4 py-2 text-xs font-extrabold text-white bg-orange-500 hover:bg-orange-600 rounded-xl shadow-md transition-all disabled:opacity-50 flex items-center gap-1.5"
            >
              {isSavingAnnouncement ? "Saving..." : "Publish Notice"}
            </button>
          </div>
        </div>
      </div>,
      document.body
    );
  };

  if (isLoading) {
    if (isAdmin) {
      return (
        <div className="flex flex-col gap-6 p-2 md:p-6 bg-[#F5F6FA] min-h-screen">
          <div className="w-64 h-8 bg-gray-200 dark:bg-slate-800 animate-pulse rounded-lg mb-2"></div>
          <div className="w-48 h-4 bg-gray-200 dark:bg-slate-800 animate-pulse rounded-md"></div>
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-5 mt-4">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div
                key={i}
                className="h-32 bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 animate-pulse rounded-xl p-4 flex flex-col justify-between shadow-xs"
              >
                <div className="w-10 h-10 bg-gray-200 dark:bg-slate-700 rounded-lg"></div>
                <div className="w-24 h-6 bg-gray-200 dark:bg-slate-700 rounded-md"></div>
              </div>
            ))}
          </div>
        </div>
      );
    }

    return (
      <div className="flex flex-col gap-6 p-4 md:p-8 max-w-7xl mx-auto w-full min-h-screen">
        {/* Top Notice Bar Skeleton */}
        <div className="w-full h-11 bg-gray-200 dark:bg-slate-800 animate-pulse rounded-xl"></div>

        {/* Hero Slider Skeleton */}
        <div className="w-full h-64 sm:h-96 bg-gray-200 dark:bg-slate-800 animate-pulse rounded-3xl relative overflow-hidden flex flex-col justify-end p-6 md:p-10 shadow-sm">
          <div className="w-32 h-6 bg-gray-300 dark:bg-slate-700 rounded-full mb-3"></div>
          <div className="w-3/4 h-10 bg-gray-300 dark:bg-slate-700 rounded-lg mb-2"></div>
          <div className="w-1/2 h-5 bg-gray-300 dark:bg-slate-700 rounded-md"></div>
        </div>

        {/* Academic Overview Cards Skeleton */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mt-2">
          {[1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="h-44 bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700/60 animate-pulse rounded-2xl p-6 flex flex-col justify-between shadow-xs"
            >
              <div className="flex justify-between items-start">
                <div className="w-12 h-12 bg-gray-200 dark:bg-slate-700 rounded-xl"></div>
                <div className="w-16 h-4 bg-gray-200 dark:bg-slate-700 rounded-full"></div>
              </div>
              <div className="space-y-2">
                <div className="w-28 h-6 bg-gray-200 dark:bg-slate-700 rounded-md"></div>
                <div className="w-full h-3 bg-gray-200 dark:bg-slate-700 rounded-full"></div>
              </div>
            </div>
          ))}
        </div>

        {/* Featured Content & Principal Message Skeleton */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mt-2">
          <div className="lg:col-span-2 h-72 bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700/60 animate-pulse rounded-3xl p-8"></div>
          <div className="h-72 bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700/60 animate-pulse rounded-3xl p-8"></div>
        </div>
      </div>
    );
  }

  if (isAdmin) {
    return (
      <div className="flex flex-col gap-6 pb-12 bg-[#F5F6FA] min-h-full px-4 md:px-0">
        {/* Dynamic Welcome Banner */}
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-[#1B4F72] via-[#2471A3] to-[#2E86C1] p-6 text-white shadow-lg border border-[#133C57]/30 mb-2">
          {/* Decorative Background Elements */}
          <div className="absolute right-0 bottom-0 top-0 w-1/3 bg-[radial-gradient(circle_at_bottom_right,rgba(255,255,255,0.12),transparent_70%)] pointer-events-none" />
          <div className="absolute -left-10 -top-10 w-40 h-40 rounded-full bg-white/5 blur-3xl pointer-events-none" />
          <div className="absolute right-10 top-5 w-24 h-24 rounded-full bg-teal-400/10 blur-2xl pointer-events-none" />
          
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 relative z-10">
            <div>
              <span className="inline-flex items-center px-3 py-1 rounded-full bg-white/10 backdrop-blur-md text-[10px] font-black uppercase tracking-widest text-teal-200 border border-white/10 mb-3">
                Administrative Control Panel
              </span>
              <h1 className="text-2xl md:text-3xl font-extrabold text-white tracking-tight mb-2">
                Good {greeting}, Administrator 👋
              </h1>
              <p className="text-white/80 text-sm font-medium max-w-xl">
                School management modules are active. Monitor live admissions, broadcast notices, review fee structures, and access financial statements in real-time.
              </p>
            </div>
          </div>
        </div>

        {/* Global Scrolling Announcement */}
        {(content.announcement || true) && (
          <div className={`w-full bg-white dark:bg-slate-900 border rounded-xl overflow-hidden flex flex-row shadow-sm relative mb-4 items-center h-10 md:h-12 select-none justify-between ${content.isNoticeEnabled === false ? 'border-dashed border-red-300 dark:border-red-900 bg-red-50/10' : 'border-gray-200 dark:border-slate-800'}`}>
            <div className="flex items-center overflow-hidden h-full flex-1">
              <div className={`${content.isNoticeEnabled === false ? 'bg-slate-400 dark:bg-slate-700' : 'bg-orange-500'} text-white text-[11px] md:text-xs font-bold px-3 md:px-4 h-full uppercase tracking-wider relative z-10 shadow-[2px_0_5px_rgba(0,0,0,0.1)] whitespace-nowrap shrink-0 flex items-center gap-1.5 rounded-l-xl`}>
                <span className={`w-1.5 h-1.5 rounded-full bg-white flex-shrink-0 ${content.isNoticeEnabled === false ? '' : 'animate-pulse'}`}></span>
                <span className="hidden sm:inline">{content.isNoticeEnabled === false ? 'Notice (Stopped):' : 'Notice Update:'}</span>
                <span className="sm:hidden">{content.isNoticeEnabled === false ? 'Stopped:' : 'Notice:'}</span>
              </div>
              <div className="relative flex-1 overflow-hidden h-full flex items-center">
                <div className={`absolute whitespace-nowrap text-xs md:text-sm pl-3 ${content.isNoticeEnabled === false ? 'animate-none text-slate-400 dark:text-slate-500 italic' : 'animate-marquee text-gray-800 dark:text-gray-100 font-bold'}`}>
                  {content.isNoticeEnabled === false ? `[Notice Stopped] ${content.announcement || "🌟 Welcome to the new Shikshantar Academy Portal! Term 1 Examinations starting from next week. 🌟"}` : (content.announcement || "🌟 Welcome to the new Shikshantar Academy Portal! Term 1 Examinations starting from next week. 🌟")}
                </div>
              </div>
            </div>
            <button
              onClick={() => {
                setNewAnnouncementText(content.announcement || "🌟 Welcome to the new Shikshantar Academy Portal! Term 1 Examinations starting from next week. 🌟");
                setIsNoticeEnabledLocal(content.isNoticeEnabled !== false);
                setIsUpdatingAnnouncement(true);
              }}
              className="bg-orange-500 hover:bg-orange-600 text-white text-[10px] md:text-xs font-bold px-3 py-1.5 md:py-2 rounded-md mx-2 z-20 flex items-center gap-1 active:scale-95 transition-all shadow-sm shrink-0 whitespace-nowrap"
            >
              <Edit2 className="w-3 h-3 shrink-0" /> <span className="hidden sm:inline">Update Notice</span>
            </button>
          </div>
        )}

        {/* Section 1: 6 Premium Summary Stat Cards */}
        <motion.div variants={containerVariants} initial="hidden" animate="show" className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-5">
          {/* Card 1: Students */}
          <motion.div
            variants={itemVariants}
            {...cardHoverProps}
            onClick={() => navigate("/user-approvals?filter=student")}
            className="bg-white rounded-xl shadow-[0_4px_12px_rgba(0,0,0,0.04)] hover:shadow-[0_8px_20px_rgba(0,0,0,0.08)] border border-slate-100 hover:border-blue-200 p-4.5 cursor-pointer transition-all flex flex-col justify-between"
          >
            <div className="flex justify-between items-start mb-3">
              <div className="p-2 bg-blue-50 rounded-lg text-blue-600">
                <Users className="w-5 h-5" />
              </div>
              <span className="text-[10px] font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full">Enrolled</span>
            </div>
            <div>
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Total Students</p>
              <h3 className="text-2xl font-black text-gray-800 leading-none mb-1.5">
                <AnimatedCounter value={totalStudents} />
              </h3>
              <div className="w-full bg-slate-100 h-1 rounded-full overflow-hidden">
                <div className="bg-blue-500 h-full rounded-full" style={{ width: "85%" }} />
              </div>
              <p className="text-[10px] text-gray-500 font-medium mt-1.5">Active profiles synced</p>
            </div>
          </motion.div>

          {/* Card 2: Teachers */}
          <motion.div
            variants={itemVariants}
            {...cardHoverProps}
            onClick={() => navigate("/user-approvals?filter=teacher")}
            className="bg-white rounded-xl shadow-[0_4px_12px_rgba(0,0,0,0.04)] hover:shadow-[0_8px_20px_rgba(0,0,0,0.08)] border border-slate-100 hover:border-indigo-200 p-4.5 cursor-pointer transition-all flex flex-col justify-between"
          >
            <div className="flex justify-between items-start mb-3">
              <div className="p-2 bg-indigo-50 rounded-lg text-indigo-600">
                <GraduationCap className="w-5 h-5" />
              </div>
              <span className="text-[10px] font-bold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full">Faculty</span>
            </div>
            <div>
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Total Teachers</p>
              <h3 className="text-2xl font-black text-gray-800 leading-none mb-1.5">
                <AnimatedCounter value={totalTeachers} />
              </h3>
              <div className="w-full bg-slate-100 h-1 rounded-full overflow-hidden">
                <div className="bg-indigo-500 h-full rounded-full" style={{ width: "90%" }} />
              </div>
              <p className="text-[10px] text-gray-500 font-medium mt-1.5">Departments covered</p>
            </div>
          </motion.div>

          {/* Card 3: Pending Admissions */}
          <motion.div
            variants={itemVariants}
            {...cardHoverProps}
            onClick={() => navigate("/admin-admissions")}
            className="bg-white rounded-xl shadow-[0_4px_12px_rgba(0,0,0,0.04)] hover:shadow-[0_8px_20px_rgba(0,0,0,0.08)] border border-slate-100 hover:border-amber-200 p-4.5 cursor-pointer transition-all flex flex-col justify-between"
          >
            <div className="flex justify-between items-start mb-3">
              <div className="p-2 bg-amber-50 rounded-lg text-amber-600">
                <FileText className="w-5 h-5" />
              </div>
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${pendingAdmissions.length > 0 ? "bg-red-50 text-red-600 animate-pulse" : "bg-amber-50 text-amber-600"}`}>
                {pendingAdmissions.length > 0 ? "Review" : "Done"}
              </span>
            </div>
            <div>
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Admissions</p>
              <h3 className="text-2xl font-black text-gray-800 leading-none mb-1.5">
                <AnimatedCounter value={pendingAdmissions.length} />
              </h3>
              <div className="w-full bg-slate-100 h-1 rounded-full overflow-hidden">
                <div className={`h-full rounded-full ${pendingAdmissions.length > 0 ? "bg-amber-500" : "bg-emerald-500"}`} style={{ width: pendingAdmissions.length > 0 ? "40%" : "100%" }} />
              </div>
              <p className="text-[10px] text-gray-500 font-medium mt-1.5">Applications pending</p>
            </div>
          </motion.div>

          {/* Card 4: Fee Collected */}
          <motion.div
            variants={itemVariants}
            {...cardHoverProps}
            onClick={() => navigate(isAdmin ? "/account-admin" : "/account")}
            className="bg-white rounded-xl shadow-[0_4px_12px_rgba(0,0,0,0.04)] hover:shadow-[0_8px_20px_rgba(0,0,0,0.08)] border border-slate-100 hover:border-emerald-200 p-4.5 cursor-pointer transition-all flex flex-col justify-between"
          >
            <div className="flex justify-between items-start mb-3">
              <div className="p-2 bg-emerald-50 rounded-lg text-emerald-600">
                <CreditCard className="w-5 h-5" />
              </div>
              <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">Cashflow</span>
            </div>
            <div>
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Total Collected</p>
              <h3 className="text-lg font-black text-gray-800 leading-none mb-1.5 truncate">
                Rs. {feeCollected.toLocaleString()}
              </h3>
              <div className="w-full bg-slate-100 h-1 rounded-full overflow-hidden">
                <div className="bg-emerald-500 h-full rounded-full" style={{ width: feeCollected > 0 ? "100%" : "0%" }} />
              </div>
              <p className="text-[10px] text-gray-500 font-medium mt-1.5">Today: Rs. {todayTotal.toLocaleString()}</p>
            </div>
          </motion.div>

          {/* Card 5: Outstanding Dues */}
          <motion.div
            variants={itemVariants}
            {...cardHoverProps}
            onClick={() => navigate(isAdmin ? "/account-admin" : "/")}
            className="bg-white rounded-xl shadow-[0_4px_12px_rgba(0,0,0,0.04)] hover:shadow-[0_8px_20px_rgba(0,0,0,0.08)] border border-slate-100 hover:border-rose-200 p-4.5 cursor-pointer transition-all flex flex-col justify-between"
          >
            <div className="flex justify-between items-start mb-3">
              <div className="p-2 bg-rose-50 rounded-lg text-rose-600">
                <AlertCircle className="w-5 h-5" />
              </div>
              <span className="text-[10px] font-bold text-rose-600 bg-rose-50 px-2 py-0.5 rounded-full">Receivable</span>
            </div>
            <div>
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Outstanding Dues</p>
              <h3 className="text-lg font-black text-gray-800 leading-none mb-1.5 truncate">
                Rs. {pendingDues.toLocaleString()}
              </h3>
              <div className="w-full bg-slate-100 h-1 rounded-full overflow-hidden">
                <div className="bg-rose-500 h-full rounded-full" style={{ width: pendingDues > 0 ? "100%" : "0%" }} />
              </div>
              <p className="text-[10px] text-gray-500 font-medium mt-1.5">{pendingDuesCount} Students have dues</p>
            </div>
          </motion.div>

          {/* Card 6: Active Notice Board */}
          <motion.div
            variants={itemVariants}
            {...cardHoverProps}
            onClick={() => navigate("/notices")}
            className="bg-white rounded-xl shadow-[0_4px_12px_rgba(0,0,0,0.04)] hover:shadow-[0_8px_20px_rgba(0,0,0,0.08)] border border-slate-100 hover:border-purple-200 p-4.5 cursor-pointer transition-all flex flex-col justify-between"
          >
            <div className="flex justify-between items-start mb-3">
              <div className="p-2 bg-purple-50 rounded-lg text-purple-600">
                <Megaphone className="w-5 h-5" />
              </div>
              <span className="text-[10px] font-bold text-purple-600 bg-purple-50 px-2 py-0.5 rounded-full">Notices</span>
            </div>
            <div>
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Active Notices</p>
              <h3 className="text-2xl font-black text-gray-800 leading-none mb-1.5">
                <AnimatedCounter value={notices.length} />
              </h3>
              <div className="w-full bg-slate-100 h-1 rounded-full overflow-hidden">
                <div className="bg-purple-500 h-full rounded-full" style={{ width: "60%" }} />
              </div>
              <p className="text-[10px] text-gray-500 font-medium mt-1.5">Public bulletins posted</p>
            </div>
          </motion.div>
        </motion.div>

        {/* Section 2: Pending Actions Alert */}
        <div className="mt-2">
          {(pendingAdmissions.length > 0 || pendingEnquiries.length > 0 || pendingAlumniSubmissions.length > 0) ? (
            <div className="bg-white rounded-xl p-5 border border-orange-200 shadow-[0_2px_8px_rgba(0,0,0,0.08)] relative overflow-hidden">
              <div className="absolute top-0 left-0 w-1 h-full bg-orange-400"></div>
              <h3 className="text-[16px] font-bold text-gray-900 mb-3 flex items-center gap-2">
                <span className="text-xl">⚡</span> Action Required
              </h3>
              <div className="space-y-3">
                {pendingAdmissions.length > 0 && (
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 p-3 bg-orange-50/50 rounded-lg border border-orange-100">
                    <div className="flex items-start gap-2">
                      <FileText className="w-5 h-5 text-orange-500 shrink-0 mt-0.5" />
                      <span className="text-sm font-medium text-gray-800">
                        {pendingAdmissions.length} admission applications waiting for review
                      </span>
                    </div>
                    <button
                      onClick={() => navigate("/admin-admissions")}
                      className="shrink-0 bg-white border border-gray-200 text-gray-800 hover:text-orange-600 px-4 py-1.5 rounded text-sm font-bold shadow-sm transition-colors w-full md:w-auto"
                    >
                      Review Now
                    </button>
                  </div>
                )}

                {pendingEnquiries.length > 0 && (
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 p-3 bg-indigo-50/50 rounded-lg border border-indigo-100">
                    <div className="flex items-start gap-2">
                      <Mail className="w-5 h-5 text-indigo-500 shrink-0 mt-0.5" />
                      <span className="text-sm font-medium text-gray-800">
                        {pendingEnquiries.length} web enquiries waiting for response
                      </span>
                    </div>
                    <button
                      onClick={() => navigate("/admin?tab=enquiries")}
                      className="shrink-0 bg-white border border-gray-200 text-gray-800 hover:text-indigo-600 px-4 py-1.5 rounded text-sm font-bold shadow-sm transition-colors w-full md:w-auto"
                    >
                      Review Enquiries
                    </button>
                  </div>
                )}

                {pendingAlumniSubmissions.length > 0 && (
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 p-3 bg-amber-50/50 rounded-lg border border-amber-100">
                    <div className="flex items-start gap-2">
                      <GraduationCap className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
                      <span className="text-sm font-medium text-gray-800">
                        {pendingAlumniSubmissions.length} alumni stories waiting for approval
                      </span>
                    </div>
                    <button
                      onClick={() => navigate("/alumni")}
                      className="shrink-0 bg-white border border-gray-200 text-gray-800 hover:text-amber-600 px-4 py-1.5 rounded text-sm font-bold shadow-sm transition-colors w-full md:w-auto"
                    >
                      Review Stories
                    </button>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="bg-white rounded-xl p-5 border border-emerald-200 shadow-[0_2px_8px_rgba(0,0,0,0.08)] relative overflow-hidden flex items-center gap-3">
              <div className="absolute top-0 left-0 w-1 h-full bg-emerald-400"></div>
              <CheckCircle2 className="w-6 h-6 text-emerald-500" />
              <h3 className="text-[16px] font-bold text-gray-900">
                ✅ Everything is up to date!
              </h3>
            </div>
          )}
        </div>

        {/* Section 3: Dual Charts Bento-Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Chart 1: Admissions Breakdown */}
          <div className="lg:col-span-4 bg-white p-5 rounded-2xl shadow-[0_4px_12px_rgba(0,0,0,0.04)] border border-slate-100 flex flex-col h-[360px] relative overflow-hidden">
            <div className="absolute top-0 left-0 w-1.5 h-full bg-orange-500" />
            <h3 className="text-[15px] font-black text-slate-800 mb-4 border-l-4 border-orange-500 pl-2 tracking-tight">
              Admissions Summary
            </h3>
            <div className="flex-1 w-full min-h-0 relative">
              <ResponsiveContainer width="100%" height={240}>
                <PieChart>
                  <Pie
                    data={admissionsChartData}
                    cx="50%"
                    cy="45%"
                    innerRadius="65%"
                    outerRadius="85%"
                    paddingAngle={4}
                    dataKey="value"
                    stroke="transparent"
                  >
                    {admissionsChartData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <RechartsTooltip
                    contentStyle={{
                      borderRadius: "12px",
                      border: "none",
                      boxShadow: "0 10px 15px -3px rgba(0, 0, 0, 0.1)",
                      fontFamily: "Inter, sans-serif",
                      fontWeight: "bold",
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div className="absolute top-[40%] left-1/2 transform -translate-x-1/2 -translate-y-1/2 text-center mt-1">
                <div className="text-3xl font-black text-slate-800 leading-none mb-1">
                  {admissionsChartData.reduce((a, b) => a + b.value, 0)}
                </div>
                <div className="text-[9px] font-black uppercase text-slate-400 tracking-widest leading-none">
                  Applications
                </div>
              </div>
              <div className="flex justify-center gap-3 flex-wrap mt-1">
                {admissionsChartData.map((item, idx) => (
                  <div key={idx} className="flex items-center gap-1.5">
                    <span
                      className="w-2.5 h-2.5 rounded-full"
                      style={{ backgroundColor: item.color }}
                    ></span>
                    <span className="text-[11px] font-semibold text-slate-600">
                      {item.name} ({item.value})
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Chart 2: Monthly Collections Trend */}
          <div className="lg:col-span-8 bg-white p-5 rounded-2xl shadow-[0_4px_12px_rgba(0,0,0,0.04)] border border-slate-100 flex flex-col h-[360px] relative overflow-hidden">
            <div className="absolute top-0 left-0 w-1.5 h-full bg-indigo-500" />
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-[15px] font-black text-slate-800 border-l-4 border-indigo-500 pl-2 tracking-tight">
                Monthly Fee Collections
              </h3>
              <span className="text-[10px] font-extrabold text-indigo-600 bg-indigo-50 px-2.5 py-1 rounded-full uppercase tracking-wider">
                Financial Statement B.S.
              </span>
            </div>
            <div className="flex-1 w-full min-h-0 flex flex-col justify-center items-center">
              {feeChartData.every((item) => item.collected === 0) ? (
                <div className="flex flex-col items-center justify-center p-6 text-center">
                  <div className="w-12 h-12 bg-slate-50 text-slate-400 rounded-full flex items-center justify-center mb-3">
                    <CreditCard className="w-6 h-6" />
                  </div>
                  <h4 className="text-sm font-bold text-slate-700 mb-1">No collections recorded yet</h4>
                  <p className="text-xs text-slate-500 max-w-sm mb-4">
                    There are no successful fee transactions logged for the current B.S. academic year ({currentBSYear}).
                  </p>
                  <button
                    onClick={() => navigate("/account-admin")}
                    className="text-xs font-bold text-indigo-600 hover:text-indigo-700 bg-indigo-50 hover:bg-indigo-100 px-3 py-1.5 rounded-xl transition-all"
                  >
                    Go to Fee Management
                  </button>
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={feeChartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="colorCollected" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#4f46e5" stopOpacity={0.9} />
                        <stop offset="95%" stopColor="#3b82f6" stopOpacity={0.6} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                    <XAxis 
                      dataKey="name" 
                      axisLine={false} 
                      tickLine={false} 
                      tick={{ fill: '#64748b', fontSize: 10, fontWeight: 600 }} 
                    />
                    <YAxis 
                      axisLine={false} 
                      tickLine={false} 
                      tick={{ fill: '#64748b', fontSize: 10, fontWeight: 600 }} 
                      tickFormatter={(val) => `Rs.${val >= 1000 ? `${(val/1000).toFixed(0)}k` : val}`}
                    />
                    <RechartsTooltip
                      cursor={{ fill: '#f8fafc' }}
                      contentStyle={{
                        borderRadius: "12px",
                        border: "none",
                        boxShadow: "0 10px 15px -3px rgba(0, 0, 0, 0.1)",
                        fontFamily: "Inter, sans-serif",
                      }}
                      formatter={(value) => [`Rs. ${Number(value).toLocaleString()}`, 'Collected']}
                    />
                    <Bar 
                      dataKey="collected" 
                      fill="url(#colorCollected)" 
                      radius={[6, 6, 0, 0]} 
                      maxBarSize={32}
                    />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>
        </div>

        {/* Section 4: Three Column Widgets */}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          {/* Recent Admissions */}
          <div className="bg-white rounded-xl shadow-[0_2px_8px_rgba(0,0,0,0.08)] border border-gray-100 flex flex-col overflow-hidden">
            <div className="p-4 border-b border-gray-100">
              <h3 className="text-[15px] font-bold text-[#333] border-l-4 border-orange-500 pl-2">
                📝 Recent Admissions
              </h3>
            </div>
            <div className="flex-1 p-0 flex flex-col max-h-[300px] overflow-y-auto custom-scrollbar">
              {recentAdmissionsList.length > 0 ? (
                recentAdmissionsList.slice(0, 5).map((adm, i) => (
                  <div
                    key={adm.id}
                    className="p-3 border-b border-gray-50 hover:text-primary flex items-center justify-between gap-2"
                  >
                    <div className="flex items-center gap-3 overflow-hidden">
                      <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center font-bold text-xs shrink-0 uppercase">
                        {(adm.studentName || "U").substring(0, 2)}
                      </div>
                      <div className="overflow-hidden">
                        <p className="text-sm font-bold text-gray-800 truncate">
                          {adm.studentName || "Unknown"}
                        </p>
                        <p className="text-[11px] text-gray-500 truncate">
                          Class {adm.classApplied} |{" "}
                          {formatBSDate(
                            adm.submittedAt?.toDate?.() || Date.now(),
                          )}
                        </p>
                      </div>
                    </div>
                    <div className="shrink-0 flex flex-col items-end gap-1">
                      {adm.status === "Pending" ? (
                        <div className="flex gap-1">
                          <button
                            onClick={() =>
                              handleAdmissionAction(adm.id, "Admitted")
                            }
                            className="p-1 px-2 bg-emerald-50 text-emerald-600 hover:bg-emerald-100 rounded text-[10px] font-bold border border-emerald-200 transition-colors"
                          >
                            ✓ Adm
                          </button>
                          <button
                            onClick={() =>
                              handleAdmissionAction(adm.id, "Rejected")
                            }
                            className="p-1 px-2 bg-red-50 text-red-600 hover:bg-red-100 rounded text-[10px] font-bold border border-red-200 transition-colors"
                          >
                            ✗ Rej
                          </button>
                        </div>
                      ) : (
                        <span
                          className={`text-[10px] px-2 py-0.5 rounded-full font-bold border ${adm.status === "Admitted" ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-red-50 text-red-700 border-red-200"}`}
                        >
                          {adm.status}
                        </span>
                      )}
                    </div>
                  </div>
                ))
              ) : (
                <div className="p-6 text-center text-sm font-medium text-gray-500">
                  No recent applications
                </div>
              )}
            </div>
            <div className="p-3 border-t border-gray-100 text-primary text-center mt-auto">
              <Link
                to="/admin-admissions"
                className="text-sm font-bold text-blue-600 hover:text-blue-800 cursor-pointer w-full inline-block"
              >
                View All Admissions →
              </Link>
            </div>
          </div>

          {/* Notice Board */}
          <div className="bg-white rounded-xl shadow-[0_2px_8px_rgba(0,0,0,0.08)] border border-gray-100 flex flex-col overflow-hidden">
            <div className="p-4 border-b border-gray-100 flex justify-between items-center bg-purple-50/30">
              <h3 className="text-[15px] font-bold text-[#333] border-l-4 border-purple-500 pl-2">
                📢 Latest Notices
              </h3>
              <button
                onClick={() => navigate("/notices")}
                className="bg-purple-600 text-white px-2 py-1 rounded text-xs font-bold shadow-sm hover:bg-purple-700 transition-colors flex items-center gap-1"
              >
                <PlusCircle className="w-3 h-3" /> Post
              </button>
            </div>
            <div className="flex-1 p-0 flex flex-col max-h-[300px] overflow-y-auto custom-scrollbar">
              {notices.slice(0, 3).map((n) => (
                <div
                  key={n.id}
                  onClick={() => navigate("/notices")}
                  className="p-3 border-b border-gray-50 hover:bg-purple-50/50 cursor-pointer flex flex-col gap-1.5 transition-colors"
                >
                  <div className="flex justify-between items-center gap-2">
                    <h4
                      className={`text-sm font-bold leading-tight line-clamp-1 ${n.priority === "Urgent" ? "text-red-700" : "text-gray-800"}`}
                    >
                      {n.title}
                    </h4>
                  </div>
                  <div className="flex justify-between items-center gap-2">
                    <div className="flex gap-1 items-center flex-wrap">
                      <span
                        className={`text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded border ${n.priority === "Urgent" ? "bg-red-50 text-red-700 border-red-200" : "bg-blue-50 text-blue-700 border-blue-200"}`}
                      >
                        {n.priority}
                      </span>
                      <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-gray-100 text-gray-600 border border-gray-200 truncate max-w-[100px]">
                        {(n.targets || []).join(", ") || "All"}
                      </span>
                    </div>
                    <span className="text-[10px] font-medium text-gray-400 shrink-0">
                      {formatBSDate(n.date)}
                    </span>
                  </div>
                </div>
              ))}
              {notices.length === 0 && (
                <div className="p-6 text-center text-sm font-medium text-gray-500">
                  No active notices
                </div>
              )}
            </div>
            <div className="p-3 border-t border-gray-100 text-primary text-center mt-auto">
              <Link
                to="/notices"
                className="text-sm font-bold text-blue-600 hover:text-blue-800 cursor-pointer w-full inline-block"
              >
                View All Notices →
              </Link>
            </div>
          </div>
        </div>

        {/* Section 5: Quick Action Buttons */}
        {isAdmin && (
          <motion.div variants={containerVariants} initial="hidden" animate="show" className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <motion.button
              variants={itemVariants}
              whileHover={{ y: -3, scale: 1.03, boxShadow: "0 8px 16px -4px rgba(0,0,0,0.08)" }}
              whileTap={{ scale: 0.97 }}
              onClick={() => navigate("/user-approvals")}
              className="bg-white border text-left border-gray-200 hover:border-blue-400 rounded-xl p-4 shadow-sm transition-all flex flex-col items-center justify-center gap-2 group xl:min-h-[96px] min-h-[80px]"
            >
              <UserPlus className="w-6 h-6 text-blue-500 group-hover:scale-110 transition-transform" />
              <span className="text-xs font-bold text-gray-700 text-center">
                Add Student
              </span>
            </motion.button>
            <motion.button
              variants={itemVariants}
              whileHover={{ y: -3, scale: 1.03, boxShadow: "0 8px 16px -4px rgba(0,0,0,0.08)" }}
              whileTap={{ scale: 0.97 }}
              onClick={() => navigate("/admin")}
              className="bg-white border text-left border-gray-200 hover:border-indigo-400 rounded-xl p-4 shadow-sm transition-all flex flex-col items-center justify-center gap-2 group xl:min-h-[96px] min-h-[80px]"
            >
              <Upload className="w-6 h-6 text-indigo-500 group-hover:scale-110 transition-transform" />
              <span className="text-xs font-bold text-gray-700 text-center">
                Upload Results
              </span>
            </motion.button>
            <motion.button
              variants={itemVariants}
              whileHover={{ y: -3, scale: 1.03, boxShadow: "0 8px 16px -4px rgba(0,0,0,0.08)" }}
              whileTap={{ scale: 0.97 }}
              onClick={() => navigate("/notices")}
              className="bg-white border text-left border-gray-200 hover:border-purple-400 rounded-xl p-4 shadow-sm transition-all flex flex-col items-center justify-center gap-2 group xl:min-h-[96px] min-h-[80px]"
            >
              <Megaphone className="w-6 h-6 text-purple-500 group-hover:scale-110 transition-transform" />
              <span className="text-xs font-bold text-gray-700 text-center">
                Post Notice
              </span>
            </motion.button>
            <motion.button
              variants={itemVariants}
              whileHover={{ y: -3, scale: 1.03, boxShadow: "0 8px 16px -4px rgba(0,0,0,0.08)" }}
              whileTap={{ scale: 0.97 }}
              onClick={() => navigate("/user-approvals")}
              className="bg-white border text-left border-gray-200 hover:border-cyan-400 rounded-xl p-4 shadow-sm transition-all flex flex-col items-center justify-center gap-2 group xl:min-h-[96px] min-h-[80px]"
            >
              <ShieldCheck className="w-6 h-6 text-cyan-500 group-hover:scale-110 transition-transform" />
              <span className="text-xs font-bold text-gray-700 text-center">
                Approve Users
              </span>
            </motion.button>
          </motion.div>
        )}
        {renderNoticeEditorModal()}
      </div>
    );
  }

  // --- Student Dashboard ---
  if (userRole === "student" && studentData) {
    if (isLoading) {
      return (
        <div className="flex flex-col gap-6 p-2 md:p-4">
          <div className="w-64 h-8 bg-gray-200 animate-pulse rounded mb-2"></div>
          <div className="w-48 h-4 bg-gray-200 animate-pulse rounded"></div>
        </div>
      );
    }

    return (
      <div className="flex flex-col gap-6 pb-12 bg-[#F5F6FA] min-h-full px-4 md:px-0">
        <div className="mb-2 flex flex-col md:flex-row md:items-start md:justify-between gap-4 sticky top-[-1.25rem] z-20 bg-[#F5F6FA] pt-4 pb-2 md:-mt-0 -mx-5 px-5 md:mx-0 md:px-0 md:static md:bg-transparent shadow-sm md:shadow-none border-b border-gray-200 md:border-none">
          <div>
            <h1 className="text-2xl md:text-3xl font-extrabold text-[#1a1a2e] mb-2 tracking-tight flex flex-col sm:flex-row sm:items-center gap-2">
              <span>Good {greeting}, {studentData.fullName || studentData.name} 👋</span>
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-indigo-50 text-indigo-700 text-[10px] font-black uppercase tracking-widest border border-indigo-100 w-fit md:hidden">
                🎓 Student Portal
              </span>
            </h1>
            <div className="flex flex-col">
              <p className="text-sm text-gray-500 font-medium">
                {dateString} | {bsString}
              </p>
            </div>
          </div>
        </div>

        {/* Global Scrolling Announcement */}
        {(content.announcement || true) && (content.isNoticeEnabled !== false || isAdmin) && (
          <div className={`w-full bg-white dark:bg-slate-900 border rounded-xl overflow-hidden flex flex-row shadow-sm relative mb-4 items-center h-10 select-none justify-between ${content.isNoticeEnabled === false ? 'border-dashed border-red-300 dark:border-red-900 bg-red-50/10' : 'border-gray-200 dark:border-slate-800'}`}>
            <div className="flex items-center overflow-hidden h-full flex-1">
              <div className={`${content.isNoticeEnabled === false ? 'bg-slate-400 dark:bg-slate-700' : 'bg-orange-500'} text-white text-[11px] font-bold px-3 h-full uppercase tracking-wider relative z-10 shadow-[2px_0_5px_rgba(0,0,0,0.1)] whitespace-nowrap shrink-0 flex items-center gap-1.5 rounded-l-xl`}>
                <span className={`w-1.5 h-1.5 rounded-full bg-white ${content.isNoticeEnabled === false ? '' : 'animate-pulse'}`}></span>
                {content.isNoticeEnabled === false ? 'Notice (Stopped)' : 'Notice'}
              </div>
              <div className="relative flex-1 overflow-hidden h-full flex items-center">
                <div className={`absolute whitespace-nowrap text-xs md:text-sm pl-3 ${content.isNoticeEnabled === false ? 'animate-none text-slate-400 dark:text-slate-500 italic' : 'animate-marquee text-gray-800 dark:text-gray-100 font-bold'}`}>
                  {content.isNoticeEnabled === false ? `[Notice Stopped] ${content.announcement || "🌟 Welcome to the new Shikshantar Academy Portal! Term 1 Examinations starting from next week. 🌟"}` : (content.announcement || "🌟 Welcome to the new Shikshantar Academy Portal! Term 1 Examinations starting from next week. 🌟")}
                </div>
              </div>
            </div>
            {isAdmin && (
              <button
                onClick={() => {
                  setNewAnnouncementText(content.announcement || "🌟 Welcome to the new Shikshantar Academy Portal! Term 1 Examinations starting from next week. 🌟");
                  setIsNoticeEnabledLocal(content.isNoticeEnabled !== false);
                  setIsUpdatingAnnouncement(true);
                }}
                className="bg-orange-500 hover:bg-orange-600 text-white text-[10px] font-bold px-2 md:px-2.5 py-1.5 rounded-md mr-2 z-20 flex items-center gap-1 active:scale-95 transition-all shadow-sm shrink-0"
              >
                <Edit2 className="w-3 h-3" /> <span className="hidden sm:inline">Update Notice</span>
              </button>
            )}
          </div>
        )}

        {/* Student Info Card */}
        <div className="bg-blue-600 rounded-xl p-6 text-white shadow-md relative overflow-hidden">
          <div className="absolute top-0 right-0 w-48 h-48 bg-white/10 rounded-full blur-3xl -mr-10 -mt-10"></div>
          <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 rounded-full bg-white/20 flex items-center justify-center font-bold text-xl uppercase backdrop-blur-sm shadow-inner">
                {(studentData.fullName || studentData.name || "S").substring(
                  0,
                  2,
                )}
              </div>
              <div>
                <p className="text-blue-100 text-sm font-medium uppercase tracking-wider mb-1">
                  Student Profile
                </p>
                <h2 className="text-2xl font-bold">
                  Class {studentData.class || "N/A"}
                </h2>
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => navigate("/profile")}
                className="px-5 py-2 bg-white/10 hover:bg-white/20 backdrop-blur-md rounded-lg font-bold text-sm transition-colors border border-white/20"
              >
                View Profile
              </button>
            </div>
          </div>
        </div>

        {/* Academic Performance Overview */}
        {studentResults && studentResults.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Trend Line Chart */}
            <div className="bg-white rounded-xl p-5 shadow-[0_2px_8px_rgba(0,0,0,0.08)] border border-gray-100 flex flex-col">
              <h3 className="text-[16px] font-bold text-[#333] border-l-4 border-blue-500 pl-3 mb-4">
                📈 Overall Grade Trend
              </h3>
              <div className="h-48 w-full flex-1">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart
                    data={studentResults}
                    margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
                  >
                    <CartesianGrid
                      strokeDasharray="3 3"
                      vertical={false}
                      stroke="#E2E8F0"
                    />
                    <XAxis
                      dataKey="examType"
                      tick={{ fontSize: 10, fill: "#64748b" }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis
                      domain={[0, 100]}
                      tick={{ fontSize: 10, fill: "#64748b" }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <RechartsTooltip
                      cursor={{ fill: "#f8fafc" }}
                      contentStyle={{
                        borderRadius: "8px",
                        border: "none",
                        boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)",
                      }}
                    />
                    <Line
                      type="monotone"
                      dataKey="percentage"
                      stroke="#3b82f6"
                      strokeWidth={3}
                      dot={{ r: 4, strokeWidth: 2, fill: "#fff" }}
                      activeDot={{ r: 6 }}
                      name="Percentage %"
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Latest Exam Bar Chart */}
            {studentResults[studentResults.length - 1] && (
              <div className="bg-white rounded-xl p-5 shadow-[0_2px_8px_rgba(0,0,0,0.08)] border border-gray-100 flex flex-col">
                <h3 className="text-[16px] font-bold text-[#333] border-l-4 border-emerald-500 pl-3 mb-4">
                  📊 Latest Subject Performance
                </h3>
                <div className="h-48 w-full flex-1">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={Object.entries(
                        studentResults[studentResults.length - 1].subjects ||
                          {},
                      ).map(([sub, data]: any) => ({
                        subject: sub,
                        marks:
                          data.obtained === "AB"
                            ? 0
                            : Number(data.obtained) || 0,
                      }))}
                      margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
                      barCategoryGap="20%"
                    >
                      <CartesianGrid
                        strokeDasharray="3 3"
                        vertical={false}
                        stroke="#E2E8F0"
                      />
                      <XAxis
                        dataKey="subject"
                        tick={{ fontSize: 9, fill: "#64748b" }}
                        interval={0}
                        axisLine={false}
                        tickLine={false}
                      />
                      <YAxis
                        domain={[0, 100]}
                        tick={{ fontSize: 10, fill: "#64748b" }}
                        axisLine={false}
                        tickLine={false}
                      />
                      <RechartsTooltip
                        cursor={{ fill: "#f8fafc" }}
                        contentStyle={{
                          borderRadius: "8px",
                          border: "none",
                          boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)",
                        }}
                      />
                      <Bar
                        dataKey="marks"
                        fill="#10b981"
                        radius={[4, 4, 0, 0]}
                        name="Marks Obtained"
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Quick Actions */}
        <motion.div variants={containerVariants} initial="hidden" animate="show" className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <motion.button
            variants={itemVariants}
            whileHover={{ y: -3, scale: 1.03, boxShadow: "0 8px 16px -4px rgba(0,0,0,0.08)" }}
            whileTap={{ scale: 0.97 }}
            onClick={() => navigate("/result")}
            className="bg-white border text-center hover:border-blue-500 rounded-xl p-5 shadow-sm transition-all flex flex-col items-center justify-center gap-3 group w-full cursor-pointer"
          >
            <div className="p-3 bg-blue-50 rounded-full group-hover:bg-blue-100 transition-colors">
              <PieChartIcon className="w-6 h-6 text-blue-600 group-hover:scale-110 transition-transform" />
            </div>
            <span className="text-sm font-bold text-gray-800">My Result</span>
          </motion.button>
          <motion.button
            variants={itemVariants}
            whileHover={{ y: -3, scale: 1.03, boxShadow: "0 8px 16px -4px rgba(0,0,0,0.08)" }}
            whileTap={{ scale: 0.97 }}
            onClick={() => navigate("/account")}
            className="bg-white border text-center hover:border-emerald-500 rounded-xl p-5 shadow-sm transition-all flex flex-col items-center justify-center gap-3 group w-full cursor-pointer"
          >
            <div className="p-3 bg-emerald-50 rounded-full group-hover:bg-emerald-100 transition-colors">
              <CreditCard className="w-6 h-6 text-emerald-600 group-hover:scale-110 transition-transform" />
            </div>
            <span className="text-sm font-bold text-gray-800">Fee Status</span>
          </motion.button>
          <motion.button
            variants={itemVariants}
            whileHover={{ y: -3, scale: 1.03, boxShadow: "0 8px 16px -4px rgba(0,0,0,0.08)" }}
            whileTap={{ scale: 0.97 }}
            onClick={() => navigate("/calendar")}
            className="bg-white border text-center hover:border-orange-500 rounded-xl p-5 shadow-sm transition-all flex flex-col items-center justify-center gap-3 group w-full cursor-pointer"
          >
            <div className="p-3 bg-orange-50 rounded-full group-hover:bg-orange-100 transition-colors">
              <Calendar className="w-6 h-6 text-orange-600 group-hover:scale-110 transition-transform" />
            </div>
            <span className="text-sm font-bold text-gray-800">Calendar</span>
          </motion.button>
          <motion.button
            variants={itemVariants}
            whileHover={{ y: -3, scale: 1.03, boxShadow: "0 8px 16px -4px rgba(0,0,0,0.08)" }}
            whileTap={{ scale: 0.97 }}
            onClick={() => navigate("/notices")}
            className="bg-white border text-center hover:border-purple-500 rounded-xl p-5 shadow-sm transition-all flex flex-col items-center justify-center gap-3 group w-full cursor-pointer"
          >
            <div className="p-3 bg-purple-50 rounded-full group-hover:bg-purple-100 transition-colors">
              <Megaphone className="w-6 h-6 text-purple-600 group-hover:scale-110 transition-transform" />
            </div>
            <span className="text-sm font-bold text-gray-800">Notices</span>
          </motion.button>
        </motion.div>

        {/* Notice Board Preview */}
        <div className="bg-white rounded-xl shadow-[0_2px_8px_rgba(0,0,0,0.08)] border border-gray-100 flex flex-col overflow-hidden">
          <div className="p-5 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
            <h3 className="text-[16px] font-bold text-[#333] border-l-4 border-purple-500 pl-3">
              📢 Latest Notices
            </h3>
            <Link
              to="/notices"
              className="text-sm font-bold text-blue-600 hover:text-blue-800"
            >
              View All
            </Link>
          </div>
          <div className="flex-1 p-0 flex flex-col divide-y divide-gray-50">
            {notices.slice(0, 4).map((n) => (
              <div
                key={n.id}
                onClick={() => navigate("/notices")}
                className="p-4 hover:bg-gray-50 cursor-pointer flex flex-col gap-2 transition-colors"
              >
                <div className="flex justify-between items-start gap-2">
                  <h4 className="text-sm font-bold text-gray-900 leading-tight">
                    {n.title}
                  </h4>
                  <span className="text-[10px] font-medium text-gray-400 shrink-0 mt-0.5">
                    {formatBSDate(n.date)}
                  </span>
                </div>
                <div className="flex gap-2 items-center">
                  <span
                    className={`text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border ${n.priority === "Urgent" ? "bg-red-50 text-red-700 border-red-200" : "bg-blue-50 text-blue-700 border-blue-200"}`}
                  >
                    {n.priority}
                  </span>
                </div>
              </div>
            ))}
            {notices.length === 0 && (
              <div className="p-8 text-center text-sm font-medium text-gray-500">
                No active notices for your class
              </div>
            )}
          </div>
        </div>
        {renderNoticeEditorModal()}
      </div>
    );
  }

  // --- Teacher Dashboard ---
  if (userRole === "teacher" && studentData) {
    if (isLoading) {
      return (
        <div className="flex flex-col gap-6 p-2 md:p-4">
          <div className="w-64 h-8 bg-gray-200 animate-pulse rounded mb-2"></div>
          <div className="w-48 h-4 bg-gray-200 animate-pulse rounded"></div>
        </div>
      );
    }

    const handlePublishClassResults = async (examId: string) => {
      if (!studentData.class) return;
      const selectedExam = unpublishedExams.find(ex => ex.id === examId);
      const examName = selectedExam ? selectedExam.name : "Exam";
      
      setPublishStatusMessage(`⏳ Fetching results for Class ${studentData.class}...`);
      try {
        // 1. Fetch all student summaries for this class & exam
        const summariesSnap = await getDocs(
          query(
            collection(db, "resultSummary"),
            where("examId", "==", examId),
            where("class", "==", studentData.class)
          )
        );

        if (summariesSnap.empty) {
          setPublishStatusMessage("⚠️ No student results found for this exam and class in resultSummary.");
          setTimeout(() => setPublishStatusMessage(""), 5000);
          return;
        }

        setPublishStatusMessage("⚡ Calculating highest marks and class averages...");

        // 2. Fetch all raw results (subjects) for this class & exam to calculate highest marks
        const resultsSnap = await getDocs(
          query(
            collection(db, "results"),
            where("examId", "==", examId),
            where("class", "==", studentData.class)
          )
        );

        const highestMarks: Record<string, number> = {};
        const sumMarks: Record<string, number> = {};
        const countMarks: Record<string, number> = {};

        resultsSnap.forEach((docSnap) => {
          const d = docSnap.data();
          const sub = d.subject;
          const obtained = d.marks === "AB" ? 0 : Number(d.marks) || 0;
          if (!highestMarks[sub] || highestMarks[sub] < obtained) {
            highestMarks[sub] = obtained;
          }
          if (!sumMarks[sub]) { sumMarks[sub] = 0; countMarks[sub] = 0; }
          sumMarks[sub] += obtained;
          countMarks[sub] += 1;
        });

        const classAverages: Record<string, number> = {};
        Object.keys(sumMarks).forEach(sub => {
          classAverages[sub] = countMarks[sub] > 0 ? sumMarks[sub] / countMarks[sub] : 0;
        });

        // 3. Write updates in a batch
        const batch = writeBatch(db);

        // Update all result summaries for this class to set published: true
        summariesSnap.forEach((docSnap) => {
          batch.update(docSnap.ref, { published: true });
        });

        // Create a nice notification notice
        const noticeRef = doc(collection(db, "notices"));
        batch.set(noticeRef, {
          title: `Class ${studentData.class} Results Published: ${examName}`,
          message: `The results for ${examName} have been officially published by Class Teacher ${studentData.fullName || studentData.name || 'Teacher'} for Class ${studentData.class}. Students and parents can now view and download report cards.`,
          date: new Date().toISOString().split('T')[0],
          priority: 'Urgent',
          targets: ['Student', 'Guardian'],
          isPinned: false,
          status: 'Published',
          timestamp: new Date().toISOString()
        });

        await batch.commit();

        setPublishStatusMessage(`✅ Successfully published results for Class ${studentData.class}!`);
        setTimeout(() => setPublishStatusMessage(""), 5000);
      } catch (err: any) {
        console.error("Failed publishing class results:", err);
        setPublishStatusMessage(`❌ Error: ${err.message || err}`);
        setTimeout(() => setPublishStatusMessage(""), 5000);
      }
    };

    return (
      <div className="flex flex-col gap-6 pb-12 bg-[#F5F6FA] min-h-full px-4 md:px-0">
        <div className="mb-2 flex flex-col md:flex-row md:items-start md:justify-between gap-4 sticky top-[-1.25rem] z-20 bg-[#F5F6FA] pt-4 pb-2 md:-mt-0 -mx-5 px-5 md:mx-0 md:px-0 md:static md:bg-transparent shadow-sm md:shadow-none border-b border-gray-200 md:border-none">
          <div>
            <h1 className="text-2xl md:text-3xl font-extrabold text-[#1a1a2e] mb-2 tracking-tight flex flex-col sm:flex-row sm:items-center gap-2">
              <span>Good {greeting}, {studentData.fullName || studentData.name} 👋</span>
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 text-[10px] font-black uppercase tracking-widest border border-emerald-100 w-fit md:hidden">
                🧑‍🏫 Teacher Portal
              </span>
            </h1>
            <div className="flex flex-col">
              <p className="text-sm text-gray-500 font-medium">
                {dateString} | {bsString}
              </p>
            </div>
          </div>
        </div>

        {/* Global Scrolling Announcement */}
        {(content.announcement || true) && (content.isNoticeEnabled !== false || isAdmin) && (
          <div className={`w-full bg-white dark:bg-slate-900 border rounded-xl overflow-hidden flex flex-row shadow-sm relative mb-4 items-center h-10 select-none justify-between ${content.isNoticeEnabled === false ? 'border-dashed border-red-300 dark:border-red-900 bg-red-50/10' : 'border-gray-200 dark:border-slate-800'}`}>
            <div className="flex items-center overflow-hidden h-full flex-1">
              <div className={`${content.isNoticeEnabled === false ? 'bg-slate-400 dark:bg-slate-700' : 'bg-orange-500'} text-white text-[11px] font-bold px-3 h-full uppercase tracking-wider relative z-10 shadow-[2px_0_5px_rgba(0,0,0,0.1)] whitespace-nowrap shrink-0 flex items-center gap-1.5 rounded-l-xl`}>
                <span className={`w-1.5 h-1.5 rounded-full bg-white ${content.isNoticeEnabled === false ? '' : 'animate-pulse'}`}></span>
                {content.isNoticeEnabled === false ? 'Notice (Stopped)' : 'Notice'}
              </div>
              <div className="relative flex-1 overflow-hidden h-full flex items-center">
                <div className={`absolute whitespace-nowrap text-xs md:text-sm pl-3 ${content.isNoticeEnabled === false ? 'animate-none text-slate-400 dark:text-slate-500 italic' : 'animate-marquee text-gray-800 dark:text-gray-100 font-bold'}`}>
                  {content.isNoticeEnabled === false ? `[Notice Stopped] ${content.announcement || "🌟 Welcome to the new Shikshantar Academy Portal! Term 1 Examinations starting from next week. 🌟"}` : (content.announcement || "🌟 Welcome to the new Shikshantar Academy Portal! Term 1 Examinations starting from next week. 🌟")}
                </div>
              </div>
            </div>
            {isAdmin && (
              <button
                onClick={() => {
                  setNewAnnouncementText(content.announcement || "🌟 Welcome to the new Shikshantar Academy Portal! Term 1 Examinations starting from next week. 🌟");
                  setIsNoticeEnabledLocal(content.isNoticeEnabled !== false);
                  setIsUpdatingAnnouncement(true);
                }}
                className="bg-orange-500 hover:bg-orange-600 text-white text-[10px] font-bold px-2 md:px-2.5 py-1.5 rounded-md mr-2 z-20 flex items-center gap-1 active:scale-95 transition-all shadow-sm shrink-0"
              >
                <Edit2 className="w-3 h-3" /> <span className="hidden sm:inline">Update Notice</span>
              </button>
            )}
          </div>
        )}

        {/* Teacher Info Card */}
        <div className="bg-indigo-600 rounded-xl p-6 text-white shadow-md relative overflow-hidden">
          <div className="absolute top-0 right-0 w-48 h-48 bg-white/10 rounded-full blur-3xl -mr-10 -mt-10"></div>
          <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 rounded-full bg-white/20 flex items-center justify-center font-bold text-xl uppercase backdrop-blur-sm shadow-inner">
                {(studentData.fullName || studentData.name || "T").substring(
                  0,
                  2,
                )}
              </div>
              <div>
                <h2 className="text-2xl font-bold">Teacher Dashboard</h2>
                <p className="text-indigo-100 text-sm font-medium mt-1">
                  Manage classes, marks, notices & view salary history
                </p>
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => navigate("/profile")}
                className="px-5 py-2 bg-white/10 hover:bg-white/20 backdrop-blur-md rounded-lg font-bold text-sm transition-colors border border-white/20"
              >
                View Profile
              </button>
            </div>
          </div>
        </div>

        {/* Quick Actions */}
        <motion.div variants={containerVariants} initial="hidden" animate="show" className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <motion.button
            variants={itemVariants}
            whileHover={{ y: -3, scale: 1.03, boxShadow: "0 8px 16px -4px rgba(0,0,0,0.08)" }}
            whileTap={{ scale: 0.97 }}
            onClick={() => navigate("/admin")}
            className="bg-white border text-center hover:border-indigo-500 rounded-xl p-5 shadow-sm transition-all flex flex-col items-center justify-center gap-3 group w-full cursor-pointer"
          >
            <div className="p-3 bg-indigo-50 rounded-full group-hover:bg-indigo-100 transition-colors">
              <Edit2 className="w-6 h-6 text-indigo-600 group-hover:scale-110 transition-transform" />
            </div>
            <span className="text-sm font-bold text-gray-800">
              Manage Results
            </span>
          </motion.button>
          <motion.button
            variants={itemVariants}
            whileHover={{ y: -3, scale: 1.03, boxShadow: "0 8px 16px -4px rgba(0,0,0,0.08)" }}
            whileTap={{ scale: 0.97 }}
            onClick={() => navigate("/teacher-salary")}
            className="bg-white border text-center hover:border-emerald-500 rounded-xl p-5 shadow-sm transition-all flex flex-col items-center justify-center gap-3 group w-full cursor-pointer"
          >
            <div className="p-3 bg-emerald-50 rounded-full group-hover:bg-emerald-100 transition-colors">
              <CreditCard className="w-6 h-6 text-emerald-600 group-hover:scale-110 transition-transform" />
            </div>
            <span className="text-sm font-bold text-gray-800">
              Salary Status
            </span>
          </motion.button>
          <motion.button
            variants={itemVariants}
            whileHover={{ y: -3, scale: 1.03, boxShadow: "0 8px 16px -4px rgba(0,0,0,0.08)" }}
            whileTap={{ scale: 0.97 }}
            onClick={() => navigate("/calendar")}
            className="bg-white border text-center hover:border-orange-500 rounded-xl p-5 shadow-sm transition-all flex flex-col items-center justify-center gap-3 group w-full cursor-pointer"
          >
            <div className="p-3 bg-orange-50 rounded-full group-hover:bg-orange-100 transition-colors">
              <Calendar className="w-6 h-6 text-orange-600 group-hover:scale-110 transition-transform" />
            </div>
            <span className="text-sm font-bold text-gray-800">Calendar</span>
          </motion.button>
          <motion.button
            variants={itemVariants}
            whileHover={{ y: -3, scale: 1.03, boxShadow: "0 8px 16px -4px rgba(0,0,0,0.08)" }}
            whileTap={{ scale: 0.97 }}
            onClick={() => navigate("/notices")}
            className="bg-white border text-center hover:border-purple-500 rounded-xl p-5 shadow-sm transition-all flex flex-col items-center justify-center gap-3 group w-full cursor-pointer"
          >
            <div className="p-3 bg-purple-50 rounded-full group-hover:bg-purple-100 transition-colors">
              <Megaphone className="w-6 h-6 text-purple-600 group-hover:scale-110 transition-transform" />
            </div>
            <span className="text-sm font-bold text-gray-800">Notices</span>
          </motion.button>
        </motion.div>

        {/* Classes and Subjects Badges */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <h2 className="text-sm font-black uppercase tracking-widest text-[#1a1a2e] mb-4 flex items-center gap-2">
            <BookOpen className="w-5 h-5 text-indigo-500" />
            Classes & Subjects Assignment
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <span className="text-xs text-gray-400 font-bold uppercase tracking-wider block mb-2">Class Teacher Designation</span>
              {studentData.class ? (
                <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-emerald-50 border border-emerald-200 text-emerald-800 font-bold text-sm rounded-lg">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                  Class {studentData.class} Teacher
                </div>
              ) : (
                <span className="text-sm text-gray-500 italic font-medium">No main class assigned as Class Teacher</span>
              )}
            </div>
            <div>
              <span className="text-xs text-gray-400 font-bold uppercase tracking-wider block mb-2">Assigned Classes & Subjects</span>
              <div className="flex flex-wrap gap-2">
                {(studentData.assignedClasses || []).map((cls: string) => (
                  <span key={cls} className="px-2.5 py-1 bg-indigo-50 border border-indigo-100 text-indigo-700 text-xs font-black rounded-lg">
                    Class {cls}
                  </span>
                ))}
                {(studentData.assignedSubjects || []).map((sub: string) => (
                  <span key={sub} className="px-2.5 py-1 bg-purple-50 border border-purple-100 text-purple-700 text-xs font-black rounded-lg">
                    {sub}
                  </span>
                ))}
                {(!studentData.assignedClasses?.length && !studentData.assignedSubjects?.length) && (
                  <span className="text-sm text-gray-500 italic font-medium">No additional subjects or classes listed</span>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Salary Status Card */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 pb-4 border-b border-gray-50">
            <div>
              <h2 className="text-sm font-black uppercase tracking-widest text-[#1a1a2e] flex items-center gap-2">
                <CreditCard className="w-5 h-5 text-emerald-500" />
                Salary Status Tracker
              </h2>
              <p className="text-xs text-gray-400 font-bold mt-1 uppercase tracking-wider">
                Annual Salary Tracking & Benefits Pipeline
              </p>
            </div>
            <button 
              onClick={() => navigate('/teacher-salary')} 
              className="px-4 py-2.5 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 transition-all rounded-xl text-xs font-black uppercase tracking-widest border border-indigo-100/50 flex items-center gap-2 hover:scale-101 shadow-sm self-start sm:self-center"
            >
              My Salary Dashboard
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
            <div className="bg-gradient-to-br from-indigo-50/60 to-purple-50/60 border border-indigo-100/30 p-4 rounded-xl">
              <span className="text-[10px] font-black uppercase tracking-widest text-indigo-400 block">Total Months Paid</span>
              <p className="text-2xl font-black text-indigo-950 mt-1">{teacherSalaries.filter(s => s.status === 'Paid').length} / 12 Months</p>
              <div className="w-full bg-indigo-100 h-2 rounded-full mt-2 overflow-hidden">
                <div 
                  className="bg-indigo-600 h-full rounded-full transition-all duration-500" 
                  style={{ width: `${(teacherSalaries.filter(s => s.status === 'Paid').length / 12) * 100}%` }}
                ></div>
              </div>
            </div>

            <div className="bg-gradient-to-br from-emerald-50/60 to-teal-50/60 border border-emerald-100/30 p-4 rounded-xl">
              <span className="text-[10px] font-black uppercase tracking-widest text-emerald-500 block">Current Paid Range</span>
              <p className="text-xs font-black text-emerald-950 mt-2">
                {(() => {
                  const nepaliMonthsList = [
                    "Baisakh", "Jestha", "Asar", "Shrawan", "Bhadra", "Ashwin", 
                    "Kartik", "Mangsir", "Poush", "Magh", "Falgun", "Chaitra"
                  ];
                  const paidSalaries = teacherSalaries.filter(s => s.status === 'Paid');
                  if (paidSalaries.length === 0) return "No payments recorded yet";
                  
                  const sortedPaid = [...paidSalaries].sort((a, b) => {
                    const idxA = nepaliMonthsList.indexOf(a.month);
                    const idxB = nepaliMonthsList.indexOf(b.month);
                    if (a.year !== b.year) return Number(a.year) - Number(b.year);
                    return idxA - idxB;
                  });
                  const earliest = sortedPaid[0];
                  const latest = sortedPaid[sortedPaid.length - 1];
                  return sortedPaid.length === 1 
                    ? `${earliest.month} ${earliest.year}`
                    : `From ${earliest.month} ${earliest.year} to ${latest.month} ${latest.year}`;
                })()}
              </p>
              <span className="text-[10px] text-emerald-600 font-bold mt-1.5 block">Verified by Academy Registrar</span>
            </div>

            <div className="bg-gray-50 border border-gray-100 p-4 rounded-xl flex flex-col justify-between">
              <div>
                <span className="text-[10px] font-black uppercase tracking-widest text-gray-400 block">Latest Payout</span>
                {latestSalary ? (
                  <div className="mt-1 flex items-baseline gap-1.5">
                    <span className="text-xl font-black text-gray-900">NRs. {latestSalary.netPay?.toLocaleString()}</span>
                    <span className="text-[10px] font-bold text-gray-400">({latestSalary.month})</span>
                  </div>
                ) : (
                  <p className="text-sm text-gray-500 italic mt-1">No payments yet</p>
                )}
              </div>
              <div className="flex items-center gap-1.5 mt-2">
                <span className={`w-2 h-2 rounded-full ${latestSalary && latestSalary.status === 'Paid' ? 'bg-emerald-500' : 'bg-red-500 animate-pulse'}`}></span>
                <span className="text-[10px] font-black uppercase tracking-widest text-gray-700">
                  {latestSalary ? (latestSalary.status === 'Paid' ? `Paid on ${latestSalary.date}` : 'Unpaid') : 'No salary processed'}
                </span>
              </div>
            </div>
          </div>

          <div>
            <h3 className="text-[11px] font-black uppercase tracking-widest text-gray-400 mb-3 pl-1">Annual Fiscal Period Checklist (12 Months Pipeline)</h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-2.5">
              {[
                "Baisakh", "Jestha", "Asar", "Shrawan", "Bhadra", "Ashwin", 
                "Kartik", "Mangsir", "Poush", "Magh", "Falgun", "Chaitra"
              ].map(m => {
                const rec = teacherSalaries.find(s => s.month === m);
                const isPaid = rec && rec.status === 'Paid';
                const isUnpaid = rec && rec.status === 'Unpaid';
                
                let bgClass = "bg-gray-50/50 border border-gray-100 text-gray-400";
                let statusLabel = "Not Issued";
                let statusDot = "bg-gray-300";
                
                if (isPaid) {
                  bgClass = "bg-emerald-50 border-emerald-100 text-emerald-800";
                  statusLabel = "Paid";
                  statusDot = "bg-emerald-500";
                } else if (isUnpaid) {
                  bgClass = "bg-rose-50 border-rose-100 text-rose-800 animate-pulse";
                  statusLabel = "Unpaid";
                  statusDot = "bg-rose-500";
                }
                
                return (
                  <div key={m} className={`p-3 rounded-xl text-center flex flex-col justify-between items-center transition-all border ${bgClass}`}>
                    <span className="text-xs font-black uppercase tracking-wider block">{m}</span>
                    <div className="flex items-center gap-1.5 mt-1.5">
                      <span className={`w-1.5 h-1.5 rounded-full ${statusDot}`}></span>
                      <span className="text-[9px] font-black uppercase tracking-widest">{statusLabel}</span>
                    </div>
                    {rec && (
                      <span className="text-[10px] font-extrabold block mt-1.5 opacity-80">
                        NRs. {rec.netPay?.toLocaleString()}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Publish Results Widget */}
        {studentData.class && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
            <div className="flex flex-col md:flex-row md:items-start justify-between gap-4 mb-4">
              <div>
                <h2 className="text-sm font-black uppercase tracking-widest text-[#1a1a2e] flex items-center gap-2">
                  <Trophy className="w-5 h-5 text-orange-500" />
                  Publish Exam Results for Class {studentData.class}
                </h2>
                <p className="text-xs text-gray-500 mt-1 font-semibold">
                  As the Class Teacher of Class {studentData.class}, you can officially publish finished exam results. Once published, the results and report cards instantly become visible on the students' and parents' dashboards.
                </p>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-3 items-end max-w-xl">
              <div className="flex-1 w-full">
                <label className="block text-[10px] font-black uppercase tracking-widest text-gray-400 mb-1">Select Exam to Publish</label>
                <select 
                  value={selectedPublishExamId} 
                  onChange={(e) => setSelectedPublishExamId(e.target.value)}
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-2.5 text-sm font-bold text-gray-700 focus:outline-none focus:border-indigo-500 cursor-pointer"
                >
                  <option value="">-- Choose Exam --</option>
                  {unpublishedExams.map(ex => (
                    <option key={ex.id} value={ex.id}>{ex.name}</option>
                  ))}
                </select>
              </div>
              <button 
                onClick={() => handlePublishClassResults(selectedPublishExamId)}
                disabled={!selectedPublishExamId}
                className={`w-full sm:w-auto px-6 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest text-white shadow-md transition-all ${!selectedPublishExamId ? 'bg-gray-300 cursor-not-allowed' : 'bg-indigo-600 hover:bg-indigo-700 hover:scale-101'}`}
              >
                Publish Results
              </button>
            </div>

            {publishStatusMessage && (
              <p className="mt-3 text-xs font-bold text-indigo-600 bg-indigo-50/50 p-2.5 rounded-lg border border-indigo-100">{publishStatusMessage}</p>
            )}

            {/* Quick Link Helper / Entry Arrow */}
            <div className="mt-6 p-4 bg-gradient-to-r from-indigo-50/60 to-blue-50/60 border border-indigo-100/50 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-start gap-3">
                <span className="text-xl shrink-0 mt-0.5">📝</span>
                <div>
                  <p className="text-xs font-black text-indigo-950 uppercase tracking-wider">Need to Enter or Update Marks First?</p>
                  <p className="text-[11px] text-indigo-700/80 font-bold mt-0.5">Input individual subject marks, view class metrics, or configure custom grades before publishing.</p>
                </div>
              </div>
              <button 
                onClick={() => navigate("/admin")}
                className="inline-flex items-center gap-2 px-4 py-2 bg-white hover:bg-indigo-50 text-indigo-700 text-[11px] font-black uppercase tracking-widest rounded-xl border border-indigo-200 shadow-sm transition-all shrink-0 self-start sm:self-center group"
              >
                Go to Marks Entry
                <ArrowRight className="w-3.5 h-3.5 transform group-hover:translate-x-1 transition-transform text-indigo-600" />
              </button>
            </div>
          </div>
        )}

        {/* Notice Board Preview */}
        <div className="bg-white rounded-xl shadow-[0_2px_8px_rgba(0,0,0,0.08)] border border-gray-100 flex flex-col overflow-hidden">
          <div className="p-5 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
            <h3 className="text-[16px] font-bold text-[#333] border-l-4 border-purple-500 pl-3">
              📢 Latest Notices
            </h3>
            <Link
              to="/notices"
              className="text-sm font-bold text-blue-600 hover:text-blue-800"
            >
              View All
            </Link>
          </div>
          <div className="flex-1 p-0 flex flex-col divide-y divide-gray-50">
            {notices.slice(0, 4).map((n) => (
              <div
                key={n.id}
                onClick={() => navigate("/notices")}
                className="p-4 hover:bg-gray-50 cursor-pointer flex flex-col gap-2 transition-colors"
              >
                <div className="flex justify-between items-start gap-2">
                  <h4 className="text-sm font-bold text-gray-900 leading-tight">
                    {n.title}
                  </h4>
                  <span className="text-[10px] font-medium text-gray-400 shrink-0 mt-0.5">
                    {formatBSDate(n.date)}
                  </span>
                </div>
                <div className="flex gap-2 items-center">
                  <span
                    className={`text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border ${n.priority === "Urgent" ? "bg-red-50 text-red-700 border-red-200" : "bg-blue-50 text-blue-700 border-blue-200"}`}
                  >
                    {n.priority}
                  </span>
                </div>
              </div>
            ))}
            {notices.length === 0 && (
              <div className="p-8 text-center text-sm font-medium text-gray-500">
                No active notices
              </div>
            )}
          </div>
        </div>
        {renderNoticeEditorModal()}
      </div>
    );
  }

  const handleEnquirySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setEnquiryError("");

    if (!enquiryName.trim()) {
      setEnquiryError("Parent / Guardian name is required.");
      return;
    }
    if (!enquiryStudentName.trim()) {
      setEnquiryError("Student / Child Name is required for academic logging.");
      return;
    }
    if (!enquiryGrade) {
      setEnquiryError("Please select the target Admission Grade.");
      return;
    }
    // Clean and validate phone number
    const cleanPhone = enquiryPhone.replace(/\D/g, "");
    if (cleanPhone.length !== 10) {
      setEnquiryError("Please enter a valid 10-digit Nepalese mobile number.");
      return;
    }
    // Validate email if present
    if (enquiryEmail.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(enquiryEmail)) {
      setEnquiryError("Please enter a valid email identifier.");
      return;
    }

    setEnquiryLoading(true);
    try {
      const combinedMessage = `🏫 Student: ${enquiryStudentName.trim()}\n🎓 Grade: ${enquiryGrade}\n📧 Contact Email: ${enquiryEmail.trim() || "N/A"}\n💬 Message: ${enquiryMessage.trim() || "N/A"}`;

      await setDoc(doc(collection(db, "contact_enquiries")), {
        name: enquiryName.trim(),
        studentName: enquiryStudentName.trim(),
        grade: enquiryGrade,
        phone: cleanPhone,
        email: enquiryEmail.trim() || "",
        message: combinedMessage,
        rawMessage: enquiryMessage.trim() || "",
        createdAt: new Date().toISOString(),
        status: "unread"
      });
      setEnquiryRefId(`ENQ-${Date.now().toString().slice(-6)}`);
      setEnquirySuccess(true);
    } catch (err) {
      console.error("Enquiry submit error:", err);
      setEnquiryError("Failed to register. Please check your internet connection.");
    } finally {
      setEnquiryLoading(false);
    }
  };



  // --- Public View below ---
  return (
    <div className="flex flex-col bg-[#FAFAF8] dark:bg-[#0b0f19] w-full min-h-screen text-[#1A1A2E] dark:text-gray-100 relative overflow-hidden">
      <Helmet>
        <title>
          {content.tagline2 || "Shikshantar Academy"} | Outstanding Education in Siraha
        </title>
        <meta
          name="description"
          content={
            content.description
              ? content.description.slice(0, 160)
              : "Shikshantar Academy provides quality education, expert faculty, and modern facilities from Play Group to Class 10 in Siraha, Nepal."
          }
        />
        <meta
          name="keywords"
          content="Shikshantar Academy, School in Siraha, Best school in Bastipur, Quality Education Nepal, SEE Preparation, English Medium School Siraha"
        />
        <link rel="canonical" href="https://www.shikshantaracademy.edu.np" />
        <link rel="preload" href={logoImage} as="image" />
        <meta
          property="og:title"
          content={`${content.tagline2 || "Shikshantar Academy"} | Inspiring Minds`}
        />
        <meta
          property="og:description"
          content={
            content.description
              ? content.description.slice(0, 160)
              : "Nurturing minds and building character in the heart of Siraha. Modern facilities, expert faculty, and a commitment to excellence."
          }
        />
        <script type="application/ld+json">
          {JSON.stringify({
            "@context": "https://schema.org",
            "@type": "EducationalOrganization",
            name: "Shikshantar Academy",
            description:
              content.description ||
              "Nurturing minds and building character in the heart of Siraha.",
            image: logoImage,
            address: {
              "@type": "PostalAddress",
              addressLocality: "Siraha",
              addressRegion: "Madhesh Pradesh",
              addressCountry: "NP",
            },
            telephone: content.contactPhone || "+977 9709867048, +977 9807790805",
          })}
        </script>
      </Helmet>

      {/* 1. Notice Announcement Ticker */}
      {(content.announcement || true) && (content.isNoticeEnabled !== false || isAdmin) && (
        <div className={`w-full h-10 md:h-[44px] flex items-center overflow-hidden border-b z-30 select-none justify-between relative lg:sticky lg:top-0 ${content.isNoticeEnabled === false ? 'bg-red-50/10 dark:bg-slate-900 border-dashed border-red-300 dark:border-red-900' : 'bg-[#F0A500] dark:bg-amber-600 border-[#F0A500]/25'}`}>
          <div className="flex items-center overflow-hidden h-full flex-1">
            <div className={`${content.isNoticeEnabled === false ? 'bg-slate-400 dark:bg-slate-700' : 'bg-[#1B4F72] dark:bg-[#111827]'} text-white text-[10px] md:text-xs font-black uppercase tracking-widest px-3 md:px-5 h-full flex items-center z-10 whitespace-nowrap shrink-0 shadow-[4px_0_10px_rgba(0,0,0,0.15)] font-poppins`}>
              📢 <span className="hidden sm:inline ml-1">{content.isNoticeEnabled === false ? 'Notice (Stopped):' : 'Notice Update:'}</span><span className="sm:hidden ml-1">{content.isNoticeEnabled === false ? 'Stopped:' : 'Notice:'}</span>
            </div>
            <div className="relative flex-1 overflow-hidden h-full flex items-center">
              <div className={`absolute whitespace-nowrap text-xs md:text-sm h-full flex items-center ${content.isNoticeEnabled === false ? 'animate-none text-slate-400 dark:text-slate-500 italic pl-3' : 'animate-marquee text-white font-bold'}`}>
                {content.isNoticeEnabled === false ? `[Notice Stopped] ${content.announcement || "🌟 Welcome to the new Shikshantar Academy Portal! Term 1 Examinations starting from next week. 🌟"}` : (content.announcement || "🌟 Welcome to the new Shikshantar Academy Portal! Term 1 Examinations starting from next week. 🌟")}
              </div>
            </div>
          </div>
          {isAdmin && (
            <button
              onClick={() => {
                setNewAnnouncementText(content.announcement || "🌟 Welcome to the new Shikshantar Academy Portal! Term 1 Examinations starting from next week. 🌟");
                setIsNoticeEnabledLocal(content.isNoticeEnabled !== false);
                setIsUpdatingAnnouncement(true);
              }}
              className="bg-[#1B4F72] hover:bg-[#21618C] text-white text-[10px] md:text-xs font-bold px-3 py-1.5 md:py-2 rounded-md mx-2 z-20 flex items-center gap-1 active:scale-95 transition-all shadow-sm shrink-0 whitespace-nowrap"
            >
              <Edit2 className="w-3 h-3 shrink-0" /> <span className="hidden sm:inline">Update Notice</span>
            </button>
          )}
        </div>
      )}

      {/* 2. Hero Section - Professional Academic Institutional Showcase */}
      <section 
        className="relative h-[660px] sm:h-[640px] md:h-[600px] lg:h-[640px] xl:h-[680px] max-h-[92vh] min-h-[520px] overflow-hidden select-none w-full bg-[#071726]"
      >
        {/* Subtle background ambient lighting */}
        <div className="absolute inset-0 bg-gradient-to-r from-[#040e18] via-[#092238] to-[#040e18] opacity-95"></div>

        {[
          {
            id: 0,
            tabLabel: "Principal's Vision",
            category: "Academic Leadership",
            image: principalImageSrc,
            badge: "Academic Leadership & Vision",
            title: "Inspiring Character, Intellect & Moral Values",
            desc: "Under the dedicated leadership of Founder Principal Mr. Pappu Kumar Jha, Shikshantar Academy nurtures every child with quality English-medium education, disciplined guidance, and enduring moral values in Bastipur, Karjanha.",
            link: "/about",
            cta: "Explore Our Story",
            secondaryLink: "/admission",
            secondaryCta: "Admission Enquiry",
            isLogoSlide: false,
            objectPosition: "object-[center_68%] md:object-[center_62%]",
            imageClassName: "scale-110 md:scale-105",
            cardTitle: "Mr. Pappu Kumar Jha",
            cardSubtitle: "Founder Principal & Academic Director"
          },
          {
            id: 1,
            tabLabel: "BALA Smart Campus",
            category: "Interactive Environment",
            image: content.slide2Image || "https://images.unsplash.com/photo-1503676260728-1c00da094a0b?q=80&w=1200&auto=format&fit=crop",
            badge: content.slide2Badge || "Building as a Learning Aid",
            title: content.slide2Title || "Building as a Learning Aid (BALA)",
            desc: content.slide2Desc || "Every wall and corridor teaches a lesson. Custom educational murals, Nepali Barnamala alphabets, mathematics curves, and geographical maps encourage natural curiosity and intuitive learning.",
            link: content.slide2Link || "/facilities",
            cta: content.slide2Cta ? content.slide2Cta.replace(/[📜📝🎨🏛️🖼️📞→]/g, "").trim() : "Tour BALA Classrooms",
            secondaryLink: "/facilities",
            secondaryCta: "View Facilities",
            isLogoSlide: false,
            isBalaSlide: true,
            objectPosition: "object-[center_72%] md:object-right-bottom",
            cardTitle: "BALA Smart Classrooms",
            cardSubtitle: "Curriculum-Integrated Educational Walls"
          },
          {
            id: 2,
            tabLabel: "Academy Heritage",
            category: "Institutional Legacy",
            image: logoImage,
            badge: "Institutional Heritage",
            title: "A Decade of Community Trust & Excellence",
            desc: "Serving Bastipur, Karjanha since 2072 B.S. with committed educators, comprehensive student support, and a proven track record of 100% SEE board success.",
            link: "/about",
            cta: "Discover Our Vision",
            secondaryLink: "/contact",
            secondaryCta: "Contact School Office",
            isLogoSlide: true,
            objectPosition: "object-center",
            cardTitle: "Shikshantar Academy",
            cardSubtitle: "Estd. 2072 B.S. • Bastipur, Siraha"
          }
        ].map((slide, idx) => (
          <div
            key={idx}
            className={`absolute inset-0 w-full h-full flex flex-col md:flex-row transition-all duration-1000 ease-in-out ${
              currentSlide === idx ? "opacity-100 scale-100 z-10" : "opacity-0 scale-102 z-0 pointer-events-none"
            }`}
          >
            {/* Left Column: Dignified Academic Editorial Panel */}
            <div className="w-full h-[56%] sm:h-[52%] md:h-full md:w-[50%] lg:w-[46%] xl:w-[42%] flex flex-col justify-start pt-5 sm:pt-7 md:justify-center bg-gradient-to-br from-[#0c2b42] via-[#092236] to-[#04121e] p-6 sm:p-8 md:p-10 lg:p-12 xl:p-14 z-20 relative text-white border-b-4 md:border-b-0 md:border-r-4 border-[#F0A500] shadow-[16px_0_35px_rgba(0,0,0,0.65)]">
              {/* Subtle watermark logo for institutional texture */}
              <div className="absolute inset-0 opacity-[0.02] bg-center bg-no-repeat bg-contain pointer-events-none select-none" style={{ backgroundImage: `url(${logoImage})`, backgroundSize: '75%' }}></div>
              
              <div className="space-y-3 sm:space-y-4 md:space-y-4.5 relative z-10">
                {/* School Header Tag */}
                <div className="flex items-center gap-2">
                  <span className="text-[10px] sm:text-[11px] font-bold tracking-widest text-[#F0A500] uppercase font-poppins">
                    {slide.badge}
                  </span>
                  <span className="text-white/30 text-xs">•</span>
                  <span className="text-[10px] sm:text-[11px] text-slate-300 font-medium tracking-wide">
                    Bastipur, Karjanha
                  </span>
                </div>

                {/* Main Heading */}
                <h1 className="text-xl sm:text-2xl md:text-3xl lg:text-4xl xl:text-[40px] font-display font-bold leading-tight md:leading-[1.18] text-white tracking-tight drop-shadow-md">
                  {slide.title}
                </h1>

                {/* Description */}
                <p className="text-xs sm:text-sm md:text-sm lg:text-[15px] text-slate-200 max-w-xl leading-relaxed drop-shadow-sm font-poppins font-normal line-clamp-3 md:line-clamp-none">
                  {slide.desc}
                </p>

                {/* Refined Academic Highlights */}
                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <span className="px-2.5 py-1 rounded-md bg-white/10 text-white/90 text-[11px] font-medium backdrop-blur-sm border border-white/10">
                    100% SEE Board Success
                  </span>
                  <span className="px-2.5 py-1 rounded-md bg-white/10 text-white/90 text-[11px] font-medium backdrop-blur-sm border border-white/10">
                    Playgroup to Grade 10
                  </span>
                  <span className="px-2.5 py-1 rounded-md bg-white/10 text-white/90 text-[11px] font-medium backdrop-blur-sm border border-white/10 hidden sm:inline-flex">
                    Estd. 2072 B.S.
                  </span>
                </div>

                {/* Action Buttons */}
                <div className="flex flex-wrap items-center gap-3 pt-2">
                  {slide.link.startsWith("tel:") ? (
                    <a
                      href={slide.link}
                      className="bg-[#F0A500] hover:bg-[#D4900A] text-slate-950 px-5 py-2.5 md:px-6 md:py-3 rounded-lg text-xs md:text-sm font-bold tracking-wide transition-all shadow-md active:scale-95 flex items-center gap-2"
                    >
                      <span>{slide.cta}</span>
                      <ArrowRight className="w-4 h-4" />
                    </a>
                  ) : (
                    <Link
                      to={slide.link}
                      className="bg-[#F0A500] hover:bg-[#D4900A] text-slate-950 px-5 py-2.5 md:px-6 md:py-3 rounded-lg text-xs md:text-sm font-bold tracking-wide transition-all shadow-md active:scale-95 flex items-center gap-2"
                    >
                      <span>{slide.cta}</span>
                      <ArrowRight className="w-4 h-4" />
                    </Link>
                  )}

                  {slide.secondaryLink && (
                    <Link
                      to={slide.secondaryLink}
                      className="bg-white/10 hover:bg-white/20 text-white border border-white/20 px-4 py-2.5 md:px-5 md:py-3 rounded-lg text-xs md:text-sm font-semibold tracking-wide transition-all backdrop-blur-sm active:scale-95"
                    >
                      {slide.secondaryCta}
                    </Link>
                  )}
                </div>
              </div>
            </div>

            {/* Right Column: Clean Media Panel with Static Institutional Credential Plaque */}
            <div className={`w-full h-[44%] sm:h-[48%] md:h-full md:w-[50%] lg:w-[54%] xl:w-[58%] relative overflow-hidden z-10 transition-colors duration-500 ${slide.isBalaSlide ? "bg-[#0b1522]" : "bg-slate-950"}`}>
              {/* Left fade blend on Desktop */}
              <div className="absolute inset-y-0 left-0 w-20 md:w-28 bg-gradient-to-r from-[#04121e] to-transparent z-20 hidden md:block"></div>
              {/* Bottom fade into controls */}
              <div className="absolute inset-x-0 bottom-0 h-24 md:h-32 bg-gradient-to-t from-[#04121e] to-transparent z-20 pointer-events-none"></div>

              {slide.image && (
                slide.isLogoSlide ? (
                  <div className="w-full h-full flex flex-col items-center justify-center relative p-4 sm:p-6 md:p-8 bg-[#091E33] bg-[radial-gradient(circle_at_center,_#11365A_0%,_#091E33_70%,_#05111E_100%)] overflow-hidden">
                    <div className="absolute inset-0 opacity-[0.03] bg-center bg-no-repeat bg-contain pointer-events-none select-none" style={{ backgroundImage: `url(${logoImage})`, backgroundSize: '85%' }}></div>

                    {/* Institutional Medallion */}
                    <div className="relative z-10 flex flex-col items-center">
                      <div className="p-2.5 md:p-3 rounded-full bg-gradient-to-b from-[#F0A500] via-[#E29300] to-[#B37200] shadow-[0_20px_50px_rgba(0,0,0,0.6)] border-2 border-white/20">
                        <div className="p-1.5 rounded-full bg-[#071D33]">
                          <div className="w-36 h-36 sm:w-48 sm:h-48 md:w-60 md:h-60 lg:w-72 lg:h-72 rounded-full bg-white overflow-hidden shadow-inner flex items-center justify-center p-3 sm:p-4 md:p-5 relative">
                            <img
                              src={slide.image}
                              alt={slide.title}
                              className="w-full h-full object-contain filter drop-shadow select-none pointer-events-none"
                              referrerPolicy="no-referrer"
                              loading="eager"
                              fetchPriority="high"
                              onError={(e) => {
                                const target = e.currentTarget;
                                if (target.src !== logoFallback) {
                                  target.src = logoFallback;
                                }
                              }}
                            />
                          </div>
                        </div>
                      </div>

                      <div className="mt-3 text-center">
                        <div className="text-white text-xs sm:text-sm md:text-base font-bold tracking-wide font-display">
                          SHIKSHANTAR ACADEMY
                        </div>
                        <div className="text-[#F0A500] text-[10px] sm:text-xs font-medium tracking-widest uppercase mt-0.5 font-poppins">
                          Bastipur, Karjanha-02, Siraha
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <img
                    src={slide.image}
                    alt={slide.title}
                    className={`w-full h-full object-cover ${slide.objectPosition || "object-center"} ${slide.imageClassName || "scale-100"} filter brightness-[0.90] sm:brightness-[0.92] select-none pointer-events-none`}
                    referrerPolicy="no-referrer"
                    loading="eager"
                  />
                )
              )}

              {/* Static Institutional Plaque (Glassmorphic Transparent) */}
              <div className="absolute right-4 sm:right-6 bottom-16 sm:bottom-20 md:bottom-22 z-30 max-w-[240px] sm:max-w-xs bg-black/40 backdrop-blur-md border border-white/20 p-3 rounded-xl shadow-lg text-white">
                <div className="text-xs sm:text-sm font-bold font-display text-white truncate">
                  {slide.cardTitle}
                </div>
                <div className="text-[10px] sm:text-xs text-slate-200/90 font-poppins truncate mt-0.5">
                  {slide.cardSubtitle}
                </div>
              </div>
            </div>
          </div>
        ))}

        {/* Quiet Arrow Navigation Controls */}
        <button
          onClick={() => setCurrentSlide((prev) => (prev - 1 + 3) % 3)}
          className="absolute left-3 sm:left-5 top-1/2 -translate-y-1/2 p-2 sm:p-2.5 bg-black/30 hover:bg-[#F0A500]/90 text-white hover:text-slate-950 rounded-full z-30 backdrop-blur-md border border-white/20 cursor-pointer opacity-75 md:opacity-50 hover:opacity-100 transition-all shadow-lg"
          title="Previous Slide"
          aria-label="Previous Slide"
        >
          <ChevronLeft className="w-4 h-4 sm:w-5 sm:h-5" />
        </button>
        <button
          onClick={() => setCurrentSlide((prev) => (prev + 1) % 3)}
          className="absolute right-3 sm:right-5 top-1/2 -translate-y-1/2 p-2 sm:p-2.5 bg-black/30 hover:bg-[#F0A500]/90 text-white hover:text-slate-950 rounded-full z-30 backdrop-blur-md border border-white/20 cursor-pointer opacity-75 md:opacity-50 hover:opacity-100 transition-all shadow-lg"
          title="Next Slide"
          aria-label="Next Slide"
        >
          <ChevronRight className="w-4 h-4 sm:w-5 sm:h-5" />
        </button>

        {/* Slide Indicator Dots (Minimal and clean) */}
        <div className="absolute bottom-6 sm:bottom-8 left-1/2 -translate-x-1/2 z-30 flex items-center gap-2">
          {[0, 1, 2].map((idx) => (
            <button
              key={idx}
              onClick={() => setCurrentSlide(idx)}
              className={`h-2 rounded-full transition-all cursor-pointer ${
                currentSlide === idx
                  ? "w-8 bg-[#F0A500] shadow-sm"
                  : "w-2 bg-white/50 hover:bg-white/80"
              }`}
              aria-label={`Go to slide ${idx + 1}`}
            />
          ))}
        </div>

        {/* Wave SVG divider transitioning into Stats bar */}
        <div className="absolute bottom-0 left-0 right-0 w-full overflow-hidden leading-[0] z-20 pointer-events-none">
          <svg className="relative block w-full h-[30px] md:h-[50px] text-[#1B4F72] fill-current" viewBox="0 0 1200 120" preserveAspectRatio="none">
            <path d="M321.39,56.44c58-10.79,114.16-30.13,172-41.86,82.39-16.72,168.19-17.73,250.45-.39C823.78,31,906.67,72,985.66,92.83c70.05,18.48,146.53,26.09,214.34,3V120H0V0C26.9,8.75,56.12,18.3,88.45,26.49,152.68,42.74,223.41,63.15,321.39,56.44Z" className="fill-[#1B4F72]"></path>
          </svg>
        </div>
      </section>

      {/* 3. Stats / Trust Bar Strip - "Numbers That Speak" */}
      <section className="bg-[#1B4F72] text-white w-full border-b border-white/5 relative z-20 py-8 select-none shadow-md">
        <div className="container mx-auto max-w-6xl px-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6 text-center">
            {[
              { metric: "Level Range", value: content.statsLevelRange || "PG — Class 10", icon: "🏫", desc: "Co-Ed Curriculum" },
              { metric: "Enrolled Students", value: content.statsStudents || "200+", icon: "👥", desc: "Active Learners", isCounter: true },
              { metric: "Qualified Mentors", value: content.statsTeachers || "12+", icon: "👨‍🏫", desc: "Expert Educators", isCounter: true },
              { metric: "Established Year", value: content.statsEstYear || "2072 B.S.", icon: "🏆", desc: "Academic Foundation" }
            ].map((item, idx) => (
              <div
                key={idx}
                className="flex flex-col items-center justify-center p-3 transition-transform duration-300 hover:scale-105"
              >
                <div className="text-3xl mb-1 opacity-90">{item.icon}</div>
                <div className="text-3xl md:text-4xl font-display font-bold text-[#F0A500] drop-shadow-sm mt-1">
                  {item.isCounter ? (
                    <AnimatedCounter value={item.value} className="font-bold font-display" />
                  ) : (
                    <span>{item.value}</span>
                  )}
                </div>
                <div className="text-xs uppercase font-poppins font-bold text-white/90 tracking-widest mt-1">
                  {item.metric}
                </div>
                <div className="text-[10px] text-white/60 font-medium mt-0.5">{item.desc}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Main Page Layout Wrapper */}
      <div className="w-full bg-[#FAFAF8] dark:bg-[#0b0f19] py-16 px-6 relative z-10 space-y-24">
        
        {/* 4. About / Introduction Section - "Split Story" */}
        <section className="container mx-auto max-w-6xl">
          <div className="grid grid-cols-1 md:grid-cols-12 gap-10 lg:gap-16 items-center">
            {/* Left Image Block */}
            <div className="md:col-span-5 relative group">
              <div className="absolute -inset-2 bg-gradient-to-r from-[#1B4F72] to-[#F0A500] opacity-15 rounded-3xl blur-xl group-hover:opacity-20 transition duration-300"></div>
              <div className="relative rounded-2xl overflow-hidden shadow-2xl border-4 border-white dark:border-slate-800 scale-100 hover:scale-[1.01] transition-all duration-300 bg-white">
                <img
                  src={content.slide1Image || "https://images.unsplash.com/photo-1577896851231-70ef18881754?q=80&w=1200&auto=format&fit=crop"}
                  alt="Shikshantar Academy School Life"
                  className="w-full h-[360px] object-cover"
                  referrerPolicy="no-referrer"
                />
                <div className="absolute bottom-4 left-4 right-4 bg-[#1B4F72]/95 backdrop-blur-md rounded-xl p-3.5 text-white border border-white/10 shadow-lg">
                  <p className="text-[10px] font-black font-poppins uppercase tracking-wider text-[#F0A500]">Inspiring Center</p>
                  <p className="text-xs font-semibold font-sans mt-0.5">Karjanha Municipali-05,Bastipur.</p>
                </div>
              </div>
            </div>

            {/* Right Text Block */}
            <div className="md:col-span-7 space-y-6">
              <div className="space-y-2">
                <span className="text-xs font-black uppercase tracking-widest text-[#F0A500] font-poppins bg-[#FFF3CC] dark:bg-amber-950/40 px-3 py-1 rounded-full border border-[#FFF3CC]/30">
                  Est. 2072 B.S. · Bastipur, Siraha
                </span>
                <h2 className="text-3xl md:text-4.5xl font-display font-bold text-[#1A1A2E] dark:text-white leading-tight">
                  Welcome to Shikshantar Academy
                </h2>
              </div>
              <p className="text-sm md:text-base text-[#6B7280] dark:text-gray-300 leading-relaxed font-sans">
                {content.description ||
                  "Shikshantar Academy provides quality education from class Play to Ten (10) in a peaceful and nurturing environment in Karjanha Municipality, Ward No. 05, Siraha."}
              </p>

              {/* Principal Pull Quote */}
              <div className="border-l-4 border-[#F0A500] pl-5 py-2 my-6 bg-[#FFF3CC]/10 dark:bg-amber-950/10 rounded-r-lg">
                <p className="text-base font-display italic text-gray-800 dark:text-gray-200">
                  "We believe in nurturing not just academic excellence, but character, creativity, and critical thinking."
                </p>
                <p className="text-xs font-poppins font-bold text-[#1B4F72] dark:text-blue-400 mt-2 uppercase tracking-wider">
                  — Pappu Kumar Jha, Executive Principal
                </p>
              </div>

              <div className="pt-2">
                <Link
                  to="/about"
                  className="inline-flex items-center gap-2 bg-[#1B4F72] hover:bg-[#12364E] text-white px-6 py-3 rounded-xl text-xs font-black uppercase tracking-widest transition-all duration-200 font-poppins shadow-md scale-100 hover:scale-105"
                >
                  🏫 Learn Our History & Mission →
                </Link>
              </div>
            </div>
          </div>
        </section>



        {/* 5. Principal's Message Section - "Voice of Leadership" Card with custom premium animations */}
        <motion.section 
          initial={{ opacity: 0, y: 40 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.8, ease: "easeOut" }}
          className="container mx-auto max-w-5xl"
        >
          <div className="relative rounded-[32px] overflow-hidden p-8 md:p-12 bg-gradient-to-br from-[#FFF3CC]/25 via-[#FFF3CC]/5 to-transparent dark:from-slate-900/50 dark:via-slate-900/10 dark:to-transparent border border-[#F0A500]/30 shadow-2xl relative group/card">
            
            {/* Ambient Background Glowing Blobs */}
            <motion.div
              animate={{
                scale: [1, 1.15, 1],
                opacity: [0.08, 0.16, 0.08],
              }}
              transition={{
                repeat: Infinity,
                duration: 8,
                ease: "easeInOut",
              }}
              className="absolute -top-12 -left-12 w-48 h-48 rounded-full bg-gradient-to-br from-[#F0A500] to-amber-300 blur-3xl pointer-events-none"
            />
            <motion.div
              animate={{
                scale: [1.1, 0.95, 1.1],
                opacity: [0.05, 0.12, 0.05],
              }}
              transition={{
                repeat: Infinity,
                duration: 10,
                ease: "easeInOut",
                delay: 1.5,
              }}
              className="absolute -bottom-16 -right-16 w-56 h-56 rounded-full bg-gradient-to-br from-[#1B4F72] to-blue-300 blur-3xl pointer-events-none"
            />

            {/* Subtle Diagonal Stripe Decoration */}
            <div className="absolute inset-0 opacity-[0.03] dark:opacity-[0.015] bg-[linear-gradient(45deg,#F0A500_25%,transparent_25%,transparent_50%,#F0A500_50%,#F0A500_75%,transparent_75%,transparent)] bg-[size:40px_40px] pointer-events-none"></div>

            <div className="relative z-10 flex flex-col md:flex-row gap-8 lg:gap-12 items-center">
              
              {/* Principal Photo circular frame with floating animations */}
              <div className="w-[180px] h-[220px] md:w-[200px] md:h-[250px] shrink-0 relative group/photo">
                {/* Rotating background accent board */}
                <motion.div 
                  animate={{ rotate: [3, 5, 3] }}
                  transition={{ repeat: Infinity, duration: 6, ease: "easeInOut" }}
                  className="absolute inset-0 bg-[#F0A500] rounded-2xl rotate-3 scale-95 shadow-md origin-center"
                />
                
                {/* Image Wrapper */}
                <motion.div
                  whileHover={{ 
                    scale: 1.05, 
                    rotate: -1,
                    y: -5,
                    boxShadow: "0 20px 25px -5px rgb(0 0 0 / 0.15), 0 8px 10px -6px rgb(0 0 0 / 0.15)"
                  }}
                  transition={{ type: "spring", stiffness: 350, damping: 18 }}
                  className="absolute inset-0 rounded-2xl overflow-hidden bg-gray-100 dark:bg-slate-800 shadow-lg cursor-pointer p-[3px] group/principal"
                >
                  {/* Outer Bloom Aura shadow behind photo */}
                  <div className="absolute inset-0 bg-gradient-to-r from-[#0a3d62] via-[#0284c7] to-[#F0A500] opacity-50 lg:opacity-0 lg:group-hover/photo:opacity-40 blur-xl transition-all duration-500 rounded-2xl -z-10" />

                  {/* Rotating lightning border */}
                  <div className="absolute inset-[-180%] bg-[conic-gradient(from_0deg,#0a3d62,#0284c7,#F0A500,#fbbf24,#0ea5e9,#0a3d62)] animate-[spin_5s_linear_infinite] opacity-75 lg:opacity-0 lg:group-hover/photo:opacity-100 transition-opacity duration-300 z-0 pointer-events-none" />

                  {/* Inner masked circular frame */}
                  <div className="relative w-full h-full rounded-[12px] overflow-hidden z-10">
                    <img
                      src={content.principalImage || principalImg}
                      alt="Principal Pappu Kumar Jha"
                      referrerPolicy="no-referrer"
                      className="w-full h-full object-cover object-top transition-transform duration-500 group-hover/photo:scale-110"
                      onError={(e) => {
                        if ((e.target as HTMLImageElement).src !== fallbackImg) {
                          (e.target as HTMLImageElement).src = fallbackImg;
                        }
                      }}
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/20 via-transparent to-transparent opacity-0 group-hover/photo:opacity-100 transition-opacity duration-300"></div>
                  </div>
                </motion.div>
              </div>

              {/* Message Details with clean staggered entries */}
              <div className="flex-1 space-y-5 text-center md:text-left">
                <div className="flex items-center justify-center md:justify-start gap-2">
                  <motion.span 
                    animate={{ rotate: 360 }}
                    transition={{ repeat: Infinity, duration: 8, ease: "linear" }}
                    className="text-[#F0A500] font-black text-xs block"
                  >
                    ★
                  </motion.span>
                  <span className="text-[#F0A500] font-black tracking-widest text-[10px] uppercase font-poppins block">
                    SCHOOL LEADERSHIP MESSAGE
                  </span>
                  <motion.span 
                    animate={{ rotate: -360 }}
                    transition={{ repeat: Infinity, duration: 8, ease: "linear" }}
                    className="text-[#F0A500] font-black text-xs block"
                  >
                    ★
                  </motion.span>
                </div>

                <blockquote className="text-[15px] md:text-[17px] text-gray-700 dark:text-gray-200 italic leading-relaxed relative px-4 md:px-0">
                  <motion.span 
                    animate={{ scale: [1, 1.08, 1], opacity: [0.15, 0.3, 0.15] }}
                    transition={{ repeat: Infinity, duration: 5, ease: "easeInOut" }}
                    className="text-6xl text-[#F0A500] absolute -top-9 -left-4 font-display select-none pointer-events-none"
                  >
                    “
                  </motion.span>
                  
                  <span className="relative z-10 font-sans tracking-wide">
                    {content.principalMessage ||
                      "At Shikshantar Academy, we believe in nurturing not just academic excellence, but character, creativity, and critical thinking. Our peaceful environment and modern facilities provide the perfect setting for your child to grow and thrive."}
                  </span>

                  <motion.span 
                    animate={{ scale: [1, 1.08, 1], opacity: [0.15, 0.3, 0.15] }}
                    transition={{ repeat: Infinity, duration: 5, ease: "easeInOut", delay: 2.5 }}
                    className="text-6xl text-[#F0A500] absolute -bottom-16 right-0 font-display select-none pointer-events-none"
                  >
                    ”
                  </motion.span>
                </blockquote>

                <div className="pt-3 relative">
                  {/* Small elegant layout line */}
                  <div className="w-12 h-[2px] bg-[#F0A500]/40 rounded mb-3 mx-auto md:mx-0 group-hover/card:w-24 transition-all duration-500"></div>
                  
                  <p className="font-display font-bold text-gray-950 dark:text-white text-lg">
                    {content.principalName || "Mr. Pappu Kumar Jha"}
                  </p>
                  <p className="text-xs text-[#1B4F72] dark:text-blue-400 font-black font-poppins uppercase tracking-widest mt-0.5">
                    {content.principalTitle || "Founder Principal, Shikshantar Academy"}
                  </p>
                </div>
              </div>

            </div>
          </div>
        </motion.section>

        {/* 5.5 Interactive Fee & Scholarship Estimator */}
        <FeeEstimator />

        {/* 6. Learning Pathways Grade Card Catalog */}
        <section className="container mx-auto max-w-6xl space-y-12">
          <div className="text-center max-w-xl mx-auto space-y-2">
            <span className="text-[#F0A500] font-poppins font-black text-[10px] uppercase tracking-widest">
              ACADEMIC SPECTRUM
            </span>
            <motion.h2 
              initial={{ opacity: 0, y: 15 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ type: "spring", stiffness: 100, damping: 15, delay: 0.1 }}
              className="text-3xl md:text-5xl font-display font-medium leading-none mb-2 text-gray-900 dark:text-white flex flex-wrap justify-center items-center gap-x-3 gap-y-2"
            >
              <span className="text-gray-900 dark:text-gray-150">From</span>
              <motion.span 
                whileHover={{ scale: 1.1, rotate: -3, transition: { type: "spring", stiffness: 400, damping: 10 } }}
                whileTap={{ scale: 1.05, rotate: -2 }}
                animate={{
                  y: [0, -3, 0],
                  rotate: [0, -1, 1, 0]
                }}
                transition={{
                  y: { repeat: Infinity, duration: 3, ease: "easeInOut" },
                  rotate: { repeat: Infinity, duration: 6, ease: "easeInOut" }
                }}
                className="relative inline-block text-[#F0A500] italic font-serif px-3 py-1 font-semibold dark:text-amber-400 cursor-pointer"
              >
                Curiosity
                <span className="absolute bottom-1.5 left-0 w-full h-1.5 bg-amber-200/60 dark:bg-amber-950/40 -z-10 rounded-full"></span>
              </motion.span>
              <span className="text-gray-900 dark:text-gray-150">to</span>
              <motion.span 
                whileHover={{ scale: 1.1, rotate: 3, transition: { type: "spring", stiffness: 400, damping: 10 } }}
                whileTap={{ scale: 1.05, rotate: 2 }}
                animate={{
                  y: [0, 3, 0],
                  rotate: [-1.5, -0.5, -2.5, -1.5]
                }}
                transition={{
                  y: { repeat: Infinity, duration: 3.5, ease: "easeInOut" },
                  rotate: { repeat: Infinity, duration: 7, ease: "easeInOut" }
                }}
                className="relative inline-block px-4 py-1 rounded-2xl bg-[#1B4F72] text-white font-black tracking-wide shadow-md hover:shadow-xl cursor-default text-xs md:text-sm uppercase -rotate-[1.5deg]"
              >
                Capability
              </motion.span>
            </motion.h2>
            <p className="text-sm text-[#6B7280] dark:text-gray-400 font-sans">
              Explore our structured stages modeled dynamically around scientific learning pathways.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {[
              {
                title: "Play Group & Montessori",
                grade: "Pre-School",
                stripeColor: "bg-[#1B4F72]",
                desc: "An safe visual play space establishing fundamental motor development, social interactions, and phonics.",
                feats: ["🎨 Color Playrooms", "🧸 Sensory Stimulation", "🥪 Healthy Meals", "👨‍🏫 Caring Nurse Staff"]
              },
              {
                title: "Nursery & Kindergarten",
                grade: "Lower Kindergarten",
                stripeColor: "bg-[#F0A500]",
                desc: "Introduction to writing scales, alphabet identification, numbers arithmetic cards, and bilingual storytelling.",
                feats: ["✏️ Alphabet Tracing", "🎼 Rhymes & Audios", "🃏 Number Playing Cards", "🎭 Annual Skits"]
              },
              {
                title: "Primary (Class 1 — 5)",
                grade: "Junior Foundation",
                stripeColor: "bg-[#2E7D4F]",
                desc: "Following CDM standards with intensive writing studies, abacus mental math classes, and local sciences.",
                feats: ["📖 CDC English Curriculations", "🧮 Abacus Classrooms", "🎨 Oil Paint Arts", "🔬 Ecology Gardens"]
              },
              {
                title: "Basic School (Class 6 — 8)",
                grade: "Middle Schooling",
                stripeColor: "bg-[#0A3D62]",
                desc: "Fostering analytical logic with introductory Physics, Chemistry diagnostics, sociologies, and physical drills.",
                feats: ["📐 Physics & Chem Labs", "🧘 Yoga Sessions", "🤝 Cultural Assemblies", "💻 Computing Laboratories"]
              },
              {
                title: "Secondary (Class 9 — 10)",
                grade: "SEE Board Core",
                stripeColor: "bg-[#F1C40F]",
                desc: "High-level diagnostic coaching designed specifically to secure highest SEE aggregates in Karjanha Province.",
                feats: ["🏆 SEE Board Preparation", "👨‍🏫 Special Subject Coaching", "📊 Weekly Diagnostic Exams", "🎯 Target aggregate reviews"]
              },
              {
                title: "Extra-Curricular Clubs",
                grade: "Beyond Studios",
                stripeColor: "bg-[#2E7D4F]",
                desc: "Enriching physical education logs with professional coaches, music tournaments, debates, and public speaking platforms.",
                feats: ["⚽ Professional Football", "🏛️ Municipal Debates", "🎺 Brass Band Auditions", "🏆 General Assembly Honors"]
              }
            ].map((program, idx) => (
              <motion.div
                key={idx}
                className="h-full"
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-50px" }}
                transition={{ duration: 0.4, delay: idx * 0.05 }}
              >
                <SpotlightCard
                  roundedClass="rounded-[24px]"
                  spotlightColor="rgba(240, 165, 0, 0.2)"
                  borderGlowColor="rgba(240, 165, 0, 0.95)"
                  glowAuraColor="rgba(240, 165, 0, 0.4)"
                  className="h-full cursor-pointer transition-transform duration-300 hover:-translate-y-1.5 shadow-sm hover:shadow-2xl"
                  innerClassName="bg-white dark:bg-slate-900 border-0"
                >
                  {/* Colored border stripe top */}
                  <div className={`h-2.5 w-full ${program.stripeColor}`}></div>
                  <div className="p-6 md:p-8 flex flex-col flex-1 space-y-4">
                    <div>
                      <span className="text-[10px] font-black uppercase text-[#F0A500] font-poppins tracking-widest">{program.grade}</span>
                      <h3 className="text-lg font-bold font-display text-gray-900 dark:text-white mt-1 group-hover/spotlight:text-[#1B4F72] dark:group-hover/spotlight:text-blue-400 transition-colors">
                        {program.title}
                      </h3>
                    </div>
                    <p className="text-xs text-gray-600 dark:text-gray-400 leading-relaxed flex-1 font-medium">
                      {program.desc}
                    </p>
                    <div className="h-px bg-gray-100 dark:bg-slate-800/80 w-full my-1"></div>
                    <div className="flex flex-wrap gap-1.5 pt-2">
                      {program.feats.map((feat, fIdx) => (
                        <span key={fIdx} className="text-[10px] font-bold text-gray-700 dark:text-gray-300 bg-slate-50 dark:bg-slate-800/90 px-2.5 py-1 rounded-full border border-slate-200/80 dark:border-slate-700/80">
                          {feat}
                        </span>
                      ))}
                    </div>
                  </div>
                </SpotlightCard>
              </motion.div>
            ))}
          </div>
        </section>

        {/* 7. Gallery Section - "Cherished Memories" */}
        {(() => {
          // Dynamically map from real DB collections to ensure authentic uploaded images or default matches
          const batch1 = dbBatches[0] || { year: '2082 B.S', image: 'https://images.unsplash.com/photo-1546410531-bb4caa6b424d?q=80&w=800&h=600&auto=format&fit=crop' };
          const batch2 = dbBatches[1] || { year: '2081 B.S', image: 'https://images.unsplash.com/photo-1523050854058-8df90110c9f1?q=80&w=800&h=600&auto=format&fit=crop' };

          // Find Teacher Team (role or name contains 'Staff', 'Faculty', 'Team' or has the default team URL)
          const teacherTeamItem = dbTeachers.find((t: any) => 
            (t.role || "").toLowerCase().includes("staff") || 
            (t.name || "").toLowerCase().includes("faculty") || 
            (t.name || "").toLowerCase().includes("staff") ||
            (t.role || "").toLowerCase().includes("team") ||
            t.image === "https://images.unsplash.com/photo-1524178232363-1fb2b075b655?q=80&w=1470&auto=format&fit=crop"
          ) || dbTeachers[0] || { name: 'Teaching Faculty', role: 'Principal & Staff', image: "https://images.unsplash.com/photo-1524178232363-1fb2b075b655?q=80&w=1470&auto=format&fit=crop" };

          // Find Principal (role or name contains 'Principal' or 'Pappu')
          const principalItem = dbTeachers.find((t: any) => 
            t.image !== teacherTeamItem.image && (
              (t.role || "").toLowerCase().includes("principal") || 
              (t.name || "").toLowerCase().includes("principal") || 
              (t.name || "").toLowerCase().includes("pappu")
            )
          ) || dbTeachers.find((t: any) => t.image !== teacherTeamItem.image) || { name: 'Mr. Pappu Kumar Jha', role: 'Principal', image: 'https://images.unsplash.com/photo-1544717305-2782549b5136?q=80&w=400&h=500&auto=format&fit=crop' };

          // Find Festival celebration event photo (title contains 'Tihar', 'Deepawali', 'Celebrate', 'fest' etc)
          const festivalItem = dbEvents.find((e: any) => 
            (e.title || "").toLowerCase().includes("tihar") || 
            (e.title || "").toLowerCase().includes("celebrat") || 
            (e.title || "").toLowerCase().includes("fest") ||
            (e.title || "").toLowerCase().includes("deepawali") ||
            e.image === "https://images.unsplash.com/photo-1605151523425-46fdad6ff468?q=80&w=1548&auto=format&fit=crop"
          ) || dbEvents[0] || { title: 'Celebrating Tihar', image: "https://images.unsplash.com/photo-1605151523425-46fdad6ff468?q=80&w=1548&auto=format&fit=crop" };

          // Exactly 5 unique photos ordered exactly by user request:
          // 1. Principal's Portrait, 2. Teacher team, 3. Batch 1, 4. Batch 2, 5. Celebratory festival
          const uniquePhotos = [
            {
              image: principalItem.image,
              caption: principalItem.name || "Mr. Pappu Kumar Jha (Principal)",
              sizeDetail: principalItem.role || "Academic Leadership",
              celebrationDetail: "Guiding our children with modern standards and values",
              id: "principal-jha",
              isBatch: false
            },
            {
              image: teacherTeamItem.image,
              caption: teacherTeamItem.name || "Teaching Faculty & Staff Team",
              sizeDetail: teacherTeamItem.role || "Dedicated Faculty Members",
              celebrationDetail: "Our team of professional educators committed to developmental learning",
              id: "faculty-staff",
              isBatch: false
            },
            {
              image: batch1.image,
              caption: batch1.year || batch1.caption || "2082 B.S. Senior Graduation Batch",
              sizeDetail: "",
              celebrationDetail: "Fostering academic excellence with stellar board results",
              id: "batch-a",
              isBatch: false
            },
            {
              image: batch2.image,
              caption: batch2.year || batch2.caption || "Primary Interactive Logic Session",
              sizeDetail: "",
              celebrationDetail: "Inspirational early childhood scientific exploration class",
              id: "batch-b",
              isBatch: false
            },
            {
              image: festivalItem.image,
              caption: festivalItem.title || festivalItem.caption || "Celebrating Tihar Festival Batch",
              sizeDetail: "Traditional Celebrations",
              celebrationDetail: "Deepawali student assembly with interactive value programs",
              id: "festival-tihar",
              isBatch: false
            }
          ];

          const activePhoto = uniquePhotos[currentGallerySlide] || uniquePhotos[0];

          const nextSlide = () => {
            setCurrentGallerySlide((prev) => (prev + 1) % 5);
          };

          const prevSlide = () => {
            setCurrentGallerySlide((prev) => (prev - 1 + 5) % 5);
          };

          const handleKeyDown = (e: React.KeyboardEvent) => {
            switch (e.key) {
              case "ArrowLeft":
                e.preventDefault();
                prevSlide();
                break;
              case "ArrowRight":
                e.preventDefault();
                nextSlide();
                break;
              case "Home":
                e.preventDefault();
                setCurrentGallerySlide(0);
                break;
              case "End":
                e.preventDefault();
                setCurrentGallerySlide(uniquePhotos.length - 1);
                break;
              case "Enter":
              case " ":
                e.preventDefault();
                setExpandedImage(activePhoto.image);
                break;
              default:
                break;
            }
          };

          // Define five distinct premium transitioning animation properties for each slide
          const getTransitionProps = (idx: number) => {
            switch (idx) {
              case 0:
                // Effect 1: Push off / Horizontal Slide Left-to-Right displacement
                return {
                  initial: { opacity: 0, x: "-100%", scale: 0.96 },
                  animate: { opacity: 1, x: 0, scale: 1 },
                  exit: { opacity: 0, x: "100%", scale: 1.04 },
                  transition: { duration: 1.3, ease: [0.25, 1, 0.5, 1] }
                };
              case 1:
                // Effect 2: Lens Shutter (Vertical scale & extreme contrast light opening)
                return {
                  initial: { opacity: 0, scaleY: 0.05, filter: "contrast(4) brightness(2.5)" },
                  animate: { opacity: 1, scaleY: 1, filter: "contrast(1) brightness(1)" },
                  exit: { opacity: 0, scaleY: 0.05, filter: "contrast(4) brightness(0.25)" },
                  transition: { duration: 1.4, ease: [0.76, 0, 0.24, 1] }
                };
              case 2:
                // Effect 3: Slide (Smooth vertical slide upward entrance)
                return {
                  initial: { opacity: 0, y: "100%", scale: 0.98 },
                  animate: { opacity: 1, y: 0, scale: 1 },
                  exit: { opacity: 0, y: "-100%", scale: 1.02 },
                  transition: { duration: 1.2, ease: [0.16, 1, 0.3, 1] }
                };
              case 3:
                // Effect 4: Right shift (Sliding entry from right side shifting left-to-right off output)
                return {
                  initial: { opacity: 0, x: "100%", scale: 0.96 },
                  animate: { opacity: 1, x: 0, scale: 1 },
                  exit: { opacity: 0, x: "-100%", scale: 1.04 },
                  transition: { duration: 1.3, ease: [0.25, 1, 0.5, 1] }
                };
              case 4:
              default:
                // Effect 5: Blink White / Professional Camera flash light blast and smooth fade
                return {
                  initial: { opacity: 0, filter: "brightness(4) contrast(3)" },
                  animate: { opacity: 1, filter: "brightness(1) contrast(1)" },
                  exit: { opacity: 0, filter: "brightness(4) contrast(3)" },
                  transition: { duration: 1.1, ease: "easeInOut" }
                };
            }
          };

          const transitionProps = getTransitionProps(currentGallerySlide);

          return (
            <section className="container mx-auto max-w-5xl px-4 py-8 relative">
              {/* Glowing Background Accent to elevate visual presentation */}
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-gradient-to-tr from-[#F0A500]/5 via-[#1B4F72]/5 to-transparent rounded-full blur-[120px] pointer-events-none -z-10" />

              <motion.div 
                initial={{ opacity: 0, scale: 0.95 }}
                whileInView={{ opacity: 1, scale: 1 }}
                viewport={{ once: true }}
                transition={{ duration: 0.8 }}
                className="relative z-10 flex flex-col items-center text-center space-y-2 mb-6 md:mb-8"
              >
                {/* Micro capsule tag */}
                <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#1B4F72]/5 dark:bg-slate-800/60 border border-[#1B4F72]/10 dark:border-white/5 text-[10px] text-[#1B4F72] dark:text-amber-400 font-extrabold tracking-widest uppercase font-mono shadow-sm">
                  Exclusive School Glimpses
                </div>

                <h2 className="text-2xl md:text-4xl font-display font-medium tracking-tight text-[#1B4F72] dark:text-white">
                  Cherished <span className="text-[#F0A500] font-semibold">Memories</span>
                </h2>
                <p className="text-xs md:text-xs text-gray-500 max-w-md font-sans mx-auto leading-relaxed">
                  Browse authentic glimpses of academic exploration, dedicated educators, and vibrant student celebrations at Shikshantar.
                </p>
                <div className="w-16 h-0.5 bg-gradient-to-r from-transparent via-[#F0A500] to-transparent rounded-full mt-1.5"></div>
              </motion.div>

              {/* Screen reader only instruction text */}
              <div className="sr-only">
                Interactive School Glimpses Slideshow. When focused, use the Left and Right arrow keys to navigate between slides. Press Home or End to skip to the first or last slide. Press Space or Enter on the active slide to zoom/expand the photo.
              </div>

              {/* Enlarged Cinematic Slideshow View */}
              <div className="relative max-w-4xl mx-auto rounded-[28px] p-[3.5px] bg-slate-100 dark:bg-slate-850 md:group-hover:bg-transparent shadow-xl hover:shadow-2xl md:hover:scale-[1.015] group transition-all duration-300">
                {/* Mobile & Tablet persistent 3-Layer Cinematic Bloom (Ambient backlight tailored for touch & tablet screens) */}
                {/* Layer 1: Wide Deep-Field Ambient Bloom */}
                <div className="lg:hidden absolute inset-4 bg-gradient-to-r from-blue-500 via-[#F0A500]/30 to-emerald-500 opacity-60 blur-2xl rounded-3xl -z-10 pointer-events-none" />
                {/* Layer 2: Core Golden/Slate Vivid Aura */}
                <div className="lg:hidden absolute inset-1 bg-gradient-to-r from-[#F0A500]/60 via-[#1B4F72]/50 to-[#10b981]/40 opacity-70 blur-xl rounded-3xl -z-10 pointer-events-none" />
                {/* Layer 3: High-Definition Backlight Edge Halo */}
                <div className="lg:hidden absolute -inset-[2px] bg-gradient-to-r from-cyan-400 via-amber-400 to-rose-400 opacity-45 blur-md rounded-[28px] -z-10 pointer-events-none" />

                {/* Desktop-only outer glow bloom shadows (Dual Layer for extra high-fidelity intensity on hover) */}
                <div className="hidden lg:block absolute inset-1 bg-gradient-to-r from-[#0a3d62] via-[#0284c7] to-[#F0A500] opacity-0 group-hover:opacity-65 blur-xl transition-all duration-500 rounded-3xl -z-10 group-hover:scale-103 pointer-events-none" />
                <div className="hidden lg:block absolute inset-[-4px] bg-gradient-to-r from-sky-400 via-amber-400 to-blue-600 opacity-0 group-hover:opacity-45 blur-2xl transition-all duration-700 rounded-3xl -z-10 group-hover:scale-105 pointer-events-none" />

                {/* Rotating lightning border - properly clipped to card bounds (active constantly on mobile & tablet, and on hover on desktop) */}
                <div className="absolute inset-0 rounded-[28px] overflow-hidden pointer-events-none z-0">
                  {/* Mobile & Tablet persistent dual layer spinning lighting border */}
                  <div className="lg:hidden absolute inset-[-150%] bg-[conic-gradient(from_0deg,#0a3d62,#0284c7,#F0A500,#fbbf24,#0ea5e9,#0a3d62)] animate-[spin_5s_linear_infinite] opacity-75" />

                  {/* Desktop-only high-fidelity effect: 4s linear spin active on hover */}
                  <div className="hidden lg:block absolute inset-[-150%] bg-[conic-gradient(from_0deg,#0a3d62,#0284c7,#F0A500,#fbbf24,#0ea5e9,#0a3d62)] animate-[spin_4s_linear_infinite] opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                </div>

                <div 
                  className="relative w-full h-full rounded-[25px] overflow-hidden bg-white dark:bg-slate-950 aspect-[16/10] sm:aspect-[16/9] z-10 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#F0A500]/50"
                  tabIndex={0}
                  onKeyDown={handleKeyDown}
                  role="region"
                  aria-roledescription="carousel"
                  aria-label="School Glimpses Gallery"
                >
                  <AnimatePresence mode="wait">
                    <motion.div
                      key={currentGallerySlide}
                      initial={transitionProps.initial}
                      animate={transitionProps.animate}
                      exit={transitionProps.exit}
                      transition={transitionProps.transition}
                      className="absolute inset-0 w-full h-full cursor-zoom-in origin-center"
                      style={{ transformOrigin: "center" }}
                      onClick={() => setExpandedImage(activePhoto.image)}
                      role="tabpanel"
                      id={`gallery-slide-panel-${currentGallerySlide}`}
                      aria-label={`Slide ${currentGallerySlide + 1} of ${uniquePhotos.length}: ${activePhoto.caption}`}
                    >
                      <img
                        src={activePhoto.image}
                        className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-103"
                        alt={activePhoto.caption}
                        referrerPolicy="no-referrer"
                      />
                    </motion.div>
                  </AnimatePresence>

                  {/* Glassmorphic Slide Indicator & Counter */}
                  <div className="absolute top-3 left-3 z-20 backdrop-blur-md bg-black/60 border border-white/10 px-2.5 py-1 rounded-md text-white text-[10px] font-mono font-bold tracking-widest flex items-center gap-1.5 shadow-md">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#F0A500]"></span>
                    SLIDE {currentGallerySlide + 1} / {uniquePhotos.length}
                  </div>

                  {/* Left Manual Arrow Control */}
                  <button 
                    onClick={(e) => {
                      e.stopPropagation();
                      prevSlide();
                    }}
                    className="absolute left-3 top-1/2 -translate-y-1/2 z-20 bg-white/95 dark:bg-slate-900/95 hover:bg-[#F0A500] hover:text-white text-[#1B4F72] transition-all p-2.5 rounded-full shadow-lg border border-gray-150 dark:border-slate-800 flex items-center justify-center opacity-0 group-hover:opacity-100 cursor-pointer pointer-events-auto transform -translate-x-2 group-hover:translate-x-0 transition-all duration-300 focus-visible:opacity-100 focus-visible:translate-x-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F0A500]"
                    aria-label="Previous Slide"
                    aria-controls={`gallery-slide-panel-${currentGallerySlide}`}
                  >
                    <ChevronLeft className="w-4.5 h-4.5 font-bold" />
                  </button>

                  {/* Right Manual Arrow Control */}
                  <button 
                    onClick={(e) => {
                      e.stopPropagation();
                      nextSlide();
                    }}
                    className="absolute right-3 top-1/2 -translate-y-1/2 z-20 bg-white/95 dark:bg-slate-900/95 hover:bg-[#F0A500] hover:text-white text-[#1B4F72] transition-all p-2.5 rounded-full shadow-lg border border-gray-150 dark:border-slate-800 flex items-center justify-center opacity-0 group-hover:opacity-100 cursor-pointer pointer-events-auto transform translate-x-2 group-hover:translate-x-0 transition-all duration-300 focus-visible:opacity-100 focus-visible:translate-x-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F0A500]"
                    aria-label="Next Slide"
                    aria-controls={`gallery-slide-panel-${currentGallerySlide}`}
                  >
                    <ChevronRight className="w-4.5 h-4.5 font-bold" />
                  </button>
                </div>
              </div>

              {/* Unified responsive caption block shown outside the image container so the image is fully visible and responsive */}
              <div className="w-full max-w-4xl mx-auto bg-gradient-to-b from-white to-gray-50/50 dark:from-slate-900 dark:to-slate-950/20 border border-gray-100 dark:border-slate-800/60 rounded-[20px] p-4 md:p-6 shadow-sm space-y-1.5 mt-3 md:mt-4 text-center relative overflow-hidden">
                {/* Aesthetic decorative brand glow lines */}
                <div className="absolute top-0 left-1/4 right-1/4 h-[1.5px] bg-gradient-to-r from-transparent via-[#F0A500]/60 to-transparent"></div>
                
                {activePhoto.isBatch && (
                  <div className="flex justify-center">
                    <span className="text-amber-600 dark:text-[#F0A500] font-mono text-[9px] md:text-xs uppercase tracking-widest font-extrabold bg-[#F0A500]/10 dark:bg-[#F0A500]/15 px-2.5 py-0.5 rounded-full border border-[#F0A500]/20 inline-block">
                      {activePhoto.sizeDetail}
                    </span>
                  </div>
                )}
                
                <h3 className="text-sm md:text-lg font-bold leading-tight text-[#1B4F72] dark:text-white font-sans tracking-tight">
                  {activePhoto.caption}
                </h3>
                
                <p className="text-[11px] md:text-xs font-medium text-gray-500 dark:text-gray-400 leading-relaxed font-sans max-w-xl mx-auto">
                  {activePhoto.celebrationDetail}
                </p>
              </div>

              {/* Slider Dots indicators */}
              <div 
                className="flex justify-center gap-2 pt-3"
                role="tablist"
                aria-label="Gallery slide selectors"
              >
                {uniquePhotos.map((_, dotIdx) => (
                  <button
                    key={dotIdx}
                    onClick={() => setCurrentGallerySlide(dotIdx)}
                    className={`h-2 rounded-full cursor-pointer transition-all duration-350 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F0A500] ${
                      currentGallerySlide === dotIdx 
                        ? "bg-gradient-to-r from-[#1B4F72] to-[#F0A500] w-8 shadow-md shadow-[#F0A500]/10" 
                        : "bg-gray-300 dark:bg-slate-700 w-2 hover:bg-[#F0A500]/40"
                    }`}
                    role="tab"
                    aria-selected={currentGallerySlide === dotIdx}
                    aria-label={`Go to slide ${dotIdx + 1}: ${uniquePhotos[dotIdx].caption}`}
                    aria-controls={`gallery-slide-panel-${dotIdx}`}
                  />
                ))}
              </div>

              <div className="text-center pt-3">
                <Link
                  to="/gallery"
                  className="inline-flex items-center gap-2 bg-[#1B4F72] hover:bg-[#F0A500] text-white hover:text-slate-950 font-bold uppercase tracking-widest text-[10px] px-6 py-2.5 rounded-xl transition-all duration-300 shadow-md scale-100 hover:scale-105"
                >
                  Explore Complete Archives
                  <ArrowRight className="w-3.5 h-3.5" />
                </Link>
              </div>
            </section>
          );
        })()}

        {/* 8. Facilities / Features Section - "Why Shikshantar" */}
        <section className="container mx-auto max-w-6xl space-y-12 px-4">
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-100px" }}
            transition={{ duration: 0.6 }}
            className="text-center max-w-xl mx-auto space-y-3"
          >
            <h2 className="text-3xl md:text-4xl lg:text-[40px] font-display font-medium text-[#1B4F72] dark:text-white leading-none">
              Why Choose Shikshantar Academy?
            </h2>
            <div className="w-14 h-1 bg-[#F0A500] mx-auto rounded-full"></div>
            <p className="text-base text-gray-600 dark:text-gray-300 font-sans font-medium">
              Trusted by 600+ Families in Karjanha Municipality
            </p>
          </motion.div>

          {/* Why Choose Shikshantar Academy Facilities Grid (2 Large Cards Per Row on Big Screens) */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 lg:gap-8">
            {[
              {
                emoji: "🏫",
                title: "Modern Infrastructure",
                sentence1: "Our campus features child-friendly classrooms integrated with Building as a Learning Aid (BALA) wall murals.",
                sentence2: "Students enjoy safe recreational playgrounds, clean sanitary amenities, and an inspiring daily learning environment."
              },
              {
                emoji: "🔬",
                title: "Science & Computer Lab",
                sentence1: "Equipped with modern computer systems and practical laboratory apparatus for foundational and secondary classes.",
                sentence2: "Learners gain hands-on scientific curiosity and essential technological literacy under experienced faculty mentorship."
              },
              {
                emoji: "🌐",
                title: "English Medium",
                sentence1: "All core curriculum subjects are taught in English to build global communicative confidence and strong analytical skills.",
                sentence2: "We balance international academic standards with rich Nepali cultural values, ethics, and moral science."
              },
              {
                emoji: "📊",
                title: "Regular Assessments",
                sentence1: "We conduct four systematic terminal examinations each academic year to measure and guide student progress.",
                sentence2: "Parents receive timely feedback along with 24/7 digital access to report cards and attendance records on our portal."
              },
              {
                emoji: "🏆",
                title: "Extra-Curricular Activities",
                sentence1: "Students actively participate in inter-house sports tournaments, debates, creative arts, and annual cultural celebrations.",
                sentence2: "These diverse activities build teamwork, leadership skills, emotional resilience, and lifelong physical fitness."
              },
              {
                emoji: "💰",
                title: "Affordable Fees",
                sentence1: "We deliver quality private schooling with competitive, transparent, and family-friendly fee structures.",
                sentence2: "Merit-based scholarships and need-based tuition concessions are provided to empower every deserving student."
              },
              {
                emoji: "📍",
                title: "Central Location",
                fullWidth: true,
                sentence1: "Conveniently located in Bastipur, Karjanha-02, Siraha with safe, accessible student transit connectivity.",
                sentence2: "The campus provides a secure, peaceful, and green setting away from highway noise for focused learning."
              }
            ].map((facility, idx) => (
              <motion.div
                key={idx}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-40px" }}
                transition={{ duration: 0.4, delay: idx * 0.05, type: "spring", stiffness: 120 }}
                className={`group [perspective:1200px] h-[250px] sm:h-[265px] md:h-[275px] cursor-pointer select-none ${
                  facility.fullWidth ? "col-span-1 lg:col-span-2" : "col-span-1"
                }`}
                onClick={() => setActiveCardIdx(activeCardIdx === idx ? null : idx)}
              >
                <div 
                  className={`relative w-full h-full transition-transform duration-700 [transform-style:preserve-3d] shadow-[0_8px_24px_rgba(0,0,0,0.06)] rounded-[28px] sm:rounded-[32px] ${
                    activeCardIdx === idx 
                      ? "[transform:rotateY(180deg)]" 
                      : "group-hover:[transform:rotateY(180deg)]"
                  }`}
                  style={{ transformStyle: "preserve-3d" }}
                >
                  {/* FRONT SIDE */}
                  <div 
                    className="absolute inset-0 bg-white dark:bg-slate-900 rounded-[28px] sm:rounded-[32px] border border-slate-200/90 dark:border-slate-800 border-l-[12px] sm:border-l-[16px] border-l-[#143D5C] dark:border-l-sky-600 px-7 sm:px-10 py-6 sm:py-7 flex flex-col justify-between transition-all duration-300 group-hover:shadow-2xl overflow-hidden"
                    style={{ backfaceVisibility: "hidden", WebkitBackfaceVisibility: "hidden" }}
                  >
                    {/* Top Content: 3D Icon + Bold Facility Title */}
                    <div className="flex items-center gap-6 sm:gap-8 my-auto">
                      {/* 3D Emoji / Icon */}
                      <div className="w-18 h-18 sm:w-22 sm:h-22 rounded-2xl bg-slate-50 dark:bg-slate-800/80 border border-slate-100 dark:border-slate-700 flex items-center justify-center text-4xl sm:text-5xl shadow-xs shrink-0 group-hover:scale-105 transition-transform">
                        <span>{facility.emoji}</span>
                      </div>

                      {/* Bold Facility Title */}
                      <div className="min-w-0">
                        <h3 className="text-2xl sm:text-3xl lg:text-[28px] font-bold font-display text-[#0E2C44] dark:text-white leading-tight tracking-tight">
                          {facility.title}
                        </h3>
                      </div>
                    </div>

                    {/* Bottom Row: Light Divider + Gold HOVER TO SEE DETAILS + Arrow */}
                    <div className="pt-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
                      <span className="text-xs sm:text-sm font-extrabold tracking-widest text-[#B8860B] dark:text-[#F0A500] uppercase font-mono">
                        {isTouchDevice ? "TAP TO SEE DETAILS" : "HOVER TO SEE DETAILS"}
                      </span>
                      <ChevronRight className="w-5 h-5 sm:w-6 sm:h-6 text-[#B8860B] dark:text-[#F0A500] group-hover:translate-x-1.5 transition-transform" />
                    </div>
                  </div>

                  {/* BACK SIDE - EXACTLY TWO CONCISE SENTENCES WITH GENEROUS ROOM */}
                  <div 
                    className="absolute inset-0 bg-gradient-to-br from-[#0c2438] via-[#12395b] to-[#0a1c2c] dark:from-slate-900 dark:to-slate-950 rounded-[28px] sm:rounded-[32px] border border-white/20 border-l-[12px] sm:border-l-[16px] border-l-[#F0A500] px-7 sm:px-10 py-6 sm:py-7 flex flex-col justify-between text-white shadow-2xl overflow-hidden"
                    style={{ 
                      transform: "rotateY(180deg)", 
                      backfaceVisibility: "hidden", 
                      WebkitBackfaceVisibility: "hidden" 
                    }}
                  >
                    <div>
                      {/* Back Header Bar */}
                      <div className="flex items-center justify-between gap-3 border-b border-white/15 pb-3 mb-3">
                        <div className="flex items-center gap-2.5">
                          <span className="text-2xl">{facility.emoji}</span>
                          <span className="text-base sm:text-lg font-bold font-display text-white tracking-tight">
                            {facility.title}
                          </span>
                        </div>
                      </div>

                      {/* Concise 2-Sentence Description */}
                      <div className="space-y-2.5 pt-1">
                        <p className="text-sm sm:text-[15px] text-slate-100 font-sans leading-relaxed">
                          {facility.sentence1}
                        </p>
                        <p className="text-sm sm:text-[15px] text-slate-300 font-sans leading-relaxed">
                          {facility.sentence2}
                        </p>
                      </div>
                    </div>

                    {/* Back Footer */}
                    <div className="text-[11px] font-bold uppercase tracking-widest text-slate-400 pt-3 border-t border-white/10 flex items-center justify-end font-mono">
                      <span>{isTouchDevice ? "Tap to flip front" : "Hover out to flip"}</span>
                    </div>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>


        </section>

        {/* 9. Notice Board / Recent News Timeline */}
        <section className="container mx-auto max-w-6xl space-y-12 px-4">
          
          {/* Public Bulletin Noticeboard (Displayed at the top of the section) */}
          <div className="space-y-6">
            <div className="flex items-center gap-3 border-b border-gray-150 dark:border-slate-800 pb-3">
              <span className="w-2.5 h-6 bg-[#F0A500] rounded-full"></span>
              <h2 className="text-xl font-display font-bold text-gray-920 dark:text-white uppercase tracking-tight">
                📢 Public Bulletin Noticeboard
              </h2>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {notices.slice(0, 3).map((notice) => (
                <div key={notice.id} className="relative group animate-fade-in bg-white dark:bg-slate-900 p-5 rounded-2xl border border-gray-150 dark:border-slate-800 shadow-sm hover:shadow-md hover:-translate-y-1 duration-200 transition-all flex flex-col justify-between">
                  <div>
                    <div className="flex justify-between items-start gap-4 mb-2">
                      <span className="text-[10px] font-mono font-bold text-[#F0A500]">{formatBSDate(notice.date)}</span>
                      <span className={`text-[9px] font-poppins font-black uppercase tracking-widest px-2 py-0.5 rounded-full border ${notice.priority === "Urgent" ? "bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-400 border-red-100" : "bg-[#FFF3CC] dark:bg-amber-950/20 text-[#F0A500] border-[#FFF3CC]"}`}>
                        {notice.priority}
                      </span>
                    </div>
                    <h4 className={`text-base font-bold font-sans leading-tight ${notice.priority === "Urgent" ? "text-red-600 dark:text-red-400" : "text-gray-900 dark:text-white"}`}>
                      {notice.title}
                    </h4>
                  </div>
                  <p className="text-xs text-gray-600 dark:text-gray-400 font-sans mt-4 leading-relaxed font-semibold border-t border-gray-100 dark:border-slate-800 pt-2.5">
                    Targets: {(notice.targets || []).join(", ") || "All Visitors"}
                  </p>
                </div>
              ))}
              {notices.length === 0 && (
                <div className="col-span-full p-8 text-center text-xs text-gray-500 font-poppins font-bold bg-white dark:bg-slate-900 rounded-xl border border-dashed">
                   No immediate public bulletin updates, please check back later.
                </div>
              )}
            </div>

            <div className="pt-2 text-right">
              <Link
                to="/notices"
                className="inline-flex items-center gap-1.5 text-xs font-black font-poppins text-[#1B4F72] dark:text-blue-400 hover:underline uppercase tracking-widest"
              >
                Access complete bulletin archives →
              </Link>
            </div>
          </div>

          {/* Guardian Voices (Displayed below the Noticeboard) */}
          <div className="space-y-6 pt-6 border-t border-gray-100 dark:border-slate-800">
            <div className="flex items-center gap-3 border-b border-gray-150 dark:border-slate-800 pb-3">
              <span className="w-2.5 h-6 bg-[#2E7D4F] rounded-full"></span>
              <h2 className="text-xl font-display font-medium text-gray-920 dark:text-white uppercase tracking-tight">
                {content.testiTitle || "💬 Guardian Voices"}
              </h2>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {(content.guardianVoices && Array.isArray(content.guardianVoices) && content.guardianVoices.length > 0
                ? content.guardianVoices
                : [
                    {
                      text: content.testi1Text || "My son's results have improved significantly since joining Shikshantar. The teachers are dedicated and the portal helps us track everything easily.",
                      author: content.testi1Author || "Ram Prasad Sharma",
                      role: content.testi1Role || "Parent of Class 10 Student",
                      initials: content.testi1Initials || "RP"
                    },
                    {
                      text: content.testi2Text || "Best school in Karjanha Municipality for affordable quality education. My daughter got A+ in Science and Mathematics in SEE.",
                      author: content.testi2Author || "Sunita Devi Thapa",
                      role: content.testi2Role || "Parent of SEE Graduate 2081",
                      initials: content.testi2Initials || "SD"
                    },
                    {
                      text: content.testi3Text || "The online portal is very helpful. We can check fee receipts and results anytime from our phone. Very convenient for parents.",
                      author: content.testi3Author || "Mohan Lal Yadav",
                      role: content.testi3Role || "Parent of Class 9 Student",
                      initials: content.testi3Initials || "ML"
                    }
                  ].filter((v: any) => v.text || v.author)
              ).map((voice: any, index: number) => (
                <motion.div
                  key={voice.id || index}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, margin: "-50px" }}
                  transition={{ duration: 0.4, delay: index * 0.05 }}
                  className="h-full"
                >
                  <SpotlightCard
                    roundedClass="rounded-[24px]"
                    spotlightColor="rgba(240, 165, 0, 0.2)"
                    borderGlowColor="rgba(240, 165, 0, 0.95)"
                    glowAuraColor="rgba(240, 165, 0, 0.35)"
                    className="h-full cursor-pointer transition-transform duration-300 hover:-translate-y-1.5 shadow-sm hover:shadow-2xl"
                    innerClassName="bg-white dark:bg-slate-900 border-0 p-6 md:p-7 justify-between gap-5"
                  >
                    <div className="flex flex-col gap-3">
                      <div className="flex gap-1 text-[#F0A500] text-sm">★★★★★</div>
                      <blockquote className="text-[13px] text-gray-700 dark:text-gray-200 italic leading-relaxed font-sans font-medium">
                        "{voice.text}"
                      </blockquote>
                    </div>
                    <div className="flex items-center gap-3 pt-4 border-t border-gray-100 dark:border-slate-800/80 mt-auto">
                      <div className="w-10 h-10 rounded-full bg-[#1B4F72]/10 dark:bg-slate-800 flex items-center justify-center font-black text-[#1B4F72] dark:text-blue-400 text-xs shadow-xs">
                        {voice.initials || (voice.author ? voice.author.substring(0, 2).toUpperCase() : "G")}
                      </div>
                      <div>
                        <h5 className="text-xs font-black text-gray-900 dark:text-white font-poppins">
                          {voice.author}
                        </h5>
                        <span className="text-[10px] text-gray-500 dark:text-gray-400 font-sans font-semibold">
                          {voice.role}
                        </span>
                      </div>
                    </div>
                  </SpotlightCard>
                </motion.div>
              ))}
            </div>
          </div>
        </section>

        {/* 10. Contact / Map Location split Layout */}
        <section className="container mx-auto max-w-6xl">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-12">
            
            {/* Left: Google maps container */}
            <div className="lg:col-span-7 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <h3 className="text-xl font-display font-bold text-gray-900 dark:text-white uppercase tracking-wide">
                  🗺️ Find Our School Location
                </h3>
                <a
                  href="https://maps.app.goo.gl/Ykri7uu78Y22NVjd6"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-xs font-black font-poppins text-[#F0A500] hover:text-[#d4900a] transition-colors uppercase tracking-widest font-bold"
                >
                  📍 Open in Google Maps &rarr;
                </a>
              </div>
              <div className="w-full h-[360px] rounded-2xl overflow-hidden border-2 border-white dark:border-slate-800 shadow-xl bg-gray-150">
                <iframe
                  title="Shikshantar Academy Map Location"
                  src="https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3568.043743360216!2d86.1814415!3d26.8611814!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x39ec1c0cf1e37b71%3A0xccf0f22f2bf31dc2!2sShikshantar%20Academy!5e0!3m2!1sen!2snp!4v1718445582931!5m2!1sen!2snp"
                  className="w-full h-full border-0"
                  allowFullScreen
                  loading="lazy"
                  referrerPolicy="no-referrer-when-downgrade"
                ></iframe>
              </div>
            </div>

            {/* Right: Quick Inquiry Form saving to Firestore */}
            <div className="lg:col-span-12 xl:col-span-5 space-y-4 relative">
              <h3 className="text-xl font-display font-bold text-gray-900 dark:text-white uppercase tracking-wide flex items-center gap-2">
                <span>📋</span> Send Quick Web Enquiry
              </h3>
              
              <div className="relative rounded-[32px] group transition-all duration-300">
                {/* Outer Glow Bloom aura */}
                <div className="absolute inset-2 bg-gradient-to-r from-[#0a3d62] via-[#0284c7] to-[#F0A500] opacity-35 lg:opacity-0 lg:group-hover:opacity-30 blur-2xl transition-all duration-500 rounded-3xl -z-10 group-hover:scale-102 pointer-events-none" />

                {/* Boundary box with rotating gradient for lightning border effect */}
                <div className="relative w-full h-full rounded-[32px] overflow-hidden p-[2.5px] bg-gray-150 dark:bg-slate-800 transition-colors duration-300 group-hover:bg-transparent flex flex-col">
                  {/* Spinning lightning border */}
                  <div className="absolute inset-[-180%] bg-[conic-gradient(from_0deg,#0a3d62,#0284c7,#F0A500,#fbbf24,#0ea5e9,#0a3d62)] animate-[spin_5s_linear_infinite] opacity-60 lg:opacity-25 lg:group-hover:opacity-100 transition-opacity duration-300 z-0 pointer-events-none" />

                  {/* Inner masked content card */}
                  <div className="relative w-full h-full bg-white dark:bg-slate-900 p-6 md:p-8 rounded-[30px] flex flex-col z-10 overflow-hidden flex-1 shadow-xl">
                    {/* Visual Accent Lines */}
                    <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-amber-400 via-yellow-500 to-[#1B4F72] z-20" />

                {(() => {
                  let filledCount = 0;
                  if (enquiryName.trim()) filledCount++;
                  if (enquiryStudentName.trim()) filledCount++;
                  if (enquiryGrade) filledCount++;
                  if (enquiryPhone.replace(/\D/g, "").length === 10) filledCount++;
                  const completionPct = filledCount * 25;

                  return (
                    <AnimatePresence mode="wait">
                      {enquirySuccess ? (
                        <motion.div
                          key="success"
                          initial={{ opacity: 0, scale: 0.95, y: 10 }}
                          animate={{ opacity: 1, scale: 1, y: 0 }}
                          exit={{ opacity: 0, scale: 0.95 }}
                          transition={{ type: "spring", duration: 0.5 }}
                          className="text-center py-6 space-y-5"
                        >
                          <div className="w-16 h-16 bg-emerald-100 dark:bg-emerald-950/40 text-emerald-600 rounded-full flex items-center justify-center mx-auto shadow-sm">
                            <svg className="w-10 h-10 text-emerald-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
                              <polyline points="20 6 9 17 4 12"></polyline>
                            </svg>
                          </div>
                          <div className="space-y-1">
                            <h4 className="text-lg font-black text-gray-900 dark:text-white font-poppins uppercase tracking-wide">
                              Enquiry Registered!
                            </h4>
                            <p className="text-xs text-slate-500 dark:text-slate-400 max-w-xs mx-auto leading-relaxed">
                              Thank you for contacting Shikshantar Academy Bastipur. Our registrar has queued your query.
                            </p>
                          </div>

                          {/* Digital Carbon Check-In Sheet */}
                          <div className="bg-slate-50 dark:bg-slate-950/30 rounded-2xl border border-dashed border-slate-200 dark:border-slate-800 p-4 text-left space-y-3 relative overflow-hidden">
                            <div className="absolute top-0 right-0 bg-[#F0A500] text-slate-950 text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-bl-lg">
                              ONLINE LOG
                            </div>
                            
                            <div className="space-y-2 text-xs">
                              <div className="grid grid-cols-2 gap-2">
                                <div>
                                  <p className="text-[9px] text-gray-400 uppercase font-black">Parent Name</p>
                                  <p className="font-bold text-gray-800 dark:text-gray-200 truncate">{enquiryName}</p>
                                </div>
                                <div>
                                  <p className="text-[9px] text-gray-400 uppercase font-black">Student Name</p>
                                  <p className="font-bold text-gray-800 dark:text-gray-200 truncate">{enquiryStudentName}</p>
                                </div>
                              </div>
                              <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-100 dark:border-slate-800/60">
                                <div>
                                  <p className="text-[9px] text-gray-400 uppercase font-black">Target Class</p>
                                  <p className="font-bold text-[#1B4F72] dark:text-sky-400">{enquiryGrade}</p>
                                </div>
                                <div>
                                  <p className="text-[9px] text-gray-400 uppercase font-black">Ref ID</p>
                                  <p className="font-mono font-bold text-slate-600 dark:text-slate-300">
                                    #{enquiryRefId || "ENQ-9901"}
                                  </p>
                                </div>
                              </div>
                            </div>
                          </div>

                          <div className="pt-2">
                            <button
                              type="button"
                              onClick={() => {
                                setEnquirySuccess(false);
                                setEnquiryName("");
                                setEnquiryStudentName("");
                                setEnquiryGrade("");
                                setEnquiryPhone("");
                                setEnquiryEmail("");
                                setEnquiryMessage("");
                                setEnquiryError("");
                              }}
                              className="px-5 py-2.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-xl text-xs font-black uppercase tracking-wider transition-all duration-150"
                            >
                              Dismiss & Clean Form
                            </button>
                          </div>
                        </motion.div>
                      ) : (
                        <motion.div
                          key="form"
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          exit={{ opacity: 0 }}
                          className="space-y-5"
                        >
                          {/* Progress bar indicating parent walkthrough */}
                          <div className="space-y-1">
                            <div className="flex justify-between items-center text-[10px] text-gray-400 font-bold uppercase tracking-wider">
                              <span>Form Completion</span>
                              <span className="text-[#F0A500] font-mono">{completionPct}%</span>
                            </div>
                            <div className="w-full bg-slate-100 dark:bg-slate-800/80 h-1 rounded-full overflow-hidden">
                              <div 
                                className="bg-[#F0A500] h-full transition-all duration-300 rounded" 
                                style={{ width: `${completionPct}%` }}
                              />
                            </div>
                          </div>

                          {enquiryError && (
                            <motion.div
                              initial={{ opacity: 0, y: -5 }}
                              animate={{ opacity: 1, y: 0 }}
                              className="p-3 bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900/50 rounded-xl text-xs text-red-700 dark:text-red-400 flex items-start gap-2"
                            >
                              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                              <span className="font-semibold leading-normal">{enquiryError}</span>
                            </motion.div>
                          )}

                          <form onSubmit={handleEnquirySubmit} className="space-y-4">
                            
                            {/* Entity 1: Parent Name */}
                            <div className="space-y-1.5 group relative">
                              <label className="text-[10px] font-black uppercase text-gray-400 dark:text-slate-400 tracking-wider font-poppins flex items-center justify-between">
                                <span>Parent / Guardian Name *</span>
                                {enquiryName.trim().length > 3 && (
                                  <span className="text-emerald-500 font-mono text-[9px] font-bold">✓ Filled</span>
                                )}
                              </label>
                              <div className="relative">
                                <User className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none group-focus-within:text-[#1B4F72] transition-colors" />
                                <input
                                  type="text"
                                  required
                                  value={enquiryName}
                                  onChange={(e) => setEnquiryName(e.target.value)}
                                  placeholder="e.g. Rahul Sah"
                                  className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-gray-200 dark:border-slate-800 bg-[#FAFAF8] dark:bg-slate-900 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-[#1B4F72]/20 focus:border-[#1B4F72] text-gray-800 dark:text-white transition-all placeholder-slate-400"
                                />
                              </div>
                            </div>

                            {/* Entity 2: Student Name */}
                            <div className="space-y-1.5 group relative">
                              <label className="text-[10px] font-black uppercase text-gray-400 dark:text-slate-400 tracking-wider font-poppins flex items-center justify-between">
                                <span>Student / Child Name *</span>
                                {enquiryStudentName.trim().length > 3 && (
                                  <span className="text-emerald-500 font-mono text-[9px] font-bold">✓ Filled</span>
                                )}
                              </label>
                              <div className="relative">
                                <GraduationCap className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none group-focus-within:text-[#1B4F72] transition-colors" />
                                <input
                                  type="text"
                                  required
                                  value={enquiryStudentName}
                                  onChange={(e) => setEnquiryStudentName(e.target.value)}
                                  placeholder="e.g. Aayush Sah"
                                  className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-gray-200 dark:border-slate-800 bg-[#FAFAF8] dark:bg-slate-900 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-[#1B4F72]/20 focus:border-[#1B4F72] text-gray-800 dark:text-white transition-all placeholder-slate-400"
                                />
                              </div>
                            </div>

                            {/* Entity 3: Target Class */}
                            <div className="space-y-1.5 group relative">
                              <label className="text-[10px] font-black uppercase text-gray-400 dark:text-slate-400 tracking-wider font-poppins flex items-center justify-between">
                                <span>Grade Seeking Admission *</span>
                                {enquiryGrade && (
                                  <span className="text-emerald-500 font-mono text-[9px] font-bold">✓ Selected</span>
                                )}
                              </label>
                              <div className="relative">
                                <BookOpen className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none group-focus-within:text-[#1B4F72] transition-colors" />
                                <select
                                  required
                                  value={enquiryGrade}
                                  onChange={(e) => setEnquiryGrade(e.target.value)}
                                  className="w-full pl-9 pr-8 py-2.5 rounded-xl border border-gray-200 dark:border-slate-800 bg-[#FAFAF8] dark:bg-slate-900 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-[#1B4F72]/20 focus:border-[#1B4F72] text-gray-800 dark:text-white transition-all appearance-none"
                                >
                                  <option value="">-- Choose Target Grade --</option>
                                  {["Playgroup", "Nursery", "L.KG", "U.KG", "Class 1", "Class 2", "Class 3", "Class 4", "Class 5", "Class 6", "Class 7", "Class 8", "Class 9"].map((item) => (
                                    <option key={item} value={item}>{item}</option>
                                  ))}
                                </select>
                                <div className="absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400 text-[10px]">
                                  ▼
                                </div>
                              </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                              {/* Entity 4: Phone Number */}
                              <div className="space-y-1.5 group relative">
                                <label className="text-[10px] font-black uppercase text-gray-400 dark:text-slate-400 tracking-wider font-poppins flex items-center justify-between">
                                  <span>Phone Number *</span>
                                  {enquiryPhone.replace(/\D/g, "").length === 10 && (
                                    <span className="text-emerald-500 font-mono text-[9px] font-bold">✓ Valid</span>
                                  )}
                                </label>
                                <div className="relative">
                                  <Phone className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none group-focus-within:text-[#1B4F72] transition-colors" />
                                  <input
                                    type="tel"
                                    required
                                    value={enquiryPhone}
                                    onChange={(e) => {
                                      const cleaned = e.target.value.replace(/\D/g, "").slice(0, 10);
                                      setEnquiryPhone(cleaned);
                                    }}
                                    placeholder="e.g. 9812345678"
                                    className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-gray-200 dark:border-slate-800 bg-[#FAFAF8] dark:bg-slate-900 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-[#1B4F72]/20 focus:border-[#1B4F72] text-gray-800 dark:text-white transition-all placeholder-slate-400 font-mono"
                                  />
                                </div>
                              </div>

                              {/* Entity 5: Parent Email */}
                              <div className="space-y-1.5 group relative">
                                <label className="text-[10px] font-black uppercase text-gray-400 dark:text-slate-400 tracking-wider font-poppins flex items-center justify-between">
                                  <span>Parent Email (Optional)</span>
                                  {enquiryEmail.trim() && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(enquiryEmail) && (
                                    <span className="text-emerald-500 font-mono text-[9px] font-bold">✓ Valid</span>
                                  )}
                                </label>
                                <div className="relative">
                                  <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none group-focus-within:text-[#1B4F72] transition-colors" />
                                  <input
                                    type="email"
                                    value={enquiryEmail}
                                    onChange={(e) => setEnquiryEmail(e.target.value)}
                                    placeholder="e.g. parent@gmail.com"
                                    className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-gray-200 dark:border-slate-800 bg-[#FAFAF8] dark:bg-slate-900 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-[#1B4F72]/20 focus:border-[#1B4F72] text-gray-800 dark:text-white transition-all placeholder-slate-400"
                                  />
                                </div>
                              </div>
                            </div>

                            {/* Entity 6: Message */}
                            <div className="space-y-1.5">
                              <label className="text-[10px] font-black uppercase text-gray-400 dark:text-slate-400 tracking-wider font-poppins flex justify-between">
                                <span>Message / Questions (Optional)</span>
                                <span className="font-mono text-[9px] text-gray-400">{enquiryMessage.length}/300</span>
                              </label>
                              <textarea
                                rows={2}
                                maxLength={300}
                                value={enquiryMessage}
                                onChange={(e) => setEnquiryMessage(e.target.value)}
                                placeholder="Specify any classes or facilities inquiry..."
                                className="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-slate-800 bg-[#FAFAF8] dark:bg-slate-900 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-[#1B4F72]/20 focus:border-[#1B4F72] text-gray-800 dark:text-white transition-all placeholder-slate-400"
                              />
                            </div>

                            <button
                              type="submit"
                              disabled={enquiryLoading}
                              className="w-full bg-[#F0A500] hover:bg-[#D4900A] active:scale-[0.98] text-slate-950 font-black uppercase tracking-wider text-xs py-3.5 rounded-xl font-poppins shadow-md transition-all duration-150 disabled:opacity-50 flex justify-center items-center gap-2"
                            >
                              {enquiryLoading ? (
                                <>
                                  <span className="w-3.5 h-3.5 border-2 border-slate-950 border-t-transparent rounded-full animate-spin" />
                                  Registering Academic Query...
                                </>
                              ) : (
                                "📞 Register Academic Query"
                              )}
                            </button>
                          </form>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  );
                })()}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* 11. Social Media Links with Logos below the Contact Us Section */}
        <section className="container mx-auto max-w-6xl mt-6 pb-12 px-4">
          <div className="bg-gradient-to-r from-amber-50 to-orange-50/50 dark:from-slate-900/40 dark:to-slate-900/10 border border-amber-150/60 dark:border-slate-800/80 rounded-[32px] p-6 md:p-8 shadow-sm flex flex-col md:flex-row items-center justify-between gap-6">
            <div className="space-y-1 text-center md:text-left flex-1">
              <span className="text-[10px] font-bold text-amber-600 dark:text-amber-400 uppercase tracking-widest font-mono">🌐 Stay Connected & Follow Us</span>
              <h4 className="text-base md:text-lg font-display font-bold text-slate-800 dark:text-white">
                Our Official Social Media & Web Links
              </h4>
              <p className="text-xs text-gray-500 dark:text-gray-400 max-w-lg font-sans font-medium">
                Click on the official logos below to visit our active portals, read school highlights, or follow our official posts.
              </p>
            </div>
            
            <div className="flex flex-wrap items-center justify-center gap-3">
              {socialData.facebookUrl && (
                <a
                  href={socialData.facebookUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-4 py-2.5 bg-[#1877F2]/10 dark:bg-[#1877F2]/15 text-[#1877F2] hover:bg-[#1877F2] hover:text-white font-sans font-black text-[11px] uppercase tracking-wider rounded-xl flex items-center gap-2 transition-all shadow-sm border border-[#1877F2]/20 hover:scale-[1.02] active:scale-95 cursor-pointer"
                >
                  <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24">
                    <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
                  </svg>
                  <span>Facebook</span>
                </a>
              )}

              {socialData.websiteUrl && (
                <a
                  href={socialData.websiteUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-4 py-2.5 bg-emerald-500/10 dark:bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-600 hover:text-white font-sans font-black text-[11px] uppercase tracking-wider rounded-xl flex items-center gap-2 transition-all shadow-sm border border-emerald-500/20 hover:scale-[1.02] active:scale-95 cursor-pointer"
                >
                  <svg className="w-4 h-4 fill-none stroke-current" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
                    <circle cx="12" cy="12" r="10"></circle>
                    <line x1="2" y1="12" x2="22" y2="12"></line>
                    <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path>
                  </svg>
                  <span>Website</span>
                </a>
              )}

              {socialData.youtubeUrl && (
                <a
                  href={socialData.youtubeUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-4 py-2.5 bg-rose-600/10 dark:bg-rose-600/15 text-rose-600 dark:text-rose-400 hover:bg-rose-600 hover:text-white font-sans font-black text-[11px] uppercase tracking-wider rounded-xl flex items-center gap-2 transition-all shadow-sm border border-rose-600/20 hover:scale-[1.02] active:scale-95 cursor-pointer"
                >
                  <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24">
                    <path d="M23.498 6.163a3.003 3.003 0 0 0-2.11-2.108C19.524 3.545 12 3.545 12 3.545s-7.525 0-9.388.51a3.003 3.003 0 0 0-2.11 2.108C0 8.025 0 12 0 12s0 3.975.502 5.837a3.003 3.003 0 0 0 2.11 2.108c1.863.51 9.388.51 9.388.51s7.525 0 9.388-.51a3.002 3.002 0 0 0 2.11-2.108c.502-1.862.502-5.837.502-5.837s0-3.975-.502-5.837zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
                  </svg>
                  <span>YouTube</span>
                </a>
              )}
              {socialData.tiktokUrl && (
                <a
                  href={socialData.tiktokUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-4 py-2.5 bg-slate-800/10 dark:bg-slate-300/10 text-slate-800 dark:text-slate-300 hover:bg-slate-800 dark:hover:bg-slate-300 hover:text-white dark:hover:text-slate-900 font-sans font-black text-[11px] uppercase tracking-wider rounded-xl flex items-center gap-2 transition-all shadow-sm border border-slate-800/20 hover:scale-[1.02] active:scale-95 cursor-pointer"
                >
                  <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24">
                    <path d="M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.92-1.88 2.63-5.31 3.49-8.15 2.23-2.33-1.01-3.87-3.41-3.85-5.93.01-2.58 1.66-4.98 4.13-5.75 1.14-.37 2.37-.3 3.53.11v4.07c-.72-.37-1.57-.45-2.33-.22-1.01.27-1.72 1.2-1.74 2.24-.03 1.34 1.15 2.45 2.48 2.42 1.15-.01 2.11-.88 2.22-2.02.03-.51.01-1.02.01-1.53V0z"/>
                  </svg>
                  <span>TikTok</span>
                </a>
              )}
              {socialData.instagramUrl && (
                <a
                  href={socialData.instagramUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-4 py-2.5 bg-[#E1306C]/10 dark:bg-[#E1306C]/15 text-[#E1306C] hover:bg-[#E1306C] hover:text-white font-sans font-black text-[11px] uppercase tracking-wider rounded-xl flex items-center gap-2 transition-all shadow-sm border border-[#E1306C]/20 hover:scale-[1.02] active:scale-95 cursor-pointer"
                >
                  <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24">
                    <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.051.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z"/>
                  </svg>
                  <span>Instagram</span>
                </a>
              )}
              {socialData.whatsappNumber && (
                <a
                  href={`https://wa.me/${socialData.whatsappNumber.replace(/[^0-9]/g, '')}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-4 py-2.5 bg-[#25D366]/10 dark:bg-[#25D366]/15 text-[#25D366] hover:bg-[#25D366] hover:text-white font-sans font-black text-[11px] uppercase tracking-wider rounded-xl flex items-center gap-2 transition-all shadow-sm border border-[#25D366]/20 hover:scale-[1.02] active:scale-95 cursor-pointer"
                >
                  <svg className="w-4 h-4 fill-current" viewBox="0 0 448 512" xmlns="http://www.w3.org/2000/svg">
                    <path d="M380.9 97.1C339 55.1 283.2 32 223.9 32c-122.4 0-222 99.6-222 222 0 39.1 10.2 77.3 29.6 111L3 480l117.7-30.9c32.4 17.7 68.9 27 106.1 27h.1c122.3 0 224.1-99.6 224.1-222 0-59.3-25.2-115-67.1-157zm-157 341.6c-33.2 0-65.7-8.9-94-25.7l-6.7-4-69.8 18.3L72 359.2l-4.4-7c-18.5-29.4-28.2-63.3-28.2-98.2 0-101.7 82.8-184.5 184.6-184.5 49.3 0 95.6 19.2 130.4 54.1 34.8 34.9 56.2 81.2 56.1 130.5 0 101.8-84.9 184.6-186.6 184.6zm101.2-138.2c-5.5-2.8-32.8-16.2-37.9-18-5.1-1.9-8.8-2.8-12.5 2.8-3.7 5.6-14.3 18-17.6 21.8-3.2 3.7-6.5 4.2-12 1.4-32.6-16.3-54-29.1-75.5-66-5.7-9.8 5.7-9.1 16.3-30.3 1.8-3.7 .9-6.9-.5-9.7-1.4-2.8-12.5-30.1-17.1-41.2-4.5-10.8-9.1-9.3-12.5-9.5-3.2-.2-6.9-.2-10.6-.2-3.7 0-9.7 1.4-14.8 6.9-5.1 5.6-19.4 19-19.4 46.3 0 27.3 19.9 53.7 22.6 57.4 2.8 3.7 39.1 59.7 94.8 83.8 35.2 15.2 49 16.5 66.6 13.9 10.7-1.6 32.8-13.4 37.4-26.4 4.6-13 4.6-24.1 3.2-26.4-1.3-2.5-5-3.9-10.5-6.6z"/>
                  </svg>
                  <span>WhatsApp</span>
                </a>
              )}
            </div>
          </div>


        </section>

      </div>



      {/* 12. Persistent Mobile Sticky "Admission Enquiry" Button */}
      <div className="md:hidden fixed bottom-5 right-5 z-40">
        <Link
          to="/admission"
          className="bg-[#F0A500] hover:bg-[#D4900A] text-slate-950 font-black px-5 py-3.5 rounded-full shadow-2xl flex items-center gap-1.5 text-[11px] uppercase tracking-wider scale-100 hover:scale-105 active:scale-95 transition-all duration-200 border border-white/20 font-poppins"
        >
          <span>✏️ Admission Enquiry</span>
        </Link>
      </div>

      {/* 13. Lightbox Expanded Single Photo Modal */}
      {expandedImage && createPortal(
        <div
          className="fixed inset-0 z-[9999] bg-black/95 backdrop-blur-md flex items-center justify-center p-4 cursor-zoom-out animate-in fade-in duration-200"
          onClick={() => setExpandedImage(null)}
        >
          <button
            className="absolute top-6 right-6 text-white/70 hover:text-white bg-black/50 hover:bg-white/20 rounded-full p-2.5 transition-all z-[110] cursor-pointer"
            onClick={(e) => {
              e.stopPropagation();
              setExpandedImage(null);
            }}
            title="Close Lightbox"
          >
            <X className="w-8 h-8 font-bold" />
          </button>
          <div className="relative max-w-[95vw] max-h-[90vh] flex items-center justify-center select-none" onClick={(e) => e.stopPropagation()}>
            <img
              src={expandedImage}
              alt="Expanded view"
              className="max-w-[92vw] max-h-[85vh] object-contain rounded-2xl shadow-2xl shadow-black ring-4 ring-white/10 cursor-zoom-out transition-all duration-300 hover:brightness-105"
              onClick={() => setExpandedImage(null)}
              referrerPolicy="no-referrer"
            />
          </div>
        </div>,
        document.body
      )}

      {/* 14. Cinematic Fullscreen Video Modal */}
      {isCinematicOpen && createPortal(
        <div className="fixed inset-0 z-[99999] bg-black/95 backdrop-blur-md flex flex-col items-center justify-center p-4 md:p-8 animate-in fade-in duration-200" onClick={() => setIsCinematicOpen(false)}>
          {/* Top Header Row with Title and Big Close (Cut) button */}
          <div className="w-full max-w-5xl flex items-center justify-between mb-4 text-white" onClick={(e) => e.stopPropagation()}>
            <div className="space-y-1">
              <span className="text-xs font-bold text-[#F0A500] uppercase tracking-widest">🎥 CINEMATIC SCREEN</span>
              <h4 className="text-lg md:text-xl font-display font-medium text-amber-400">
                {content.homeVideoTitle || "Shikshantar Academy Campus Showreel"}
              </h4>
            </div>
            <button
              onClick={() => setIsCinematicOpen(false)}
              className="px-4 py-2 bg-red-600/20 hover:bg-red-600 text-red-200 hover:text-white border border-red-500/30 rounded-xl transition-all font-bold font-sans text-xs flex items-center gap-2 cursor-pointer shadow-md"
              title="Close/Cut Video"
            >
              <X className="w-4 h-4" />
              <span>Cut Video (Close)</span>
            </button>
          </div>
          
          {/* Main Video Body with Native Controls and custom layout */}
          <div className="w-full max-w-5xl aspect-video rounded-3xl overflow-hidden border border-white/10 shadow-2xl bg-black relative" onClick={(e) => e.stopPropagation()}>
            <video
              src={content.homeVideoUrl || "https://pixabay.com/videos/download/video-246148_medium.mp4"}
              className="w-full h-full object-contain"
              controls
              autoPlay
              loop
              playsInline
            />
          </div>
          
          {/* Written Text / Descriptive Information Section below the large player */}
          <div className="w-full max-w-5xl mt-6 bg-white/5 border border-white/10 p-5 rounded-2xl text-white text-center md:text-left flex flex-col md:flex-row items-center md:items-start justify-between gap-6" onClick={(e) => e.stopPropagation()}>
            <div className="space-y-2 flex-1">
              <h5 className="text-amber-400 font-bold uppercase text-[11px] tracking-wider">🌟 HOLISTIC DEVELOPMENT & MODERN INFRASTRUCTURE</h5>
              <p className="text-sm text-gray-200 leading-relaxed font-sans font-medium">
                {content.homeVideoDesc || "Our campus features modern infrastructure, cutting-edge science and computer labs, and a native English-medium environment. We execute 4 monthly/term assessments per year with a transparent parent portal to guarantee excellent student learning outcomes."}
              </p>
            </div>
            <div className="shrink-0 flex flex-wrap gap-2.5">
              <div className="px-3.5 py-2 bg-sky-500/10 border border-sky-500/20 text-sky-300 text-xs font-bold rounded-lg uppercase tracking-wider font-mono">🔬 Science Labs</div>
              <div className="px-3.5 py-2 bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-xs font-bold rounded-lg uppercase tracking-wider font-mono">🌐 English Medium</div>
              <div className="px-3.5 py-2 bg-amber-500/10 border border-amber-500/20 text-amber-300 text-xs font-bold rounded-lg uppercase tracking-wider font-mono">🏆 Sports & Arts</div>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* 15. Inline Notice Ticker Announcement Editor Modal */}
      {renderNoticeEditorModal()}
    </div>
  );
}

