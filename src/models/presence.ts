import { normalizeTextDeep } from "@/src/utils/text-normalization";

import { EMPLOYEE_ROLES, type EmployeeRole } from "./roles";

export interface Presence {
  userId: string;
  employeeId: string;
  displayName: string | null;
  avatarUrl: string | null;
  faction: string | null;
  role: EmployeeRole;
  isOnline: boolean;
  lastSeen: string;
  updatedAt: string;
}

export interface PresenceDbRow {
  user_id: string;
  employee_id: string;
  display_name: string | null;
  avatar_url: string | null;
  faction: string | null;
  role: string;
  is_online: boolean;
  last_seen: string;
  updated_at: string;
}

const toEmployeeRole = (rawRole: string): EmployeeRole =>
  rawRole === EMPLOYEE_ROLES.ADMIN ? EMPLOYEE_ROLES.ADMIN : EMPLOYEE_ROLES.MEMBER;

export const mapPresenceDbRow = (row: PresenceDbRow): Presence => {
  const normalized = normalizeTextDeep(row);

  return {
    userId: normalized.user_id,
    employeeId: normalized.employee_id,
    displayName: normalized.display_name ?? null,
    avatarUrl: normalized.avatar_url ?? null,
    faction: normalized.faction ?? null,
    role: toEmployeeRole(normalized.role),
    isOnline: Boolean(normalized.is_online),
    lastSeen: normalized.last_seen,
    updatedAt: normalized.updated_at,
  };
};
