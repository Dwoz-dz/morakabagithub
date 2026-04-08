import { useFocusEffect } from "@react-navigation/native";
import { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

import {
  WEEKLY_REST_DAY_LABELS,
  type WeeklyRestAssignment,
} from "@/src/models";
import { WeeklyRestService } from "@/src/services/supabase/weekly-rest.service";
import { palette, radius, shadows, spacing } from "@/src/theme/tokens";
import { formatDateTime } from "@/src/utils/formatting";

const daysLabel = (days: string[]): string =>
  days
    .map((day) => WEEKLY_REST_DAY_LABELS[day as keyof typeof WEEKLY_REST_DAY_LABELS] ?? day)
    .join("، ");

export default function MyWeeklyRestScreen() {
  const [assignments, setAssignments] = useState<WeeklyRestAssignment[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const currentAssignment = useMemo(
    () => assignments.find((item) => item.status === "active") ?? null,
    [assignments],
  );

  const loadAssignments = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    const result = await WeeklyRestService.listMyAssignments(20);
    if (result.error) {
      setError(result.error);
      setAssignments([]);
      setIsLoading(false);
      return;
    }

    setAssignments(result.data ?? []);
    setIsLoading(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      void loadAssignments();
    }, [loadAssignments]),
  );

  return (
    <ScrollView
      contentContainerStyle={styles.container}
      contentInsetAdjustmentBehavior="automatic"
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.card}>
        <Text style={styles.title}>راحتي الأسبوعية</Text>
        <Text style={styles.subtitle}>يعرض هذا القسم أيام راحتك التي أرسلها المدير.</Text>
      </View>

      {isLoading ? (
        <View style={styles.card}>
          <View style={styles.loadingBox}>
            <ActivityIndicator color={palette.primary} />
            <Text style={styles.loadingText}>جاري تحميل بيانات الراحة...</Text>
          </View>
        </View>
      ) : null}

      {!isLoading && currentAssignment ? (
        <View style={styles.highlightCard}>
          <Text style={styles.highlightTitle}>الراحة الحالية</Text>
          <Text style={styles.highlightDays}>{daysLabel(currentAssignment.days)}</Text>
          <Text style={styles.highlightMeta}>من {currentAssignment.weekStartDate} إلى {currentAssignment.weekEndDate}</Text>
        </View>
      ) : null}

      {!isLoading && !currentAssignment ? (
        <View style={styles.card}>
          <Text style={styles.emptyText}>لا توجد راحة أسبوعية محددة حاليًا.</Text>
        </View>
      ) : null}

      {!isLoading ? (
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>السجل الأخير</Text>
          {assignments.length === 0 ? (
            <Text style={styles.emptyText}>لا يوجد سجل سابق بعد.</Text>
          ) : (
            assignments.map((assignment) => (
              <View key={assignment.id} style={styles.row}>
                <Text style={styles.rowTitle}>{daysLabel(assignment.days)}</Text>
                <Text style={styles.rowMeta}>الأسبوع: {assignment.weekStartDate} - {assignment.weekEndDate}</Text>
                <Text style={styles.rowMeta}>{formatDateTime(new Date(assignment.createdAt))}</Text>
              </View>
            ))
          )}
        </View>
      ) : null}

      {error ? (
        <View style={styles.card}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : null}
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
  highlightCard: {
    backgroundColor: "#0F446F",
    borderRadius: radius.xl,
    padding: spacing.lg,
    gap: spacing.sm,
    ...shadows.card,
  },
  highlightTitle: {
    textAlign: "right",
    color: "rgba(255,255,255,0.84)",
    fontWeight: "700",
  },
  highlightDays: {
    textAlign: "right",
    color: "#FFFFFF",
    fontSize: 28,
    fontWeight: "900",
  },
  highlightMeta: {
    textAlign: "right",
    color: "rgba(255,255,255,0.9)",
    lineHeight: 20,
  },
  sectionTitle: {
    textAlign: "right",
    color: palette.text,
    fontWeight: "800",
    fontSize: 18,
  },
  row: {
    borderTopWidth: 1,
    borderTopColor: palette.line,
    paddingTop: spacing.sm,
    gap: 4,
  },
  rowTitle: {
    textAlign: "right",
    color: palette.text,
    fontWeight: "800",
  },
  rowMeta: {
    textAlign: "right",
    color: palette.textMuted,
    fontSize: 12,
  },
  emptyText: {
    textAlign: "right",
    color: palette.textMuted,
  },
  errorText: {
    textAlign: "right",
    color: palette.danger,
    fontWeight: "700",
  },
});
