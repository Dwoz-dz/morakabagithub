import { useFocusEffect } from "@react-navigation/native";
import { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

import type { NotificationItem } from "@/src/models";
import { NotificationsService } from "@/src/services/supabase/notifications.service";
import { palette, radius, shadows, spacing } from "@/src/theme/tokens";
import { formatDateTime } from "@/src/utils/formatting";

export default function MemberNotificationsScreen() {
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isWorking, setIsWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const unreadCount = useMemo(
    () => notifications.filter((item) => !item.isRead).length,
    [notifications],
  );

  const loadNotifications = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    const result = await NotificationsService.listMy(150);
    if (result.error) {
      setError(result.error);
      setNotifications([]);
      setIsLoading(false);
      return;
    }

    setNotifications(result.data ?? []);
    setIsLoading(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      void loadNotifications();
    }, [loadNotifications]),
  );

  const markAsRead = useCallback(async (id: string) => {
    const result = await NotificationsService.markAsRead(id);
    if (result.error) {
      setError(result.error);
      return;
    }

    setNotifications((prev) => prev.map((item) => (item.id === id ? { ...item, isRead: true } : item)));
  }, []);

  const markAllAsRead = useCallback(async () => {
    setIsWorking(true);
    const result = await NotificationsService.markAllAsRead();
    if (result.error) {
      setError(result.error);
      setIsWorking(false);
      return;
    }

    setNotifications((prev) => prev.map((item) => ({ ...item, isRead: true })));
    setIsWorking(false);
  }, []);

  const clearAll = useCallback(async () => {
    setIsWorking(true);
    const result = await NotificationsService.clearAll();
    if (result.error) {
      setError(result.error);
      setIsWorking(false);
      return;
    }

    setNotifications([]);
    setIsWorking(false);
  }, []);

  return (
    <ScrollView
      contentContainerStyle={styles.container}
      contentInsetAdjustmentBehavior="automatic"
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.card}>
        <Text style={styles.title}>الإشعارات</Text>
        <Text style={styles.subtitle}>عدد غير المقروء: {unreadCount}</Text>

        <View style={styles.actionsRow}>
          <Pressable
            style={({ pressed }) => [styles.secondaryButton, pressed && styles.buttonPressed, isWorking && styles.buttonDisabled]}
            onPress={() => void markAllAsRead()}
            disabled={isWorking}
          >
            <Text style={styles.secondaryButtonText}>تعيين الكل كمقروء</Text>
          </Pressable>

          <Pressable
            style={({ pressed }) => [styles.clearButton, pressed && styles.buttonPressed, isWorking && styles.buttonDisabled]}
            onPress={() => void clearAll()}
            disabled={isWorking}
          >
            <Text style={styles.clearButtonText}>مسح الإشعارات</Text>
          </Pressable>
        </View>

        {error ? <Text style={styles.errorText}>{error}</Text> : null}
      </View>

      {isLoading ? (
        <View style={styles.card}>
          <View style={styles.loadingBox}>
            <ActivityIndicator color={palette.primary} />
            <Text style={styles.loadingText}>جاري تحميل الإشعارات...</Text>
          </View>
        </View>
      ) : null}

      {!isLoading && notifications.length === 0 ? (
        <View style={styles.card}>
          <Text style={styles.emptyText}>لا توجد إشعارات حاليًا.</Text>
        </View>
      ) : null}

      {notifications.map((item) => (
        <Pressable
          key={item.id}
          style={({ pressed }) => [
            styles.notificationRow,
            !item.isRead && styles.notificationRowUnread,
            pressed && styles.buttonPressed,
          ]}
          onPress={() => {
            if (!item.isRead) {
              void markAsRead(item.id);
            }
          }}
        >
          <View style={[styles.dot, { backgroundColor: item.isRead ? "#A5B8D1" : palette.primary }]} />
          <View style={styles.notificationBody}>
            <Text style={styles.notificationTitle}>{item.title || "إشعار"}</Text>
            <Text style={styles.notificationMessage}>{item.message}</Text>
            <Text style={styles.notificationMeta}>{formatDateTime(new Date(item.createdAt))}</Text>
          </View>
        </Pressable>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: palette.background,
    padding: spacing.xl,
    paddingBottom: spacing.xxl,
    gap: spacing.md,
  },
  card: {
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.line,
    borderRadius: radius.xl,
    padding: spacing.lg,
    gap: spacing.sm,
    ...shadows.card,
  },
  title: {
    textAlign: "right",
    color: palette.text,
    fontWeight: "900",
    fontSize: 26,
  },
  subtitle: {
    textAlign: "right",
    color: palette.textMuted,
  },
  actionsRow: {
    flexDirection: "row-reverse",
    gap: spacing.sm,
  },
  secondaryButton: {
    flex: 1,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: palette.line,
    backgroundColor: palette.surfaceMuted,
    paddingVertical: spacing.sm,
    alignItems: "center",
  },
  secondaryButtonText: {
    color: palette.text,
    fontWeight: "700",
    fontSize: 12,
  },
  clearButton: {
    flex: 1,
    borderRadius: radius.md,
    backgroundColor: "#FCEAEC",
    borderWidth: 1,
    borderColor: "#F5C2C9",
    paddingVertical: spacing.sm,
    alignItems: "center",
  },
  clearButtonText: {
    color: palette.danger,
    fontWeight: "700",
    fontSize: 12,
  },
  buttonPressed: {
    opacity: 0.84,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  errorText: {
    textAlign: "right",
    color: palette.danger,
    fontWeight: "700",
  },
  loadingBox: {
    flexDirection: "row-reverse",
    justifyContent: "center",
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: spacing.md,
  },
  loadingText: {
    color: palette.textMuted,
  },
  emptyText: {
    textAlign: "right",
    color: palette.textMuted,
  },
  notificationRow: {
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.line,
    borderRadius: radius.lg,
    padding: spacing.md,
    flexDirection: "row-reverse",
    gap: spacing.sm,
    ...shadows.card,
  },
  notificationRowUnread: {
    borderColor: "#BFD3EE",
    backgroundColor: "#F5F9FF",
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 99,
    marginTop: 6,
  },
  notificationBody: {
    flex: 1,
    gap: 4,
  },
  notificationTitle: {
    textAlign: "right",
    color: palette.text,
    fontWeight: "800",
  },
  notificationMessage: {
    textAlign: "right",
    color: palette.text,
    lineHeight: 20,
  },
  notificationMeta: {
    textAlign: "right",
    color: palette.textMuted,
    fontSize: 12,
  },
});
