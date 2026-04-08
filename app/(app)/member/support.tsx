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

import {
  SUPPORT_TICKET_STATUSES,
  type SupportTicket,
  type SupportTicketStatus,
} from "@/src/models";
import { SupportService } from "@/src/services/supabase/support.service";
import { useAuthStore } from "@/src/store/auth.store";
import { palette, radius, shadows, spacing } from "@/src/theme/tokens";
import { formatDateTime } from "@/src/utils/formatting";

const statusLabel: Record<SupportTicketStatus, string> = {
  [SUPPORT_TICKET_STATUSES.OPEN]: "مفتوحة",
  [SUPPORT_TICKET_STATUSES.IN_PROGRESS]: "قيد المعالجة",
  [SUPPORT_TICKET_STATUSES.CLOSED]: "مغلقة",
};

const statusColor: Record<SupportTicketStatus, string> = {
  [SUPPORT_TICKET_STATUSES.OPEN]: "#8A4B0F",
  [SUPPORT_TICKET_STATUSES.IN_PROGRESS]: "#0C5A69",
  [SUPPORT_TICKET_STATUSES.CLOSED]: "#1E6E47",
};

export default function MemberSupportScreen() {
  const employee = useAuthStore((state) => state.employee);

  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [tickets, setTickets] = useState<SupportTicket[]>([]);

  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const openTicketsCount = useMemo(
    () =>
      tickets.filter(
        (item) =>
          item.status === SUPPORT_TICKET_STATUSES.OPEN ||
          item.status === SUPPORT_TICKET_STATUSES.IN_PROGRESS,
      ).length,
    [tickets],
  );

  const loadTickets = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    const result = await SupportService.listForCurrentUser(60);
    if (result.error) {
      setError(result.error);
      setTickets([]);
      setIsLoading(false);
      return;
    }

    setTickets(result.data ?? []);
    setIsLoading(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      void loadTickets();
    }, [loadTickets]),
  );

  const submitTicket = useCallback(async () => {
    if (!employee?.id || !employee.authUserId) {
      setError("ملف الموظف غير مكتمل.");
      return;
    }

    if (!subject.trim() || !message.trim()) {
      setError("يرجى إدخال العنوان والرسالة.");
      return;
    }

    setIsSubmitting(true);
    setError(null);
    setSuccess(null);

    const result = await SupportService.createTicket({
      employeeId: employee.id,
      subject: subject.trim(),
      message: message.trim(),
      actorAuthUserId: employee.authUserId,
    });

    if (result.error) {
      setError(result.error);
      setIsSubmitting(false);
      return;
    }

    setSuccess("تم إرسال تذكرتك بنجاح. سيقوم المدير بالرد قريبًا.");
    setSubject("");
    setMessage("");
    setIsSubmitting(false);
    await loadTickets();
  }, [employee?.authUserId, employee?.id, loadTickets, message, subject]);

  return (
    <ScrollView
      contentContainerStyle={styles.container}
      contentInsetAdjustmentBehavior="automatic"
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.card}>
        <Text style={styles.title}>الدعم الفني</Text>
        <Text style={styles.subtitle}>
          أرسل تذكرة مباشرة للمدير وتابع الردود من داخل التطبيق.
        </Text>
        <Text style={styles.counterText}>
          التذاكر المفتوحة لديك: {openTicketsCount}
        </Text>

        <TextInput
          style={styles.input}
          value={subject}
          onChangeText={setSubject}
          placeholder="عنوان المشكلة"
          placeholderTextColor={palette.textMuted}
          textAlign="right"
        />

        <TextInput
          style={[styles.input, styles.messageInput]}
          value={message}
          onChangeText={setMessage}
          placeholder="اكتب تفاصيل المشكلة أو الطلب"
          placeholderTextColor={palette.textMuted}
          textAlign="right"
          textAlignVertical="top"
          multiline
        />

        {error ? <Text style={styles.errorText}>{error}</Text> : null}
        {success ? <Text style={styles.successText}>{success}</Text> : null}

        <Pressable
          style={({ pressed }) => [
            styles.submitButton,
            isSubmitting && styles.buttonDisabled,
            pressed && !isSubmitting && styles.buttonPressed,
          ]}
          disabled={isSubmitting}
          onPress={() => void submitTicket()}
        >
          {isSubmitting ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text style={styles.submitButtonText}>إرسال التذكرة</Text>
          )}
        </Pressable>
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>سجل التذاكر</Text>

        {isLoading ? (
          <View style={styles.loadingBox}>
            <ActivityIndicator color={palette.primary} />
            <Text style={styles.loadingText}>جاري تحميل التذاكر...</Text>
          </View>
        ) : null}

        {!isLoading && tickets.length === 0 ? (
          <Text style={styles.emptyText}>لا توجد تذاكر سابقة.</Text>
        ) : null}

        {tickets.map((ticket) => (
          <View key={ticket.id} style={styles.ticketRow}>
            <View style={styles.ticketHeader}>
              <View
                style={[
                  styles.statusBadge,
                  { backgroundColor: `${statusColor[ticket.status]}1A`, borderColor: `${statusColor[ticket.status]}55` },
                ]}
              >
                <Text style={[styles.statusBadgeText, { color: statusColor[ticket.status] }]}>
                  {statusLabel[ticket.status]}
                </Text>
              </View>
              <Text style={styles.ticketSubject}>{ticket.subject}</Text>
            </View>

            <Text style={styles.ticketMessage}>{ticket.message}</Text>

            {ticket.adminReply ? (
              <View style={styles.replyBox}>
                <Text style={styles.replyTitle}>رد الإدارة</Text>
                <Text style={styles.replyText}>{ticket.adminReply}</Text>
              </View>
            ) : null}

            <Text style={styles.ticketMeta}>
              {formatDateTime(new Date(ticket.createdAt))}
            </Text>
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
    lineHeight: 20,
  },
  counterText: {
    textAlign: "right",
    color: palette.primaryDark,
    fontWeight: "700",
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
    minHeight: 110,
  },
  submitButton: {
    borderRadius: radius.md,
    backgroundColor: palette.primary,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: spacing.md,
  },
  submitButtonText: {
    color: "#FFFFFF",
    fontWeight: "800",
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
  successText: {
    textAlign: "right",
    color: palette.accent,
    fontWeight: "700",
  },
  sectionTitle: {
    textAlign: "right",
    color: palette.text,
    fontWeight: "800",
    fontSize: 18,
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
  ticketRow: {
    borderTopWidth: 1,
    borderTopColor: palette.line,
    paddingTop: spacing.sm,
    gap: spacing.sm,
  },
  ticketHeader: {
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  statusBadge: {
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
  },
  statusBadgeText: {
    fontWeight: "700",
    fontSize: 11,
  },
  ticketSubject: {
    flex: 1,
    textAlign: "right",
    color: palette.text,
    fontWeight: "800",
  },
  ticketMessage: {
    textAlign: "right",
    color: palette.text,
    lineHeight: 21,
  },
  replyBox: {
    borderWidth: 1,
    borderColor: "#CFE3FF",
    backgroundColor: "#F2F7FF",
    borderRadius: radius.md,
    padding: spacing.sm,
    gap: 4,
  },
  replyTitle: {
    textAlign: "right",
    color: palette.primaryDark,
    fontWeight: "800",
  },
  replyText: {
    textAlign: "right",
    color: palette.text,
    lineHeight: 20,
  },
  ticketMeta: {
    textAlign: "right",
    color: palette.textMuted,
    fontSize: 12,
  },
});

