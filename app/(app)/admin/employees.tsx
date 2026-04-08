import { useCallback, useMemo, useState } from "react";
import { useFocusEffect } from "@react-navigation/native";
import { Image } from "expo-image";
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

import { isPrimaryAdminEmail } from "@/src/constants/admin";
import { FACTION_OPTIONS, isSupportedFaction } from "@/src/constants/factions";
import { EMPLOYEE_ROLES, type Employee } from "@/src/models";
import { EMPLOYEE_STATUSES, type EmployeeStatus } from "@/src/models/status";
import { EmployeesService } from "@/src/services/supabase/employees.service";
import { resolveStoragePathOrUrl } from "@/src/services/supabase/storage.service";
import { useAuthStore } from "@/src/store/auth.store";
import { palette, radius, spacing, typography } from "@/src/theme/tokens";

type EmployeeRoleFilter = "all" | "member" | "admin";
type EmployeeStatusFilter = "all" | EmployeeStatus;
type EmployeeFactionFilter = "all" | (typeof FACTION_OPTIONS)[number];

const STATUS_FILTERS: { label: string; value: EmployeeStatusFilter }[] = [
  { label: "الكل", value: "all" },
  { label: "مقبول", value: EMPLOYEE_STATUSES.APPROVED },
  { label: "معلّق", value: EMPLOYEE_STATUSES.PENDING },
  { label: "مجمّد", value: EMPLOYEE_STATUSES.FROZEN },
  { label: "محظور", value: EMPLOYEE_STATUSES.BLOCKED },
];

const ROLE_FILTERS: { label: string; value: EmployeeRoleFilter }[] = [
  { label: "الكل", value: "all" },
  { label: "موظف", value: EMPLOYEE_ROLES.MEMBER },
  { label: "مدير", value: EMPLOYEE_ROLES.ADMIN },
];

const roleLabel = (role: string): string => (role === EMPLOYEE_ROLES.ADMIN ? "مدير" : "موظف");

const statusLabel = (status: EmployeeStatus): string => {
  if (status === EMPLOYEE_STATUSES.APPROVED) return "مقبول";
  if (status === EMPLOYEE_STATUSES.PENDING) return "قيد الانتظار";
  if (status === EMPLOYEE_STATUSES.REJECTED) return "مرفوض";
  if (status === EMPLOYEE_STATUSES.FROZEN) return "مجمّد";
  return "محظور";
};

const statusColors = (status: EmployeeStatus): { bg: string; text: string } => {
  if (status === EMPLOYEE_STATUSES.APPROVED) return { bg: "#DDF7E8", text: "#0E6C3A" };
  if (status === EMPLOYEE_STATUSES.PENDING) return { bg: "#FFF3DA", text: "#8A5A00" };
  if (status === EMPLOYEE_STATUSES.FROZEN) return { bg: "#EEF1F9", text: "#3D4B6D" };
  if (status === EMPLOYEE_STATUSES.REJECTED) return { bg: "#FFE8E8", text: "#A71D2A" };
  return { bg: "#FFE1E6", text: "#9F1239" };
};

export default function EmployeesManagementScreen() {
  const currentEmployee = useAuthStore((state) => state.employee);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [avatarUrls, setAvatarUrls] = useState<Record<string, string>>({});
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<EmployeeStatusFilter>("all");
  const [roleFilter, setRoleFilter] = useState<EmployeeRoleFilter>("all");
  const [factionFilter, setFactionFilter] = useState<EmployeeFactionFilter>("all");
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionKey, setActionKey] = useState<string | null>(null);

  const isPrimaryAdmin = useMemo(
    () => isPrimaryAdminEmail(currentEmployee?.email),
    [currentEmployee?.email],
  );

  const loadEmployees = useCallback(
    async (refresh = false) => {
      if (refresh) {
        setIsRefreshing(true);
      } else {
        setIsLoading(true);
      }
      setError(null);

      const result = await EmployeesService.listAllEmployees();
      if (result.error) {
        setError(result.error);
        setAvatarUrls({});
        setEmployees([]);
        setIsLoading(false);
        setIsRefreshing(false);
        return;
      }

      const ordered =
        result.data
          ?.slice()
          .sort((a, b) => {
            if (a.role !== b.role) {
              return a.role === EMPLOYEE_ROLES.ADMIN ? -1 : 1;
            }
            if (a.status !== b.status) {
              return a.status.localeCompare(b.status);
            }
            return a.fullName.localeCompare(b.fullName, "ar");
          }) ?? [];

      setEmployees(ordered);

      const avatarEntries = await Promise.all(
        ordered
          .filter((employee) => employee.avatarUrl)
          .map(async (employee) => {
            const signed = await resolveStoragePathOrUrl({
              bucket: "profile-avatars",
              pathOrUrl: employee.avatarUrl as string,
              expiresIn: 3600,
            });
            return [employee.id, signed.url] as const;
          }),
      );

      const avatarMap: Record<string, string> = {};
      avatarEntries.forEach(([id, url]) => {
        if (url) {
          avatarMap[id] = url;
        }
      });

      setAvatarUrls(avatarMap);
      setIsLoading(false);
      setIsRefreshing(false);
    },
    [],
  );

  useFocusEffect(
    useCallback(() => {
      void loadEmployees(false);
    }, [loadEmployees]),
  );

  const patchEmployee = useCallback((next: Employee) => {
    setEmployees((prev) => prev.map((employee) => (employee.id === next.id ? next : employee)));
  }, []);

  const runWithConfirmation = useCallback(
    (title: string, message: string, onConfirm: () => void) => {
      Alert.alert(title, message, [
        { text: "إلغاء", style: "cancel" },
        { text: "تأكيد", style: "destructive", onPress: onConfirm },
      ]);
    },
    [],
  );

  const handleChangeFaction = useCallback(
    async (employee: Employee, faction: string) => {
      if (employee.faction === faction) {
        return;
      }

      setActionKey(`faction-${employee.id}`);
      const result = await EmployeesService.updateEmployeeFaction({
        employeeId: employee.id,
        faction,
        actorAuthUserId: currentEmployee?.authUserId,
        actorEmployeeId: currentEmployee?.id ?? null,
      });

      if (result.error || !result.data) {
        setError(result.error ?? "تعذر تحديث الفصيلة.");
        setActionKey(null);
        return;
      }

      patchEmployee(result.data);
      setActionKey(null);
    },
    [currentEmployee?.authUserId, currentEmployee?.id, patchEmployee],
  );

  const handlePromote = useCallback(
    async (employee: Employee) => {
      setActionKey(`role-${employee.id}`);
      const result = await EmployeesService.updateEmployeeRole({
        employeeId: employee.id,
        role: EMPLOYEE_ROLES.ADMIN,
        actorEmail: currentEmployee?.email,
        targetEmail: employee.email,
        actorAuthUserId: currentEmployee?.authUserId,
        actorEmployeeId: currentEmployee?.id ?? null,
      });

      if (result.error || !result.data) {
        setError(result.error ?? "تعذر ترقية الموظف.");
        setActionKey(null);
        return;
      }

      patchEmployee(result.data);
      setActionKey(null);
    },
    [currentEmployee?.authUserId, currentEmployee?.email, currentEmployee?.id, patchEmployee],
  );

  const handleDemote = useCallback(
    async (employee: Employee) => {
      setActionKey(`role-${employee.id}`);
      const result = await EmployeesService.updateEmployeeRole({
        employeeId: employee.id,
        role: EMPLOYEE_ROLES.MEMBER,
        actorEmail: currentEmployee?.email,
        targetEmail: employee.email,
        actorAuthUserId: currentEmployee?.authUserId,
        actorEmployeeId: currentEmployee?.id ?? null,
      });

      if (result.error || !result.data) {
        setError(result.error ?? "تعذر تعديل الصلاحية.");
        setActionKey(null);
        return;
      }

      patchEmployee(result.data);
      setActionKey(null);
    },
    [currentEmployee?.authUserId, currentEmployee?.email, currentEmployee?.id, patchEmployee],
  );

  const handleStatusChange = useCallback(
    async (employee: Employee, status: EmployeeStatus, actionName: string) => {
      setActionKey(`status-${employee.id}`);
      const result = await EmployeesService.updateEmployeeStatus({
        employeeId: employee.id,
        status,
        actorEmail: currentEmployee?.email,
        actorAuthUserId: currentEmployee?.authUserId,
        actorEmployeeId: currentEmployee?.id ?? null,
        targetEmail: employee.email,
      });

      if (result.error || !result.data) {
        setError(result.error ?? `تعذر تنفيذ إجراء ${actionName}.`);
        setActionKey(null);
        return;
      }

      patchEmployee(result.data);
      setActionKey(null);
    },
    [currentEmployee?.authUserId, currentEmployee?.email, currentEmployee?.id, patchEmployee],
  );

  const handleSoftDelete = useCallback(
    async (employee: Employee) => {
      setActionKey(`delete-${employee.id}`);
      const result = await EmployeesService.softDeleteEmployee({
        employeeId: employee.id,
        actorEmail: currentEmployee?.email,
        actorAuthUserId: currentEmployee?.authUserId,
        actorEmployeeId: currentEmployee?.id ?? null,
        targetEmail: employee.email,
      });

      if (result.error || !result.data) {
        setError(result.error ?? "تعذر حذف الموظف.");
        setActionKey(null);
        return;
      }

      patchEmployee(result.data);
      setActionKey(null);
    },
    [currentEmployee?.authUserId, currentEmployee?.email, currentEmployee?.id, patchEmployee],
  );

  const summary = useMemo(() => {
    return {
      total: employees.length,
      approved: employees.filter((item) => item.status === EMPLOYEE_STATUSES.APPROVED).length,
      pending: employees.filter((item) => item.status === EMPLOYEE_STATUSES.PENDING).length,
      blocked: employees.filter((item) => item.status === EMPLOYEE_STATUSES.BLOCKED).length,
    };
  }, [employees]);

  const filteredEmployees = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();

    return employees.filter((item) => {
      if (statusFilter !== "all" && item.status !== statusFilter) return false;
      if (roleFilter !== "all" && item.role !== roleFilter) return false;
      if (factionFilter !== "all" && item.faction !== factionFilter) return false;

      if (!q) return true;
      const searchable = `${item.fullName} ${item.email} ${item.faction ?? ""}`.toLowerCase();
      return searchable.includes(q);
    });
  }, [employees, factionFilter, roleFilter, searchQuery, statusFilter]);

  return (
    <View style={styles.screen}>
      <FlatList
        data={filteredEmployees}
        keyExtractor={(item) => item.id}
        refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={() => void loadEmployees(true)} />}
        contentContainerStyle={styles.content}
        ListHeaderComponent={
          <View style={styles.headerWrapper}>
            <View style={styles.headerCard}>
              <Text style={styles.title}>إدارة الموظفين</Text>
              <Text style={styles.subtitle}>
                بطاقات ذكية للبحث، الفلترة، وتغيير الحالة/الصلاحيات بسرعة.
              </Text>
              {isPrimaryAdmin ? <Text style={styles.primaryAdminBadge}>مدير رئيسي</Text> : null}
              {error ? <Text style={styles.errorText}>{error}</Text> : null}
            </View>

            <View style={styles.summaryStrip}>
              <View style={styles.summaryItem}>
                <Text style={styles.summaryValue}>{summary.total}</Text>
                <Text style={styles.summaryLabel}>إجمالي</Text>
              </View>
              <View style={styles.summaryItem}>
                <Text style={styles.summaryValue}>{summary.approved}</Text>
                <Text style={styles.summaryLabel}>مقبول</Text>
              </View>
              <View style={styles.summaryItem}>
                <Text style={styles.summaryValue}>{summary.pending}</Text>
                <Text style={styles.summaryLabel}>معلّق</Text>
              </View>
              <View style={styles.summaryItem}>
                <Text style={styles.summaryValue}>{summary.blocked}</Text>
                <Text style={styles.summaryLabel}>محظور</Text>
              </View>
            </View>

            <View style={styles.filtersCard}>
              <TextInput
                style={styles.searchInput}
                value={searchQuery}
                onChangeText={setSearchQuery}
                placeholder="بحث بالاسم أو البريد أو الفصيلة"
                placeholderTextColor={palette.textMuted}
                textAlign="right"
              />

              <View style={styles.filtersGroup}>
                <Text style={styles.filterLabel}>الحالة</Text>
                <View style={styles.chipsRow}>
                  {STATUS_FILTERS.map((item) => (
                    <Pressable
                      key={item.value}
                      style={({ pressed }) => [
                        styles.chip,
                        statusFilter === item.value && styles.chipActive,
                        pressed && styles.chipPressed,
                      ]}
                      onPress={() => setStatusFilter(item.value)}
                    >
                      <Text
                        style={[styles.chipText, statusFilter === item.value && styles.chipTextActive]}
                      >
                        {item.label}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </View>

              <View style={styles.filtersGroup}>
                <Text style={styles.filterLabel}>الدور</Text>
                <View style={styles.chipsRow}>
                  {ROLE_FILTERS.map((item) => (
                    <Pressable
                      key={item.value}
                      style={({ pressed }) => [
                        styles.chip,
                        roleFilter === item.value && styles.chipActive,
                        pressed && styles.chipPressed,
                      ]}
                      onPress={() => setRoleFilter(item.value)}
                    >
                      <Text style={[styles.chipText, roleFilter === item.value && styles.chipTextActive]}>
                        {item.label}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </View>

              <View style={styles.filtersGroup}>
                <Text style={styles.filterLabel}>الفصيلة</Text>
                <View style={styles.chipsRow}>
                  <Pressable
                    style={({ pressed }) => [
                      styles.chip,
                      factionFilter === "all" && styles.chipActive,
                      pressed && styles.chipPressed,
                    ]}
                    onPress={() => setFactionFilter("all")}
                  >
                    <Text style={[styles.chipText, factionFilter === "all" && styles.chipTextActive]}>
                      الكل
                    </Text>
                  </Pressable>
                  {FACTION_OPTIONS.map((item) => (
                    <Pressable
                      key={item}
                      style={({ pressed }) => [
                        styles.chip,
                        factionFilter === item && styles.chipActive,
                        pressed && styles.chipPressed,
                      ]}
                      onPress={() => setFactionFilter(item)}
                    >
                      <Text style={[styles.chipText, factionFilter === item && styles.chipTextActive]}>
                        {item}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </View>
            </View>
          </View>
        }
        ListEmptyComponent={
          isLoading ? (
            <View style={styles.emptyBox}>
              <ActivityIndicator color={palette.primary} />
              <Text style={styles.emptyText}>جاري تحميل الموظفين...</Text>
            </View>
          ) : (
            <View style={styles.emptyBox}>
              <Text style={styles.emptyText}>لا توجد نتائج مطابقة للفلاتر الحالية.</Text>
            </View>
          )
        }
        renderItem={({ item }) => {
          const rowActionLoading =
            actionKey === `role-${item.id}` ||
            actionKey === `faction-${item.id}` ||
            actionKey === `status-${item.id}` ||
            actionKey === `delete-${item.id}`;

          const rowStatusColor = statusColors(item.status);
          const isRowPrimaryAdmin = isPrimaryAdminEmail(item.email);
          const canPromote = isPrimaryAdmin && item.role === EMPLOYEE_ROLES.MEMBER;
          const canDemote = isPrimaryAdmin && item.role === EMPLOYEE_ROLES.ADMIN && !isRowPrimaryAdmin;
          const canDangerousStatusAction = !isRowPrimaryAdmin;
          const currentFaction = item.faction && isSupportedFaction(item.faction) ? item.faction : null;

          return (
            <View style={styles.card}>
              <View style={styles.cardTop}>
                <View style={styles.identityBlock}>
                  {avatarUrls[item.id] ? (
                    <Image source={{ uri: avatarUrls[item.id] }} style={styles.avatar} contentFit="cover" />
                  ) : (
                    <View style={styles.avatarFallback}>
                      <Text style={styles.avatarLetter}>{item.fullName.slice(0, 1)}</Text>
                    </View>
                  )}

                  <View style={styles.identityText}>
                    <Text style={styles.name}>{item.fullName}</Text>
                    <Text style={styles.email}>{item.email}</Text>
                  </View>
                </View>

                <View style={styles.badgesColumn}>
                  <View style={[styles.statusBadge, { backgroundColor: rowStatusColor.bg }]}>
                    <Text style={[styles.statusBadgeText, { color: rowStatusColor.text }]}>
                      {statusLabel(item.status)}
                    </Text>
                  </View>
                  <View style={styles.roleBadge}>
                    <Text style={styles.roleBadgeText}>{roleLabel(item.role)}</Text>
                  </View>
                </View>
              </View>

              <View style={styles.metaRow}>
                <Text style={styles.metaLabel}>الفصيلة:</Text>
                <Text style={styles.metaValue}>{currentFaction ?? "غير محددة"}</Text>
              </View>

              <View style={styles.sectionBlock}>
                <Text style={styles.sectionLabel}>تعديل الفصيلة</Text>
                <View style={styles.chipsRow}>
                  {FACTION_OPTIONS.map((faction) => (
                    <Pressable
                      key={`${item.id}-${faction}`}
                      style={({ pressed }) => [
                        styles.chip,
                        currentFaction === faction && styles.chipActive,
                        pressed && styles.chipPressed,
                      ]}
                      disabled={rowActionLoading}
                      onPress={() => void handleChangeFaction(item, faction)}
                    >
                      <Text style={[styles.chipText, currentFaction === faction && styles.chipTextActive]}>
                        {faction}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </View>

              <View style={styles.actionsWrap}>
                <View style={styles.actionsRow}>
                  <Pressable
                    style={({ pressed }) => [
                      styles.actionButton,
                      styles.actionButtonNeutral,
                      pressed && styles.actionButtonPressed,
                      (!canDangerousStatusAction || rowActionLoading) && styles.buttonDisabled,
                    ]}
                    disabled={!canDangerousStatusAction || rowActionLoading}
                    onPress={() =>
                      runWithConfirmation("تجميد الموظف", "سيتم تجميد هذا الحساب مؤقتًا.", () => {
                        void handleStatusChange(item, EMPLOYEE_STATUSES.FROZEN, "التجميد");
                      })
                    }
                  >
                    <Text style={styles.actionButtonTextNeutral}>تجميد</Text>
                  </Pressable>

                  <Pressable
                    style={({ pressed }) => [
                      styles.actionButton,
                      styles.actionButtonWarning,
                      pressed && styles.actionButtonPressed,
                      (!canDangerousStatusAction || rowActionLoading) && styles.buttonDisabled,
                    ]}
                    disabled={!canDangerousStatusAction || rowActionLoading}
                    onPress={() =>
                      runWithConfirmation("تعطيل الموظف", "سيتم تعطيل هذا الحساب (محظور).", () => {
                        void handleStatusChange(item, EMPLOYEE_STATUSES.BLOCKED, "التعطيل");
                      })
                    }
                  >
                    <Text style={styles.actionButtonTextWarning}>تعطيل</Text>
                  </Pressable>

                  <Pressable
                    style={({ pressed }) => [
                      styles.actionButton,
                      styles.actionButtonSuccess,
                      pressed && styles.actionButtonPressed,
                      rowActionLoading && styles.buttonDisabled,
                    ]}
                    disabled={rowActionLoading}
                    onPress={() =>
                      runWithConfirmation("إعادة التفعيل", "سيتم إعادة تفعيل هذا الحساب.", () => {
                        void handleStatusChange(item, EMPLOYEE_STATUSES.APPROVED, "إعادة التفعيل");
                      })
                    }
                  >
                    <Text style={styles.actionButtonTextSuccess}>إعادة تفعيل</Text>
                  </Pressable>
                </View>

                <View style={styles.actionsRow}>
                  <Pressable
                    style={({ pressed }) => [
                      styles.actionButton,
                      styles.actionButtonPrimary,
                      pressed && styles.actionButtonPressed,
                      (!canPromote || rowActionLoading) && styles.buttonDisabled,
                    ]}
                    disabled={!canPromote || rowActionLoading}
                    onPress={() =>
                      runWithConfirmation("ترقية إلى مدير", "هل تريد ترقية هذا الموظف إلى مدير؟", () => {
                        void handlePromote(item);
                      })
                    }
                  >
                    <Text style={styles.actionButtonTextPrimary}>ترقية مدير</Text>
                  </Pressable>

                  <Pressable
                    style={({ pressed }) => [
                      styles.actionButton,
                      styles.actionButtonNeutral,
                      pressed && styles.actionButtonPressed,
                      (!canDemote || rowActionLoading) && styles.buttonDisabled,
                    ]}
                    disabled={!canDemote || rowActionLoading}
                    onPress={() =>
                      runWithConfirmation("إزالة صلاحية مدير", "سيتم إرجاع الحساب إلى موظف.", () => {
                        void handleDemote(item);
                      })
                    }
                  >
                    <Text style={styles.actionButtonTextNeutral}>إرجاع موظف</Text>
                  </Pressable>

                  <Pressable
                    style={({ pressed }) => [
                      styles.actionButton,
                      styles.actionButtonDanger,
                      pressed && styles.actionButtonPressed,
                      (!canDangerousStatusAction || rowActionLoading) && styles.buttonDisabled,
                    ]}
                    disabled={!canDangerousStatusAction || rowActionLoading}
                    onPress={() =>
                      runWithConfirmation(
                        "حذف الموظف",
                        "سيتم حذف الحساب منطقيًا (status=blocked) مع سحب صلاحية الإدارة.",
                        () => {
                          void handleSoftDelete(item);
                        },
                      )
                    }
                  >
                    <Text style={styles.actionButtonTextDanger}>حذف منطقي</Text>
                  </Pressable>
                </View>
              </View>

              {rowActionLoading ? (
                <View style={styles.loadingInline}>
                  <ActivityIndicator size="small" color={palette.primary} />
                  <Text style={styles.loadingInlineText}>جارٍ تنفيذ الإجراء...</Text>
                </View>
              ) : null}
            </View>
          );
        }}
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
    gap: spacing.md,
    paddingBottom: spacing.xxl,
  },
  headerWrapper: {
    gap: spacing.md,
  },
  headerCard: {
    backgroundColor: palette.surface,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: palette.line,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  title: {
    color: palette.text,
    textAlign: "right",
    fontWeight: "900",
    fontSize: 28,
  },
  subtitle: {
    color: palette.textMuted,
    textAlign: "right",
    lineHeight: 20,
  },
  primaryAdminBadge: {
    alignSelf: "flex-end",
    color: palette.accent,
    fontWeight: "800",
  },
  errorText: {
    color: palette.danger,
    textAlign: "right",
    fontWeight: "700",
  },
  summaryStrip: {
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: palette.line,
    backgroundColor: palette.surface,
    padding: spacing.sm,
    flexDirection: "row-reverse",
    gap: spacing.sm,
  },
  summaryItem: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.md,
    backgroundColor: palette.surfaceMuted,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.xs,
  },
  summaryValue: {
    color: palette.text,
    fontSize: 20,
    fontWeight: "900",
  },
  summaryLabel: {
    color: palette.textMuted,
    fontSize: typography.caption,
    fontWeight: "700",
  },
  filtersCard: {
    backgroundColor: palette.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: palette.line,
    padding: spacing.md,
    gap: spacing.md,
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
  filtersGroup: {
    gap: spacing.xs,
  },
  filterLabel: {
    textAlign: "right",
    color: palette.text,
    fontWeight: "800",
    fontSize: 13,
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
  chipPressed: {
    opacity: 0.8,
  },
  chipText: {
    color: palette.textMuted,
    fontWeight: "700",
    fontSize: 12,
  },
  chipTextActive: {
    color: "#FFFFFF",
  },
  card: {
    backgroundColor: palette.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: palette.line,
    padding: spacing.md,
    gap: spacing.sm,
  },
  cardTop: {
    flexDirection: "row-reverse",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  identityBlock: {
    flex: 1,
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: spacing.sm,
  },
  identityText: {
    flex: 1,
    gap: 2,
  },
  avatar: {
    width: 46,
    height: 46,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: palette.line,
    backgroundColor: "#E9EFF9",
  },
  avatarFallback: {
    width: 46,
    height: 46,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: palette.line,
    backgroundColor: "#E7F0FD",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarLetter: {
    color: palette.primaryDark,
    fontWeight: "900",
    fontSize: 16,
  },
  name: {
    color: palette.text,
    fontSize: 17,
    fontWeight: "900",
    textAlign: "right",
  },
  email: {
    color: palette.textMuted,
    textAlign: "right",
    fontSize: 12,
  },
  badgesColumn: {
    alignItems: "flex-end",
    gap: 6,
  },
  statusBadge: {
    borderRadius: 999,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
  },
  statusBadgeText: {
    fontWeight: "800",
    fontSize: 11,
  },
  roleBadge: {
    borderRadius: 999,
    backgroundColor: "#E7F0FD",
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
  },
  roleBadgeText: {
    color: palette.primaryDark,
    fontWeight: "800",
    fontSize: 11,
  },
  metaRow: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: spacing.xs,
  },
  metaLabel: {
    color: palette.textMuted,
    fontWeight: "700",
  },
  metaValue: {
    color: palette.text,
    fontWeight: "700",
    flex: 1,
    textAlign: "right",
  },
  sectionBlock: {
    gap: spacing.xs,
    paddingTop: spacing.xs,
  },
  sectionLabel: {
    color: palette.textMuted,
    fontWeight: "700",
    textAlign: "right",
    fontSize: 12,
  },
  actionsWrap: {
    gap: spacing.xs,
    paddingTop: spacing.xs,
  },
  actionsRow: {
    flexDirection: "row-reverse",
    gap: spacing.xs,
  },
  actionButton: {
    flex: 1,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: spacing.sm,
    borderWidth: 1,
  },
  actionButtonPrimary: {
    borderColor: palette.primary,
    backgroundColor: palette.primary,
  },
  actionButtonSuccess: {
    borderColor: palette.accent,
    backgroundColor: "#DDF7E8",
  },
  actionButtonWarning: {
    borderColor: "#FFD8A8",
    backgroundColor: "#FFF4E5",
  },
  actionButtonNeutral: {
    borderColor: palette.line,
    backgroundColor: "#EDF1F8",
  },
  actionButtonDanger: {
    borderColor: "#FFD1DB",
    backgroundColor: "#FFEAF0",
  },
  actionButtonPressed: {
    opacity: 0.82,
  },
  buttonDisabled: {
    opacity: 0.45,
  },
  actionButtonTextPrimary: {
    color: "#FFFFFF",
    fontWeight: "800",
    fontSize: 12,
  },
  actionButtonTextSuccess: {
    color: "#0E6C3A",
    fontWeight: "800",
    fontSize: 12,
  },
  actionButtonTextWarning: {
    color: "#8A5A00",
    fontWeight: "800",
    fontSize: 12,
  },
  actionButtonTextNeutral: {
    color: palette.text,
    fontWeight: "800",
    fontSize: 12,
  },
  actionButtonTextDanger: {
    color: "#9F1239",
    fontWeight: "800",
    fontSize: 12,
  },
  loadingInline: {
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xs,
    paddingTop: 2,
  },
  loadingInlineText: {
    color: palette.textMuted,
    fontSize: 12,
    fontWeight: "600",
  },
  emptyBox: {
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: palette.line,
    backgroundColor: palette.surface,
    padding: spacing.xl,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
  },
  emptyText: {
    color: palette.textMuted,
    textAlign: "center",
    fontWeight: "600",
  },
});
