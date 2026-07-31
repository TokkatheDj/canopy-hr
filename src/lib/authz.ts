// Single source of truth for permissions. Enforced in three layers:
// 1. (app) layout redirects unauthenticated users (cosmetic)
// 2. Server Actions call require*/can (authoritative)
// 3. UI hides what the role can't do (cosmetic)

export type SessionUser = {
  id: string;
  email: string;
  name: string;
  role: "ADMIN" | "MANAGER" | "EMPLOYEE";
  employeeId: string | null;
  isManager: boolean; // has direct reports (derived at login)
  image?: string | null;
};

export type Action =
  | "people.viewAll"
  | "people.edit"
  | "people.viewCompensation"
  | "hiring.manage"
  | "onboarding.manage"
  | "timeoff.approve"
  | "timesheets.approve"
  | "payroll.manage"
  | "benefits.manage"
  | "performance.manage"
  | "surveys.manage"
  | "reports.view"
  | "files.manage"
  | "settings.manage"
  | "audit.view";

const ADMIN_ONLY: Action[] = [
  "people.edit",
  "hiring.manage",
  "onboarding.manage",
  "payroll.manage",
  "benefits.manage",
  "performance.manage",
  "surveys.manage",
  "files.manage",
  "settings.manage",
  "audit.view",
];

const MANAGER_ALLOWED: Action[] = [
  "timeoff.approve",
  "timesheets.approve",
  "reports.view",
  "people.viewCompensation", // for own team only — scope checked at query site
];

export function can(user: SessionUser, action: Action): boolean {
  if (user.role === "ADMIN") return true;
  if (action === "people.viewAll") return true; // directory is company-wide
  if (user.role === "MANAGER" || user.isManager) {
    return MANAGER_ALLOWED.includes(action);
  }
  // EMPLOYEE: self-service only — no cross-cutting actions
  return false;
}

export class AuthzError extends Error {
  constructor(action: string) {
    super(`Not authorized: ${action}`);
  }
}

export function require_(user: SessionUser | undefined, action: Action): SessionUser {
  if (!user || !can(user, action)) throw new AuthzError(action);
  return user;
}

/** True when `user` may act on `employeeId`'s data as their manager (or is admin). */
export function managesEmployee(
  user: SessionUser,
  managerChainIds: string[],
): boolean {
  if (user.role === "ADMIN") return true;
  return user.employeeId != null && managerChainIds.includes(user.employeeId);
}
