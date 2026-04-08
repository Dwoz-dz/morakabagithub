import { useFocusEffect } from "@react-navigation/native";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import type { ActivityLog, Employee } from "@/src/models";
import { ActivityLogsService } from "@/src/services/supabase/activity-logs.service";
import { EmployeesService } from "@/src/services/supabase/employees.service";
import { palette, radius, shadows, spacing } from "@/src/theme/tokens";
import { formatDateTime } from "@/src/utils/formatting";

type DateFilter = "all" | "today" | "last_7_days" | "last_30_days";

const PAGE_SIZE = 30;

const DATE_FILTERS: { value: DateFilter; label: string }[] = [
  { value: "all", label: "كل الفترات" },
  { value: "today", label: "اليوم" },
  { value: "last_7_days", label: "7 أيام" },
  { value: "last_30_days", label: "30 يوم" },
];

const actionLabel = (action: string): string => {
  if (action === "registration.approve") return "قبول طلب تسجيل";
  if (action === "registration.reject") return "رفض طلب تسجيل";
  if (action === "notification.send") return "إرسال إشعار";
  if (action === "reminder.dispatch") return "إرسال تنبيهات التذكير";
  if (action === "weapon.submit") return "إرسال فحص سلاح";
  if (action === "weapon.review") return "مراجعة فحص سلاح";
  if (action === "fuel.submit") return "إرسال استمارة وقود";
  if (action === "fuel.review") return "مراجعة استمارة وقود";
  if (action === "fuel.delete") return "حذف سجل وقود";
  if (action === "fuel.clear") return "تنظيف سجلات الوقود";
  if (action === "employee.update_faction") return "تعديل فصيلة موظف";
  if (action === "employee.update_role") return "تعديل صلاحية موظف";
  if (action === "employee.update_status") return "تعديل حالة موظف";
  if (action === "employee.soft_delete") return "حذف منطقي لموظف";
  if (action === "settings.update") return "تحديث إعدادات";
  return action;
};

const actionPillColor = (action: string): { bg: string; text: string } => {
  if (action.startsWith("fuel")) return { bg: "#FFEDE4", text: "#9B3200" };
  if (action.startsWith("weapon")) return { bg: "#E5F6F8", text: "#005A68" };
  if (action.startsWith("employee")) return { bg: "#E5F0FF", text: "#18477D" };
  if (action.startsWith("registration")) return { bg: "#FFF2E2", text: "#6A3A00" };
  if (action.startsWith("notification")) return { bg: "#F3E9FF", text: "#5B2A86" };
  return { bg: "#EEF1F9", text: "#3D4B6D" };
};

const formatDetailValue = (value: unknown): string => {
  if (value === null || value === undefined) {
    return "-";
  }

  if (typeof value === "string") {
    return value;
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
};

const getDateRange = (filter: DateFilter): { from: string | null; to: string | null } => {
  if (filter === "all") {
    return { from: null, to: null };
  }

  const now = new Date();
  const end = new Date(now);
  end.setHours(23, 59, 59, 999);

  const start = new Date(now);
  start.setHours(0, 0, 0, 0);

  if (filter === "last_7_days") {
    start.setDate(start.getDate() - 6);
  }

  if (filter === "last_30_days") {
    start.setDate(start.getDate() - 29);
  }

  return { from: start.toISOString(), to: end.toISOString() };
};

export default function ActivityLogsAdminScreen() {
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [employeesById, setEmployeesById] = useState<Record<string, Employee>>({});
  const [employeesByAuthUserId, setEmployeesByAuthUserId] = useState<Record<string, Employee>>({});

  const [query, setQuery] = useState("");
  const [actionFilter, setActionFilter] = useState<string>("all");
  const [entityFilter, setEntityFilter] = useState<string>("all");
  const [dateFilter, setDateFilter] = useState<DateFilter>("all");

  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);

  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [isClearing, setIsClearing] = useState(false);

  const loadEmployeesMap = useCallback(async () => {
    const result = await EmployeesService.listAllEmployees();
    if (result.error) {
      return;
    }

    const rows = result.data ?? [];
    const byId: Record<string, Employee> = {};
    const byAuth: Record<string, Employee> = {};

    rows.forEach((employee) => {
      byId[employee.id] = employee;
      byAuth[employee.authUserId] = employee;
    });

    setEmployeesById(byId);
    setEmployeesByAuthUserId(byAuth);
  }, []);

  const loadLogs = useCallback(
    async (options?: { reset?: boolean; refresh?: boolean }) => {
      const reset = options?.reset ?? false;
      const refresh = options?.refresh ?? false;
      const offset = reset ? 0 : logs.length;
      const range = getDateRange(dateFilter);

      if (reset && refresh) {
        setIsRefreshing(true);
      } else if (reset) {
        setIsLoading(true);
      } else {
        setIsLoadingMore(true);
      }

      setError(null);
      setSuccess(null);

      const result = await ActivityLogsService.listPaged({
        limit: PAGE_SIZE,
        offset,
        action: actionFilter === "all" ? null : actionFilter,
        entityType: entityFilter === "all" ? null : entityFilter,
        dateFrom: range.from,
        dateTo: range.to,
      });

      if (result.error) {
        setError(result.error);
        if (reset) {
          setLogs([]);
        }
        setIsLoading(false);
        setIsRefreshing(false);
        setIsLoadingMore(false);
        return;
      }

      const rows = result.data ?? [];
      setHasMore(rows.length === PAGE_SIZE);

      if (reset) {
        setLogs(rows);
      } else {
        setLogs((prev) => {
          const map = new Map(prev.map((log) => [log.id, log]));
          rows.forEach((log) => map.set(log.id, log));
          return Array.from(map.values());
        });
      }

      setIsLoading(false);
      setIsRefreshing(false);
      setIsLoadingMore(false);
    },
    [actionFilter, dateFilter, entityFilter, logs.length],
  );

  useFocusEffect(
    useCallback(() => {
      void loadEmployeesMap();
      void loadLogs({ reset: true });
    }, [loadEmployeesMap, loadLogs]),
  );

  useEffect(() => {
    void loadLogs({ reset: true });
  }, [actionFilter, dateFilter, entityFilter, loadLogs]);

  const visibleLogs = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) {
      return logs;
    }

    return logs.filter((log) => {
      const actorByEmployeeId = log.actorEmployeeId ? employeesById[log.actorEmployeeId] : null;
      const actorByAuthId = employeesByAuthUserId[log.actorAuthUserId];
      const actorName = actorByEmployeeId?.fullName ?? actorByAuthId?.fullName ?? "";

      const haystack = [
        log.action,
        log.entityType,
        log.entityId ?? "",
        actorName,
        formatDetailValue(log.details),
      ]
        .join(" ")
        .toLowerCase();

      return haystack.includes(normalizedQuery);
    });
  }, [employeesByAuthUserId, employeesById, logs, query]);

  const actionOptions = useMemo(() => {
    const unique = Array.from(new Set(logs.map((log) => log.action))).sort((a, b) => a.localeCompare(b));
    return ["all", ...unique];
  }, [logs]);

  const entityOptions = useMemo(() => {
    const unique = Array.from(new Set(logs.map((log) => log.entityType))).sort((a, b) =>
      a.localeCompare(b),
    );
    return ["all", ...unique];
  }, [logs]);

  const summary = useMemo(() => {
    const total = visibleLogs.length;
    const uniqueActors = new Set(
      visibleLogs.map((log) => log.actorEmployeeId ?? log.actorAuthUserId).filter(Boolean),
    ).size;
    const uniqueEntities = new Set(visibleLogs.map((log) => log.entityType)).size;
    return { total, uniqueActors, uniqueEntities };
  }, [visibleLogs]);

  const actorLabel = useCallback(
    (log: ActivityLog): string => {
      const actorByEmployeeId = log.actorEmployeeId ? employeesById[log.actorEmployeeId] : null;
      if (actorByEmployeeId) {
        return actorByEmployeeId.fullName;
      }

      const actorByAuthId = employeesByAuthUserId[log.actorAuthUserId];
      if (actorByAuthId) {
        return actorByAuthId.fullName;
      }

      return `User ${log.actorAuthUserId.slice(0, 8)}`;
    },
    [employeesByAuthUserId, employeesById],
  );

  const runConfirm = useCallback((title: string, message: string, onConfirm: () => void) => {
    Alert.alert(title, message, [
      { text: "إلغاء", style: "cancel" },
      { text: "تأكيد", style: "destructive", onPress: onConfirm },
    ]);
  }, []);

  const handleDeleteOne = useCallback(
    async (logId: string) => {
      setDeletingId(logId);
      setError(null);
      setSuccess(null);

      const result = await ActivityLogsService.deleteOne(logId);
      if (result.error) {
        setError(result.error);
        setDeletingId(null);
        return;
      }

      setLogs((prev) => prev.filter((item) => item.id !== logId));
      setSuccess("تم حذف السجل.");
      setDeletingId(null);
    },
    [],
  );

  const handleClearAll = useCallback(async () => {
    setIsClearing(true);
    setError(null);
    setSuccess(null);

    const result = await ActivityLogsService.clearAll();
    if (result.error) {
      setError(result.error);
      setIsClearing(false);
      return;
    }

    setLogs([]);
    setHasMore(false);
    setSuccess(
      result.data && result.data > 0 ? `تم حذف ${result.data} سجل نشاط.` : "لا توجد سجلات للحذف.",
    );
    setIsClearing(false);
  }, []);

  return (
    <View style={styles.screen}>
      <FlatList
        data={visibleLogs}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={() => void loadLogs({ reset: true, refresh: true })}
          />
        }
        ListHeaderComponent={
          <View style={styles.headerWrap}>
            <View style={styles.card}>
              <View style={styles.topRow}>
                <Text style={styles.title}>سجل النشاطات</Text>
                <Pressable
                  style={({ pressed }) => [styles.refreshPill, pressed && styles.buttonPressed]}
                  onPress={() => void loadLogs({ reset: true, refresh: true })}
                >
                  <Text style={styles.refreshPillText}>تحديث</Text>
                </Pressable>
              </View>

              <Text style={styles.subtitle}>
                متابعة كل عمليات الإدارة مع فلترة متقدمة، حذف فردي، ومسح كامل للسجلات.
              </Text>

              <TextInput
                style={styles.searchInput}
                value={query}
                onChangeText={setQuery}
                placeholder="بحث في العملية، الكيان، التفاصيل أو المنفّذ"
                placeholderTextColor={palette.textMuted}
                textAlign="right"
              />

              <View style={styles.summaryStrip}>
                <View style={styles.summaryItem}>
                  <Text style={styles.summaryValue}>{summary.total}</Text>
                  <Text style={styles.summaryLabel}>سجل</Text>
                </View>
                <View style={styles.summaryItem}>
                  <Text style={styles.summaryValue}>{summary.uniqueActors}</Text>
                  <Text style={styles.summaryLabel}>منفّذ</Text>
                </View>
                <View style={styles.summaryItem}>
                  <Text style={styles.summaryValue}>{summary.uniqueEntities}</Text>
                  <Text style={styles.summaryLabel}>كيان</Text>
                </View>
              </View>

              <View style={styles.filterBlock}>
                <Text style={styles.filterLabel}>التاريخ</Text>
                <View style={styles.chipsRow}>
                  {DATE_FILTERS.map((filterItem) => (
                    <Pressable
                      key={filterItem.value}
                      style={({ pressed }) => [
                        styles.chip,
                        dateFilter === filterItem.value && styles.chipActive,
                        pressed && styles.buttonPressed,
                      ]}
                      onPress={() => setDateFilter(filterItem.value)}
                    >
                      <Text
                        style={[styles.chipText, dateFilter === filterItem.value && styles.chipTextActive]}
                      >
                        {filterItem.label}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </View>

              <View style={styles.filterBlock}>
                <Text style={styles.filterLabel}>العملية</Text>
                <View style={styles.chipsRow}>
                  {actionOptions.map((option) => (
                    <Pressable
                      key={option}
                      style={({ pressed }) => [
                        styles.chip,
                        actionFilter === option && styles.chipActive,
                        pressed && styles.buttonPressed,
                      ]}
                      onPress={() => setActionFilter(option)}
                    >
                      <Text style={[styles.chipText, actionFilter === option && styles.chipTextActive]}>
                        {option === "all" ? "الكل" : actionLabel(option)}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </View>

              <View style={styles.filterBlock}>
                <Text style={styles.filterLabel}>الكيان</Text>
                <View style={styles.chipsRow}>
                  {entityOptions.map((option) => (
                    <Pressable
                      key={option}
                      style={({ pressed }) => [
                        styles.chip,
                        entityFilter === option && styles.chipActive,
                        pressed && styles.buttonPressed,
                      ]}
                      onPress={() => setEntityFilter(option)}
                    >
                      <Text style={[styles.chipText, entityFilter === option && styles.chipTextActive]}>
                        {option === "all" ? "الكل" : option}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </View>

              <View style={styles.bulkRow}>
                <Pressable
                  style={({ pressed }) => [
                    styles.bulkButton,
                    styles.bulkButtonDanger,
                    pressed && !isClearing && styles.buttonPressed,
                    isClearing && styles.buttonDisabled,
                  ]}
                  disabled={isClearing}
                  onPress={() =>
                    runConfirm(
                      "مسح جميع السجلات",
                      "سيتم حذف كل سجلات النشاط نهائيًا. هل تريد المتابعة؟",
                      () => {
                        void handleClearAll();
                      },
                    )
                  }
                >
                  {isClearing ? (
                    <ActivityIndicator color="#9F1239" />
                  ) : (
                    <Text style={styles.bulkButtonDangerText}>مسح كل السجلات</Text>
                  )}
                </Pressable>
              </View>

              {error ? <Text style={styles.errorText}>{error}</Text> : null}
              {success ? <Text style={styles.successText}>{success}</Text> : null}
            </View>
          </View>
        }
        ListEmptyComponent={
          isLoading ? (
            <View style={styles.card}>
              <View style={styles.loadingBox}>
                <ActivityIndicator color={palette.primary} />
                <Text style={styles.loadingText}>جاري تحميل السجلات...</Text>
              </View>
            </View>
          ) : (
            <View style={styles.card}>
              <Text style={styles.emptyText}>لا توجد سجلات مطابقة للفلاتر الحالية.</Text>
            </View>
          )
        }
        renderItem={({ item }) => {
          const tone = actionPillColor(item.action);
          const detailRows = Object.entries(item.details ?? {}).slice(0, 4);
          const isDeleting = deletingId === item.id;

          return (
            <View style={styles.card}>
              <View style={styles.itemTopRow}>
                <View style={[styles.actionPill, { backgroundColor: tone.bg }]}>
                  <Text style={[styles.actionPillText, { color: tone.text }]}>{actionLabel(item.action)}</Text>
                </View>
                <Text style={styles.itemDate}>{formatDateTime(new Date(item.createdAt))}</Text>
              </View>

              <Text style={styles.metaText}>الكيان: {item.entityType}</Text>
              {item.entityId ? <Text style={styles.metaText}>المعرف: {item.entityId}</Text> : null}
              <Text style={styles.metaText}>المنفّذ: {actorLabel(item)}</Text>

              {detailRows.length > 0 ? (
                <View style={styles.detailsBox}>
                  {detailRows.map(([key, value]) => (
                    <Text key={`${item.id}-${key}`} style={styles.detailText}>
                      {`${key}: ${formatDetailValue(value)}`}
                    </Text>
                  ))}
                </View>
              ) : null}

              <Pressable
                style={({ pressed }) => [
                  styles.deleteButton,
                  pressed && !isDeleting && styles.buttonPressed,
                  isDeleting && styles.buttonDisabled,
                ]}
                disabled={isDeleting}
                onPress={() =>
                  runConfirm("حذف سجل النشاط", "سيتم حذف هذا السجل نهائيًا.", () => {
                    void handleDeleteOne(item.id);
                  })
                }
              >
                {isDeleting ? (
                  <ActivityIndicator color="#9F1239" />
                ) : (
                  <Text style={styles.deleteButtonText}>حذف السجل</Text>
                )}
              </Pressable>
            </View>
          );
        }}
        ListFooterComponent={
          hasMore && !isLoading ? (
            <Pressable
              style={({ pressed }) => [
                styles.loadMoreButton,
                pressed && !isLoadingMore && styles.buttonPressed,
                isLoadingMore && styles.buttonDisabled,
              ]}
              disabled={isLoadingMore}
              onPress={() => void loadLogs({ reset: false })}
            >
              {isLoadingMore ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text style={styles.loadMoreButtonText}>تحميل المزيد</Text>
              )}
            </Pressable>
          ) : null
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: palette.background,
  },
  content: {
    padding: spacing.lg,
    paddingBottom: spacing.xxl,
    gap: spacing.md,
  },
  headerWrap: {
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
  topRow: {
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
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
  refreshPill: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: palette.line,
    backgroundColor: palette.surfaceMuted,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
  },
  refreshPillText: {
    color: palette.primaryDark,
    fontWeight: "700",
    fontSize: 12,
  },
  searchInput: {
    borderWidth: 1,
    borderColor: palette.line,
    borderRadius: radius.md,
    backgroundColor: palette.surfaceMuted,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    color: palette.text,
  },
  summaryStrip: {
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: palette.line,
    backgroundColor: palette.surfaceMuted,
    padding: spacing.sm,
    flexDirection: "row-reverse",
    gap: spacing.sm,
  },
  summaryItem: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.md,
    backgroundColor: palette.surface,
    paddingVertical: spacing.xs,
  },
  summaryValue: {
    color: palette.text,
    fontSize: 20,
    fontWeight: "900",
  },
  summaryLabel: {
    color: palette.textMuted,
    fontSize: 12,
    fontWeight: "700",
  },
  filterBlock: {
    gap: spacing.xs,
  },
  filterLabel: {
    textAlign: "right",
    color: palette.text,
    fontWeight: "800",
    fontSize: 12,
  },
  chipsRow: {
    flexDirection: "row-reverse",
    flexWrap: "wrap",
    gap: spacing.xs,
  },
  chip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: palette.line,
    backgroundColor: palette.surfaceMuted,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
  },
  chipActive: {
    backgroundColor: palette.primary,
    borderColor: palette.primary,
  },
  chipText: {
    color: palette.text,
    fontWeight: "700",
    fontSize: 12,
  },
  chipTextActive: {
    color: "#FFFFFF",
  },
  bulkRow: {
    flexDirection: "row-reverse",
  },
  bulkButton: {
    flex: 1,
    borderRadius: radius.md,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: spacing.sm,
  },
  bulkButtonDanger: {
    borderColor: "#FFD1DB",
    backgroundColor: "#FFF3F6",
  },
  bulkButtonDangerText: {
    color: "#9F1239",
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
  loadingBox: {
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "center",
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
  itemTopRow: {
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  actionPill: {
    borderRadius: 999,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
  },
  actionPillText: {
    fontWeight: "800",
    fontSize: 12,
  },
  itemDate: {
    color: palette.textMuted,
    fontSize: 12,
    fontWeight: "600",
  },
  metaText: {
    textAlign: "right",
    color: palette.textMuted,
    lineHeight: 19,
  },
  detailsBox: {
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: palette.line,
    backgroundColor: palette.surfaceMuted,
    padding: spacing.sm,
    gap: 4,
  },
  detailText: {
    textAlign: "right",
    color: palette.text,
    fontSize: 12,
    lineHeight: 18,
  },
  deleteButton: {
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: "#FFD1DB",
    backgroundColor: "#FFF3F6",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: spacing.sm,
    marginTop: spacing.xs,
  },
  deleteButtonText: {
    color: "#9F1239",
    fontWeight: "800",
  },
  loadMoreButton: {
    borderRadius: radius.md,
    backgroundColor: palette.primaryDark,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: spacing.md,
    marginTop: spacing.xs,
  },
  loadMoreButtonText: {
    color: "#FFFFFF",
    fontWeight: "800",
  },
  buttonPressed: {
    opacity: 0.82,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
});
