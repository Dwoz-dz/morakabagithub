import { EMPLOYEE_ROLES, type EmployeeRole } from "@/src/models";

import { getSupabaseClient, isSupabaseConfigured } from "./client";
import { fail, ok, type ServiceResult, SUPABASE_MISSING_ERROR } from "./service-types";

export interface CurrentEmployeeContext {
  employeeId: string;
  authUserId: string;
  fullName: string;
  avatarUrl: string | null;
  role: EmployeeRole;
  faction: string | null;
  status: string;
}

const toEmployeeRole = (rawRole: string): EmployeeRole =>
  rawRole === EMPLOYEE_ROLES.ADMIN ? EMPLOYEE_ROLES.ADMIN : EMPLOYEE_ROLES.MEMBER;

export const getCurrentEmployeeContext = async (): Promise<ServiceResult<CurrentEmployeeContext>> => {
  if (!isSupabaseConfigured) {
    return fail(SUPABASE_MISSING_ERROR);
  }

  try {
    const supabase = getSupabaseClient() as any;
    const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
    if (sessionError) {
      return fail(sessionError.message);
    }

    const authUserId = sessionData?.session?.user?.id ?? null;
    if (!authUserId) {
      return fail("No authenticated user session.");
    }

    const { data, error } = await supabase
      .from("employees")
      .select("id, auth_user_id, full_name, avatar_url, role, status, faction")
      .eq("auth_user_id", authUserId)
      .maybeSingle();

    if (error) {
      return fail(error.message);
    }

    if (!data) {
      return fail("Employee profile not found for current user.");
    }

    return ok({
      employeeId: data.id,
      authUserId: data.auth_user_id,
      fullName: data.full_name ?? "",
      avatarUrl: data.avatar_url ?? null,
      role: toEmployeeRole(data.role ?? ""),
      faction: data.faction ?? null,
      status: data.status ?? "pending",
    });
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Failed to resolve current employee context.");
  }
};
