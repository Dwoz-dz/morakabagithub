// cspell:disable Supabase
import { isPrimaryAdminEmail } from "@/src/constants/admin";
import { isSupportedFaction } from "@/src/constants/factions";
import {
  EMPLOYEE_ROLES,
  type Employee,
  type EmployeeRole,
  mapEmployeeDbRow,
} from "@/src/models";
import { EMPLOYEE_STATUSES, type EmployeeStatus } from "@/src/models/status";
import { fixPossiblyMojibake } from "@/src/utils/text-normalization";

import { ActivityLogsService } from "./activity-logs.service";
import { getSupabaseClient, isSupabaseConfigured } from "./client";

type ServiceResult<T> = {
  data: T | null;
  error: string | null;
};

const SUPABASE_MISSING_ERROR =
  "Supabase is not configured. Please provide EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY.";

const EMPLOYEE_SELECT_FIELDS =
  "id, auth_user_id, full_name, email, role, status, faction, avatar_url, created_at, updated_at";

const ok = <T>(data: T): ServiceResult<T> => ({ data, error: null });
const fail = <T>(error: string): ServiceResult<T> => ({ data: null, error });

const toReadableError = (message: string): string => {
  if (message.toLowerCase().includes("permission denied")) {
    return "Permission denied. Make sure your account has enough privileges.";
  }

  return message;
};

const isMissingFunctionError = (
  message: string,
  functionName: string,
): boolean => {
  const normalized = message.toLowerCase();
  const normalizedFunctionName = functionName.toLowerCase();
  const mentionsFunction =
    normalized.includes(`function public.${normalizedFunctionName}`) ||
    normalized.includes(`public.${normalizedFunctionName}`) ||
    normalized.includes(normalizedFunctionName);
  const missingHint =
    normalized.includes("does not exist") ||
    normalized.includes("schema cache") ||
    normalized.includes("could not find the function");

  return mentionsFunction && missingHint;
};

export class EmployeesService {
  static async listAllEmployees(): Promise<ServiceResult<Employee[]>> {
    if (!isSupabaseConfigured) {
      return fail<Employee[]>(SUPABASE_MISSING_ERROR);
    }

    try {
      const supabase = getSupabaseClient() as any;

      const { data, error } = await supabase
        .from("employees")
        .select(EMPLOYEE_SELECT_FIELDS)
        .order("created_at", { ascending: false });

      if (error) {
        return fail(toReadableError(error.message));
      }

      return ok((data ?? []).map(mapEmployeeDbRow));
    } catch (error) {
      return fail(
        error instanceof Error ? error.message : "Failed to fetch employees.",
      );
    }
  }

  static async listApprovedMembers(): Promise<ServiceResult<Employee[]>> {
    if (!isSupabaseConfigured) {
      return fail<Employee[]>(SUPABASE_MISSING_ERROR);
    }

    try {
      const supabase = getSupabaseClient() as any;

      const { data, error } = await supabase
        .from("employees")
        .select(EMPLOYEE_SELECT_FIELDS)
        .eq("role", "member")
        .eq("status", "approved")
        .order("full_name", { ascending: true });

      if (error) {
        return fail(toReadableError(error.message));
      }

      return ok((data ?? []).map(mapEmployeeDbRow));
    } catch (error) {
      return fail(
        error instanceof Error
          ? error.message
          : "Failed to fetch approved members.",
      );
    }
  }

  static async getByAuthUserId(
    authUserId: string,
  ): Promise<ServiceResult<Employee | null>> {
    if (!isSupabaseConfigured) {
      return fail<Employee | null>(SUPABASE_MISSING_ERROR);
    }

    if (!authUserId.trim()) {
      return fail<Employee | null>("authUserId is required.");
    }

    try {
      const supabase = getSupabaseClient() as any;
      const { data, error } = await supabase
        .from("employees")
        .select(EMPLOYEE_SELECT_FIELDS)
        .eq("auth_user_id", authUserId.trim())
        .maybeSingle();

      if (error) {
        return fail(toReadableError(error.message));
      }

      if (!data) {
        return ok(null);
      }

      return ok(mapEmployeeDbRow(data));
    } catch (error) {
      return fail(
        error instanceof Error
          ? error.message
          : "Failed to fetch employee by auth user id.",
      );
    }
  }

  static async ensureCurrentUserProfile(): Promise<ServiceResult<boolean>> {
    if (!isSupabaseConfigured) {
      return fail<boolean>(SUPABASE_MISSING_ERROR);
    }

    try {
      const supabase = getSupabaseClient() as any;
      const { error } = await supabase.rpc(
        "ensure_employee_profile_for_current_user",
      );

      if (error) {
        if (
          isMissingFunctionError(
            error.message,
            "ensure_employee_profile_for_current_user",
          )
        ) {
          return ok(false);
        }
        return fail<boolean>(toReadableError(error.message));
      }

      // RPC may return void/null; success is determined by absence of error.
      return ok(true);
    } catch (error) {
      return fail<boolean>(
        error instanceof Error
          ? error.message
          : "Failed to ensure employee profile.",
      );
    }
  }

  static async updateEmployeeFaction(params: {
    employeeId: string;
    faction: string;
    actorAuthUserId?: string | null;
    actorEmployeeId?: string | null;
  }): Promise<ServiceResult<Employee>> {
    if (!isSupabaseConfigured) {
      return fail<Employee>(SUPABASE_MISSING_ERROR);
    }

    const normalizedFaction = fixPossiblyMojibake(params.faction.trim());
    if (!isSupportedFaction(normalizedFaction)) {
      return fail<Employee>("Unsupported faction.");
    }

    try {
      const supabase = getSupabaseClient() as any;
      const { data, error } = await supabase
        .from("employees")
        .update({ faction: normalizedFaction })
        .eq("id", params.employeeId)
        .select(EMPLOYEE_SELECT_FIELDS)
        .maybeSingle();

      if (error) {
        return fail<Employee>(toReadableError(error.message));
      }

      if (!data) {
        return fail<Employee>("Employee not found.");
      }

      const updated = mapEmployeeDbRow(data);

      if (params.actorAuthUserId) {
        await ActivityLogsService.log({
          actorAuthUserId: params.actorAuthUserId,
          actorEmployeeId: params.actorEmployeeId ?? null,
          action: "employee.update_faction",
          entityType: "employee",
          entityId: updated.id,
          details: {
            faction: updated.faction,
          },
        });
      }

      return ok(updated);
    } catch (error) {
      return fail<Employee>(
        error instanceof Error
          ? error.message
          : "Failed to update employee faction.",
      );
    }
  }

  static async updateEmployeeRole(params: {
    employeeId: string;
    role: EmployeeRole;
    actorEmail: string | null | undefined;
    targetEmail: string;
    actorAuthUserId?: string | null;
    actorEmployeeId?: string | null;
  }): Promise<ServiceResult<Employee>> {
    if (!isSupabaseConfigured) {
      return fail<Employee>(SUPABASE_MISSING_ERROR);
    }

    const normalizedTargetEmail = params.targetEmail.trim().toLowerCase();
    if (
      isPrimaryAdminEmail(normalizedTargetEmail) &&
      params.role !== EMPLOYEE_ROLES.ADMIN
    ) {
      return fail<Employee>("Cannot remove primary admin privileges.");
    }

    if (
      params.role === EMPLOYEE_ROLES.ADMIN &&
      !isPrimaryAdminEmail(params.actorEmail)
    ) {
      return fail<Employee>(
        "Only the primary admin can promote another admin.",
      );
    }

    try {
      const supabase = getSupabaseClient() as any;
      const { data, error } = await supabase
        .from("employees")
        .update({ role: params.role })
        .eq("id", params.employeeId)
        .select(EMPLOYEE_SELECT_FIELDS)
        .maybeSingle();

      if (error) {
        return fail<Employee>(toReadableError(error.message));
      }

      if (!data) {
        return fail<Employee>("Employee not found.");
      }

      const updated = mapEmployeeDbRow(data);

      if (params.actorAuthUserId) {
        await ActivityLogsService.log({
          actorAuthUserId: params.actorAuthUserId,
          actorEmployeeId: params.actorEmployeeId ?? null,
          action: "employee.update_role",
          entityType: "employee",
          entityId: updated.id,
          details: {
            role: updated.role,
            targetEmail: updated.email,
          },
        });
      }

      return ok(updated);
    } catch (error) {
      return fail<Employee>(
        error instanceof Error
          ? error.message
          : "Failed to update employee role.",
      );
    }
  }

  static async updateEmployeeStatus(params: {
    employeeId: string;
    status: EmployeeStatus;
    actorEmail?: string | null;
    actorAuthUserId?: string | null;
    actorEmployeeId?: string | null;
    targetEmail?: string | null;
  }): Promise<ServiceResult<Employee>> {
    if (!isSupabaseConfigured) {
      return fail<Employee>(SUPABASE_MISSING_ERROR);
    }

    const normalizedTargetEmail =
      params.targetEmail?.trim().toLowerCase() ?? null;
    if (
      normalizedTargetEmail &&
      isPrimaryAdminEmail(normalizedTargetEmail) &&
      params.status !== EMPLOYEE_STATUSES.APPROVED
    ) {
      return fail<Employee>("Cannot change primary admin status.");
    }

    try {
      const supabase = getSupabaseClient() as any;
      const { data, error } = await supabase
        .from("employees")
        .update({ status: params.status })
        .eq("id", params.employeeId)
        .select(EMPLOYEE_SELECT_FIELDS)
        .maybeSingle();

      if (error) {
        return fail<Employee>(toReadableError(error.message));
      }

      if (!data) {
        return fail<Employee>("Employee not found.");
      }

      const updated = mapEmployeeDbRow(data);

      if (params.actorAuthUserId) {
        await ActivityLogsService.log({
          actorAuthUserId: params.actorAuthUserId,
          actorEmployeeId: params.actorEmployeeId ?? null,
          action: "employee.update_status",
          entityType: "employee",
          entityId: updated.id,
          details: {
            status: updated.status,
            targetEmail: updated.email,
          },
        });
      }

      return ok(updated);
    } catch (error) {
      return fail<Employee>(
        error instanceof Error
          ? error.message
          : "Failed to update employee status.",
      );
    }
  }

  static async softDeleteEmployee(params: {
    employeeId: string;
    actorEmail?: string | null;
    actorAuthUserId?: string | null;
    actorEmployeeId?: string | null;
    targetEmail?: string | null;
  }): Promise<ServiceResult<Employee>> {
    if (!isSupabaseConfigured) {
      return fail<Employee>(SUPABASE_MISSING_ERROR);
    }

    const normalizedTargetEmail =
      params.targetEmail?.trim().toLowerCase() ?? null;
    if (normalizedTargetEmail && isPrimaryAdminEmail(normalizedTargetEmail)) {
      return fail<Employee>("Cannot delete primary admin account.");
    }

    try {
      const supabase = getSupabaseClient() as any;
      const { data, error } = await supabase
        .from("employees")
        .update({
          role: EMPLOYEE_ROLES.MEMBER,
          status: EMPLOYEE_STATUSES.BLOCKED,
        })
        .eq("id", params.employeeId)
        .select(EMPLOYEE_SELECT_FIELDS)
        .maybeSingle();

      if (error) {
        return fail<Employee>(toReadableError(error.message));
      }

      if (!data) {
        return fail<Employee>("Employee not found.");
      }

      const updated = mapEmployeeDbRow(data);

      if (params.actorAuthUserId) {
        await ActivityLogsService.log({
          actorAuthUserId: params.actorAuthUserId,
          actorEmployeeId: params.actorEmployeeId ?? null,
          action: "employee.soft_delete",
          entityType: "employee",
          entityId: updated.id,
          details: {
            targetEmail: updated.email,
            status: updated.status,
            role: updated.role,
          },
        });
      }

      return ok(updated);
    } catch (error) {
      return fail<Employee>(
        error instanceof Error ? error.message : "Failed to delete employee.",
      );
    }
  }

  private static validateUpdateOwnProfileInputs(params: {
    fullName?: string;
    avatarUrl?: string | null;
  }): {
    hasAvatarField: boolean;
    normalizedFullName: string | null;
    error: string | null;
  } {
    const hasFullName = typeof params.fullName === "string";
    const hasAvatarField = Object.hasOwn(params, "avatarUrl");

    if (!hasFullName && !hasAvatarField) {
      return {
        hasAvatarField,
        normalizedFullName: null,
        error: "No profile values to update.",
      };
    }

    const normalizedFullName = hasFullName
      ? fixPossiblyMojibake(params.fullName!.trim())
      : null;
    if (hasFullName && !normalizedFullName) {
      return {
        hasAvatarField,
        normalizedFullName,
        error: "Full name cannot be empty.",
      };
    }

    return { hasAvatarField, normalizedFullName, error: null };
  }

  private static async performRpcUpdate(
    supabase: any,
    hasAvatarField: boolean,
    avatarUrl: string | null | undefined,
    normalizedFullName: string | null,
    authUserId: string,
  ): Promise<ServiceResult<Employee>> {
    const rpcResult = await supabase.rpc("update_current_employee_profile", {
      p_avatar_url: hasAvatarField ? (avatarUrl ?? null) : null,
      p_full_name: normalizedFullName,
      p_set_avatar: hasAvatarField,
    });

    if (!rpcResult.error) {
      const refreshed = await this.getByAuthUserId(authUserId);
      if (refreshed.error) {
        return fail<Employee>(refreshed.error);
      }
      if (!refreshed.data) {
        return fail<Employee>("Employee profile not found after update.");
      }
      return ok(refreshed.data);
    }

    if (
      !isMissingFunctionError(
        rpcResult.error.message,
        "update_current_employee_profile",
      )
    ) {
      return fail<Employee>(toReadableError(rpcResult.error.message));
    }

    return { data: null, error: null }; // Indicate fallback needed
  }

  private static async performLegacyUpdate(
    supabase: any,
    patch: Record<string, unknown>,
    params: { authUserId: string; employeeId?: string | null },
  ): Promise<ServiceResult<Employee>> {
    const updateByAuthUserId = async () =>
      supabase
        .from("employees")
        .update(patch)
        .eq("auth_user_id", params.authUserId)
        .select(EMPLOYEE_SELECT_FIELDS)
        .maybeSingle();

    const updateByEmployeeId = async () => {
      if (!params.employeeId) {
        return { data: null, error: null };
      }
      return supabase
        .from("employees")
        .update(patch)
        .eq("id", params.employeeId)
        .select(EMPLOYEE_SELECT_FIELDS)
        .maybeSingle();
    };

    let updateResult = await updateByAuthUserId();
    if (!updateResult.data && !updateResult.error) {
      updateResult = await updateByEmployeeId();
    }

    if (!updateResult.data && !updateResult.error) {
      const ensureResult = await this.ensureCurrentUserProfile();
      if (ensureResult.error) {
        return fail<Employee>(ensureResult.error);
      }
      updateResult = await updateByAuthUserId();
    }

    if (updateResult.error) {
      return fail<Employee>(toReadableError(updateResult.error.message));
    }

    if (!updateResult.data) {
      return fail<Employee>(
        "Employee profile not found. Ask admin to verify your account.",
      );
    }

    return ok(mapEmployeeDbRow(updateResult.data));
  }

  static async updateOwnProfile(params: {
    authUserId: string;
    employeeId?: string | null;
    fullName?: string;
    avatarUrl?: string | null;
  }): Promise<ServiceResult<Employee>> {
    if (!isSupabaseConfigured) {
      return fail<Employee>(SUPABASE_MISSING_ERROR);
    }

    const {
      hasAvatarField,
      normalizedFullName,
      error: validationError,
    } = this.validateUpdateOwnProfileInputs(params);
    if (validationError) {
      return fail<Employee>(validationError);
    }

    try {
      const supabase = getSupabaseClient() as any;

      const rpcUpdateResult = await this.performRpcUpdate(
        supabase,
        hasAvatarField,
        params.avatarUrl,
        normalizedFullName,
        params.authUserId,
      );
      if (rpcUpdateResult.data || rpcUpdateResult.error) {
        return rpcUpdateResult;
      }

      // Fallback to legacy update
      const patch: Record<string, unknown> = {};
      if (normalizedFullName) {
        patch.full_name = normalizedFullName;
      }
      if (hasAvatarField) {
        patch.avatar_url = params.avatarUrl ?? null;
      }

      return await this.performLegacyUpdate(supabase, patch, params);
    } catch (error) {
      return fail<Employee>(
        error instanceof Error ? error.message : "Failed to update profile.",
      );
    }
  }
}
