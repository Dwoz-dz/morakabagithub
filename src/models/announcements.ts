import { normalizeTextDeep } from "@/src/utils/text-normalization";

import type { EmployeeRole } from "./roles";

export type AnnouncementType = "info" | "urgent" | "telegram" | "reward" | "good_news";
export type AnnouncementTargetRole = EmployeeRole | "all";

export interface Announcement {
  id: string;
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
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AnnouncementDbRow {
  id: string;
  title: string;
  message: string;
  type: string;
  emoji: string | null;
  image_url: string | null;
  target_roles: unknown;
  target_factions: unknown;
  show_in_ticker: boolean;
  show_in_stories: boolean;
  show_in_feed: boolean;
  priority: number;
  is_active: boolean;
  starts_at: string | null;
  expires_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface AnnouncementRead {
  id: string;
  announcementId: string;
  employeeId: string;
  openedStoryAt: string | null;
  readFeedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AnnouncementReadDbRow {
  id: string;
  announcement_id: string;
  employee_id: string;
  opened_story_at: string | null;
  read_feed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface AnnouncementWithReadState extends Announcement {
  openedStoryAt: string | null;
  readFeedAt: string | null;
  hasOpenedStory: boolean;
  hasReadFeed: boolean;
}

const normalizeTargetRoles = (value: unknown): AnnouncementTargetRole[] => {
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

const normalizeTargetFactions = (value: unknown): string[] => {
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

const normalizeType = (value: string): AnnouncementType => {
  if (value === "urgent") return "urgent";
  if (value === "telegram") return "telegram";
  if (value === "reward") return "reward";
  if (value === "good_news") return "good_news";
  return "info";
};

export const mapAnnouncementDbRow = (row: AnnouncementDbRow): Announcement => {
  const normalized = normalizeTextDeep(row);

  return {
    id: normalized.id,
    title: normalized.title,
    message: normalized.message,
    type: normalizeType(normalized.type),
    emoji: normalized.emoji ?? null,
    imageUrl: normalized.image_url ?? null,
    targetRoles: normalizeTargetRoles(normalized.target_roles),
    targetFactions: normalizeTargetFactions(normalized.target_factions),
    showInTicker: Boolean(normalized.show_in_ticker),
    showInStories: Boolean(normalized.show_in_stories),
    showInFeed: Boolean(normalized.show_in_feed),
    priority: Number.isFinite(normalized.priority) ? normalized.priority : 0,
    isActive: Boolean(normalized.is_active),
    startsAt: normalized.starts_at ?? null,
    expiresAt: normalized.expires_at ?? null,
    createdBy: normalized.created_by ?? null,
    createdAt: normalized.created_at,
    updatedAt: normalized.updated_at,
  };
};

export const mapAnnouncementReadDbRow = (row: AnnouncementReadDbRow): AnnouncementRead => {
  const normalized = normalizeTextDeep(row);

  return {
    id: normalized.id,
    announcementId: normalized.announcement_id,
    employeeId: normalized.employee_id,
    openedStoryAt: normalized.opened_story_at ?? null,
    readFeedAt: normalized.read_feed_at ?? null,
    createdAt: normalized.created_at,
    updatedAt: normalized.updated_at,
  };
};

export const withAnnouncementReadState = (
  announcement: Announcement,
  read: AnnouncementRead | null,
): AnnouncementWithReadState => ({
  ...announcement,
  openedStoryAt: read?.openedStoryAt ?? null,
  readFeedAt: read?.readFeedAt ?? null,
  hasOpenedStory: Boolean(read?.openedStoryAt),
  hasReadFeed: Boolean(read?.readFeedAt),
});
