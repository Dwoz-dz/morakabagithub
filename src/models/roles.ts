export const EMPLOYEE_ROLES = {
  ADMIN: "admin",
  MEMBER: "member",
} as const;

export type EmployeeRole = (typeof EMPLOYEE_ROLES)[keyof typeof EMPLOYEE_ROLES];

export interface Role {
  id: string;
  slug: EmployeeRole;
  title: string;
  createdAt: string;
  updatedAt: string;
}

export interface RoleDbRow {
  id: string;
  slug: string;
  title: string;
  created_at: string;
  updated_at: string;
}

