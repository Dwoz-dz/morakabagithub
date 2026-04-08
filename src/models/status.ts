export const EMPLOYEE_STATUSES = {
  PENDING: "pending",
  APPROVED: "approved",
  REJECTED: "rejected",
  FROZEN: "frozen",
  BLOCKED: "blocked",
} as const;

export type EmployeeStatus =
  (typeof EMPLOYEE_STATUSES)[keyof typeof EMPLOYEE_STATUSES];

export const BLOCKED_EMPLOYEE_STATUSES: EmployeeStatus[] = [
  EMPLOYEE_STATUSES.REJECTED,
  EMPLOYEE_STATUSES.FROZEN,
  EMPLOYEE_STATUSES.BLOCKED,
];

export const isBlockedEmployeeStatus = (status: EmployeeStatus): boolean =>
  BLOCKED_EMPLOYEE_STATUSES.includes(status);
