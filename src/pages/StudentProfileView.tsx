import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { 
  ArrowLeft, 
  User, 
  GraduationCap, 
  Bus, 
  Monitor, 
  FileText, 
  CreditCard, 
  Edit3, 
  Trash2, 
  Calendar, 
  Mail, 
  Phone, 
  MapPin, 
  ShieldCheck, 
  BadgeCheck, 
  Award, 
  Users, 
  Clock, 
  CheckCircle2, 
  AlertCircle,
  ExternalLink,
  Layers
} from 'lucide-react';
import { db, auth } from '../firebase';
import { doc, getDoc, collection, query, where, getDocs } from 'firebase/firestore';

export default function StudentProfileView() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [student, setStudent] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentRole, setCurrentRole] = useState<string>('admin');

  useEffect(() => {
    const role = localStorage.getItem('userRole') || 'admin';
    setCurrentRole(role);

    const fetchStudent = async () => {
      if (!id) {
        setError('No student identifier provided.');
        setLoading(false);
        return;
      }

      setLoading(true);
      setError(null);
      try {
        const cleanId = decodeURIComponent(id).trim();
        
        // 1. Try finding by Firestore Document ID
        let foundData: any = null;
        const directDoc = await getDoc(doc(db, 'users', cleanId));
        if (directDoc.exists()) {
          foundData = { id: directDoc.id, ...directDoc.data() };
        } else {
          // 2. Query by permanentStudentId
          const qPerm = query(collection(db, 'users'), where('permanentStudentId', '==', cleanId));
          const snapPerm = await getDocs(qPerm);
          if (!snapPerm.empty) {
            foundData = { id: snapPerm.docs[0].id, ...snapPerm.docs[0].data() };
          } else {
            // 3. Query by studentId
            const qStd = query(collection(db, 'users'), where('studentId', '==', cleanId));
            const snapStd = await getDocs(qStd);
            if (!snapStd.empty) {
              foundData = { id: snapStd.docs[0].id, ...snapStd.docs[0].data() };
            } else {
              // 4. Query by EMIS
              const qEmis = query(collection(db, 'users'), where('emisNumber', '==', cleanId));
              const snapEmis = await getDocs(qEmis);
              if (!snapEmis.empty) {
                foundData = { id: snapEmis.docs[0].id, ...snapEmis.docs[0].data() };
              }
            }
          }
        }

        if (!foundData) {
          setError(`Student record not found for ID "${cleanId}".`);
        } else {
          setStudent(foundData);
        }
      } catch (err: any) {
        console.error('Error fetching student profile:', err);
        setError(err.message || 'Failed to load student profile.');
      } finally {
        setLoading(false);
      }
    };

    fetchStudent();
  }, [id]);

  if (loading) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-12 min-h-[500px]">
        <div className="w-12 h-12 rounded-full border-4 border-primary/20 border-t-primary animate-spin mb-4" />
        <p className="text-sm font-bold text-gray-600 dark:text-gray-300">Loading student profile...</p>
      </div>
    );
  }

  if (error || !student) {
    return (
      <div className="flex-1 max-w-4xl mx-auto p-6 md:p-8">
        <button
          onClick={() => navigate('/user-approvals')}
          className="inline-flex items-center gap-2 text-sm font-bold text-primary hover:underline mb-6 cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" /> Back to User Management
        </button>

        <div className="bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-2xl p-8 text-center">
          <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-3" />
          <h2 className="text-xl font-bold text-red-900 dark:text-red-300 mb-2">Student Profile Not Found</h2>
          <p className="text-sm text-red-700 dark:text-red-400 mb-6">{error || 'The requested student profile could not be located.'}</p>
          <button
            onClick={() => navigate('/user-approvals')}
            className="px-5 py-2.5 bg-primary text-white rounded-xl font-bold text-sm hover:opacity-90 shadow-sm"
          >
            Return to User Management
          </button>
        </div>
      </div>
    );
  }

  const permanentId = student.permanentStudentId || student.studentId || `STU-${student.id.substring(0, 6)}`;
  const emis = student.emisNumber || student.studentEmis || 'N/A';
  const displayClass = student.class ? `Class ${student.class}` : 'Unassigned Class';
  const displaySection = student.section ? `Section ${student.section}` : '';
  const displayRoll = student.rollNumber || student.rollNo ? `Roll No. ${student.rollNumber || student.rollNo}` : '';
  const academicYear = student.classAssignedYear || student.academicYear || '2083-2084 B.S.';

  // Format creation date
  let registeredDate = 'Registered Record';
  if (student.createdAt) {
    try {
      registeredDate = new Date(student.createdAt).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
      });
    } catch (_) {}
  }

  return (
    <div className="w-full max-w-6xl mx-auto p-4 sm:p-6 lg:p-8 space-y-6">
      {/* Top Navigation & Context Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <button
          type="button"
          onClick={() => navigate('/user-approvals')}
          className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-200 text-xs font-bold hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors shadow-xs cursor-pointer w-fit"
        >
          <ArrowLeft className="w-4 h-4" /> Back to User Management
        </button>

        {/* Action Buttons Toolbar */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Result Button */}
          <button
            type="button"
            onClick={() => {
              navigate(`/admin?tab=student_result&studentId=${encodeURIComponent(student.id)}`);
            }}
            className="px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-black text-xs rounded-xl shadow-xs transition-all flex items-center gap-2 cursor-pointer"
            title="View complete published examination marks"
          >
            <FileText className="w-4 h-4" /> Result
          </button>

          {/* Fee Status Button */}
          <button
            type="button"
            onClick={() => {
              navigate(`/account-admin?tab=student_laser&studentId=${encodeURIComponent(student.id)}`);
            }}
            className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs rounded-xl shadow-xs transition-all flex items-center gap-2 cursor-pointer"
            title="View student fee account ledger"
          >
            <CreditCard className="w-4 h-4" /> Fee Status
          </button>

          {/* Edit Profile Button */}
          <button
            type="button"
            onClick={() => {
              navigate(`/user-approvals?editUserId=${encodeURIComponent(student.id)}`);
            }}
            className="px-4 py-2.5 bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-100 border border-indigo-200 dark:border-indigo-800 font-black text-xs rounded-xl transition-all flex items-center gap-2 cursor-pointer"
            title="Edit student profile details"
          >
            <Edit3 className="w-4 h-4" /> Edit Profile
          </button>

          {/* Delete Account Button */}
          <button
            type="button"
            onClick={() => {
              navigate(`/user-approvals?deleteUserId=${encodeURIComponent(student.id)}`);
            }}
            className="px-4 py-2.5 bg-red-50 dark:bg-red-950/40 text-red-600 dark:text-red-400 hover:bg-red-600 hover:text-white border border-red-200 dark:border-red-800 font-black text-xs rounded-xl transition-all flex items-center gap-2 cursor-pointer"
            title="Permanently remove student account"
          >
            <Trash2 className="w-4 h-4" /> Delete Account
          </button>
        </div>
      </div>

      {/* Main Student Header Card */}
      <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/90 dark:border-slate-800 shadow-md p-6 sm:p-8 overflow-hidden relative">
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-6">
          {/* Avatar / Photo */}
          <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-2xl bg-gradient-to-tr from-emerald-600 to-teal-500 text-white font-black text-3xl sm:text-4xl flex items-center justify-center shadow-lg border-2 border-white dark:border-slate-800 shrink-0 overflow-hidden">
            {student.avatarUrl ? (
              <img src={student.avatarUrl} alt={student.fullName || 'Student'} className="w-full h-full object-cover" />
            ) : (
              <span>{(student.fullName || student.name || 'S').charAt(0).toUpperCase()}</span>
            )}
          </div>

          {/* Bio Info */}
          <div className="flex-1 min-w-0 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                STUDENT
              </span>
              <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                student.status === 'active' || student.active !== false
                  ? 'bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300'
                  : 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
              }`}>
                {student.status || (student.active !== false ? 'Active' : 'Inactive')}
              </span>
              <span className="text-xs font-medium text-slate-400">
                Registered: {registeredDate}
              </span>
            </div>

            <h1 className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-white truncate">
              {student.fullName || student.name || 'Unnamed Student'}
            </h1>

            <div className="flex flex-wrap items-center gap-3 text-xs sm:text-sm font-semibold text-slate-600 dark:text-slate-300">
              <span className="inline-flex items-center gap-1.5 font-mono text-blue-600 dark:text-blue-400 font-bold bg-blue-50 dark:bg-blue-950/40 px-2.5 py-1 rounded-lg border border-blue-100 dark:border-blue-900">
                <BadgeCheck className="w-4 h-4 text-blue-500" /> {permanentId}
              </span>
              {emis !== 'N/A' && (
                <span className="inline-flex items-center gap-1.5 font-mono text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 px-2.5 py-1 rounded-lg">
                  EMIS: <strong>{emis}</strong>
                </span>
              )}
              <span className="px-2.5 py-1 bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300 rounded-lg border border-amber-200 dark:border-amber-800 font-bold">
                {displayClass} {displaySection ? `• ${displaySection}` : ''} {displayRoll ? `• ${displayRoll}` : ''}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Grid of Profile Detail Sections */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* 1. PERSONAL DETAILS */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/90 dark:border-slate-800 p-6 shadow-sm space-y-4">
          <div className="flex items-center gap-2 pb-3 border-b border-slate-100 dark:border-slate-800">
            <User className="w-5 h-5 text-blue-600" />
            <h2 className="text-sm font-black uppercase tracking-wider text-slate-800 dark:text-slate-100">
              1. Personal & Identity Details
            </h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
            <div>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider mb-1">Student Full Name</p>
              <p className="font-bold text-slate-800 dark:text-slate-100 text-sm">{student.fullName || student.name || 'N/A'}</p>
            </div>

            <div>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider mb-1">Permanent Student ID</p>
              <p className="font-mono font-bold text-blue-600 dark:text-blue-400 text-sm">{permanentId}</p>
            </div>

            <div>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider mb-1">EMIS Number</p>
              <p className="font-mono font-bold text-slate-800 dark:text-slate-100 text-sm">{emis}</p>
            </div>

            <div>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider mb-1">Account Email</p>
              <p className="font-medium text-slate-800 dark:text-slate-100 flex items-center gap-1.5 truncate">
                <Mail className="w-3.5 h-3.5 text-slate-400 shrink-0" /> {student.email || 'N/A'}
              </p>
            </div>

            <div>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider mb-1">Contact Phone</p>
              <p className="font-bold text-slate-800 dark:text-slate-100 flex items-center gap-1.5">
                <Phone className="w-3.5 h-3.5 text-slate-400 shrink-0" /> {student.phone || 'N/A'}
              </p>
            </div>

            <div>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider mb-1">Date of Birth</p>
              <div className="font-medium text-slate-800 dark:text-slate-100 space-y-0.5">
                <div className="flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5 text-slate-400" />
                  <span>{student.dob || 'Not Provided'} (A.D.)</span>
                </div>
                {student.dobBs && (
                  <div className="text-slate-500 dark:text-slate-400 font-semibold pl-5">
                    {student.dobBs} (B.S.)
                  </div>
                )}
              </div>
            </div>

            <div>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider mb-1">Gender</p>
              <p className="font-bold text-slate-800 dark:text-slate-100 capitalize">{student.gender || 'Not Specified'}</p>
            </div>

            <div>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider mb-1">Permanent Address</p>
              <p className="font-medium text-slate-800 dark:text-slate-100 flex items-center gap-1.5">
                <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" /> {student.address || student.permanentAddress || 'Not Provided'}
              </p>
            </div>

            {student.temporaryAddress && (
              <div>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider mb-1">Temporary / Current Address</p>
                <p className="font-medium text-slate-800 dark:text-slate-100 flex items-center gap-1.5">
                  <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" /> {student.temporaryAddress}
                </p>
              </div>
            )}

            <div>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider mb-1">Caste / Ethnicity</p>
              <p className="font-bold text-slate-800 dark:text-slate-100">{student.caste || 'Not Specified'}</p>
            </div>

            <div>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider mb-1">Disability Status</p>
              <p className="font-bold text-slate-800 dark:text-slate-100">{student.disability || 'None'}</p>
            </div>

            {student.bloodGroup && (
              <div>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider mb-1">Blood Group</p>
                <p className="font-bold text-rose-600 dark:text-rose-400">{student.bloodGroup}</p>
              </div>
            )}
          </div>
        </div>

        {/* 2. ACADEMIC & ENROLLMENT DETAILS */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/90 dark:border-slate-800 p-6 shadow-sm space-y-4">
          <div className="flex items-center gap-2 pb-3 border-b border-slate-100 dark:border-slate-800">
            <GraduationCap className="w-5 h-5 text-emerald-600" />
            <h2 className="text-sm font-black uppercase tracking-wider text-slate-800 dark:text-slate-100">
              2. Academic & Enrollment Details
            </h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
            <div>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider mb-1">Assigned Academic Year</p>
              <p className="font-bold text-slate-800 dark:text-slate-100 text-sm">{academicYear}</p>
            </div>

            <div>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider mb-1">Enrolled Class</p>
              <p className="font-black text-emerald-700 dark:text-emerald-400 text-sm">{student.class ? `Class ${student.class}` : 'N/A'}</p>
            </div>

            <div>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider mb-1">Section</p>
              <p className="font-bold text-slate-800 dark:text-slate-100 text-sm">{student.section || 'A'}</p>
            </div>

            <div>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider mb-1">Roll Number</p>
              <p className="font-mono font-bold text-slate-800 dark:text-slate-100 text-sm">{student.rollNumber || student.rollNo || 'Not Assigned'}</p>
            </div>

            <div>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider mb-1">Class Teacher Assignment</p>
              <p className="font-medium text-slate-700 dark:text-slate-300">{student.linkedTeacherId || 'Standard Class Assignment'}</p>
            </div>

            <div>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider mb-1">Enrollment Status</p>
              <span className="inline-block px-2.5 py-1 rounded-md text-[11px] font-black bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                Official Roster Active
              </span>
            </div>

            {student.admissionDate && (
              <div>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider mb-1">Admission Date</p>
                <p className="font-medium text-slate-800 dark:text-slate-200">{student.admissionDate}</p>
              </div>
            )}

            {student.previousSchool && (
              <div>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider mb-1">Previous School</p>
                <p className="font-medium text-slate-800 dark:text-slate-200">{student.previousSchool}</p>
              </div>
            )}

            <div>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider mb-1">Board / Curriculum</p>
              <p className="font-medium text-slate-800 dark:text-slate-200">{student.board || 'Curriculum Development Centre (CDC) / NEB'}</p>
            </div>

            {(student.applicationId || student.trackingId) && (
              <div>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider mb-1">Registration / Application ID</p>
                <p className="font-mono font-bold text-slate-700 dark:text-slate-300">{student.applicationId || student.trackingId}</p>
              </div>
            )}
          </div>
        </div>

        {/* 3. GUARDIAN & FAMILY DETAILS */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/90 dark:border-slate-800 p-6 shadow-sm space-y-4">
          <div className="flex items-center gap-2 pb-3 border-b border-slate-100 dark:border-slate-800">
            <Users className="w-5 h-5 text-indigo-600" />
            <h2 className="text-sm font-black uppercase tracking-wider text-slate-800 dark:text-slate-100">
              3. Guardian & Family Details
            </h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
            <div>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider mb-1">Father's Full Name</p>
              <p className="font-bold text-slate-800 dark:text-slate-100 text-sm">{student.fatherName || 'Not Provided'}</p>
              {student.fatherOccupation && (
                <p className="text-[11px] text-slate-500 mt-0.5">Occupation: {student.fatherOccupation}</p>
              )}
            </div>

            <div>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider mb-1">Mother's Full Name</p>
              <p className="font-bold text-slate-800 dark:text-slate-100 text-sm">{student.motherName || 'Not Provided'}</p>
              {student.motherOccupation && (
                <p className="text-[11px] text-slate-500 mt-0.5">Occupation: {student.motherOccupation}</p>
              )}
            </div>

            <div>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider mb-1">Primary Guardian Name</p>
              <p className="font-bold text-slate-800 dark:text-slate-100 text-sm">{student.guardianName || student.fatherName || student.motherName || 'N/A'}</p>
              <p className="text-[11px] text-slate-500 mt-0.5">Relation: {student.guardianRelation || student.relationship || (student.fatherName ? 'Father' : 'Guardian')}</p>
            </div>

            <div>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider mb-1">Guardian Contact Phone</p>
              <p className="font-bold text-slate-800 dark:text-slate-100 flex items-center gap-1.5 text-sm">
                <Phone className="w-3.5 h-3.5 text-slate-400 shrink-0" /> {student.guardianPhone || student.phone || 'N/A'}
              </p>
            </div>

            <div className="sm:col-span-2 pt-2 border-t border-slate-100 dark:border-slate-800">
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider mb-1">Scholarship Award Status</p>
              <div className="flex items-center gap-2">
                <span className={`px-2.5 py-1 rounded-md text-xs font-bold ${
                  student.scholarshipStatus === 'Provided'
                    ? 'bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200'
                    : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
                }`}>
                  {student.scholarshipStatus === 'Provided' ? 'Scholarship Awarded' : 'No Active Scholarship'}
                </span>
                {student.scholarshipStatus === 'Provided' && (
                  <span className="text-xs font-mono font-bold text-amber-700 dark:text-amber-400">
                    NRs. {Number(student.scholarshipAmount || 0).toLocaleString()} per month
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* 4. TRANSPORTATION DETAILS */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/90 dark:border-slate-800 p-6 shadow-sm space-y-4">
          <div className="flex items-center gap-2 pb-3 border-b border-slate-100 dark:border-slate-800">
            <Bus className="w-5 h-5 text-amber-500" />
            <h2 className="text-sm font-black uppercase tracking-wider text-slate-800 dark:text-slate-100">
              4. Transportation Details
            </h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
            <div>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider mb-1">School Transport Facility</p>
              <span className={`inline-block px-2.5 py-1 rounded-md text-xs font-black ${
                student.hasTransportation === 'Yes'
                  ? 'bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300'
                  : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
              }`}>
                {student.hasTransportation === 'Yes' ? 'YES (Opted In)' : 'NO (Private / Self)'}
              </span>
            </div>

            <div>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider mb-1">Designated Route</p>
              <p className="font-bold text-slate-800 dark:text-slate-100 text-sm">
                {student.hasTransportation === 'Yes' ? (student.transportRoute || 'Default Bastipur Route') : 'Not Applicable'}
              </p>
            </div>

            <div>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider mb-1">Monthly Transportation Fee</p>
              <p className="font-mono font-bold text-amber-600 dark:text-amber-400 text-sm">
                {student.hasTransportation === 'Yes'
                  ? `NRs. ${Number(student.transportFee || 0).toLocaleString()} / month`
                  : 'NRs. 0'}
              </p>
            </div>

            <div>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider mb-1">Pickup / Drop Point</p>
              <p className="font-medium text-slate-700 dark:text-slate-300">
                {student.hasTransportation === 'Yes' ? (student.pickupPoint || student.dropPoint || student.address || 'Designated Route Stop') : 'N/A'}
              </p>
            </div>

            {student.hasTransportation === 'Yes' && (student.transportVehicle || student.busNo) && (
              <div>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider mb-1">Assigned Vehicle / Bus</p>
                <p className="font-bold text-slate-800 dark:text-slate-200">
                  {student.transportVehicle || student.busNo}
                </p>
              </div>
            )}
          </div>
        </div>

        {/* 5. OTHER REGISTRATION FACILITIES */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/90 dark:border-slate-800 p-6 shadow-sm space-y-4 lg:col-span-2">
          <div className="flex items-center gap-2 pb-3 border-b border-slate-100 dark:border-slate-800">
            <Monitor className="w-5 h-5 text-cyan-600" />
            <h2 className="text-sm font-black uppercase tracking-wider text-slate-800 dark:text-slate-100">
              5. Additional Registered Facilities & School Ledger Services
            </h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 text-xs">
            <div>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider mb-1">Computer Lab Education</p>
              <span className={`inline-block px-2.5 py-1 rounded-md text-xs font-black ${
                student.hasComputer === 'Yes'
                  ? 'bg-cyan-100 text-cyan-800 dark:bg-cyan-950 dark:text-cyan-300'
                  : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
              }`}>
                {student.hasComputer === 'Yes' ? 'YES (Enrolled in Computer Lab)' : 'NO'}
              </span>
            </div>

            <div>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider mb-1">Monthly Computer Lab Fee</p>
              <p className="font-mono font-bold text-cyan-600 dark:text-cyan-400 text-sm">
                {student.hasComputer === 'Yes'
                  ? `NRs. ${Number(student.computerFee || 0).toLocaleString()} / month`
                  : 'NRs. 0'}
              </p>
            </div>

            <div>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider mb-1">Advance Balance Credit</p>
              <p className="font-mono font-bold text-emerald-600 dark:text-emerald-400 text-sm">
                NRs. {Number(student.advanceBalance || 0).toLocaleString()}
              </p>
            </div>

            <div>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider mb-1">Account Authorization</p>
              <div className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400 font-bold">
                <CheckCircle2 className="w-4 h-4" /> Verified Student Profile
              </div>
            </div>
          </div>
        </div>

      </div>

      {/* Bottom Action Footer */}
      <div className="pt-4 flex flex-wrap items-center justify-between gap-4 border-t border-slate-200 dark:border-slate-800">
        <button
          type="button"
          onClick={() => navigate('/user-approvals')}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-bold transition-all cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" /> Return to User List
        </button>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => {
              navigate(`/admin?tab=student_result&studentId=${encodeURIComponent(student.id)}`);
            }}
            className="px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-black text-xs rounded-xl shadow-xs transition-all flex items-center gap-2 cursor-pointer"
          >
            <FileText className="w-4 h-4" /> View Published Results
          </button>
          <button
            type="button"
            onClick={() => {
              navigate(`/account-admin?tab=student_laser&studentId=${encodeURIComponent(student.id)}`);
            }}
            className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs rounded-xl shadow-xs transition-all flex items-center gap-2 cursor-pointer"
          >
            <CreditCard className="w-4 h-4" /> Open Fee Ledger
          </button>
        </div>
      </div>
    </div>
  );
}
