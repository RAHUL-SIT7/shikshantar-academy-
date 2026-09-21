import React, { useState, useEffect } from 'react';
import { Download, FileSpreadsheet, ShieldAlert, CheckCircle, RefreshCcw, Search, User } from 'lucide-react';
import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';

interface StudentData {
  id: string;
  fullName?: string;
  name?: string;
  studentId?: string;
  gender?: string;
  dobBS?: string; // YYYY-MM-DD
  caste?: string;
  disability?: string;
  fatherName?: string;
  motherName?: string;
  contactNumber?: string;
  phone?: string;
  class?: string;
  section?: string;
}

const IemisExport = ({ userRole }: { userRole?: string }) => {
  const [students, setStudents] = useState<StudentData[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [selectedClass, setSelectedClass] = useState<string>('All');

  const classOptions = [
    { value: 'All', label: 'All' },
    { value: 'Play Group', label: 'Play Group' },
    { value: 'Nursery', label: 'Nursery' },
    { value: 'LKG', label: 'LKG' },
    { value: 'UKG', label: 'UKG' },
    { value: '1', label: 'Class 1' },
    { value: '2', label: 'Class 2' },
    { value: '3', label: 'Class 3' },
    { value: '4', label: 'Class 4' },
    { value: '5', label: 'Class 5' },
    { value: '6', label: 'Class 6' },
    { value: '7', label: 'Class 7' },
    { value: '8', label: 'Class 8' },
    { value: '9', label: 'Class 9' },
    { value: '10', label: 'Class 10' }
  ];

  if (userRole !== 'admin') {
    return (
      <div className="bg-red-50 text-red-600 p-6 rounded-xl flex items-center gap-3">
        <ShieldAlert className="w-8 h-8" />
        <div>
          <h2 className="text-xl font-bold">Access Denied</h2>
          <p>You do not have permission to access the IEMIS export module.</p>
        </div>
      </div>
    );
  }

  const fetchStudents = async () => {
    setIsLoading(true);
    setError(null);
    setSuccess(null);
    try {
      const q = query(collection(db, 'users'), where('role', '==', 'student'));
      const querySnapshot = await getDocs(q);
      const data: StudentData[] = [];
      querySnapshot.forEach((doc) => {
        data.push({ id: doc.id, ...doc.data() } as StudentData);
      });
      setStudents(data);
      setSuccess(`Successfully loaded ${data.length} student records.`);
    } catch (err: any) {
      console.error(err);
      setError("Failed to fetch students. " + err.message);
      handleFirestoreError(err, OperationType.LIST, 'users');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchStudents();
  }, []);

  const handleExport = async () => {
    setIsLoading(true);
    setError(null);
    setSuccess(null);
    
    try {
      const filteredStudents = selectedClass === 'All' 
        ? students 
        : students.filter(s => s.class === selectedClass);

      if (filteredStudents.length === 0) {
        throw new Error("No students found for the selected class to export.");
      }

      // CEHRD IEMIS standard mapping approach (Generic Representation)
      const exportData = filteredStudents.map((s, index) => {
        // Parse DOB
        let dobYear = '';
        let dobMonth = '';
        let dobDay = '';
        if (s.dobBS && s.dobBS.includes('-')) {
          const parts = s.dobBS.split('-');
          if (parts.length === 3) {
            dobYear = parts[0];
            dobMonth = parts[1];
            dobDay = parts[2];
          }
        }

        const name = s.fullName || s.name || '';

        return {
          'sn': index + 1,
          'student_name_eng': name,
          'student_name_nep': '',
          'std_reg_id': s.studentId || '',
          'emis_number': (s as any).emisNumber || '',
          'sex': s.gender === 'Female' ? 'F' : (s.gender === 'Male' ? 'M' : 'O'),
          'dob_year': dobYear,
          'dob_month': dobMonth,
          'dob_day': dobDay,
          'caste': s.caste || 'Others', // Dalit, Janajati, Brahmin/Chhetri, Others
          'disability': s.disability || 'No', // Visual, Hearing, etc., or No
          'ecd_experience': 'Yes',
          'father_name': s.fatherName || '',
          'mother_name': s.motherName || '',
          'mobile_1': s.contactNumber || s.phone || '',
          'Class': s.class || '',
          'Stream/Subject': 'General'
        };
      });

      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet(`IEMIS_Export_${selectedClass !== 'All' ? selectedClass : 'All'}`);
      
      // Set column headers and widths for better readability
      worksheet.columns = [
        { header: 'sn', key: 'sn', width: 8 },
        { header: 'student_name_eng', key: 'student_name_eng', width: 25 },
        { header: 'student_name_nep', key: 'student_name_nep', width: 25 },
        { header: 'std_reg_id', key: 'std_reg_id', width: 15 },
        { header: 'emis_number', key: 'emis_number', width: 15 },
        { header: 'sex', key: 'sex', width: 8 },
        { header: 'dob_year', key: 'dob_year', width: 12 },
        { header: 'dob_month', key: 'dob_month', width: 12 },
        { header: 'dob_day', key: 'dob_day', width: 12 },
        { header: 'caste', key: 'caste', width: 15 },
        { header: 'disability', key: 'disability', width: 15 },
        { header: 'ecd_experience', key: 'ecd_experience', width: 16 },
        { header: 'father_name', key: 'father_name', width: 25 },
        { header: 'mother_name', key: 'mother_name', width: 25 },
        { header: 'mobile_1', key: 'mobile_1', width: 16 },
        { header: 'Class', key: 'Class', width: 12 },
        { header: 'Stream/Subject', key: 'Stream/Subject', width: 16 }
      ];

      exportData.forEach(row => {
        worksheet.addRow(row);
      });

      // Generate Excel file buffer and trigger download via file-saver
      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      saveAs(blob, `IEMIS_Nepal_Export_${new Date().toISOString().split('T')[0]}.xlsx`);
      
      setSuccess(`Exported ${filteredStudents.length} records successfully.`);
    } catch (err: any) {
      setError(err.message || "Failed to generate Excel file.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <div className="flex items-center gap-4 mb-6 pb-4 border-b border-gray-100">
          <div className="w-12 h-12 bg-blue-100 text-blue-600 flex items-center justify-center rounded-xl shrink-0">
            <FileSpreadsheet className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl font-black text-gray-900 tracking-tight">IEMIS Nepal Export Module</h1>
            <p className="text-gray-500 text-sm font-medium mt-1">
              Generate IEMIS compatible Excel format for CEHRD portal upload.
            </p>
          </div>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-red-50 text-red-700 border border-red-200 rounded-lg flex items-center gap-3">
            <ShieldAlert className="w-5 h-5 shrink-0" />
            <span className="font-medium text-sm">{error}</span>
          </div>
        )}

        {success && (
           <div className="mb-6 p-4 bg-green-50 text-green-700 border border-green-200 rounded-lg flex items-center gap-3">
             <CheckCircle className="w-5 h-5 shrink-0" />
             <span className="font-medium text-sm">{success}</span>
           </div>
        )}

        <div className="flex flex-col md:flex-row gap-6 mb-6">
          <div className="flex-1 space-y-4">
             <div>
                <label className="block text-sm font-bold text-gray-700 mb-2">Select Class for Export</label>
                <select
                  value={selectedClass}
                  onChange={(e) => setSelectedClass(e.target.value)}
                  className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-primary focus:border-transparent transition-all text-sm font-medium"
                >
                  {classOptions.map(c => (
                    <option key={c.value} value={c.value}>{c.label}</option>
                  ))}
                </select>
             </div>
             
             <div className="flex gap-3">
                <button
                  onClick={fetchStudents}
                  disabled={isLoading}
                  className="flex-1 px-4 py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold rounded-xl transition-all flex items-center justify-center gap-2"
                >
                  <RefreshCcw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
                  Refresh Data
                </button>
                <button
                  onClick={handleExport}
                  disabled={isLoading || students.length === 0}
                  className={`flex-1 px-4 py-3 font-bold rounded-xl transition-all flex items-center justify-center gap-2 text-white shadow-md active:scale-95 ${isLoading || students.length === 0 ? 'bg-blue-400 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700'}`}
                >
                  <Download className="w-5 h-5" />
                  Generate IEMIS Excel (.xlsx)
                </button>
             </div>
          </div>

          <div className="md:w-1/3 bg-gray-50 p-5 rounded-xl border border-gray-200">
             <h3 className="text-sm font-bold text-gray-800 mb-3 flex items-center gap-2">
                <User className="w-4 h-4 text-blue-600" />
                Data Overview
             </h3>
             <ul className="space-y-2 text-sm text-gray-600">
                <li className="flex justify-between border-b border-gray-200 pb-2">
                   <span>Total Students Loaded:</span>
                   <span className="font-bold text-gray-900">{students.length}</span>
                </li>
                {selectedClass !== 'All' && (
                   <li className="flex justify-between border-b border-gray-200 pb-2">
                     <span>In {classOptions.find(c => c.value === selectedClass)?.label}:</span>
                     <span className="font-bold text-blue-600">
                       {students.filter(s => s.class === selectedClass).length}
                     </span>
                   </li>
                )}
                <li className="text-xs pt-2 italic text-gray-500">
                   * Export includes: Name, DOB, Gender, Reg ID, Caste, Parents, Class. Ensure user profiles are complete for optimal IEMIS upload.
                </li>
             </ul>
          </div>
        </div>

      </div>
    </div>
  );
};

export default IemisExport;
