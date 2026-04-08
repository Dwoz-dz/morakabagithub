import { normalizeTextDeep } from "@/src/utils/text-normalization";

export const SUPPORT_TICKET_STATUSES = {
  OPEN: "open",
  IN_PROGRESS: "in_progress",
  CLOSED: "closed",
} as const;

export type SupportTicketStatus =
  (typeof SUPPORT_TICKET_STATUSES)[keyof typeof SUPPORT_TICKET_STATUSES];

export interface SupportTicket {
  id: string;
  employeeId: string;
  subject: string;
  message: string;
  status: SupportTicketStatus;
  adminReply: string | null;
  repliedBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SupportTicketDbRow {
  id: string;
  employee_id: string;
  subject: string;
  message: string;
  status: SupportTicketStatus;
  admin_reply: string | null;
  replied_by: string | null;
  created_at: string;
  updated_at: string;
}

export const mapSupportTicketDbRow = (row: SupportTicketDbRow): SupportTicket => {
  const normalizedRow = normalizeTextDeep(row);

  return {
    id: normalizedRow.id,
    employeeId: normalizedRow.employee_id,
    subject: normalizedRow.subject,
    message: normalizedRow.message,
    status: normalizedRow.status,
    adminReply: normalizedRow.admin_reply ?? null,
    repliedBy: normalizedRow.replied_by ?? null,
    createdAt: normalizedRow.created_at,
    updatedAt: normalizedRow.updated_at,
  };
};
