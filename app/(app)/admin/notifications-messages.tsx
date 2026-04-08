import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { FACTION_OPTIONS } from "@/src/constants/factions";
import { NOTIFICATION_TARGET_TYPES, type Employee, type NotificationTargetType } from "@/src/models";
import { EmployeesService } from "@/src/services/supabase/employees.service";
import { NotificationsService } from "@/src/services/supabase/notifications.service";
import { useAuthStore } from "@/src/store/auth.store";
import { palette, radius, shadows, spacing } from "@/src/theme/tokens";
import { formatDateTime } from "@/src/utils/formatting";

const TARGET_OPTIONS: { label: string; value: NotificationTargetType }[] = [
  { label: "موظف", value: NOTIFICATION_TARGET_TYPES.USER },
  { label: "فصيلة", value: NOTIFICATION_TARGET_TYPES.FACTION },
  { label: "الكل", value: NOTIFICATION_TARGET_TYPES.ALL },
];

export default function NotificationsMessagesAdminScreen() {
  const employee = useAuthStore((state) => state.employee);

  const [members, setMembers] = useState<Employee[]>([]);
  const [selectedTargetType, setSelectedTargetType] = useState<NotificationTargetType>(
    NOTIFICATION_TARGET_TYPES.USER,
  );
  const [selectedUserAuthId, setSelectedUserAuthId] = useState<string | null>(null);
  const [selectedFaction, setSelectedFaction] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");

  const [sentItems, setSentItems] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    if (!employee?.authUserId) {
      return;
    }

    setIsLoading(true);
    setError(null);

    const [membersResult, sentResult] = await Promise.all([
      EmployeesService.listApprovedMembers(),
      NotificationsService.listSentByAdmin(employee.authUserId, 80),
    ]);

    setMembers(membersResult.data ?? []);
    setSentItems(sentResult.data ?? []);

    setError(membersResult.error ?? sentResult.error ?? null);
    setIsLoading(false);
  }, [employee?.authUserId]);

  useFocusEffect(
    useCallback(() => {
      void loadData();
    }, [loadData]),
  );

  const isValidTarget = useMemo(() => {
    if (selectedTargetType === NOTIFICATION_TARGET_TYPES.USER) {
      return Boolean(selectedUserAuthId);
    }
    if (selectedTargetType === NOTIFICATION_TARGET_TYPES.FACTION) {
      return Boolean(selectedFaction);
    }
    return true;
  }, [selectedFaction, selectedTargetType, selectedUserAuthId]);

  const canSend = Boolean(employee?.authUserId) && Boolean(message.trim()) && isValidTarget && !isSending;

  const sendNotification = useCallback(async () => {
    if (!employee?.authUserId || !canSend) {
      return;
    }

    setIsSending(true);
    setError(null);
    setSuccess(null);

    const result = await NotificationsService.sendNotification({
      senderAuthUserId: employee.authUserId,
      senderEmployeeId: employee.id,
      title: title.trim() || null,
      message,
      type: "admin_message",
      targetType: selectedTargetType,
      targetAuthUserId: selectedTargetType === NOTIFICATION_TARGET_TYPES.USER ? selectedUserAuthId ?? undefined : undefined,
      targetFaction: selectedTargetType === NOTIFICATION_TARGET_TYPES.FACTION ? selectedFaction ?? undefined : undefined,
    });

    if (result.error) {
      setError(result.error);
      setIsSending(false);
      return;
    }

    setSuccess(`تم إرسال الإشعار إلى ${result.data ?? 0} مستلم.`);
    setMessage("");
    setTitle("");
    setIsSending(false);
    await loadData();
  }, [
    canSend,
    employee?.authUserId,
    employee?.id,
    loadData,
    message,
    selectedFaction,
    selectedTargetType,
    selectedUserAuthId,
    title,
  ]);

  return (
    <ScrollView
      contentContainerStyle={styles.container}
      contentInsetAdjustmentBehavior="automatic"
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.card}>
        <Text style={styles.title}>الإشعارات والرسائل</Text>
        <Text style={styles.subtitle}>إرسال إشعار لموظف محدد أو فصيلة كاملة أو جميع الموظفين.</Text>

        <View style={styles.targetRow}>
          {TARGET_OPTIONS.map((option) => (
            <Pressable
              key={option.value}
              style={({ pressed }) => [
                styles.targetChip,
                selectedTargetType === option.value && styles.targetChipActive,
                pressed && styles.targetChipPressed,
              ]}
              onPress={() => {
                setSelectedTargetType(option.value);
                setSuccess(null);
                setError(null);
              }}
            >
              <Text
                style={[
                  styles.targetChipText,
                  selectedTargetType === option.value && styles.targetChipTextActive,
                ]}
              >
                {option.label}
              </Text>
            </Pressable>
          ))}
        </View>

        {selectedTargetType === NOTIFICATION_TARGET_TYPES.USER ? (
          <View style={styles.selectorWrap}>
            <Text style={styles.selectorTitle}>اختيار الموظف</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.selectorRow}>
              {members.map((member) => (
                <Pressable
                  key={member.id}
                  style={({ pressed }) => [
                    styles.selectorChip,
                    selectedUserAuthId === member.authUserId && styles.selectorChipActive,
                    pressed && styles.selectorChipPressed,
                  ]}
                  onPress={() => setSelectedUserAuthId(member.authUserId)}
                >
                  <Text
                    style={[
                      styles.selectorChipText,
                      selectedUserAuthId === member.authUserId && styles.selectorChipTextActive,
                    ]}
                  >
                    {member.fullName}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>
        ) : null}

        {selectedTargetType === NOTIFICATION_TARGET_TYPES.FACTION ? (
          <View style={styles.selectorWrap}>
            <Text style={styles.selectorTitle}>اختيار الفصيلة</Text>
            <View style={styles.factionGrid}>
              {FACTION_OPTIONS.map((faction) => (
                <Pressable
                  key={faction}
                  style={({ pressed }) => [
                    styles.selectorChip,
                    selectedFaction === faction && styles.selectorChipActive,
                    pressed && styles.selectorChipPressed,
                  ]}
                  onPress={() => setSelectedFaction(faction)}
                >
                  <Text
                    style={[
                      styles.selectorChipText,
                      selectedFaction === faction && styles.selectorChipTextActive,
                    ]}
                  >
                    {faction}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>
        ) : null}

        <TextInput
          style={styles.input}
          value={title}
          onChangeText={setTitle}
          placeholder="عنوان الإشعار (اختياري)"
          placeholderTextColor={palette.textMuted}
          textAlign="right"
        />

        <TextInput
          style={[styles.input, styles.messageInput]}
          value={message}
          onChangeText={setMessage}
          placeholder="اكتب نص الرسالة هنا..."
          placeholderTextColor={palette.textMuted}
          textAlign="right"
          multiline
        />

        {error ? <Text style={styles.errorText}>{error}</Text> : null}
        {success ? <Text style={styles.successText}>{success}</Text> : null}

        <Pressable
          style={({ pressed }) => [
            styles.sendButton,
            !canSend && styles.sendButtonDisabled,
            pressed && canSend && styles.sendButtonPressed,
          ]}
          onPress={() => void sendNotification()}
          disabled={!canSend}
        >
          {isSending ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <>
              <MaterialCommunityIcons name="send" size={16} color="#FFFFFF" />
              <Text style={styles.sendButtonText}>إرسال الآن</Text>
            </>
          )}
        </Pressable>
      </View>

      <View style={styles.card}>
        <View style={styles.listHeader}>
          <Text style={styles.sectionTitle}>آخر الرسائل المرسلة</Text>
          <Pressable onPress={() => void loadData()} style={({ pressed }) => [styles.refreshPill, pressed && styles.refreshPillPressed]}>
            <Text style={styles.refreshPillText}>تحديث</Text>
          </Pressable>
        </View>

        {isLoading ? (
          <View style={styles.loadingBox}>
            <ActivityIndicator color={palette.primary} />
            <Text style={styles.loadingText}>جاري تحميل الرسائل...</Text>
          </View>
        ) : null}

        {!isLoading && sentItems.length === 0 ? (
          <Text style={styles.emptyText}>لا توجد رسائل مرسلة بعد.</Text>
        ) : null}

        {sentItems.map((item) => (
          <View key={item.id} style={styles.itemRow}>
            <View style={[styles.readDot, { backgroundColor: item.isRead ? "#84B89E" : "#D56C6C" }]} />
            <View style={styles.itemContent}>
              <Text style={styles.itemTitle}>{item.title || "إشعار"}</Text>
              <Text style={styles.itemMessage}>{item.message}</Text>
              <Text style={styles.itemMeta}>
                {item.targetType === "user" ? "إلى موظف" : item.targetType === "faction" ? `إلى ${item.targetFaction ?? "فصيلة"}` : "إلى الجميع"}
              </Text>
              <Text style={styles.itemMeta}>{formatDateTime(new Date(item.createdAt))}</Text>
            </View>
          </View>
        ))}
      </View>
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
    gap: spacing.md,
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
    lineHeight: 20,
  },
  targetRow: {
    flexDirection: "row-reverse",
    gap: spacing.sm,
  },
  targetChip: {
    flex: 1,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: palette.line,
    backgroundColor: palette.surfaceMuted,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: spacing.sm,
  },
  targetChipActive: {
    backgroundColor: palette.primary,
    borderColor: palette.primary,
  },
  targetChipPressed: {
    opacity: 0.82,
  },
  targetChipText: {
    color: palette.textMuted,
    fontWeight: "700",
  },
  targetChipTextActive: {
    color: "#FFFFFF",
  },
  selectorWrap: {
    gap: spacing.sm,
  },
  selectorTitle: {
    textAlign: "right",
    color: palette.text,
    fontWeight: "700",
  },
  selectorRow: {
    gap: spacing.sm,
  },
  factionGrid: {
    flexDirection: "row-reverse",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  selectorChip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: palette.line,
    backgroundColor: palette.surfaceMuted,
    paddingVertical: 7,
    paddingHorizontal: spacing.md,
  },
  selectorChipActive: {
    borderColor: palette.primary,
    backgroundColor: "#E8F1FF",
  },
  selectorChipPressed: {
    opacity: 0.84,
  },
  selectorChipText: {
    color: palette.text,
    fontWeight: "700",
  },
  selectorChipTextActive: {
    color: palette.primaryDark,
  },
  input: {
    borderWidth: 1,
    borderColor: palette.line,
    borderRadius: radius.md,
    backgroundColor: palette.surfaceMuted,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    color: palette.text,
  },
  messageInput: {
    minHeight: 96,
    textAlignVertical: "top",
  },
  sendButton: {
    borderRadius: radius.md,
    backgroundColor: palette.primary,
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    paddingVertical: spacing.md,
  },
  sendButtonDisabled: {
    opacity: 0.5,
  },
  sendButtonPressed: {
    opacity: 0.85,
  },
  sendButtonText: {
    color: "#FFFFFF",
    fontWeight: "800",
  },
  errorText: {
    textAlign: "right",
    color: palette.danger,
    fontWeight: "700",
  },
  successText: {
    textAlign: "right",
    color: palette.accent,
    fontWeight: "700",
  },
  listHeader: {
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "space-between",
  },
  sectionTitle: {
    textAlign: "right",
    color: palette.text,
    fontWeight: "800",
    fontSize: 18,
  },
  refreshPill: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: palette.line,
    paddingHorizontal: spacing.sm,
    paddingVertical: 5,
    backgroundColor: palette.surfaceMuted,
  },
  refreshPillPressed: {
    opacity: 0.8,
  },
  refreshPillText: {
    color: palette.primaryDark,
    fontWeight: "700",
    fontSize: 12,
  },
  loadingBox: {
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    paddingVertical: spacing.md,
  },
  loadingText: {
    color: palette.textMuted,
    fontWeight: "600",
  },
  emptyText: {
    textAlign: "right",
    color: palette.textMuted,
  },
  itemRow: {
    flexDirection: "row-reverse",
    alignItems: "flex-start",
    gap: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: palette.line,
    paddingBottom: spacing.sm,
  },
  readDot: {
    width: 8,
    height: 8,
    borderRadius: 99,
    marginTop: 6,
  },
  itemContent: {
    flex: 1,
    gap: 4,
  },
  itemTitle: {
    textAlign: "right",
    color: palette.text,
    fontWeight: "800",
  },
  itemMessage: {
    textAlign: "right",
    color: palette.text,
    lineHeight: 20,
  },
  itemMeta: {
    textAlign: "right",
    color: palette.textMuted,
    fontSize: 12,
  },
});
