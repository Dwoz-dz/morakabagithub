import { mapPresenceDbRow, type Presence, type PresenceDbRow } from "@/src/models";

import { getSupabaseClient, isSupabaseConfigured } from "./client";
import { getCurrentEmployeeContext, type CurrentEmployeeContext } from "./current-employee-context";
import { fail, ok, type ServiceResult, SUPABASE_MISSING_ERROR } from "./service-types";

const PRESENCE_SELECT =
  "user_id, employee_id, display_name, avatar_url, faction, role, is_online, last_seen, updated_at";

const HEARTBEAT_MIN_INTERVAL_MS = 25_000;

const toReadableError = (error: unknown, fallback: string): string =>
  error instanceof Error ? error.message : fallback;

export class PresenceService {
  private static heartbeatByUserId = new Map<string, number>();

  private static ensureApprovedContext(
    context: CurrentEmployeeContext | null,
  ): ServiceResult<CurrentEmployeeContext> {
    if (!context) {
      return fail("Employee context is required.");
    }

    if (context.status !== "approved") {
      return fail("Only approved users can update presence.");
    }

    return ok(context);
  }

  private static async resolveContext(): Promise<ServiceResult<CurrentEmployeeContext>> {
    const contextResult = await getCurrentEmployeeContext();
    if (contextResult.error) {
      return fail(contextResult.error);
    }

    return this.ensureApprovedContext(contextResult.data);
  }

  private static async upsertPresence(
    context: CurrentEmployeeContext,
    isOnline: boolean,
    touchedAtIso: string,
  ): Promise<ServiceResult<Presence>> {
    if (!isSupabaseConfigured) {
      return fail(SUPABASE_MISSING_ERROR);
    }

    try {
      const supabase = getSupabaseClient() as any;
      const { data, error } = await supabase
        .from("presence")
        .upsert(
          {
            user_id: context.authUserId,
            employee_id: context.employeeId,
            display_name: context.fullName || null,
            avatar_url: context.avatarUrl ?? null,
            faction: context.faction,
            role: context.role,
            is_online: isOnline,
            last_seen: touchedAtIso,
          },
          {
            onConflict: "user_id",
          },
        )
        .select(PRESENCE_SELECT)
        .single();

      if (error) {
        return fail(error.message);
      }

      this.heartbeatByUserId.set(context.authUserId, Date.now());

      return ok(mapPresenceDbRow(data as PresenceDbRow));
    } catch (error) {
      return fail(toReadableError(error, "Failed to update presence."));
    }
  }

  static async upsertCurrentPresenceOnline(): Promise<ServiceResult<Presence>> {
    if (!isSupabaseConfigured) {
      return fail(SUPABASE_MISSING_ERROR);
    }

    const contextResult = await this.resolveContext();
    if (contextResult.error || !contextResult.data) {
      return fail(contextResult.error ?? "Employee context is required.");
    }

    return this.upsertPresence(contextResult.data, true, new Date().toISOString());
  }

  static async markCurrentPresenceOffline(): Promise<ServiceResult<Presence>> {
    if (!isSupabaseConfigured) {
      return fail(SUPABASE_MISSING_ERROR);
    }

    const contextResult = await this.resolveContext();
    if (contextResult.error || !contextResult.data) {
      return fail(contextResult.error ?? "Employee context is required.");
    }

    return this.upsertPresence(contextResult.data, false, new Date().toISOString());
  }

  static async heartbeatPresence(): Promise<ServiceResult<Presence | null>> {
    if (!isSupabaseConfigured) {
      return fail(SUPABASE_MISSING_ERROR);
    }

    const contextResult = await this.resolveContext();
    if (contextResult.error || !contextResult.data) {
      return fail(contextResult.error ?? "Employee context is required.");
    }

    const nowMs = Date.now();
    const lastHeartbeatMs = this.heartbeatByUserId.get(contextResult.data.authUserId) ?? 0;
    if (nowMs - lastHeartbeatMs < HEARTBEAT_MIN_INTERVAL_MS) {
      return ok(null);
    }

    const writeResult = await this.upsertPresence(contextResult.data, true, new Date(nowMs).toISOString());
    if (writeResult.error) {
      return fail(writeResult.error);
    }

    return ok(writeResult.data);
  }

  static async listVisibleOnlineUsers(limit = 40): Promise<ServiceResult<Presence[]>> {
    if (!isSupabaseConfigured) {
      return fail(SUPABASE_MISSING_ERROR);
    }

    const normalizedLimit = Number.isFinite(limit) && limit > 0 ? Math.min(limit, 200) : 40;

    try {
      const supabase = getSupabaseClient() as any;
      const { data, error } = await supabase
        .from("presence")
        .select(PRESENCE_SELECT)
        .eq("is_online", true)
        .order("updated_at", { ascending: false })
        .limit(normalizedLimit);

      if (error) {
        return fail(error.message);
      }

      return ok((data ?? []).map((row: PresenceDbRow) => mapPresenceDbRow(row)));
    } catch (error) {
      return fail(toReadableError(error, "Failed to load visible online users."));
    }
  }

  static async listVisibleRecentUsers(limit = 80): Promise<ServiceResult<Presence[]>> {
    if (!isSupabaseConfigured) {
      return fail(SUPABASE_MISSING_ERROR);
    }

    const normalizedLimit = Number.isFinite(limit) && limit > 0 ? Math.min(limit, 400) : 80;

    try {
      const supabase = getSupabaseClient() as any;
      const { data, error } = await supabase
        .from("presence")
        .select(PRESENCE_SELECT)
        .order("is_online", { ascending: false })
        .order("last_seen", { ascending: false })
        .limit(normalizedLimit);

      if (error) {
        return fail(error.message);
      }

      return ok((data ?? []).map((row: PresenceDbRow) => mapPresenceDbRow(row)));
    } catch (error) {
      return fail(toReadableError(error, "Failed to load visible recent users."));
    }
  }
}
