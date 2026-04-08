import type { Session } from "@supabase/supabase-js";

import { EMPLOYEE_ROLES, EMPLOYEE_STATUSES, type Employee } from "@/src/models";

export type AppRoute =
  | "/splash"
  | "/(auth)/login"
  | "/(auth)/waiting-approval"
  | "/(auth)/blocked-status"
  | "/(app)/admin"
  | "/(app)/member";

interface ResolveRouteParams {
  hasBootstrapped: boolean;
  session: Session | null;
  employee: Employee | null;
}

export const resolveAppRoute = ({
  hasBootstrapped,
  session,
  employee,
}: ResolveRouteParams): AppRoute => {
  if (!hasBootstrapped) {
    return "/splash";
  }

  if (!session) {
    return "/(auth)/login";
  }

  if (!employee || employee.status === EMPLOYEE_STATUSES.PENDING) {
    return "/(auth)/waiting-approval";
  }

  if (
    employee.status === EMPLOYEE_STATUSES.REJECTED ||
    employee.status === EMPLOYEE_STATUSES.FROZEN ||
    employee.status === EMPLOYEE_STATUSES.BLOCKED
  ) {
    return "/(auth)/blocked-status";
  }

  if (employee.role === EMPLOYEE_ROLES.ADMIN) {
    return "/(app)/admin";
  }

  return "/(app)/member";
};
