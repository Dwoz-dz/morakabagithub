import { EMPLOYEE_ROLES, type EmployeeRole } from "./roles";
import { EMPLOYEE_STATUSES, type EmployeeStatus } from "./status";
import { normalizeTextDeep } from "@/src/utils/text-normalization";

export interface Employee {
  id: string;
  authUserId: string;
  fullName: string;
  email: string;
  role: EmployeeRole;
  status: EmployeeStatus;
  faction: string | null;
  avatarUrl: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface EmployeeDbRow {
  id: string;
  auth_user_id: string;
  full_name: string;
  email: string;
  role: string;
  status: string;
  faction: string | null;
  avatar_url: string | null;
  created_at: string;
  updated_at: string;
}

const toEmployeeRole = (rawRole: string): EmployeeRole => {
  const normalizedRole = typeof rawRole === "string" ? rawRole.trim().toLowerCase() : "";
  return normalizedRole === EMPLOYEE_ROLES.ADMIN ? EMPLOYEE_ROLES.ADMIN : EMPLOYEE_ROLES.MEMBER;
};

const toEmployeeStatus = (rawStatus: string): EmployeeStatus => {
  if (rawStatus === EMPLOYEE_STATUSES.APPROVED) return EMPLOYEE_STATUSES.APPROVED;
  if (rawStatus === EMPLOYEE_STATUSES.REJECTED) return EMPLOYEE_STATUSES.REJECTED;
  if (rawStatus === EMPLOYEE_STATUSES.FROZEN) return EMPLOYEE_STATUSES.FROZEN;
  if (rawStatus === EMPLOYEE_STATUSES.BLOCKED) return EMPLOYEE_STATUSES.BLOCKED;

  return EMPLOYEE_STATUSES.PENDING;
};

export const mapEmployeeDbRow = (row: EmployeeDbRow): Employee => {
  const normalizedRow = normalizeTextDeep(row);

  return {
    id: normalizedRow.id,
    authUserId: normalizedRow.auth_user_id,
    fullName: normalizedRow.full_name,
    email: normalizedRow.email ?? "",
    role: toEmployeeRole(normalizedRow.role),
    status: toEmployeeStatus(normalizedRow.status),
    faction: normalizedRow.faction,
    avatarUrl: normalizedRow.avatar_url,
    createdAt: normalizedRow.created_at,
    updatedAt: normalizedRow.updated_at,
  };
};
