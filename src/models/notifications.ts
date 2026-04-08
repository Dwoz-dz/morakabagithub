import { normalizeTextDeep } from "@/src/utils/text-normalization";

export const NOTIFICATION_TARGET_TYPES = {
  USER: "user",
  FACTION: "faction",
  ALL: "all",
} as const;

export type NotificationTargetType =
  (typeof NOTIFICATION_TARGET_TYPES)[keyof typeof NOTIFICATION_TARGET_TYPES];

export interface NotificationItem {
  id: string;
  senderAuthUserId: string;
  targetAuthUserId: string;
  title: string | null;
  message: string;
  type: string;
  targetType: NotificationTargetType;
  targetFaction: string | null;
  isRead: boolean;
  createdAt: string;
}

export interface NotificationDbRow {
  id: string;
  sender_auth_user_id: string;
  target_auth_user_id: string;
  title: string | null;
  message: string;
  type: string;
  target_type: NotificationTargetType;
  target_faction: string | null;
  is_read: boolean;
  created_at: string;
}

export const mapNotificationDbRow = (row: NotificationDbRow): NotificationItem => {
  const normalizedRow = normalizeTextDeep(row);

  return {
    id: normalizedRow.id,
    senderAuthUserId: normalizedRow.sender_auth_user_id,
    targetAuthUserId: normalizedRow.target_auth_user_id,
    title: normalizedRow.title ?? null,
    message: normalizedRow.message,
    type: normalizedRow.type,
    targetType: normalizedRow.target_type,
    targetFaction: normalizedRow.target_faction ?? null,
    isRead: normalizedRow.is_read,
    createdAt: normalizedRow.created_at,
  };
};
