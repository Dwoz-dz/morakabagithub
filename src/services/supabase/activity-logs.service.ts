import { mapActivityLogDbRow, type ActivityLog } from "@/src/models";

import { getSupabaseClient, isSupabaseConfigured } from "./client";

type ServiceResult<T> = {
  data: T | null;
  error: string | null;
};

type ListLogsParams = {
  limit?: number;
  offset?: number;
  action?: string | null;
  entityType?: string | null;
  dateFrom?: string | null;
  dateTo?: string | null;
};

const SUPABASE_MISSING_ERROR =
  "Supabase is not configured. Please provide EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY.";

const ok = <T>(data: T): ServiceResult<T> => ({ data, error: null });
const fail = <T>(error: string): ServiceResult<T> => ({ data: null, error });

export class ActivityLogsService {
  static async listRecent(limit = 50): Promise<ServiceResult<ActivityLog[]>> {
    return this.listPaged({ limit, offset: 0 });
  }

  static async listPaged(params?: ListLogsParams): Promise<ServiceResult<ActivityLog[]>> {
    if (!isSupabaseConfigured) {
      return fail(SUPABASE_MISSING_ERROR);
    }

    const limit = Math.max(1, Math.min(params?.limit ?? 50, 200));
    const offset = Math.max(0, params?.offset ?? 0);

    try {
      const supabase = getSupabaseClient() as any;
      let query = supabase
        .from("activity_logs")
        .select("id, actor_auth_user_id, actor_employee_id, action, entity_type, entity_id, details, created_at")
        .order("created_at", { ascending: false })
        .range(offset, offset + limit - 1);

      if (params?.action?.trim()) {
        query = query.eq("action", params.action.trim());
      }

      if (params?.entityType?.trim()) {
        query = query.eq("entity_type", params.entityType.trim());
      }

      if (params?.dateFrom?.trim()) {
        query = query.gte("created_at", params.dateFrom.trim());
      }

      if (params?.dateTo?.trim()) {
        query = query.lte("created_at", params.dateTo.trim());
      }

      const { data, error } = await query;

      if (error) {
        return fail(error.message);
      }

      return ok((data ?? []).map(mapActivityLogDbRow));
    } catch (error) {
      return fail(error instanceof Error ? error.message : "Failed to load activity logs.");
    }
  }

  static async log(params: {
    actorAuthUserId: string;
    actorEmployeeId?: string | null;
    action: string;
    entityType: string;
    entityId?: string | null;
    details?: Record<string, unknown>;
  }): Promise<ServiceResult<boolean>> {
    if (!isSupabaseConfigured) {
      return fail(SUPABASE_MISSING_ERROR);
    }

    try {
      const supabase = getSupabaseClient() as any;
      const { error } = await supabase.from("activity_logs").insert({
        actor_auth_user_id: params.actorAuthUserId,
        actor_employee_id: params.actorEmployeeId ?? null,
        action: params.action,
        entity_type: params.entityType,
        entity_id: params.entityId ?? null,
        details: params.details ?? {},
      });

      if (error) {
        return fail(error.message);
      }

      return ok(true);
    } catch (error) {
      return fail(error instanceof Error ? error.message : "Failed to write activity log.");
    }
  }

  static async deleteOne(logId: string): Promise<ServiceResult<boolean>> {
    if (!isSupabaseConfigured) {
      return fail(SUPABASE_MISSING_ERROR);
    }

    if (!logId.trim()) {
      return fail("Activity log id is required.");
    }

    try {
      const supabase = getSupabaseClient() as any;
      const { error } = await supabase.from("activity_logs").delete().eq("id", logId);

      if (error) {
        return fail(error.message);
      }

      return ok(true);
    } catch (error) {
      return fail(error instanceof Error ? error.message : "Failed to delete activity log.");
    }
  }

  static async clearAll(): Promise<ServiceResult<number>> {
    if (!isSupabaseConfigured) {
      return fail(SUPABASE_MISSING_ERROR);
    }

    try {
      const supabase = getSupabaseClient() as any;
      const { data, error } = await supabase.from("activity_logs").select("id");

      if (error) {
        return fail(error.message);
      }

      const rows = (data ?? []) as { id: string }[];
      if (!rows.length) {
        return ok(0);
      }

      const ids = rows.map((row) => row.id);
      const CHUNK = 200;

      for (let index = 0; index < ids.length; index += CHUNK) {
        const chunk = ids.slice(index, index + CHUNK);
        const { error: deleteError } = await supabase.from("activity_logs").delete().in("id", chunk);
        if (deleteError) {
          return fail(deleteError.message);
        }
      }

      return ok(ids.length);
    } catch (error) {
      return fail(error instanceof Error ? error.message : "Failed to clear activity logs.");
    }
  }
}
