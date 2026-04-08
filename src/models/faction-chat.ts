import { normalizeTextDeep } from "@/src/utils/text-normalization";

export type FactionMessageType = "text";

export interface FactionMessage {
  id: string;
  senderUserId: string;
  senderEmployeeId: string;
  senderName: string;
  faction: string;
  content: string;
  messageType: FactionMessageType;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface FactionMessageDbRow {
  id: string;
  sender_user_id: string;
  sender_employee_id: string;
  sender_name: string;
  faction: string;
  content: string;
  message_type: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

const normalizeMessageType = (value: string): FactionMessageType =>
  value === "text" ? "text" : "text";

export const mapFactionMessageDbRow = (row: FactionMessageDbRow): FactionMessage => {
  const normalized = normalizeTextDeep(row);

  return {
    id: normalized.id,
    senderUserId: normalized.sender_user_id,
    senderEmployeeId: normalized.sender_employee_id,
    senderName: normalized.sender_name,
    faction: normalized.faction,
    content: normalized.content,
    messageType: normalizeMessageType(normalized.message_type),
    createdAt: normalized.created_at,
    updatedAt: normalized.updated_at,
    deletedAt: normalized.deleted_at ?? null,
  };
};
