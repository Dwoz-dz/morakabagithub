import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { FACTION_OPTIONS } from "@/src/constants/factions";
import type { FactionMessage } from "@/src/models";
import { FactionChatService } from "@/src/services/supabase/faction-chat.service";
import { useAuthStore } from "@/src/store/auth.store";
import { useFactionChatStore } from "@/src/store/faction-chat.store";
import { palette, radius, shadows, spacing } from "@/src/theme/tokens";

const MAX_MESSAGE_LENGTH = 1200;
const FACTION_SHORT_NAMES: Record<string, string> = {
  [FACTION_OPTIONS[0]]: "khalil21",
  [FACTION_OPTIONS[1]]: "khalil29",
  [FACTION_OPTIONS[2]]: "brp",
};

const toFactionLabel = (faction: string | null | undefined): string => {
  if (!faction) {
    return "";
  }

  const normalized = faction.trim();
  if (!normalized) {
    return "";
  }

  const short = FACTION_SHORT_NAMES[normalized];
  return short ? `${short} - ${normalized}` : normalized;
};

const toSortedUniqueMessages = (
  current: FactionMessage[],
  incoming: FactionMessage[],
): FactionMessage[] => {
  const map = new Map<string, FactionMessage>();
  current.forEach((message) => map.set(message.id, message));
  incoming.forEach((message) => map.set(message.id, message));

  return [...map.values()].sort((a, b) => {
    const delta = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    if (delta !== 0) {
      return delta;
    }
    return a.id.localeCompare(b.id);
  });
};

const formatTime = (iso: string): string => {
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) {
    return "--:--";
  }

  return parsed.toLocaleTimeString("ar-DZ", {
    hour: "2-digit",
    minute: "2-digit",
  });
};

const connectionTone = (status: string): "ok" | "warn" | "idle" => {
  if (status === "SUBSCRIBED") return "ok";
  if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") return "warn";
  return "idle";
};

export default function FactionChatScreen() {
  const router = useRouter();
  const employee = useAuthStore((state) => state.employee);

  const clearUnreadForFaction = useFactionChatStore((state) => state.clearUnreadForFaction);
  const setChatContext = useFactionChatStore((state) => state.setChatContext);
  const setLatestMessage = useFactionChatStore((state) => state.setLatestMessage);

  const listRef = useRef<FlatList<FactionMessage> | null>(null);
  const unsubscribeRef = useRef<(() => Promise<void>) | null>(null);
  const lastSeenMarkMsRef = useRef(0);

  const [selectedFaction, setSelectedFaction] = useState<string | null>(null);
  const [messages, setMessages] = useState<FactionMessage[]>([]);
  const [composer, setComposer] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState("connecting");
  const [error, setError] = useState<string | null>(null);

  const isAdmin = employee?.role === "admin";
  const ownFaction = employee?.faction?.trim() ?? "";

  const activeFaction = useMemo(() => {
    if (!isAdmin) {
      return ownFaction || null;
    }
    return selectedFaction;
  }, [isAdmin, ownFaction, selectedFaction]);

  useEffect(() => {
    if (!employee) {
      return;
    }

    if (!isAdmin) {
      setSelectedFaction(ownFaction || null);
      return;
    }

    if (!selectedFaction) {
      const preferred = ownFaction && FACTION_OPTIONS.includes(ownFaction as (typeof FACTION_OPTIONS)[number])
        ? ownFaction
        : FACTION_OPTIONS[0];
      setSelectedFaction(preferred ?? null);
    }
  }, [employee, isAdmin, ownFaction, selectedFaction]);

  const markSeen = useCallback(
    async (faction: string) => {
      const nowMs = Date.now();
      if (nowMs - lastSeenMarkMsRef.current < 1_000) {
        return;
      }
      lastSeenMarkMsRef.current = nowMs;

      const result = await FactionChatService.markCurrentFactionSeen(faction);
      if (!result.error) {
        clearUnreadForFaction(faction);
      }
    },
    [clearUnreadForFaction],
  );

  const loadMessages = useCallback(
    async (faction: string) => {
      setIsLoading(true);
      setError(null);

      try {
        const result = isAdmin
          ? await FactionChatService.adminListMessagesForFaction(faction, 220)
          : await FactionChatService.listMessagesForCurrentUserFaction(220);

        if (result.error) {
          setError(result.error);
          setMessages([]);
          setIsLoading(false);
          return;
        }

        const loaded = result.data ?? [];
        setMessages(loaded);
        if (loaded.length) {
          setLatestMessage(loaded[loaded.length - 1]);
        }

        await markSeen(faction);
      } finally {
        setIsLoading(false);
      }
    },
    [isAdmin, markSeen, setLatestMessage],
  );

  const startSubscription = useCallback(
    async (faction: string) => {
      if (unsubscribeRef.current) {
        await unsubscribeRef.current();
        unsubscribeRef.current = null;
      }

      setConnectionStatus("connecting");
      let hasSubscribedAtLeastOnce = false;

      const subscribeResult = await FactionChatService.subscribeToFactionMessages(
        {
          onMessage: (message) => {
            if (message.faction !== faction) {
              return;
            }

            setMessages((previous) => toSortedUniqueMessages(previous, [message]));
            setLatestMessage(message);
            if (message.senderUserId !== employee?.authUserId) {
              void markSeen(faction);
            }
          },
          onStatus: (status) => {
            setConnectionStatus(status);
            if (status === "SUBSCRIBED") {
              if (hasSubscribedAtLeastOnce) {
                void loadMessages(faction);
              }
              hasSubscribedAtLeastOnce = true;
            }
          },
          onError: (nextError) => {
            setError(nextError);
          },
        },
        {
          faction,
        },
      );

      if (subscribeResult.error || !subscribeResult.data) {
        setConnectionStatus("CHANNEL_ERROR");
        setError(subscribeResult.error ?? "تعذر بدء قناة الدردشة اللحظية.");
        return;
      }

      unsubscribeRef.current = subscribeResult.data;
    },
    [employee?.authUserId, loadMessages, markSeen, setLatestMessage],
  );

  useEffect(() => {
    if (!activeFaction) {
      setMessages([]);
      setIsLoading(false);
      return;
    }

    let isMounted = true;

    const boot = async () => {
      await loadMessages(activeFaction);
      if (!isMounted) {
        return;
      }
      await startSubscription(activeFaction);
    };

    void boot();

    return () => {
      isMounted = false;
      if (unsubscribeRef.current) {
        void unsubscribeRef.current();
        unsubscribeRef.current = null;
      }
    };
  }, [activeFaction, loadMessages, startSubscription]);

  useFocusEffect(
    useCallback(() => {
      if (!activeFaction) {
        return () => {};
      }

      setChatContext(true, activeFaction);
      clearUnreadForFaction(activeFaction);
      void markSeen(activeFaction);

      return () => {
        setChatContext(false, null);
      };
    }, [activeFaction, clearUnreadForFaction, markSeen, setChatContext]),
  );

  const sendMessage = useCallback(async () => {
    const content = composer.trim();
    if (!content || !activeFaction || isSending) {
      return;
    }

    setIsSending(true);
    setError(null);

    try {
      const result = isAdmin
        ? await FactionChatService.adminSendMessageToFaction(activeFaction, { content })
        : await FactionChatService.sendMessageToOwnFaction({ content });

      if (result.error || !result.data) {
        setError(result.error ?? "تعذر إرسال الرسالة.");
        setIsSending(false);
        return;
      }

      setComposer("");
      setMessages((previous) => toSortedUniqueMessages(previous, [result.data as FactionMessage]));
      setLatestMessage(result.data as FactionMessage);
      clearUnreadForFaction(activeFaction);
      void markSeen(activeFaction);
      requestAnimationFrame(() => {
        listRef.current?.scrollToEnd({ animated: true });
      });
    } finally {
      setIsSending(false);
    }
  }, [
    activeFaction,
    clearUnreadForFaction,
    composer,
    isAdmin,
    isSending,
    markSeen,
    setLatestMessage,
  ]);

  const statusTone = connectionTone(connectionStatus);
  const statusLabel =
    statusTone === "ok"
      ? "مباشر"
      : statusTone === "warn"
        ? "إعادة الاتصال"
        : "جارٍ الاتصال";

  return (
    <SafeAreaView style={styles.safeArea} edges={["top", "bottom"]}>
      <KeyboardAvoidingView
        style={styles.root}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={Platform.OS === "ios" ? 8 : 0}
      >
        <View style={styles.header}>
          <Pressable style={styles.backButton} onPress={() => router.back()}>
            <MaterialCommunityIcons name="arrow-right" size={18} color={palette.text} />
          </Pressable>
          <View style={styles.headerTitleWrap}>
            <Text style={styles.title}>دردشة الفصيلة</Text>
            <Text style={styles.subtitle}>
              {activeFaction
                ? `القناة الحالية: ${toFactionLabel(activeFaction)}`
                : "لا توجد فصيلة محددة"}
            </Text>
          </View>
          <View
            style={[
              styles.liveBadge,
              statusTone === "ok" && styles.liveBadgeOk,
              statusTone === "warn" && styles.liveBadgeWarn,
            ]}
          >
            <Text
              style={[
                styles.liveBadgeText,
                statusTone === "ok" && styles.liveBadgeTextOk,
                statusTone === "warn" && styles.liveBadgeTextWarn,
              ]}
            >
              {statusLabel}
            </Text>
          </View>
        </View>

        {isAdmin ? (
          <View style={styles.factionsRow}>
            {FACTION_OPTIONS.map((item) => {
              const selected = activeFaction === item;
              return (
                <Pressable
                  key={item}
                  style={({ pressed }) => [
                    styles.factionChip,
                    selected && styles.factionChipActive,
                    pressed && styles.factionChipPressed,
                  ]}
                  onPress={() => setSelectedFaction(item)}
                >
                  <Text style={[styles.factionChipText, selected && styles.factionChipTextActive]}>
                    {toFactionLabel(item)}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        ) : null}

        {error ? (
          <View style={styles.errorBanner}>
            <MaterialCommunityIcons name="alert-circle-outline" size={16} color="#A33D10" />
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}

        <View style={styles.messagesCard}>
          {isLoading ? (
            <View style={styles.loadingBox}>
              <ActivityIndicator color={palette.primary} />
              <Text style={styles.loadingText}>جاري تحميل الرسائل...</Text>
            </View>
          ) : (
            <FlatList
              ref={listRef}
              data={messages}
              keyExtractor={(item) => item.id}
              contentContainerStyle={styles.messagesListContent}
              keyboardShouldPersistTaps="handled"
              initialNumToRender={18}
              onContentSizeChange={() => {
                listRef.current?.scrollToEnd({ animated: true });
              }}
              renderItem={({ item }) => {
                const isSelf = item.senderUserId === employee?.authUserId;
                return (
                  <View
                    style={[
                      styles.messageRow,
                      isSelf ? styles.messageRowSelf : styles.messageRowOther,
                    ]}
                  >
                    <View
                      style={[
                        styles.messageBubble,
                        isSelf ? styles.messageBubbleSelf : styles.messageBubbleOther,
                      ]}
                    >
                      <Text style={styles.messageSender}>{isSelf ? "أنت" : item.senderName}</Text>
                      <Text style={[styles.messageText, isSelf && styles.messageTextSelf]}>
                        {item.content}
                      </Text>
                      <Text style={[styles.messageTime, isSelf && styles.messageTimeSelf]}>
                        {formatTime(item.createdAt)}
                      </Text>
                    </View>
                  </View>
                );
              }}
              ListEmptyComponent={
                <View style={styles.emptyState}>
                  <MaterialCommunityIcons name="chat-outline" size={22} color={palette.textMuted} />
                  <Text style={styles.emptyTitle}>لا توجد رسائل بعد</Text>
                  <Text style={styles.emptySubtitle}>ابدأ أول رسالة داخل قناتك.</Text>
                </View>
              }
            />
          )}
        </View>

        <View style={styles.composerWrap}>
          <TextInput
            style={styles.composerInput}
            value={composer}
            onChangeText={setComposer}
            placeholder="اكتب رسالة..."
            placeholderTextColor={palette.textMuted}
            textAlign="right"
            multiline
            maxLength={MAX_MESSAGE_LENGTH}
          />

          <Pressable
            style={({ pressed }) => [
              styles.sendButton,
              pressed && styles.sendButtonPressed,
              (!composer.trim() || isSending || !activeFaction) && styles.sendButtonDisabled,
            ]}
            onPress={() => void sendMessage()}
            disabled={!composer.trim() || isSending || !activeFaction}
          >
            {isSending ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <MaterialCommunityIcons name="send" size={17} color="#FFFFFF" />
            )}
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: palette.background,
  },
  root: {
    flex: 1,
    backgroundColor: palette.background,
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.md,
    gap: spacing.sm,
  },
  header: {
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  backButton: {
    width: 34,
    height: 34,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: palette.line,
    backgroundColor: palette.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitleWrap: {
    flex: 1,
    alignItems: "flex-end",
    gap: 2,
  },
  title: {
    textAlign: "right",
    color: palette.text,
    fontSize: 22,
    fontWeight: "900",
  },
  subtitle: {
    textAlign: "right",
    color: palette.textMuted,
    fontSize: 12,
    fontWeight: "600",
  },
  liveBadge: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#CED8E7",
    backgroundColor: "#F2F5FA",
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  liveBadgeOk: {
    borderColor: "#BEE8CE",
    backgroundColor: "#EAF9F1",
  },
  liveBadgeWarn: {
    borderColor: "#FFD8C2",
    backgroundColor: "#FFF4EE",
  },
  liveBadgeText: {
    color: "#4D5A71",
    fontWeight: "800",
    fontSize: 11,
  },
  liveBadgeTextOk: {
    color: "#0E7A43",
  },
  liveBadgeTextWarn: {
    color: "#A14A1B",
  },
  factionsRow: {
    flexDirection: "row-reverse",
    flexWrap: "wrap",
    gap: spacing.xs,
  },
  factionChip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: palette.line,
    backgroundColor: palette.surface,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  factionChipActive: {
    borderColor: palette.primary,
    backgroundColor: "#EAF3FF",
  },
  factionChipPressed: {
    opacity: 0.82,
  },
  factionChipText: {
    color: palette.text,
    fontWeight: "700",
    fontSize: 12,
  },
  factionChipTextActive: {
    color: palette.primary,
  },
  errorBanner: {
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: "#FFD5BE",
    backgroundColor: "#FFF3EA",
    padding: spacing.sm,
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: spacing.xs,
  },
  errorText: {
    flex: 1,
    textAlign: "right",
    color: "#A33D10",
    fontWeight: "700",
    fontSize: 12,
  },
  messagesCard: {
    flex: 1,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: palette.line,
    backgroundColor: palette.surface,
    padding: spacing.sm,
    ...shadows.card,
  },
  loadingBox: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
  },
  loadingText: {
    color: palette.textMuted,
    fontWeight: "600",
  },
  messagesListContent: {
    paddingVertical: spacing.xs,
    gap: spacing.xs,
  },
  messageRow: {
    width: "100%",
    flexDirection: "row-reverse",
  },
  messageRowSelf: {
    justifyContent: "flex-start",
  },
  messageRowOther: {
    justifyContent: "flex-end",
  },
  messageBubble: {
    maxWidth: "86%",
    borderRadius: radius.md,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    gap: 2,
  },
  messageBubbleSelf: {
    backgroundColor: "#1E5C96",
    borderTopRightRadius: 6,
  },
  messageBubbleOther: {
    backgroundColor: "#EFF3F8",
    borderTopLeftRadius: 6,
  },
  messageSender: {
    textAlign: "right",
    color: "#6B7890",
    fontSize: 10,
    fontWeight: "700",
  },
  messageText: {
    textAlign: "right",
    color: palette.text,
    lineHeight: 21,
    fontSize: 14,
    fontWeight: "600",
  },
  messageTextSelf: {
    color: "#FFFFFF",
  },
  messageTime: {
    textAlign: "right",
    color: "#67758D",
    fontSize: 10,
    fontWeight: "700",
  },
  messageTimeSelf: {
    color: "rgba(255,255,255,0.82)",
  },
  emptyState: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: spacing.xl,
    gap: spacing.xs,
  },
  emptyTitle: {
    color: palette.text,
    fontWeight: "800",
    fontSize: 15,
  },
  emptySubtitle: {
    color: palette.textMuted,
    fontWeight: "600",
    fontSize: 12,
  },
  composerWrap: {
    flexDirection: "row-reverse",
    alignItems: "flex-end",
    gap: spacing.xs,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: palette.line,
    backgroundColor: palette.surface,
    padding: spacing.xs,
    ...shadows.card,
  },
  composerInput: {
    flex: 1,
    minHeight: 42,
    maxHeight: 120,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: palette.line,
    backgroundColor: palette.surfaceMuted,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    color: palette.text,
    textAlignVertical: "top",
  },
  sendButton: {
    width: 42,
    height: 42,
    borderRadius: 999,
    backgroundColor: palette.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  sendButtonPressed: {
    opacity: 0.84,
  },
  sendButtonDisabled: {
    opacity: 0.5,
  },
});
