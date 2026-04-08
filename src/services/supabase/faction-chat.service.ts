import {
  mapFactionMessageDbRow,
  mapFactionMessageReadDbRow,
  type FactionMessage,
  type FactionMessageDbRow,
  type FactionMessageReadDbRow,
  type FactionMessageType,
} from "@/src/models";
import { FACTION_OPTIONS } from "@/src/constants/factions";

import { getSupabaseClient, isSupabaseConfigured } from "./client";
import { getCurrentEmployeeContext, type CurrentEmployeeContext } from "./current-employee-context";
import { fail, ok, type ServiceResult, SUPABASE_MISSING_ERROR } from "./service-types";

const FACTION_MESSAGES_SELECT =
  "id, sender_user_id, sender_employee_id, sender_name, faction, content, message_type, created_at, updated_at, deleted_at";
const FACTION_MESSAGE_READS_SELECT =
  "employee_id, faction, last_read_at, updated_at";

const MESSAGE_TYPE_TEXT: FactionMessageType = "text";

const toReadableError = (error: unknown, fallback: string): string =>
  error instanceof Error ? error.message : fallback;

const normalizeFaction = (value: string | null | undefined): string | null => {
  if (!value) {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
};

const normalizeMessageType = (value: FactionMessageType | null | undefined): FactionMessageType =>
  value === MESSAGE_TYPE_TEXT ? MESSAGE_TYPE_TEXT : MESSAGE_TYPE_TEXT;

const normalizeMessageContent = (value: string): string => value.trim();

export interface FactionMessageSubscriptionHandlers {
  onMessage: (message: FactionMessage) => void;
  onError?: (error: string) => void;
  onStatus?: (status: string) => void;
}

export interface SubscribeToFactionMessagesOptions {
  faction?: string | null;
}

export interface SendFactionMessageInput {
  content: string;
  messageType?: FactionMessageType;
}

export interface MarkFactionSeenResult {
  faction: string;
  lastReadAt: string;
}

export class FactionChatService {
  private static toSortedMessages(messages: FactionMessage[]): FactionMessage[] {
    return [...messages].sort((a, b) => {
      const delta = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      if (delta !== 0) {
        return delta;
      }

      return a.id.localeCompare(b.id);
    });
  }

  private static async resolveCurrentContext(): Promise<ServiceResult<CurrentEmployeeContext>> {
    const contextResult = await getCurrentEmployeeContext();
    if (contextResult.error) {
      return fail<CurrentEmployeeContext>(contextResult.error);
    }
    if (!contextResult.data) {
      return fail<CurrentEmployeeContext>("Employee context is required.");
    }

    return ok(contextResult.data);
  }

  private static resolveVisibleFactionsForContext(context: {
    role: string;
    faction: string | null;
  }): string[] {
    if (context.role === "admin") {
      return [...FACTION_OPTIONS];
    }

    const ownFaction = normalizeFaction(context.faction);
    if (!ownFaction) {
      return [];
    }

    return [ownFaction];
  }

  private static async listLatestForFaction(
    faction: string,
  ): Promise<ServiceResult<FactionMessage | null>> {
    try {
      const supabase = getSupabaseClient() as any;
      const { data, error } = await supabase
        .from("faction_messages")
        .select(FACTION_MESSAGES_SELECT)
        .eq("faction", faction)
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) {
        return fail(error.message);
      }

      if (!data) {
        return ok(null);
      }

      return ok(mapFactionMessageDbRow(data as FactionMessageDbRow));
    } catch (error) {
      return fail(toReadableError(error, "Failed to load latest faction message."));
    }
  }

  static async listMessagesForCurrentUserFaction(limit = 120): Promise<ServiceResult<FactionMessage[]>> {
    if (!isSupabaseConfigured) {
      return fail(SUPABASE_MISSING_ERROR);
    }

    const normalizedLimit = Number.isFinite(limit) && limit > 0 ? Math.min(limit, 300) : 120;

    try {
      const contextResult = await getCurrentEmployeeContext();
      if (contextResult.error) {
        return fail(contextResult.error);
      }
      if (!contextResult.data) {
        return fail("Employee context is required.");
      }

      const faction = normalizeFaction(contextResult.data.faction);
      if (!faction) {
        return fail("Current user does not have an assigned faction.");
      }

      const supabase = getSupabaseClient() as any;
      const { data, error } = await supabase
        .from("faction_messages")
        .select(FACTION_MESSAGES_SELECT)
        .eq("faction", faction)
        .is("deleted_at", null)
        .order("created_at", { ascending: true })
        .limit(normalizedLimit);

      if (error) {
        return fail(error.message);
      }

      return ok(
        this.toSortedMessages(
          (data ?? []).map((row: FactionMessageDbRow) => mapFactionMessageDbRow(row)),
        ),
      );
    } catch (error) {
      return fail(toReadableError(error, "Failed to load faction messages."));
    }
  }

  static async sendMessageToOwnFaction(input: SendFactionMessageInput): Promise<ServiceResult<FactionMessage>> {
    if (!isSupabaseConfigured) {
      return fail(SUPABASE_MISSING_ERROR);
    }

    const content = normalizeMessageContent(input.content);
    if (!content) {
      return fail("Message content is required.");
    }

    try {
      const contextResult = await getCurrentEmployeeContext();
      if (contextResult.error) {
        return fail(contextResult.error);
      }
      if (!contextResult.data) {
        return fail("Employee context is required.");
      }

      const faction = normalizeFaction(contextResult.data.faction);
      if (!faction) {
        return fail("Current user does not have an assigned faction.");
      }

      const supabase = getSupabaseClient() as any;
      const { data, error } = await supabase
        .from("faction_messages")
        .insert({
          sender_user_id: contextResult.data.authUserId,
          sender_employee_id: contextResult.data.employeeId,
          sender_name: contextResult.data.fullName,
          faction,
          content,
          message_type: normalizeMessageType(input.messageType),
        })
        .select(FACTION_MESSAGES_SELECT)
        .single();

      if (error) {
        return fail(error.message);
      }

      return ok(mapFactionMessageDbRow(data as FactionMessageDbRow));
    } catch (error) {
      return fail(toReadableError(error, "Failed to send faction message."));
    }
  }

  static async subscribeToFactionMessages(
    handlers: FactionMessageSubscriptionHandlers,
    options: SubscribeToFactionMessagesOptions = {},
  ): Promise<ServiceResult<() => Promise<void>>> {
    if (!isSupabaseConfigured) {
      return fail(SUPABASE_MISSING_ERROR);
    }

    if (typeof handlers.onMessage !== "function") {
      return fail("onMessage handler is required.");
    }

    try {
      const contextResult = await getCurrentEmployeeContext();
      if (contextResult.error) {
        return fail(contextResult.error);
      }
      if (!contextResult.data) {
        return fail("Employee context is required.");
      }

      const ownFaction = normalizeFaction(contextResult.data.faction);
      if (!ownFaction && contextResult.data.role !== "admin") {
        return fail("Current user does not have an assigned faction.");
      }

      const scopedFaction =
        contextResult.data.role === "admin"
          ? normalizeFaction(options.faction) ?? null
          : ownFaction;

      const supabase = getSupabaseClient() as any;
      const changeFilter: {
        event: "INSERT";
        schema: "public";
        table: "faction_messages";
        filter?: string;
      } = {
        event: "INSERT",
        schema: "public",
        table: "faction_messages",
      };

      if (scopedFaction) {
        changeFilter.filter = `faction=eq.${scopedFaction}`;
      }

      const channel = supabase
        .channel(
          `faction-messages:${contextResult.data.authUserId}:${scopedFaction ?? "all"}:${Date.now()}`,
        )
        .on(
          "postgres_changes",
          changeFilter,
          (payload: { new: FactionMessageDbRow }) => {
            try {
              const mapped = mapFactionMessageDbRow(payload.new);
              if (mapped.deletedAt) {
                return;
              }

              if (scopedFaction && mapped.faction !== scopedFaction) {
                return;
              }

              handlers.onMessage(mapped);
            } catch (error) {
              handlers.onError?.(
                toReadableError(error, "Failed to parse incoming faction message."),
              );
            }
          },
        )
        .subscribe((status: string) => {
          handlers.onStatus?.(status);

          if (
            status === "CHANNEL_ERROR" ||
            status === "TIMED_OUT" ||
            status === "CLOSED"
          ) {
            handlers.onError?.(`Faction chat realtime status: ${status}`);
          }
        });

      return ok(async () => {
        await supabase.removeChannel(channel);
      });
    } catch (error) {
      return fail(toReadableError(error, "Failed to subscribe to faction messages."));
    }
  }

  static async adminListMessagesForFaction(
    faction: string,
    limit = 160,
  ): Promise<ServiceResult<FactionMessage[]>> {
    if (!isSupabaseConfigured) {
      return fail(SUPABASE_MISSING_ERROR);
    }

    const normalizedFaction = normalizeFaction(faction);
    if (!normalizedFaction) {
      return fail("Faction is required.");
    }

    const normalizedLimit = Number.isFinite(limit) && limit > 0 ? Math.min(limit, 500) : 160;

    try {
      const contextResult = await getCurrentEmployeeContext();
      if (contextResult.error) {
        return fail(contextResult.error);
      }
      if (!contextResult.data || contextResult.data.role !== "admin") {
        return fail("Only admins can list messages for any faction.");
      }

      const supabase = getSupabaseClient() as any;
      const { data, error } = await supabase
        .from("faction_messages")
        .select(FACTION_MESSAGES_SELECT)
        .eq("faction", normalizedFaction)
        .is("deleted_at", null)
        .order("created_at", { ascending: true })
        .limit(normalizedLimit);

      if (error) {
        return fail(error.message);
      }

      return ok(
        this.toSortedMessages(
          (data ?? []).map((row: FactionMessageDbRow) => mapFactionMessageDbRow(row)),
        ),
      );
    } catch (error) {
      return fail(toReadableError(error, "Failed to load faction messages for admin."));
    }
  }

  static async adminSendMessageToFaction(
    faction: string,
    input: SendFactionMessageInput,
  ): Promise<ServiceResult<FactionMessage>> {
    if (!isSupabaseConfigured) {
      return fail(SUPABASE_MISSING_ERROR);
    }

    const normalizedFaction = normalizeFaction(faction);
    if (!normalizedFaction) {
      return fail("Faction is required.");
    }

    const content = normalizeMessageContent(input.content);
    if (!content) {
      return fail("Message content is required.");
    }

    try {
      const contextResult = await getCurrentEmployeeContext();
      if (contextResult.error) {
        return fail(contextResult.error);
      }
      if (!contextResult.data || contextResult.data.role !== "admin") {
        return fail("Only admins can send messages to arbitrary factions.");
      }

      const supabase = getSupabaseClient() as any;
      const { data, error } = await supabase
        .from("faction_messages")
        .insert({
          sender_user_id: contextResult.data.authUserId,
          sender_employee_id: contextResult.data.employeeId,
          sender_name: contextResult.data.fullName,
          faction: normalizedFaction,
          content,
          message_type: normalizeMessageType(input.messageType),
        })
        .select(FACTION_MESSAGES_SELECT)
        .single();

      if (error) {
        return fail(error.message);
      }

      return ok(mapFactionMessageDbRow(data as FactionMessageDbRow));
    } catch (error) {
      return fail(toReadableError(error, "Failed to send admin faction message."));
    }
  }

  static async markCurrentFactionSeen(
    faction?: string | null,
  ): Promise<ServiceResult<MarkFactionSeenResult>> {
    if (!isSupabaseConfigured) {
      return fail(SUPABASE_MISSING_ERROR);
    }

    try {
      const contextResult = await this.resolveCurrentContext();
      if (contextResult.error || !contextResult.data) {
        return fail(contextResult.error ?? "Employee context is required.");
      }

      const context = contextResult.data;
      const ownFaction = normalizeFaction(context.faction);
      const requestedFaction = normalizeFaction(faction);
      const resolvedFaction =
        context.role === "admin" ? requestedFaction : ownFaction;

      if (!resolvedFaction) {
        return fail("Faction is required to mark chat as seen.");
      }

      const nowIso = new Date().toISOString();
      const supabase = getSupabaseClient() as any;
      const { data, error } = await supabase
        .from("faction_message_reads")
        .upsert(
          {
            employee_id: context.employeeId,
            faction: resolvedFaction,
            last_read_at: nowIso,
          },
          { onConflict: "employee_id,faction" },
        )
        .select(FACTION_MESSAGE_READS_SELECT)
        .single();

      if (error) {
        return fail(error.message);
      }

      const mapped = mapFactionMessageReadDbRow(data as FactionMessageReadDbRow);
      return ok({
        faction: mapped.faction,
        lastReadAt: mapped.lastReadAt,
      });
    } catch (error) {
      return fail(toReadableError(error, "Failed to mark faction chat as seen."));
    }
  }

  static async listUnreadCountsForCurrentUser(): Promise<ServiceResult<Record<string, number>>> {
    if (!isSupabaseConfigured) {
      return fail(SUPABASE_MISSING_ERROR);
    }

    try {
      const contextResult = await this.resolveCurrentContext();
      if (contextResult.error || !contextResult.data) {
        return fail(contextResult.error ?? "Employee context is required.");
      }

      const context = contextResult.data;
      const visibleFactions = this.resolveVisibleFactionsForContext({
        role: context.role,
        faction: context.faction,
      });

      if (!visibleFactions.length) {
        return ok({});
      }

      const supabase = getSupabaseClient() as any;
      const { data: readsRows, error: readsError } = await supabase
        .from("faction_message_reads")
        .select(FACTION_MESSAGE_READS_SELECT)
        .eq("employee_id", context.employeeId);

      if (readsError) {
        return fail(readsError.message);
      }

      const readsByFaction = new Map<string, string>();
      (readsRows ?? []).forEach((row: FactionMessageReadDbRow) => {
        const mapped = mapFactionMessageReadDbRow(row);
        readsByFaction.set(mapped.faction, mapped.lastReadAt);
      });

      const countsEntries = await Promise.all(
        visibleFactions.map(async (entryFaction) => {
          let query = supabase
            .from("faction_messages")
            .select("id", { count: "exact", head: true })
            .eq("faction", entryFaction)
            .is("deleted_at", null)
            .neq("sender_user_id", context.authUserId);

          const lastReadAt = readsByFaction.get(entryFaction) ?? null;
          if (lastReadAt) {
            query = query.gt("created_at", lastReadAt);
          }

          const { count, error } = await query;
          if (error) {
            throw new Error(error.message);
          }

          return [entryFaction, count ?? 0] as const;
        }),
      );

      const counts: Record<string, number> = {};
      countsEntries.forEach(([entryFaction, count]) => {
        counts[entryFaction] = count;
      });

      return ok(counts);
    } catch (error) {
      return fail(toReadableError(error, "Failed to load unread faction chat counts."));
    }
  }

  static async listLatestVisibleMessagesByFaction(): Promise<
    ServiceResult<Record<string, FactionMessage | null>>
  > {
    if (!isSupabaseConfigured) {
      return fail(SUPABASE_MISSING_ERROR);
    }

    try {
      const contextResult = await this.resolveCurrentContext();
      if (contextResult.error || !contextResult.data) {
        return fail(contextResult.error ?? "Employee context is required.");
      }

      const visibleFactions = this.resolveVisibleFactionsForContext({
        role: contextResult.data.role,
        faction: contextResult.data.faction,
      });

      if (!visibleFactions.length) {
        return ok({});
      }

      const entries = await Promise.all(
        visibleFactions.map(async (entryFaction) => {
          const latestResult = await this.listLatestForFaction(entryFaction);
          if (latestResult.error) {
            throw new Error(latestResult.error);
          }

          return [entryFaction, latestResult.data ?? null] as const;
        }),
      );

      const mapped: Record<string, FactionMessage | null> = {};
      entries.forEach(([entryFaction, message]) => {
        mapped[entryFaction] = message;
      });

      return ok(mapped);
    } catch (error) {
      return fail(toReadableError(error, "Failed to load latest faction chat messages."));
    }
  }
}
