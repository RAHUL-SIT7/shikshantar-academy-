export interface SubjectMark {
  subject: string;
  marks: string | number; // Number or NG/Abs
}

export interface StudentResult {
  id?: string; // Document ID
  academicYear?: string;
  class: string;
  studentId: string;
  studentName: string;
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
  rollNo?: string;
}
