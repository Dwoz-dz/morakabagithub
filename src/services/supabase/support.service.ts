import {
  mapSupportTicketDbRow,
  SUPPORT_TICKET_STATUSES,
  type SupportTicket,
  type SupportTicketStatus,
} from "@/src/models";
import { fixPossiblyMojibake } from "@/src/utils/text-normalization";

import { ActivityLogsService } from "./activity-logs.service";
import { getSupabaseClient, isSupabaseConfigured } from "./client";

type ServiceResult<T> = {
  data: T | null;
  error: string | null;
};

const SUPABASE_MISSING_ERROR =
  "Supabase is not configured. Please provide EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY.";

const ok = <T>(data: T): ServiceResult<T> => ({ data, error: null });
const fail = <T>(error: string): ServiceResult<T> => ({ data: null, error });

const selectFields =
  "id, employee_id, subject, message, status, admin_reply, replied_by, created_at, updated_at";

export class SupportService {
  static async listForCurrentUser(limit = 50): Promise<ServiceResult<SupportTicket[]>> {
    if (!isSupabaseConfigured) {
      return fail(SUPABASE_MISSING_ERROR);
    }

    try {
      const supabase = getSupabaseClient() as any;
      const { data, error } = await supabase
        .from("support_tickets")
        .select(selectFields)
        .order("created_at", { ascending: false })
        .limit(limit);

      if (error) {
        return fail(error.message);
      }

      return ok((data ?? []).map(mapSupportTicketDbRow));
    } catch (error) {
      return fail(error instanceof Error ? error.message : "Failed to load support tickets.");
    }
  }

  static async createTicket(params: {
    employeeId: string;
    subject: string;
    message: string;
    actorAuthUserId: string;
  }): Promise<ServiceResult<SupportTicket>> {
    if (!isSupabaseConfigured) {
      return fail(SUPABASE_MISSING_ERROR);
    }

    try {
      const normalizedSubject = fixPossiblyMojibake(params.subject.trim());
      const normalizedMessage = fixPossiblyMojibake(params.message.trim());

      const supabase = getSupabaseClient() as any;
      const { data, error } = await supabase
        .from("support_tickets")
        .insert({
          employee_id: params.employeeId,
          subject: normalizedSubject,
          message: normalizedMessage,
          status: SUPPORT_TICKET_STATUSES.OPEN,
        })
        .select(selectFields)
        .single();

      if (error) {
        return fail(error.message);
      }

      const ticket = mapSupportTicketDbRow(data);

      await ActivityLogsService.log({
        actorAuthUserId: params.actorAuthUserId,
        actorEmployeeId: params.employeeId,
        action: "support.create",
        entityType: "support_ticket",
        entityId: ticket.id,
        details: { subject: ticket.subject },
      });

      return ok(ticket);
    } catch (error) {
      return fail(error instanceof Error ? error.message : "Failed to create support ticket.");
    }
  }

  static async replyAsAdmin(params: {
    ticketId: string;
    status: SupportTicketStatus;
    adminReply: string;
    actorAuthUserId: string;
    actorEmployeeId?: string | null;
  }): Promise<ServiceResult<boolean>> {
    if (!isSupabaseConfigured) {
      return fail(SUPABASE_MISSING_ERROR);
    }

    try {
      const normalizedReply = fixPossiblyMojibake(params.adminReply.trim());

      const supabase = getSupabaseClient() as any;
      const { error } = await supabase
        .from("support_tickets")
        .update({
          status: params.status,
          admin_reply: normalizedReply,
          replied_by: params.actorAuthUserId,
        })
        .eq("id", params.ticketId);

      if (error) {
        return fail(error.message);
      }

      await ActivityLogsService.log({
        actorAuthUserId: params.actorAuthUserId,
        actorEmployeeId: params.actorEmployeeId ?? null,
        action: "support.reply",
        entityType: "support_ticket",
        entityId: params.ticketId,
        details: { status: params.status },
      });

      return ok(true);
    } catch (error) {
      return fail(error instanceof Error ? error.message : "Failed to reply to support ticket.");
    }
  }
}
