import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { useFocusEffect } from "@react-navigation/native";
import { memo, useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { FACTION_OPTIONS } from "@/src/constants/factions";
import {
  WEEKLY_REST_DAY_LABELS,
  WEEKLY_REST_DAY_KEYS,
  type Employee,
  type WeeklyRestDayKey,
  type WeeklyRestFairnessStat,
  type WeeklyRestHistory,
} from "@/src/models";
import { EmployeesService } from "@/src/services/supabase/employees.service";
import { resolveStoragePathOrUrl } from "@/src/services/supabase/storage.service";
import { WeeklyRestService } from "@/src/services/supabase/weekly-rest.service";
import { useAuthStore } from "@/src/store/auth.store";
import { palette, radius, spacing } from "@/src/theme/tokens";
import { formatDateTime } from "@/src/utils/formatting";

type FactionFilter = "all" | (typeof FACTION_OPTIONS)[number];

const getWeekStartSaturday = (): string => {
  const now = new Date();
  const day = now.getDay();
  const distanceFromSaturday = (day + 1) % 7;
  const saturday = new Date(now);
  saturday.setDate(now.getDate() - distanceFromSaturday);
  return saturday.toISOString().slice(0, 10);
};

const formatRestDays = (days: string[]): string =>
  days
    .map((day) => {
      const key = day as WeeklyRestDayKey;
      return WEEKLY_REST_DAY_LABELS[key] ?? day;
    })
    .join("، ");

interface EmployeeRowProps {
  employee: Employee;
  selected: boolean;
  avatarUrl: string | null;
  onToggle: (employeeId: string) => void;
}

const EmployeeSelectableRow = memo(({ employee, selected, avatarUrl, onToggle }: EmployeeRowProps) => (
  <Pressable
    style={({ pressed }) => [
      styles.employeeRow,
      selected && styles.employeeRowSelected,
      pressed && styles.employeeRowPressed,
    ]}
    onPress={() => onToggle(employee.id)}
  >
    <View style={styles.employeeRowLeft}>
      <View style={[styles.checkbox, selected && styles.checkboxSelected]}>
        {selected ? <MaterialCommunityIcons name="check" size={16} color="#FFFFFF" /> : null}
      </View>
    </View>

    <View style={styles.employeeMain}>
      {avatarUrl ? (
        <Image source={{ uri: avatarUrl }} style={styles.employeeAvatar} contentFit="cover" />
      ) : (
        <View style={styles.employeeAvatarFallback}>
          <Text style={styles.employeeAvatarLetter}>{employee.fullName.slice(0, 1)}</Text>
        </View>
      )}

      <View style={styles.employeeTextWrap}>
        <Text style={styles.employeeName}>{employee.fullName}</Text>
        <Text style={styles.employeeMeta}>{employee.email}</Text>
        <Text style={styles.employeeMeta}>الفصيلة: {employee.faction ?? "غير محددة"}</Text>
      </View>
    </View>
  </Pressable>
));

EmployeeSelectableRow.displayName = "EmployeeSelectableRow";

interface DayChipProps {
  day: WeeklyRestDayKey;
  selected: boolean;
  onToggle: (day: WeeklyRestDayKey) => void;
}

const DayChip = memo(({ day, selected, onToggle }: DayChipProps) => (
  <Pressable
    style={({ pressed }) => [
      styles.dayChip,
      selected && styles.dayChipSelected,
      pressed && styles.dayChipPressed,
    ]}
    onPress={() => onToggle(day)}
  >
    <Text style={[styles.dayChipText, selected && styles.dayChipTextSelected]}>
      {WEEKLY_REST_DAY_LABELS[day]}
    </Text>
  </Pressable>
));

DayChip.displayName = "DayChip";

export default function WeeklyRestAdminScreen() {
  const admin = useAuthStore((state) => state.employee);
  const isAdmin = admin?.role === "admin";

  const [employees, setEmployees] = useState<Employee[]>([]);
  const [avatarUrls, setAvatarUrls] = useState<Record<string, string>>({});
  const [factionFilter, setFactionFilter] = useState<FactionFilter>("all");
  const [query, setQuery] = useState("");
  const [selectedEmployeeIds, setSelectedEmployeeIds] = useState<string[]>([]);
  const [selectedDays, setSelectedDays] = useState<WeeklyRestDayKey[]>([]);

  const [fairnessStats, setFairnessStats] = useState<WeeklyRestFairnessStat[]>([]);
  const [fairnessHistory, setFairnessHistory] = useState<WeeklyRestHistory[]>([]);

  const [isLoadingEmployees, setIsLoadingEmployees] = useState(true);
  const [isLoadingFairness, setIsLoadingFairness] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [deletingHistoryId, setDeletingHistoryId] = useState<string | null>(null);
  const [isClearingHistory, setIsClearingHistory] = useState(false);

  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const filteredEmployees = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return employees.filter((employee) => {
      if (factionFilter !== "all" && employee.faction !== factionFilter) {
        return false;
      }

      if (!normalizedQuery) {
        return true;
      }

      const haystack = [employee.fullName, employee.email, employee.faction ?? ""]
        .join(" ")
        .toLowerCase();
      return haystack.includes(normalizedQuery);
    });
  }, [employees, factionFilter, query]);

  const isAllFilteredSelected = useMemo(
    () =>
      filteredEmployees.length > 0 &&
      filteredEmployees.every((employee) => selectedEmployeeIds.includes(employee.id)),
    [filteredEmployees, selectedEmployeeIds],
  );

  const runConfirm = useCallback((title: string, message: string, onConfirm: () => void) => {
    Alert.alert(title, message, [
      { text: "إلغاء", style: "cancel" },
      { text: "تأكيد", style: "destructive", onPress: onConfirm },
    ]);
  }, []);

  const loadEmployees = useCallback(async () => {
    setIsLoadingEmployees(true);
    setError(null);

    const result = await EmployeesService.listApprovedMembers();
    if (result.error) {
      setError(result.error);
      setEmployees([]);
      setAvatarUrls({});
      setIsLoadingEmployees(false);
      return;
    }

    const rows = result.data ?? [];
    setEmployees(rows);
    setSelectedEmployeeIds((prev) => prev.filter((id) => rows.some((row) => row.id === id)));
    setIsLoadingEmployees(false);

    const employeesWithAvatar = rows.filter((row) => row.avatarUrl);
    if (!employeesWithAvatar.length) {
      setAvatarUrls({});
      return;
    }

    const avatarEntries = await Promise.all(
      employeesWithAvatar.map(async (row) => {
        const response = await resolveStoragePathOrUrl({
          bucket: "profile-avatars",
          pathOrUrl: row.avatarUrl as string,
          expiresIn: 3600,
        });

        return [row.id, response.url] as const;
      }),
    );

    const nextAvatars: Record<string, string> = {};
    avatarEntries.forEach(([id, url]) => {
      if (url) {
        nextAvatars[id] = url;
      }
    });
    setAvatarUrls(nextAvatars);
  }, []);

  const loadFairness = useCallback(async () => {
    setIsLoadingFairness(true);
    setError(null);

    const [statsResult, historyResult] = await Promise.all([
      WeeklyRestService.getFairnessStats(8),
      WeeklyRestService.listFairnessHistory(120),
    ]);

    const firstError = statsResult.error ?? historyResult.error ?? null;
    if (firstError) {
      setError(firstError);
    }

    setFairnessStats(statsResult.data ?? []);
    setFairnessHistory(historyResult.data ?? []);
    setIsLoadingFairness(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      void loadEmployees();
      void loadFairness();
    }, [loadEmployees, loadFairness]),
  );

  const toggleEmployee = useCallback((employeeId: string) => {
    setSelectedEmployeeIds((prev) =>
      prev.includes(employeeId) ? prev.filter((id) => id !== employeeId) : [...prev, employeeId],
    );
    setSuccessMessage(null);
    setError(null);
  }, []);

  const toggleDay = useCallback((day: WeeklyRestDayKey) => {
    setSelectedDays((prev) => (prev.includes(day) ? prev.filter((item) => item !== day) : [...prev, day]));
    setSuccessMessage(null);
    setError(null);
  }, []);

  const selectAllInCurrentFilter = useCallback(() => {
    const ids = filteredEmployees.map((employee) => employee.id);
    setSelectedEmployeeIds((prev) => Array.from(new Set([...prev, ...ids])));
    setSuccessMessage(null);
    setError(null);
  }, [filteredEmployees]);

  const clearEmployeeSelection = useCallback(() => {
    setSelectedEmployeeIds([]);
    setSuccessMessage(null);
    setError(null);
  }, []);

  const submit = useCallback(async () => {
    if (!admin?.authUserId || !isAdmin) {
      setError("هذه العملية مخصصة للمدير فقط.");
      return;
    }

    if (selectedEmployeeIds.length === 0) {
      setError("يرجى اختيار موظف واحد على الأقل.");
      return;
    }

    if (selectedDays.length === 0) {
      setError("يرجى اختيار يوم راحة واحد على الأقل.");
      return;
    }

    const targets = employees.filter((employee) => selectedEmployeeIds.includes(employee.id));
    if (targets.length === 0) {
      setError("لم يتم العثور على الموظفين المحددين.");
      return;
    }

    setIsSubmitting(true);
    setError(null);
    setSuccessMessage(null);

    const result = await WeeklyRestService.assignWeeklyRest({
      employees: targets,
      days: selectedDays,
      weekStartDate: getWeekStartSaturday(),
      senderAuthUserId: admin.authUserId,
    });

    if (result.error) {
      setError(result.error);
      setIsSubmitting(false);
      return;
    }

    setSelectedEmployeeIds([]);
    setSuccessMessage(`تم إرسال الراحة الأسبوعية إلى ${targets.length} موظف(ين) بنجاح.`);
    setIsSubmitting(false);

    void loadFairness();
  }, [admin?.authUserId, employees, isAdmin, loadFairness, selectedDays, selectedEmployeeIds]);

  const deleteFairnessRecord = useCallback(
    async (historyId: string) => {
      if (!admin?.authUserId || !isAdmin) {
        setError("هذه العملية مخصصة للمدير فقط.");
        return;
      }

      setDeletingHistoryId(historyId);
      setError(null);
      setSuccessMessage(null);

      const result = await WeeklyRestService.deleteFairnessHistoryRecord({
        historyId,
        actorAuthUserId: admin.authUserId,
        actorEmployeeId: admin.id,
      });

      if (result.error) {
        setError(result.error);
        setDeletingHistoryId(null);
        return;
      }

      setFairnessHistory((prev) => prev.filter((item) => item.id !== historyId));
      setSuccessMessage("تم حذف سجل العدالة.");
      setDeletingHistoryId(null);
    },
    [admin?.authUserId, admin?.id, isAdmin],
  );

  const clearFairnessHistory = useCallback(async () => {
    if (!admin?.authUserId || !isAdmin) {
      setError("هذه العملية مخصصة للمدير فقط.");
      return;
    }

    setIsClearingHistory(true);
    setError(null);
    setSuccessMessage(null);

    const result = await WeeklyRestService.clearFairnessHistory({
      actorAuthUserId: admin.authUserId,
      actorEmployeeId: admin.id,
    });

    if (result.error) {
      setError(result.error);
      setIsClearingHistory(false);
      return;
    }

    setFairnessHistory([]);
    setSuccessMessage(
      result.data && result.data > 0 ? `تم مسح ${result.data} سجل عدالة.` : "لا توجد سجلات عدالة للمسح.",
    );
    setIsClearingHistory(false);
  }, [admin?.authUserId, admin?.id, isAdmin]);

  return (
    <View style={styles.screen}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        contentInsetAdjustmentBehavior="automatic"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.sectionCard}>
          <Text style={styles.screenTitle}>إدارة الراحة الأسبوعية</Text>
          <Text style={styles.screenSubtitle}>
            اختيار الموظفين وأيام الراحة بطريقة أسرع للفرق الكبيرة، مع سجل عدالة قابل للإدارة.
          </Text>
        </View>

        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>الفلترة والبحث</Text>
          <TextInput
            style={styles.searchInput}
            value={query}
            onChangeText={setQuery}
            placeholder="ابحث بالاسم أو البريد أو الفصيلة"
            placeholderTextColor={palette.textMuted}
            textAlign="right"
          />

          <View style={styles.chipsRow}>
            <Pressable
              style={[styles.filterChip, factionFilter === "all" && styles.filterChipActive]}
              onPress={() => setFactionFilter("all")}
            >
              <Text style={[styles.filterChipText, factionFilter === "all" && styles.filterChipTextActive]}>
                الكل
              </Text>
            </Pressable>

            {FACTION_OPTIONS.map((faction) => (
              <Pressable
                key={faction}
                style={[styles.filterChip, factionFilter === faction && styles.filterChipActive]}
                onPress={() => setFactionFilter(faction)}
              >
                <Text
                  style={[styles.filterChipText, factionFilter === faction && styles.filterChipTextActive]}
                >
                  {faction}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        <View style={styles.sectionCard}>
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionTitle}>اختيار الموظفين</Text>
            <Text style={styles.sectionMeta}>{selectedEmployeeIds.length} محدد</Text>
          </View>

          <View style={styles.selectionToolsRow}>
            <Pressable
              style={({ pressed }) => [
                styles.smallAction,
                pressed && styles.smallActionPressed,
                (isLoadingEmployees || filteredEmployees.length === 0 || isAllFilteredSelected) &&
                  styles.smallActionDisabled,
              ]}
              disabled={isLoadingEmployees || filteredEmployees.length === 0 || isAllFilteredSelected}
              onPress={selectAllInCurrentFilter}
            >
              <Text style={styles.smallActionText}>تحديد الكل في الفلتر الحالي</Text>
            </Pressable>

            <Pressable
              style={({ pressed }) => [
                styles.smallAction,
                pressed && styles.smallActionPressed,
                selectedEmployeeIds.length === 0 && styles.smallActionDisabled,
              ]}
              disabled={selectedEmployeeIds.length === 0}
              onPress={clearEmployeeSelection}
            >
              <Text style={styles.smallActionText}>إلغاء التحديد</Text>
            </Pressable>
          </View>

          {isLoadingEmployees ? (
            <View style={styles.loadingBox}>
              <ActivityIndicator color={palette.primary} />
              <Text style={styles.loadingText}>جاري تحميل الموظفين...</Text>
            </View>
          ) : (
            <ScrollView
              style={styles.employeeList}
              contentContainerStyle={styles.employeeListContent}
              nestedScrollEnabled
              showsVerticalScrollIndicator={false}
            >
              {filteredEmployees.length === 0 ? (
                <View style={styles.emptyBox}>
                  <Text style={styles.emptyText}>لا يوجد موظفون مطابقون للفلتر الحالي.</Text>
                </View>
              ) : (
                filteredEmployees.map((item) => (
                  <EmployeeSelectableRow
                    key={item.id}
                    employee={item}
                    selected={selectedEmployeeIds.includes(item.id)}
                    avatarUrl={avatarUrls[item.id] ?? null}
                    onToggle={toggleEmployee}
                  />
                ))
              )}
            </ScrollView>
          )}
        </View>

        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>اختيار أيام الراحة</Text>
          <View style={styles.chipsRow}>
            {WEEKLY_REST_DAY_KEYS.map((day) => (
              <DayChip key={day} day={day} selected={selectedDays.includes(day)} onToggle={toggleDay} />
            ))}
          </View>
        </View>

        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>ملخص العدالة (آخر 8 أسابيع)</Text>
          {isLoadingFairness ? (
            <View style={styles.loadingBox}>
              <ActivityIndicator color={palette.primary} />
              <Text style={styles.loadingText}>جاري تحميل الإحصائيات...</Text>
            </View>
          ) : fairnessStats.length === 0 ? (
            <View style={styles.emptyBox}>
              <Text style={styles.emptyText}>لا توجد بيانات كافية حتى الآن.</Text>
            </View>
          ) : (
            <View style={styles.fairnessList}>
              {fairnessStats.map((item) => (
                <View key={item.employeeId} style={styles.fairnessRow}>
                  <Text style={styles.fairnessName}>{item.fullName}</Text>
                  <Text style={styles.fairnessCount}>{item.assignmentsCount} مرة</Text>
                </View>
              ))}
            </View>
          )}
        </View>

        <View style={styles.sectionCard}>
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionTitle}>سجل العدالة</Text>
            <Pressable
              style={({ pressed }) => [
                styles.smallDangerAction,
                pressed && styles.smallActionPressed,
                isClearingHistory && styles.smallActionDisabled,
              ]}
              disabled={isClearingHistory}
              onPress={() =>
                runConfirm("مسح كامل سجل العدالة", "سيتم حذف كل سجلات العدالة نهائيًا.", () => {
                  void clearFairnessHistory();
                })
              }
            >
              <Text style={styles.smallDangerActionText}>
                {isClearingHistory ? "جاري المسح..." : "مسح السجل بالكامل"}
              </Text>
            </Pressable>
          </View>

          {isLoadingFairness ? (
            <View style={styles.loadingBox}>
              <ActivityIndicator color={palette.primary} />
              <Text style={styles.loadingText}>جاري تحميل سجل العدالة...</Text>
            </View>
          ) : fairnessHistory.length === 0 ? (
            <View style={styles.emptyBox}>
              <Text style={styles.emptyText}>لا توجد سجلات عدالة متاحة.</Text>
            </View>
          ) : (
            <View style={styles.historyList}>
              {fairnessHistory.map((record) => {
                const owner = employees.find((item) => item.id === record.employeeId);
                const deleting = deletingHistoryId === record.id;
                return (
                  <View key={record.id} style={styles.historyRow}>
                    <Text style={styles.historyName}>{owner?.fullName ?? `موظف ${record.employeeId.slice(0, 8)}`}</Text>
                    <Text style={styles.historyMeta}>الفصيلة: {record.faction}</Text>
                    <Text style={styles.historyMeta}>الأيام: {formatRestDays(record.days)}</Text>
                    <Text style={styles.historyMeta}>
                      الأسبوع: {record.weekStartDate} → {record.weekEndDate}
                    </Text>
                    <Text style={styles.historyMeta}>{formatDateTime(new Date(record.createdAt))}</Text>

                    <Pressable
                      style={({ pressed }) => [
                        styles.deleteHistoryButton,
                        pressed && !deleting && styles.smallActionPressed,
                        deleting && styles.smallActionDisabled,
                      ]}
                      disabled={deleting}
                      onPress={() =>
                        runConfirm("حذف سجل عدالة", "سيتم حذف هذا السجل نهائيًا.", () => {
                          void deleteFairnessRecord(record.id);
                        })
                      }
                    >
                      {deleting ? (
                        <ActivityIndicator color="#9F1239" />
                      ) : (
                        <Text style={styles.deleteHistoryButtonText}>حذف السجل</Text>
                      )}
                    </Pressable>
                  </View>
                );
              })}
            </View>
          )}
        </View>
      </ScrollView>

      <View style={styles.actionBar}>
        <View style={styles.actionBarSummary}>
          <Text style={styles.actionBarSummaryText}>الموظفون المحددون: {selectedEmployeeIds.length}</Text>
          <Text style={styles.actionBarSummaryText}>أيام الراحة المحددة: {selectedDays.length}</Text>
          {error ? <Text style={styles.errorText}>{error}</Text> : null}
          {successMessage ? <Text style={styles.successText}>{successMessage}</Text> : null}
        </View>

        <View style={styles.actionBarButtons}>
          <Pressable
            style={({ pressed }) => [
              styles.resetButton,
              pressed && styles.smallActionPressed,
              selectedEmployeeIds.length === 0 && styles.smallActionDisabled,
            ]}
            disabled={selectedEmployeeIds.length === 0}
            onPress={clearEmployeeSelection}
          >
            <Text style={styles.resetButtonText}>إلغاء التحديد</Text>
          </Pressable>

          <Pressable
            style={({ pressed }) => [
              styles.submitButton,
              (isSubmitting || selectedEmployeeIds.length === 0 || selectedDays.length === 0) &&
                styles.submitButtonDisabled,
              pressed &&
                !isSubmitting &&
                selectedEmployeeIds.length > 0 &&
                selectedDays.length > 0 &&
                styles.submitButtonPressed,
            ]}
            onPress={() => void submit()}
            disabled={isSubmitting || selectedEmployeeIds.length === 0 || selectedDays.length === 0}
          >
            {isSubmitting ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={styles.submitButtonText}>إرسال الراحة الأسبوعية</Text>
            )}
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: palette.background,
  },
  scroll: {
    flex: 1,
    backgroundColor: palette.background,
  },
  content: {
    padding: spacing.xl,
    gap: spacing.md,
    paddingBottom: 220,
  },
  sectionCard: {
    backgroundColor: palette.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: palette.line,
    padding: spacing.lg,
    gap: spacing.md,
  },
  screenTitle: {
    textAlign: "right",
    color: palette.text,
    fontWeight: "900",
    fontSize: 28,
  },
  screenSubtitle: {
    textAlign: "right",
    color: palette.textMuted,
    lineHeight: 21,
  },
  sectionTitle: {
    textAlign: "right",
    color: palette.text,
    fontWeight: "800",
    fontSize: 18,
  },
  sectionHeaderRow: {
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  sectionMeta: {
    color: palette.primaryDark,
    fontWeight: "800",
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
  chipsRow: {
    flexDirection: "row-reverse",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  filterChip: {
    borderRadius: 999,
    backgroundColor: palette.surfaceMuted,
    borderWidth: 1,
    borderColor: palette.line,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  filterChipActive: {
    backgroundColor: palette.primary,
    borderColor: palette.primary,
  },
  filterChipText: {
    color: palette.text,
    fontWeight: "700",
    fontSize: 13,
  },
  filterChipTextActive: {
    color: "#FFFFFF",
  },
  selectionToolsRow: {
    flexDirection: "row-reverse",
    gap: spacing.sm,
  },
  smallAction: {
    flex: 1,
    borderRadius: radius.md,
    backgroundColor: palette.surfaceMuted,
    borderWidth: 1,
    borderColor: palette.line,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
    alignItems: "center",
    justifyContent: "center",
  },
  smallDangerAction: {
    borderRadius: radius.md,
    backgroundColor: "#FFF3F6",
    borderWidth: 1,
    borderColor: "#FFD1DB",
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
    alignItems: "center",
    justifyContent: "center",
  },
  smallActionPressed: {
    opacity: 0.82,
  },
  smallActionDisabled: {
    opacity: 0.55,
  },
  smallActionText: {
    color: palette.text,
    fontWeight: "700",
    fontSize: 12,
    textAlign: "center",
  },
  smallDangerActionText: {
    color: "#9F1239",
    fontWeight: "800",
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
  },
  emptyBox: {
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: palette.line,
    backgroundColor: palette.surfaceMuted,
    padding: spacing.md,
  },
  emptyText: {
    textAlign: "right",
    color: palette.textMuted,
  },
  employeeList: {
    maxHeight: 360,
  },
  employeeListContent: {
    gap: spacing.sm,
  },
  employeeRow: {
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: palette.line,
    backgroundColor: palette.surfaceMuted,
    padding: spacing.sm,
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  employeeRowSelected: {
    borderColor: palette.primary,
    backgroundColor: "#EAF1FF",
  },
  employeeRowPressed: {
    opacity: 0.86,
  },
  employeeMain: {
    flex: 1,
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: spacing.sm,
  },
  employeeRowLeft: {
    alignItems: "center",
    justifyContent: "center",
  },
  employeeAvatar: {
    width: 42,
    height: 42,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: palette.line,
    backgroundColor: "#E9EFF9",
  },
  employeeAvatarFallback: {
    width: 42,
    height: 42,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: palette.line,
    backgroundColor: "#E7F0FD",
    alignItems: "center",
    justifyContent: "center",
  },
  employeeAvatarLetter: {
    color: palette.primaryDark,
    fontWeight: "900",
    fontSize: 15,
  },
  employeeTextWrap: {
    flex: 1,
    gap: 2,
  },
  employeeName: {
    textAlign: "right",
    color: palette.text,
    fontWeight: "800",
    fontSize: 15,
  },
  employeeMeta: {
    textAlign: "right",
    color: palette.textMuted,
    fontSize: 12,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: palette.line,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
  },
  checkboxSelected: {
    backgroundColor: palette.primary,
    borderColor: palette.primary,
  },
  dayChip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: palette.line,
    backgroundColor: palette.surfaceMuted,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  dayChipSelected: {
    backgroundColor: palette.accent,
    borderColor: palette.accent,
  },
  dayChipPressed: {
    opacity: 0.85,
  },
  dayChipText: {
    color: palette.text,
    fontWeight: "700",
    fontSize: 13,
  },
  dayChipTextSelected: {
    color: "#FFFFFF",
  },
  fairnessList: {
    gap: spacing.sm,
  },
  fairnessRow: {
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: palette.line,
    backgroundColor: palette.surfaceMuted,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "space-between",
  },
  fairnessName: {
    color: palette.text,
    fontWeight: "700",
    flex: 1,
    textAlign: "right",
  },
  fairnessCount: {
    color: palette.primaryDark,
    fontWeight: "800",
    marginLeft: spacing.sm,
  },
  historyList: {
    gap: spacing.sm,
  },
  historyRow: {
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: palette.line,
    backgroundColor: palette.surfaceMuted,
    padding: spacing.md,
    gap: 4,
  },
  historyName: {
    textAlign: "right",
    color: palette.text,
    fontWeight: "800",
  },
  historyMeta: {
    textAlign: "right",
    color: palette.textMuted,
    fontSize: 12,
  },
  deleteHistoryButton: {
    borderWidth: 1,
    borderColor: "#FFD1DB",
    backgroundColor: "#FFF3F6",
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: spacing.sm,
    marginTop: spacing.xs,
  },
  deleteHistoryButtonText: {
    color: "#9F1239",
    fontWeight: "800",
  },
  actionBar: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    borderTopWidth: 1,
    borderTopColor: palette.line,
    backgroundColor: palette.surface,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.lg,
    gap: spacing.sm,
  },
  actionBarSummary: {
    gap: 2,
  },
  actionBarSummaryText: {
    textAlign: "right",
    color: palette.textMuted,
    fontSize: 12,
  },
  actionBarButtons: {
    flexDirection: "row-reverse",
    gap: spacing.sm,
  },
  submitButton: {
    flex: 1,
    borderRadius: radius.md,
    backgroundColor: palette.primary,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: spacing.md,
  },
  submitButtonDisabled: {
    opacity: 0.55,
  },
  submitButtonPressed: {
    opacity: 0.85,
  },
  submitButtonText: {
    color: "#FFFFFF",
    fontWeight: "800",
    fontSize: 15,
  },
  resetButton: {
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: palette.line,
    backgroundColor: palette.surfaceMuted,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
  },
  resetButtonText: {
    color: palette.text,
    fontWeight: "700",
    fontSize: 13,
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
});

