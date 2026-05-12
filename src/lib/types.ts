export type Role = "admin" | "hr" | "manager" | "employee";

export type EmployeeDocumentType =
  | "profile-photo"
  | "aadhaar"
  | "pan"
  | "sslc"
  | "plus2"
  | "degree"
  | "experience"
  | "certificate"
  | "other";

export interface EmployeeDocument {
  id: string;
  type: EmployeeDocumentType;
  label: string;
  url: string;
  fileName: string;
  mimeType: string;
  size: number;
  uploadedAt: string;
}

export interface EmployeeProfile {
  fullName: string;
  email: string;
  phone: string;
  department: string;
  designation: string;
  joiningDate: string;
  certificates: string[];
  /** Another employee (user id) this person reports to. */
  managerId?: string;
  /** Project this employee or manager belongs to (for HR/Admin reporting). */
  projectId?: string;
  /** Optional profile image URL (upload support can be wired later). */
  profilePhotoUrl?: string;
  /** Uploaded employee documents (Aadhaar, SSLC, certificates, etc.). */
  documents?: EmployeeDocument[];
}

export interface User {
  id: string;
  username: string;
  password: string;
  role: Role;
  mustChangePassword: boolean;
  profile?: EmployeeProfile;
  createdAt: string;
}

export interface SafeUser {
  id: string;
  username: string;
  role: Role;
  mustChangePassword: boolean;
  createdAt: string;
}

/** Payroll row for one staff member and calendar month (YYYY-MM). */
export interface SalaryRecord {
  id: string;
  userId: string;
  period: string;
  basePay: number;
  deductions: number;
  netPay: number;
  notes?: string;
  createdAt: string;
  updatedAt: string;
  createdByUserId: string;
}

/** Attendance-derived slice for one employee × calendar month (YYYY-MM). */
export interface MonthAttendancePayrollBreakdown {
  period: string;
  userId: string;
  plannedWorkingDaysInMonth: number;
  payableWorkingDays: number;
  paidLeaveWorkingDays: number;
  unpaidLeaveWorkingDays: number;
  lopDays: number;
  dailyRate: number;
  unpaidLeaveDeduction: number;
  lopDeduction: number;
}

/** Month-end payroll row for admin (merged salary record + attendance rules). */
export interface MonthEndPayrollRow {
  period: string;
  userId: string;
  username: string;
  displayName: string;
  role: string;
  /** From employee profile (trimmed), for payroll list filters. */
  department?: string;
  basePay: number;
  otherDeductions: number;
  storedNetPay: number | null;
  /** Null for HR/Admin accounts (no attendance-based payroll). */
  attendance: MonthAttendancePayrollBreakdown | null;
  computedNet: number;
}

/** Single-month payslip payload (API + PDF + on-screen). */
export interface PayslipSnapshot {
  companyName: string;
  period: string;
  periodLabel: string;
  generatedAt: string;
  employee: {
    userId: string;
    username: string;
    displayName: string;
    role: string;
    email?: string;
    phone?: string;
    department?: string;
    designation?: string;
    joiningDate?: string;
  };
  salaryRecord: SalaryRecord | null;
  basePay: number;
  otherDeductions: number;
  storedNetPay: number | null;
  attendance: MonthAttendancePayrollBreakdown | null;
  computedNet: number;
  earnings: Array<{ label: string; amount: number }>;
  deductions: Array<{ label: string; amount: number }>;
}
