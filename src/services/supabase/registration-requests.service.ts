import {
  EMPLOYEE_ROLES,
  EMPLOYEE_STATUSES,
  mapRegistrationRequestDbRow,
  REGISTRATION_REQUEST_STATUSES,
  type EmployeeRole,
  type RegistrationRequest,
  type RegistrationRequestStatus,
} from "@/src/models";
import { isPrimaryAdminEmail } from "@/src/constants/admin";
import { isSupportedFaction } from "@/src/constants/factions";
import { fixPossiblyMojibake } from "@/src/utils/text-normalization";

import { ActivityLogsService } from "./activity-logs.service";
import { getSupabaseClient, isSupabaseConfigured } from "./client";

type ServiceResult<T> = {
  data: T | null;
  error: string | null;
};

export type RegistrationRequestFilter = RegistrationRequestStatus | "all";
export type RegistrationDecision =
  | typeof REGISTRATION_REQUEST_STATUSES.APPROVED
  | typeof REGISTRATION_REQUEST_STATUSES.REJECTED;

const SUPABASE_MISSING_ERROR =
  "Supabase is not configured. Please provide EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY.";

const REQUEST_SELECT_FIELDS = "id, auth_user_id, full_name, email, faction, status, created_at";

const ok = <T>(data: T): ServiceResult<T> => ({ data, error: null });
const fail = <T>(error: string): ServiceResult<T> => ({ data: null, error });
const isMissingFunctionError = (message: string, functionName: string): boolean => {
  const normalized = message.toLowerCase();
  return normalized.includes(`function public.${functionName.toLowerCase()}`) && normalized.includes("does not exist");
};

export class RegistrationRequestsService {
  static async list(
    filter: RegistrationRequestFilter = "all",
  ): Promise<ServiceResult<RegistrationRequest[]>> {
    if (!isSupabaseConfigured) {
      return fail<RegistrationRequest[]>(SUPABASE_MISSING_ERROR);
    }

    try {
      const supabase = getSupabaseClient() as any;
      let query = supabase
        .from("registration_requests")
        .select(REQUEST_SELECT_FIELDS)
        .order("created_at", { ascending: false });

      if (filter !== "all") {
        query = query.eq("status", filter);
      }

      const { data, error } = await query;
      if (error) {
        return fail(error.message);
      }

      return ok((data ?? []).map(mapRegistrationRequestDbRow));
    } catch (error) {
      return fail(error instanceof Error ? error.message : "Failed to fetch registration requests.");
    }
  }

  static async processRequest({
    request,
    decision,
    actorAuthUserId,
    actorEmployeeId,
  }: {
    request: RegistrationRequest;
    decision: RegistrationDecision;
    actorAuthUserId?: string | null;
    actorEmployeeId?: string | null;
  }): Promise<ServiceResult<RegistrationRequest>> {
    if (!isSupabaseConfigured) {
      return fail(SUPABASE_MISSING_ERROR);
    }

    try {
      const supabase = getSupabaseClient() as any;

      const updateRequestResult = await supabase
        .from("registration_requests")
        .update({ status: decision })
        .eq("id", request.id)
        .eq("status", REGISTRATION_REQUEST_STATUSES.PENDING)
        .select(REQUEST_SELECT_FIELDS)
        .maybeSingle();

      if (updateRequestResult.error) {
        return fail(updateRequestResult.error.message);
      }

      if (!updateRequestResult.data) {
        return fail("The registration request is already processed.");
      }

      const normalizedRequestFaction = fixPossiblyMojibake(request.faction.trim());

      if (decision === REGISTRATION_REQUEST_STATUSES.APPROVED && !isSupportedFaction(normalizedRequestFaction)) {
        return fail("Cannot approve request with unsupported faction.");
      }

      const syncResult = await supabase.rpc("sync_employee_from_registration_request", {
        p_auth_user_id: request.authUserId,
      });

      if (syncResult.error && isMissingFunctionError(syncResult.error.message, "sync_employee_from_registration_request")) {
        const employeeStatus =
          decision === REGISTRATION_REQUEST_STATUSES.APPROVED
            ? EMPLOYEE_STATUSES.APPROVED
            : EMPLOYEE_STATUSES.REJECTED;
        const normalizedRequestFullName = fixPossiblyMojibake(request.fullName.trim());

        let employeeRole: EmployeeRole = EMPLOYEE_ROLES.MEMBER;
        if (isPrimaryAdminEmail(request.email)) {
          employeeRole = EMPLOYEE_ROLES.ADMIN;
        } else {
          const existingEmployeeResult = await supabase
            .from("employees")
            .select("role")
            .eq("auth_user_id", request.authUserId)
            .maybeSingle();

          if (existingEmployeeResult.error) {
            return fail(existingEmployeeResult.error.message);
          }

          if (existingEmployeeResult.data?.role === EMPLOYEE_ROLES.ADMIN) {
            employeeRole = EMPLOYEE_ROLES.ADMIN;
          }
        }

        const employeeUpsertResult = await supabase.from("employees").upsert(
          {
            auth_user_id: request.authUserId,
            full_name: normalizedRequestFullName,
            email: request.email,
            role: employeeRole,
            status: employeeStatus,
            faction: normalizedRequestFaction,
          },
          { onConflict: "auth_user_id" },
        );

        if (employeeUpsertResult.error) {
          const rollbackResult = await supabase
            .from("registration_requests")
            .update({ status: REGISTRATION_REQUEST_STATUSES.PENDING })
            .eq("id", request.id);

          if (rollbackResult.error) {
            console.error("[registration-requests] rollback failed", {
              requestId: request.id,
              error: rollbackResult.error.message,
            });
          }

          return fail(employeeUpsertResult.error.message);
        }
      } else if (syncResult.error) {
        const rollbackResult = await supabase
          .from("registration_requests")
          .update({ status: REGISTRATION_REQUEST_STATUSES.PENDING })
          .eq("id", request.id);

        if (rollbackResult.error) {
          console.error("[registration-requests] rollback failed", {
            requestId: request.id,
            error: rollbackResult.error.message,
          });
        }

        return fail(syncResult.error.message);
      }

      const employeeCheck = await supabase
        .from("employees")
        .select("id, status")
        .eq("auth_user_id", request.authUserId)
        .maybeSingle();

      if (employeeCheck.error) {
        return fail(employeeCheck.error.message);
      }

      if (!employeeCheck.data) {
        return fail("Employee profile was not created after processing this request.");
      }

      if (
        decision === REGISTRATION_REQUEST_STATUSES.APPROVED &&
        employeeCheck.data.status !== REGISTRATION_REQUEST_STATUSES.APPROVED
      ) {
        return fail("Request is approved but employee profile is still not approved.");
      }

      if (actorAuthUserId) {
        await ActivityLogsService.log({
          actorAuthUserId,
          actorEmployeeId: actorEmployeeId ?? null,
          action: decision === REGISTRATION_REQUEST_STATUSES.APPROVED ? "registration.approve" : "registration.reject",
          entityType: "registration_request",
          entityId: request.id,
          details: {
            targetAuthUserId: request.authUserId,
            email: request.email,
            faction: normalizedRequestFaction,
            status: decision,
          },
        });
      }

      return ok(mapRegistrationRequestDbRow(updateRequestResult.data));
    } catch (error) {
      return fail(error instanceof Error ? error.message : "Failed to process registration request.");
    }
  }
}
