export interface SubjectMark {
  subject: string;
  marks: string | number; // Number or NG/Abs
}

export interface StudentResult {
  id: string; // Document ID
  academicYear: string;
  class: string;
  studentId: string;
  studentName: string;
  type: string; // Terminal 1, 2, Unit Test 1...
  marks: Record<string, string | number>;
  totalScore?: number;
  percentage?: number;
  gpa?: number | string;
  rank?: number;
  published: boolean;
}
