import {
  mapAnnouncementDbRow,
  mapAnnouncementReadDbRow,
  type Announcement,
  type AnnouncementDbRow,
  type AnnouncementRead,
  type AnnouncementReadDbRow,
  type AnnouncementTargetRole,
  type AnnouncementType,
  type AnnouncementWithReadState,
  withAnnouncementReadState,
} from "@/src/models";

import { getSupabaseClient, isSupabaseConfigured } from "./client";
import { getCurrentEmployeeContext } from "./current-employee-context";
import { fail, ok, type ServiceResult, SUPABASE_MISSING_ERROR } from "./service-types";

const ANNOUNCEMENTS_SELECT =
  "id, title, message, type, emoji, image_url, target_roles, target_factions, show_in_ticker, show_in_stories, show_in_feed, priority, is_active, starts_at, expires_at, created_by, created_at, updated_at";

const ANNOUNCEMENT_READS_SELECT =
  "id, announcement_id, employee_id, opened_story_at, read_feed_at, created_at, updated_at";

interface AnnouncementAdminPayload {
  title: string;
  message: string;
  type: AnnouncementType;
  emoji: string | null;
  imageUrl: string | null;
  targetRoles: AnnouncementTargetRole[];
  targetFactions: string[];
  showInTicker: boolean;
  showInStories: boolean;
  showInFeed: boolean;
  priority: number;
  isActive: boolean;
  startsAt: string | null;
  expiresAt: string | null;
}

export type AnnouncementCreateInput = AnnouncementAdminPayload;

export interface AnnouncementUpdateInput extends Partial<AnnouncementAdminPayload> {
  id: string;
}

const toReadableError = (error: unknown, fallback: string): string =>
  error instanceof Error ? error.message : fallback;

const normalizeAnnouncementType = (value: string | null | undefined): AnnouncementType => {
  if (value === "urgent") return "urgent";
  if (value === "telegram") return "telegram";
  if (value === "reward") return "reward";
  if (value === "good_news") return "good_news";
  return "info";
};

const normalizeTargetRoles = (
  value: AnnouncementTargetRole[] | null | undefined,
): AnnouncementTargetRole[] => {
  if (!Array.isArray(value)) {
    return ["all"];
  }

  const valid = value
    .map((item) => (typeof item === "string" ? item.trim().toLowerCase() : ""))
    .filter((item): item is AnnouncementTargetRole => item === "member" || item === "admin" || item === "all");

  if (!valid.length) {
    return ["all"];
  }

  return Array.from(new Set(valid));
};

const normalizeTargetFactions = (value: string[] | null | undefined): string[] => {
  if (!Array.isArray(value)) {
    return ["all"];
  }

  const normalized = value
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter(Boolean);

  if (!normalized.length) {
    return ["all"];
  }

  if (normalized.some((item) => item.toLowerCase() === "all")) {
    return ["all"];
  }

  return Array.from(new Set(normalized));
};

const isNowVisible = (announcement: Announcement, nowMs = Date.now()): boolean => {
  if (!announcement.isActive) {
    return false;
  }

  if (announcement.startsAt && new Date(announcement.startsAt).getTime() > nowMs) {
    return false;
  }

  if (announcement.expiresAt && new Date(announcement.expiresAt).getTime() < nowMs) {
    return false;
  }

  return true;
};

const toAnnouncementWithReadState = (
  announcements: Announcement[],
  reads: AnnouncementRead[],
): AnnouncementWithReadState[] => {
  const readByAnnouncementId = new Map<string, AnnouncementRead>();
  reads.forEach((item) => {
    readByAnnouncementId.set(item.announcementId, item);
  });

  return announcements.map((item) => withAnnouncementReadState(item, readByAnnouncementId.get(item.id) ?? null));
};

const sortAnnouncements = <T extends { priority: number; createdAt: string }>(items: T[]): T[] =>
  [...items].sort((a, b) => {
    if (b.priority !== a.priority) {
      return b.priority - a.priority;
    }

    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });

const validateAnnouncementPayload = (payload: AnnouncementAdminPayload): string | null => {
  if (!payload.title.trim()) {
    return "Announcement title is required.";
  }

  if (!payload.message.trim()) {
    return "Announcement message is required.";
  }

  if (!payload.showInTicker && !payload.showInStories && !payload.showInFeed) {
    return "At least one visibility channel must be enabled (ticker/stories/feed).";
  }

  if (payload.expiresAt && payload.startsAt) {
    const startsAt = new Date(payload.startsAt).getTime();
    const expiresAt = new Date(payload.expiresAt).getTime();
    if (Number.isFinite(startsAt) && Number.isFinite(expiresAt) && expiresAt < startsAt) {
      return "Announcement expiry date must be after the start date.";
    }
  }

  return null;
};

const toDbPayload = (payload: AnnouncementAdminPayload) => ({
  title: payload.title.trim(),
  message: payload.message.trim(),
  type: normalizeAnnouncementType(payload.type),
  emoji: payload.emoji?.trim() || null,
  image_url: payload.imageUrl?.trim() || null,
  target_roles: normalizeTargetRoles(payload.targetRoles),
  target_factions: normalizeTargetFactions(payload.targetFactions),
  show_in_ticker: Boolean(payload.showInTicker),
  show_in_stories: Boolean(payload.showInStories),
  show_in_feed: Boolean(payload.showInFeed),
  priority: Number.isFinite(payload.priority) ? payload.priority : 0,
  is_active: Boolean(payload.isActive),
  starts_at: payload.startsAt ?? null,
  expires_at: payload.expiresAt ?? null,
});

export class AnnouncementsService {
  private static async ensureAdminContext(): Promise<
    ServiceResult<{ employeeId: string; authUserId: string }>
  > {
    const context = await getCurrentEmployeeContext();
    if (context.error) {
      return fail(context.error);
    }

    if (!context.data || context.data.role !== "admin") {
      return fail("Only admins can manage announcements.");
    }

    return ok({
      employeeId: context.data.employeeId,
      authUserId: context.data.authUserId,
    });
  }

  private static async listVisibleWithReadsForCurrentEmployee(): Promise<
    ServiceResult<AnnouncementWithReadState[]>
  > {
    if (!isSupabaseConfigured) {
      return fail(SUPABASE_MISSING_ERROR);
    }

    try {
      const context = await getCurrentEmployeeContext();
      if (context.error) {
        return fail(context.error);
      }
      if (!context.data) {
        return ok([]);
      }

      const supabase = getSupabaseClient() as any;
      const { data, error } = await supabase
        .from("announcements")
        .select(ANNOUNCEMENTS_SELECT)
        .order("priority", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(120);

      if (error) {
        return fail(error.message);
      }

      const announcementRows = (data ?? []) as AnnouncementDbRow[];
      const mappedAnnouncements = announcementRows
        .map((row) => mapAnnouncementDbRow(row))
        .filter((item) => isNowVisible(item));

      if (!mappedAnnouncements.length) {
        return ok([]);
      }

      const announcementIds = mappedAnnouncements.map((item: Announcement) => item.id);
      const readsResult = await supabase
        .from("announcement_reads")
        .select(ANNOUNCEMENT_READS_SELECT)
        .eq("employee_id", context.data.employeeId)
        .in("announcement_id", announcementIds);

      if (readsResult.error) {
        return fail(readsResult.error.message);
      }

      const reads = (readsResult.data ?? []).map((row: AnnouncementReadDbRow) =>
        mapAnnouncementReadDbRow(row),
      );

      return ok(toAnnouncementWithReadState(sortAnnouncements(mappedAnnouncements), reads));
    } catch (error) {
      return fail(toReadableError(error, "Failed to load announcements."));
    }
  }

  private static async markReadField(
    announcementId: string,
    field: "opened_story_at" | "read_feed_at",
  ): Promise<ServiceResult<AnnouncementRead>> {
    if (!isSupabaseConfigured) {
      return fail(SUPABASE_MISSING_ERROR);
    }

    const normalizedAnnouncementId = announcementId.trim();
    if (!normalizedAnnouncementId) {
      return fail("announcementId is required.");
    }

    try {
      const context = await getCurrentEmployeeContext();
      if (context.error) {
        return fail(context.error);
      }
      if (!context.data) {
        return fail("Employee context is required.");
      }

      const supabase = getSupabaseClient() as any;
      const nowIso = new Date().toISOString();
      const { data: existing, error: existingError } = await supabase
        .from("announcement_reads")
        .select(ANNOUNCEMENT_READS_SELECT)
        .eq("announcement_id", normalizedAnnouncementId)
        .eq("employee_id", context.data.employeeId)
        .maybeSingle();

      if (existingError) {
        return fail(existingError.message);
      }

      if (existing) {
        const { data, error } = await supabase
          .from("announcement_reads")
          .update({ [field]: nowIso })
          .eq("id", existing.id)
          .select(ANNOUNCEMENT_READS_SELECT)
          .single();

        if (error) {
          return fail(error.message);
        }

        return ok(mapAnnouncementReadDbRow(data as AnnouncementReadDbRow));
      }

      const insertPayload: Record<string, unknown> = {
        announcement_id: normalizedAnnouncementId,
        employee_id: context.data.employeeId,
        [field]: nowIso,
      };

      const { data, error } = await supabase
        .from("announcement_reads")
        .insert(insertPayload)
        .select(ANNOUNCEMENT_READS_SELECT)
        .single();

      if (error) {
        return fail(error.message);
      }

      return ok(mapAnnouncementReadDbRow(data as AnnouncementReadDbRow));
    } catch (error) {
      return fail(toReadableError(error, "Failed to track announcement read state."));
    }
  }

  static async listVisibleForCurrentUser(): Promise<ServiceResult<AnnouncementWithReadState[]>> {
    return this.listVisibleWithReadsForCurrentEmployee();
  }

  static async listStoriesForCurrentUser(): Promise<ServiceResult<AnnouncementWithReadState[]>> {
    const result = await this.listVisibleWithReadsForCurrentEmployee();
    if (result.error || !result.data) {
      return result;
    }

    return ok(result.data.filter((item) => item.showInStories));
  }

  static async listTickerAnnouncementsForCurrentUser(): Promise<ServiceResult<AnnouncementWithReadState[]>> {
    const result = await this.listVisibleWithReadsForCurrentEmployee();
    if (result.error || !result.data) {
      return result;
    }

    return ok(result.data.filter((item) => item.showInTicker));
  }

  static async listFeedAnnouncementsForCurrentUser(): Promise<ServiceResult<AnnouncementWithReadState[]>> {
    const result = await this.listVisibleWithReadsForCurrentEmployee();
    if (result.error || !result.data) {
      return result;
    }

    return ok(result.data.filter((item) => item.showInFeed));
  }

  static async markStoryOpened(announcementId: string): Promise<ServiceResult<AnnouncementRead>> {
    return this.markReadField(announcementId, "opened_story_at");
  }

  static async markFeedRead(announcementId: string): Promise<ServiceResult<AnnouncementRead>> {
    return this.markReadField(announcementId, "read_feed_at");
  }

  static async adminCreateAnnouncement(
    input: AnnouncementCreateInput,
  ): Promise<ServiceResult<Announcement>> {
    if (!isSupabaseConfigured) {
      return fail(SUPABASE_MISSING_ERROR);
    }

    try {
      const adminContext = await this.ensureAdminContext();
      if (adminContext.error) {
        return fail(adminContext.error);
      }
      if (!adminContext.data) {
        return fail("Missing admin context.");
      }

      const payload: AnnouncementAdminPayload = {
        title: input.title,
        message: input.message,
        type: normalizeAnnouncementType(input.type),
        emoji: input.emoji ?? null,
        imageUrl: input.imageUrl ?? null,
        targetRoles: normalizeTargetRoles(input.targetRoles),
        targetFactions: normalizeTargetFactions(input.targetFactions),
        showInTicker: Boolean(input.showInTicker),
        showInStories: Boolean(input.showInStories),
        showInFeed: Boolean(input.showInFeed),
        priority: Number.isFinite(input.priority) ? input.priority : 0,
        isActive: Boolean(input.isActive),
        startsAt: input.startsAt ?? null,
        expiresAt: input.expiresAt ?? null,
      };

      const validationError = validateAnnouncementPayload(payload);
      if (validationError) {
        return fail(validationError);
      }

      const supabase = getSupabaseClient() as any;
      const { data, error } = await supabase
        .from("announcements")
        .insert({
          ...toDbPayload(payload),
          created_by: adminContext.data.authUserId,
        })
        .select(ANNOUNCEMENTS_SELECT)
        .single();

      if (error) {
        return fail(error.message);
      }

      return ok(mapAnnouncementDbRow(data as AnnouncementDbRow));
    } catch (error) {
      return fail(toReadableError(error, "Failed to create announcement."));
    }
  }

  static async adminUpdateAnnouncement(
    input: AnnouncementUpdateInput,
  ): Promise<ServiceResult<Announcement>> {
    if (!isSupabaseConfigured) {
      return fail(SUPABASE_MISSING_ERROR);
    }

    const announcementId = input.id.trim();
    if (!announcementId) {
      return fail("Announcement id is required.");
    }

    try {
      const adminContext = await this.ensureAdminContext();
      if (adminContext.error) {
        return fail(adminContext.error);
      }

      const supabase = getSupabaseClient() as any;
      const { data: current, error: currentError } = await supabase
        .from("announcements")
        .select(ANNOUNCEMENTS_SELECT)
        .eq("id", announcementId)
        .maybeSingle();

      if (currentError) {
        return fail(currentError.message);
      }

      if (!current) {
        return fail("Announcement not found.");
      }

      const existing = mapAnnouncementDbRow(current as AnnouncementDbRow);
      const merged: AnnouncementAdminPayload = {
        title: input.title ?? existing.title,
        message: input.message ?? existing.message,
        type: normalizeAnnouncementType(input.type ?? existing.type),
        emoji: input.emoji === undefined ? existing.emoji : input.emoji,
        imageUrl: input.imageUrl === undefined ? existing.imageUrl : input.imageUrl,
        targetRoles: input.targetRoles ? normalizeTargetRoles(input.targetRoles) : existing.targetRoles,
        targetFactions: input.targetFactions
          ? normalizeTargetFactions(input.targetFactions)
          : existing.targetFactions,
        showInTicker: input.showInTicker ?? existing.showInTicker,
        showInStories: input.showInStories ?? existing.showInStories,
        showInFeed: input.showInFeed ?? existing.showInFeed,
        priority: input.priority ?? existing.priority,
        isActive: input.isActive ?? existing.isActive,
        startsAt: input.startsAt === undefined ? existing.startsAt : input.startsAt,
        expiresAt: input.expiresAt === undefined ? existing.expiresAt : input.expiresAt,
      };

      const validationError = validateAnnouncementPayload(merged);
      if (validationError) {
        return fail(validationError);
      }

      const { data, error } = await supabase
        .from("announcements")
        .update(toDbPayload(merged))
        .eq("id", announcementId)
        .select(ANNOUNCEMENTS_SELECT)
        .single();

      if (error) {
        return fail(error.message);
      }

      return ok(mapAnnouncementDbRow(data as AnnouncementDbRow));
    } catch (error) {
      return fail(toReadableError(error, "Failed to update announcement."));
    }
  }

  static async adminToggleActive(announcementId: string, isActive: boolean): Promise<ServiceResult<Announcement>> {
    if (!isSupabaseConfigured) {
      return fail(SUPABASE_MISSING_ERROR);
    }

    const normalizedAnnouncementId = announcementId.trim();
    if (!normalizedAnnouncementId) {
      return fail("Announcement id is required.");
    }

    try {
      const adminContext = await this.ensureAdminContext();
      if (adminContext.error) {
        return fail(adminContext.error);
      }

      const supabase = getSupabaseClient() as any;
      const { data, error } = await supabase
        .from("announcements")
        .update({ is_active: isActive })
        .eq("id", normalizedAnnouncementId)
        .select(ANNOUNCEMENTS_SELECT)
        .single();

      if (error) {
        return fail(error.message);
      }

      return ok(mapAnnouncementDbRow(data as AnnouncementDbRow));
    } catch (error) {
      return fail(toReadableError(error, "Failed to update announcement active state."));
    }
  }

  static async adminListAll(limit = 200): Promise<ServiceResult<Announcement[]>> {
    if (!isSupabaseConfigured) {
      return fail(SUPABASE_MISSING_ERROR);
    }

    try {
      const adminContext = await this.ensureAdminContext();
      if (adminContext.error) {
        return fail(adminContext.error);
      }

      const supabase = getSupabaseClient() as any;
      const { data, error } = await supabase
        .from("announcements")
        .select(ANNOUNCEMENTS_SELECT)
        .order("created_at", { ascending: false })
        .limit(limit);

      if (error) {
        return fail(error.message);
      }

      return ok((data ?? []).map((row: AnnouncementDbRow) => mapAnnouncementDbRow(row)));
    } catch (error) {
      return fail(toReadableError(error, "Failed to load admin announcements list."));
    }
  }

  static async adminListReadStats(
    announcementIds: string[],
  ): Promise<ServiceResult<Record<string, { feedReads: number; storyOpens: number }>>> {
    if (!isSupabaseConfigured) {
      return fail(SUPABASE_MISSING_ERROR);
    }

    const ids = Array.from(new Set(announcementIds.map((item) => item.trim()).filter(Boolean)));
    if (!ids.length) {
      return ok({});
    }

    try {
      const adminContext = await this.ensureAdminContext();
      if (adminContext.error) {
        return fail(adminContext.error);
      }

      const supabase = getSupabaseClient() as any;
      const { data, error } = await supabase
        .from("announcement_reads")
        .select("announcement_id, opened_story_at, read_feed_at")
        .in("announcement_id", ids);

      if (error) {
        return fail(error.message);
      }

      const stats: Record<string, { feedReads: number; storyOpens: number }> = {};
      ids.forEach((id) => {
        stats[id] = { feedReads: 0, storyOpens: 0 };
      });

      (data ?? []).forEach(
        (row: {
          announcement_id: string;
          opened_story_at: string | null;
          read_feed_at: string | null;
        }) => {
          if (!stats[row.announcement_id]) {
            stats[row.announcement_id] = { feedReads: 0, storyOpens: 0 };
          }

          if (row.read_feed_at) {
            stats[row.announcement_id].feedReads += 1;
          }
          if (row.opened_story_at) {
            stats[row.announcement_id].storyOpens += 1;
          }
        },
      );

      return ok(stats);
    } catch (error) {
      return fail(toReadableError(error, "Failed to load announcement read stats."));
    }
  }

  static async adminDeleteAnnouncement(announcementId: string): Promise<ServiceResult<boolean>> {
    if (!isSupabaseConfigured) {
      return fail(SUPABASE_MISSING_ERROR);
    }

    const normalizedAnnouncementId = announcementId.trim();
    if (!normalizedAnnouncementId) {
      return fail("Announcement id is required.");
    }

    try {
      const adminContext = await this.ensureAdminContext();
      if (adminContext.error) {
        return fail(adminContext.error);
      }

      const supabase = getSupabaseClient() as any;
      const { error } = await supabase.from("announcements").delete().eq("id", normalizedAnnouncementId);

      if (error) {
        return fail(error.message);
      }

      return ok(true);
    } catch (error) {
      return fail(toReadableError(error, "Failed to delete announcement."));
    }
  }
}
