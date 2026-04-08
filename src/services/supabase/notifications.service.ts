import {
  mapNotificationDbRow,
  NOTIFICATION_TARGET_TYPES,
  type NotificationItem,
  type NotificationTargetType,
} from "@/src/models";
import { fixPossiblyMojibake } from "@/src/utils/text-normalization";

import { ActivityLogsService } from "./activity-logs.service";
import { getSupabaseClient, isSupabaseConfigured } from "./client";

type ServiceResult<T> = {
  data: T | null;
  error: string | null;
};

type SendNotificationInput = {
  senderAuthUserId: string;
  senderEmployeeId?: string | null;
  title?: string | null;
  message: string;
  type?: string;
  targetType: NotificationTargetType;
  targetAuthUserId?: string;
  targetFaction?: string;
};

const SUPABASE_MISSING_ERROR =
  "Supabase is not configured. Please provide EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY.";

const ok = <T>(data: T): ServiceResult<T> => ({ data, error: null });
const fail = <T>(error: string): ServiceResult<T> => ({ data: null, error });

const normalizeTargetUsers = async ({
  targetType,
  targetAuthUserId,
  targetFaction,
}: {
  targetType: NotificationTargetType;
  targetAuthUserId?: string;
  targetFaction?: string;
}): Promise<ServiceResult<string[]>> => {
  const supabase = getSupabaseClient() as any;

  if (targetType === NOTIFICATION_TARGET_TYPES.USER) {
    if (!targetAuthUserId) {
      return fail("Target user is required.");
    }
    return ok([targetAuthUserId]);
  }

  let query = supabase
    .from("employees")
    .select("auth_user_id")
    .eq("status", "approved");

  if (targetType === NOTIFICATION_TARGET_TYPES.FACTION) {
    if (!targetFaction) {
      return fail("Faction is required.");
    }
    query = query.eq("faction", fixPossiblyMojibake(targetFaction.trim()));
  }

  const { data, error } = await query;
  if (error) {
    return fail(error.message);
  }

  const authUserIds = Array.from(
    new Set<string>(
      (data ?? [])
        .map((row: { auth_user_id?: string | null }) => row.auth_user_id ?? null)
        .filter((value: string | null): value is string => Boolean(value)),
    ),
  );

  if (authUserIds.length === 0) {
    return fail("No recipients matched the selected target.");
  }

  return ok(authUserIds);
};

export class NotificationsService {
  static async listMy(limit = 100): Promise<ServiceResult<NotificationItem[]>> {
    if (!isSupabaseConfigured) {
      return fail(SUPABASE_MISSING_ERROR);
    }

    try {
      const supabase = getSupabaseClient() as any;
      const { data, error } = await supabase
        .from("notifications")
        .select(
          "id, sender_auth_user_id, target_auth_user_id, title, message, type, target_type, target_faction, is_read, created_at",
        )
        .order("created_at", { ascending: false })
        .limit(limit);

      if (error) {
        return fail(error.message);
      }

      return ok((data ?? []).map(mapNotificationDbRow));
    } catch (error) {
      return fail(error instanceof Error ? error.message : "Failed to fetch notifications.");
    }
  }

  static async listSentByAdmin(senderAuthUserId: string, limit = 100): Promise<ServiceResult<NotificationItem[]>> {
    if (!isSupabaseConfigured) {
      return fail(SUPABASE_MISSING_ERROR);
    }

    try {
      const supabase = getSupabaseClient() as any;
      const { data, error } = await supabase
        .from("notifications")
        .select(
          "id, sender_auth_user_id, target_auth_user_id, title, message, type, target_type, target_faction, is_read, created_at",
        )
        .eq("sender_auth_user_id", senderAuthUserId)
        .order("created_at", { ascending: false })
        .limit(limit);

      if (error) {
        return fail(error.message);
      }

      return ok((data ?? []).map(mapNotificationDbRow));
    } catch (error) {
      return fail(error instanceof Error ? error.message : "Failed to fetch sent notifications.");
    }
  }

  static async unreadCount(): Promise<ServiceResult<number>> {
    if (!isSupabaseConfigured) {
      return fail(SUPABASE_MISSING_ERROR);
    }

    try {
      const supabase = getSupabaseClient() as any;
      const { count, error } = await supabase
        .from("notifications")
        .select("id", { head: true, count: "exact" })
        .eq("is_read", false);

      if (error) {
        return fail(error.message);
      }

      return ok(count ?? 0);
    } catch (error) {
      return fail(error instanceof Error ? error.message : "Failed to count notifications.");
    }
  }

  static async markAsRead(notificationId: string): Promise<ServiceResult<boolean>> {
    if (!isSupabaseConfigured) {
      return fail(SUPABASE_MISSING_ERROR);
    }

    try {
      const supabase = getSupabaseClient() as any;
      const { error } = await supabase
        .from("notifications")
        .update({ is_read: true })
        .eq("id", notificationId);

      if (error) {
        return fail(error.message);
      }

      return ok(true);
    } catch (error) {
      return fail(error instanceof Error ? error.message : "Failed to mark notification as read.");
    }
  }

  static async markAllAsRead(): Promise<ServiceResult<boolean>> {
    if (!isSupabaseConfigured) {
      return fail(SUPABASE_MISSING_ERROR);
    }

    try {
      const supabase = getSupabaseClient() as any;
      const { error } = await supabase
        .from("notifications")
        .update({ is_read: true })
        .eq("is_read", false);

      if (error) {
        return fail(error.message);
      }

      return ok(true);
    } catch (error) {
      return fail(error instanceof Error ? error.message : "Failed to mark all as read.");
    }
  }

  static async clearAll(): Promise<ServiceResult<boolean>> {
    if (!isSupabaseConfigured) {
      return fail(SUPABASE_MISSING_ERROR);
    }

    try {
      const supabase = getSupabaseClient() as any;
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError) {
        return fail(userError.message);
      }

      if (!user?.id) {
        return fail("No active user session.");
      }

      const { error } = await supabase
        .from("notifications")
        .delete()
        .eq("target_auth_user_id", user.id);
      if (error) {
        return fail(error.message);
      }

      return ok(true);
    } catch (error) {
      return fail(error instanceof Error ? error.message : "Failed to clear notifications.");
    }
  }

  static async sendNotification(input: SendNotificationInput): Promise<ServiceResult<number>> {
    if (!isSupabaseConfigured) {
      return fail(SUPABASE_MISSING_ERROR);
    }

    const normalizedMessage = fixPossiblyMojibake(input.message.trim());
    if (!normalizedMessage) {
      return fail("Message is required.");
    }

    const normalizedTitle = input.title ? fixPossiblyMojibake(input.title.trim()) : null;
    const normalizedTargetFaction = input.targetFaction
      ? fixPossiblyMojibake(input.targetFaction.trim())
      : undefined;

    try {
      const recipientsResult = await normalizeTargetUsers({
        targetType: input.targetType,
        targetAuthUserId: input.targetAuthUserId,
        targetFaction: normalizedTargetFaction,
      });

      if (recipientsResult.error || !recipientsResult.data) {
        return fail(recipientsResult.error ?? "Failed to build recipients.");
      }

      const supabase = getSupabaseClient() as any;
      const rows = recipientsResult.data.map((authUserId) => ({
        sender_auth_user_id: input.senderAuthUserId,
        target_auth_user_id: authUserId,
        title: normalizedTitle || null,
        message: normalizedMessage,
        type: input.type?.trim() || "general",
        target_type: input.targetType,
        target_faction:
          input.targetType === NOTIFICATION_TARGET_TYPES.FACTION ? normalizedTargetFaction ?? null : null,
        is_read: false,
      }));

      const { error } = await supabase.from("notifications").insert(rows);
      if (error) {
        return fail(error.message);
      }

      await ActivityLogsService.log({
        actorAuthUserId: input.senderAuthUserId,
        actorEmployeeId: input.senderEmployeeId ?? null,
        action: "notification.send",
        entityType: "notifications",
        entityId: null,
        details: {
          targetType: input.targetType,
          targetFaction: normalizedTargetFaction ?? null,
          recipients: rows.length,
          type: input.type?.trim() || "general",
        },
      });

      return ok(rows.length);
    } catch (error) {
      return fail(error instanceof Error ? error.message : "Failed to send notification.");
    }
  }
}
