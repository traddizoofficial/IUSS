export interface Student {
  id?: string;
  studentId: string;
  rollNumber: string;
  studentName: string;
  fatherName?: string;
  class: string;
  section?: string;
  active: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface Exam {
  id?: string;
  examName: string;
  examCategory?: string;
  academicSession: string;
  class?: string;
  status: 'Draft' | 'Published' | 'Unpublished';
  createdAt: number;
  updatedAt: number;
}

export interface SubjectResult {
  subjectName: string;
  totalMarks: number;
  obtainedMarks: number;
  percentage?: number;
  grade?: string;
  remarks?: string;
}

export interface Result {
  id?: string;
  studentId: string;
  rollNumber: string;
  examId: string;
  studentName?: string;
  fatherName?: string;
  className?: string;
  section?: string;
  status: 'Draft' | 'Published';
  totalMarks: number;
  obtainedMarks: number;
  percentage: number;
  grade: string;
  resultStatus: string;
  position?: string;
  attendance?: string;
  discipline?: string;
  remarks?: string;
  subjects: SubjectResult[];
  createdAt: number;
  updatedAt: number;
}

export interface SchoolSettings {
  id?: string;
  schoolName: string;
  address?: string;
  phone?: string;
  email?: string;
  principalName?: string;
  academicSession?: string;
  resultCardTitle?: string;
  updatedAt: number;
}
