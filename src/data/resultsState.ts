export interface SubjectMark {
  subject: string;
  marks: string | number; // Number or NG/Abs
}

export interface StudentResult {
  id?: string; // Document ID
  studentUid?: string; // Immutable technical student reference (User Doc ID / Auth UID)
  studentId: string; // Permanent school Student ID (e.g. STU-000125) or stable student reference
  permanentStudentId?: string; // Permanent school Student ID
  studentEmis?: string; // EMIS identifier where available
  studentName: string;
  academicYear?: string;
  class: string;
  section?: string;
  rollNumberSnapshot?: string; // Academic roll snapshot (display/context only, never foreign key)
  rollNo?: string; // Display roll number
  type?: string; 
  examType: string;
  examId?: string;
  marks?: Record<string, string | number>;
  subjects?: Record<string, {
    fullMarks: number, 
    obtained: number | "AB",
    thMarks?: number | "AB",
    prMarks?: number | "AB",
    thFull?: number,
    prFull?: number,
    thPass?: number,
    prPass?: number
  }>;
  highestMarks?: Record<string, number>;
  totalScore?: number;
  total?: number;
  fullTotal?: number;
  percentage?: number;
  grade?: string;
  gpa?: number | string;
  rank?: number;
  published: boolean;
  classTeacherRemark?: string;
}
