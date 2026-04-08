import { useEffect, useRef } from "react";

import { FactionChatService } from "@/src/services/supabase/faction-chat.service";
import { useAuthStore } from "@/src/store/auth.store";
import { useFactionChatStore } from "@/src/store/faction-chat.store";

const DEDUPE_LIMIT = 500;

const isApprovedEmployee = (status: string | null | undefined): boolean => status === "approved";

export default function FactionChatRealtimeBridge() {
  const sessionUserId = useAuthStore((state) => state.session?.user?.id ?? null);
  const employee = useAuthStore((state) => state.employee);

  const dedupeIdsRef = useRef<string[]>([]);
  const dedupeLookupRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    let isMounted = true;
    let cleanupSubscription: (() => Promise<void>) | null = null;

    const resetStore = () => {
      useFactionChatStore.getState().reset();
      dedupeIdsRef.current = [];
      dedupeLookupRef.current.clear();
    };

    const pushDedup = (messageId: string): boolean => {
      if (dedupeLookupRef.current.has(messageId)) {
        return false;
      }

      dedupeLookupRef.current.add(messageId);
      dedupeIdsRef.current.push(messageId);

      if (dedupeIdsRef.current.length > DEDUPE_LIMIT) {
        const removedId = dedupeIdsRef.current.shift();
        if (removedId) {
          dedupeLookupRef.current.delete(removedId);
        }
      }

      return true;
    };

    const hydrateUnreadAndLatest = async () => {
      const [unreadResult, latestResult] = await Promise.all([
        FactionChatService.listUnreadCountsForCurrentUser(),
        FactionChatService.listLatestVisibleMessagesByFaction(),
      ]);

      if (!isMounted) {
        return;
      }

      if (!unreadResult.error && unreadResult.data) {
        useFactionChatStore.getState().setUnreadSnapshot(unreadResult.data);
      }

      if (!latestResult.error && latestResult.data) {
        useFactionChatStore.getState().setLatestSnapshot(latestResult.data);
      }
    };

    const init = async () => {
      const canStart = Boolean(sessionUserId && employee?.authUserId && isApprovedEmployee(employee.status));
      if (!canStart) {
        resetStore();
        return;
      }

      useFactionChatStore.getState().setRealtimeStatus("connecting");
      await hydrateUnreadAndLatest();

      const subscribeResult = await FactionChatService.subscribeToFactionMessages(
        {
          onMessage: (message) => {
            if (!pushDedup(message.id)) {
              return;
            }

            const store = useFactionChatStore.getState();
            store.setLatestMessage(message);

            if (message.senderUserId === employee?.authUserId) {
              return;
            }

            if (store.isChatOpen && store.activeFaction === message.faction) {
              // Message is already visible in open chat, keep unread at zero.
              store.clearUnreadForFaction(message.faction);
              return;
            }

            store.incrementUnread(message.faction);
          },
          onStatus: (status) => {
            if (!isMounted) {
              return;
            }

            useFactionChatStore.getState().setRealtimeStatus(status);
            if (status === "SUBSCRIBED") {
              void hydrateUnreadAndLatest();
            }
          },
          onError: (error) => {
            if (!isMounted) {
              return;
            }

            useFactionChatStore.getState().setRealtimeStatus(error);
          },
        },
        {
          // Admin can observe all; members are scoped by RLS + service.
          faction: employee?.role === "admin" ? null : employee?.faction ?? null,
        },
      );

      if (!isMounted) {
        return;
      }

      if (subscribeResult.error || !subscribeResult.data) {
        useFactionChatStore
          .getState()
          .setRealtimeStatus(subscribeResult.error ?? "realtime-error");
        return;
      }

      cleanupSubscription = subscribeResult.data;
    };

    void init();

    return () => {
      isMounted = false;
      if (cleanupSubscription) {
        void cleanupSubscription();
      }
    };
  }, [employee?.authUserId, employee?.faction, employee?.role, employee?.status, sessionUserId]);

  return null;
}
