import type { Role } from "./types";

/** Full system access (dashboard + admin APIs). */
export function usesAdminPortal(role: Role): boolean {
  return role === "admin" || role === "hr";
}

/** Attendance, leave, employee dashboard. */
export function usesEmployeePortal(role: Role): boolean {
  return role === "employee" || role === "manager";
}

/** May record own punch in/out and load working summary (HR on admin site, employees, managers). */
export function usesSelfAttendance(role: Role): boolean {
  return role === "employee" || role === "manager" || role === "hr";
}

/**
 * Shown in the admin “Employees” directory and used to resolve reporting lines in profiles.
 * Includes `admin` so managers who report to an admin account still show a real manager row
 * (not “unknown manager”).
 */
export const DIRECTORY_ROLES: Role[] = ["employee", "manager", "hr", "admin"];

/** Users who may appear as someone’s “reports to” manager (for labels and hierarchy UI). */
export function canBeReportingManager(role: Role): boolean {
  return role === "employee" || role === "manager" || role === "hr" || role === "admin";
}

export const CREATABLE_ROLES: Role[] = ["employee", "manager", "hr", "admin"];

export function isCreatableRole(value: string): value is Role {
  return (CREATABLE_ROLES as string[]).includes(value);
}
