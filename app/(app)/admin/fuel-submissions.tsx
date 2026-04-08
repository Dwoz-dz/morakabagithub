import { Image } from "expo-image";
import { useFocusEffect } from "@react-navigation/native";
import { useCallback, useMemo, useState } from "react";
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

import {
  FUEL_ENTRY_STATUSES,
  type Employee,
  type FuelEntry,
  type FuelEntryStatus,
  type Vehicle,
} from "@/src/models";
import { EmployeesService } from "@/src/services/supabase/employees.service";
import { FuelService } from "@/src/services/supabase/fuel.service";
import { resolveStoragePathOrUrl } from "@/src/services/supabase/storage.service";
import { VehiclesService } from "@/src/services/supabase/vehicles.service";
import { useAuthStore } from "@/src/store/auth.store";
import { palette, radius, shadows, spacing } from "@/src/theme/tokens";
import { formatDateTime } from "@/src/utils/formatting";

const STATUS_FILTERS: { label: string; value: FuelEntryStatus | "all" }[] = [
  { label: "الكل", value: "all" },
  { label: "معلّق", value: FUEL_ENTRY_STATUSES.PENDING },
  { label: "مقبول", value: FUEL_ENTRY_STATUSES.REVIEWED },
  { label: "مرفوض", value: FUEL_ENTRY_STATUSES.REJECTED },
];

const statusLabel = (status: FuelEntryStatus): string => {
  if (status === FUEL_ENTRY_STATUSES.PENDING) return "قيد المراجعة";
  if (status === FUEL_ENTRY_STATUSES.REVIEWED) return "مقبول";
  return "مرفوض";
};

const statusColors = (status: FuelEntryStatus): { bg: string; text: string } => {
  if (status === FUEL_ENTRY_STATUSES.PENDING) return { bg: "#FFF3DA", text: "#8A5A00" };
  if (status === FUEL_ENTRY_STATUSES.REVIEWED) return { bg: "#DDF7E8", text: "#0E6C3A" };
  return { bg: "#FFE8E8", text: "#A71D2A" };
};

const employeeLabel = (item?: Employee): string => item?.fullName ?? "موظف غير معروف";
const employeeEmail = (item?: Employee): string => item?.email ?? "لا يوجد بريد";
const vehicleLabel = (item?: Vehicle): string =>
  item ? `${item.name} - ${item.plateNumber}` : "مركبة غير معروفة";

export default function FuelSubmissionsAdminScreen() {
  const employee = useAuthStore((state) => state.employee);

  const [allItems, setAllItems] = useState<FuelEntry[]>([]);
  const [employeesById, setEmployeesById] = useState<Record<string, Employee>>({});
  const [vehiclesById, setVehiclesById] = useState<Record<string, Vehicle>>({});
  const [filter, setFilter] = useState<FuelEntryStatus | "all">("all");
  const [factionFilter, setFactionFilter] = useState<string>("all");
  const [query, setQuery] = useState("");
  const [imageUrls, setImageUrls] = useState<Record<string, string>>({});
  const [avatarUrls, setAvatarUrls] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [actionId, setActionId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const filteredItems = useMemo(
    () => {
      const normalizedQuery = query.trim().toLowerCase();

      return allItems.filter((item) => {
        if (filter !== "all" && item.status !== filter) {
          return false;
        }

        if (factionFilter !== "all" && item.faction !== factionFilter) {
          return false;
        }

        if (!normalizedQuery) {
          return true;
        }

        const employeeItem = employeesById[item.employeeId];
        const vehicleItem = vehiclesById[item.vehicleId];
        const haystack = [
          employeeItem?.fullName ?? "",
          employeeItem?.email ?? "",
          item.faction ?? "",
          item.fuelType ?? "",
          item.notes ?? "",
          vehicleItem?.name ?? "",
          vehicleItem?.plateNumber ?? "",
        ]
          .join(" ")
          .toLowerCase();

        return haystack.includes(normalizedQuery);
      });
    },
    [allItems, employeesById, factionFilter, filter, query, vehiclesById],
  );

  const loadItems = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    setSuccess(null);

    const [fuelResult, employeesResult, vehiclesResult] = await Promise.all([
      FuelService.listForCurrentUser(200),
      EmployeesService.listAllEmployees(),
      VehiclesService.listAllForAdmin(),
    ]);

    const firstError = fuelResult.error ?? employeesResult.error ?? vehiclesResult.error ?? null;

    if (fuelResult.error) {
      setError(firstError);
      setAllItems([]);
      setImageUrls({});
      setAvatarUrls({});
      setEmployeesById({});
      setVehiclesById({});
      setIsLoading(false);
      return;
    }

    const items = fuelResult.data ?? [];
    const employees = employeesResult.data ?? [];
    const vehicles = vehiclesResult.data ?? [];

    const nextEmployeesById: Record<string, Employee> = {};
    employees.forEach((item) => {
      nextEmployeesById[item.id] = item;
    });

    const nextVehiclesById: Record<string, Vehicle> = {};
    vehicles.forEach((item) => {
      nextVehiclesById[item.id] = item;
    });

    setAllItems(items);
    setEmployeesById(nextEmployeesById);
    setVehiclesById(nextVehiclesById);
    setError(firstError);
    setIsLoading(false);

    const needsImages = items.filter((item) => item.imagePath);
    const relatedEmployeeIds = Array.from(new Set(items.map((item) => item.employeeId)));
    const employeesWithAvatar = relatedEmployeeIds
      .map((id) => nextEmployeesById[id])
      .filter((item): item is Employee => Boolean(item?.avatarUrl));

    if (!needsImages.length && !employeesWithAvatar.length) {
      setImageUrls({});
      setAvatarUrls({});
      return;
    }

    const [urlEntries, avatarEntries] = await Promise.all([
      Promise.all(
        needsImages.map(async (item) => {
          const response = await resolveStoragePathOrUrl({
            bucket: "fuel-bon",
            pathOrUrl: item.imagePath as string,
            expiresIn: 3600,
          });

          return [item.id, response.url] as const;
        }),
      ),
      Promise.all(
        employeesWithAvatar.map(async (item) => {
          const response = await resolveStoragePathOrUrl({
            bucket: "profile-avatars",
            pathOrUrl: item.avatarUrl as string,
            expiresIn: 3600,
          });

          return [item.id, response.url] as const;
        }),
      ),
    ]);

    const imageMap: Record<string, string> = {};
    urlEntries.forEach(([id, url]) => {
      if (url) {
        imageMap[id] = url;
      }
    });

    const avatarMap: Record<string, string> = {};
    avatarEntries.forEach(([id, url]) => {
      if (url) {
        avatarMap[id] = url;
      }
    });

    setImageUrls(imageMap);
    setAvatarUrls(avatarMap);
  }, []);

  useFocusEffect(
    useCallback(() => {
      void loadItems();
    }, [loadItems]),
  );

  const runConfirm = useCallback((title: string, message: string, onConfirm: () => void) => {
    Alert.alert(title, message, [
      { text: "إلغاء", style: "cancel" },
      { text: "تأكيد", style: "destructive", onPress: onConfirm },
    ]);
  }, []);

  const review = useCallback(
    async (entryId: string, status: FuelEntryStatus) => {
      if (!employee?.authUserId) {
        setError("تعذر التحقق من الجلسة الحالية.");
        return;
      }

      setActionId(entryId);
      setError(null);
      setSuccess(null);

      const result = await FuelService.reviewEntry({
        entryId,
        status,
        reviewerAuthUserId: employee.authUserId,
        reviewerEmployeeId: employee.id,
      });

      if (result.error) {
        setError(result.error);
        setActionId(null);
        return;
      }

      setAllItems((prev) =>
        prev.map((item) =>
          item.id === entryId
            ? {
                ...item,
                status,
                reviewedBy: employee.authUserId,
                reviewedAt: new Date().toISOString(),
              }
            : item,
        ),
      );

      setSuccess(status === FUEL_ENTRY_STATUSES.REVIEWED ? "تمت الموافقة على الإرسالية." : "تم رفض الإرسالية.");
      setActionId(null);
    },
    [employee?.authUserId, employee?.id],
  );

  const deleteEntry = useCallback(
    async (entryId: string) => {
      if (!employee?.authUserId) {
        setError("تعذر التحقق من الجلسة الحالية.");
        return;
      }

      setActionId(`delete:${entryId}`);
      setError(null);
      setSuccess(null);

      const result = await FuelService.deleteEntryForAdmin({
        entryId,
        actorAuthUserId: employee.authUserId,
        actorEmployeeId: employee.id,
      });

      if (result.error) {
        setError(result.error);
        setActionId(null);
        return;
      }

      setAllItems((prev) => prev.filter((item) => item.id !== entryId));
      setImageUrls((prev) => {
        if (!prev[entryId]) return prev;
        const next = { ...prev };
        delete next[entryId];
        return next;
      });
      setSuccess("تم حذف سجل الوقود.");
      setActionId(null);
    },
    [employee?.authUserId, employee?.id],
  );

  const clearEntries = useCallback(
    async (scope: "all" | "reviewed") => {
      if (!employee?.authUserId) {
        setError("تعذر التحقق من الجلسة الحالية.");
        return;
      }

      const key = scope === "all" ? "clear-all" : "clear-reviewed";
      setActionId(key);
      setError(null);
      setSuccess(null);

      const result = await FuelService.clearEntriesForAdmin({
        actorAuthUserId: employee.authUserId,
        actorEmployeeId: employee.id,
        scope,
      });

      if (result.error) {
        setError(result.error);
        setActionId(null);
        return;
      }

      if (scope === "all") {
        setAllItems([]);
        setImageUrls({});
      } else {
        setAllItems((prev) =>
          prev.filter(
            (item) =>
              item.status !== FUEL_ENTRY_STATUSES.REVIEWED &&
              item.status !== FUEL_ENTRY_STATUSES.REJECTED,
          ),
        );
      }

      const deletedCount = result.data ?? 0;
      setSuccess(
        deletedCount > 0
          ? `تم مسح ${deletedCount} سجل وقود.`
          : "لا توجد سجلات مطابقة للمسح.",
      );
      setActionId(null);
    },
    [employee?.authUserId, employee?.id],
  );

  const factions = useMemo(
    () => ["all", ...Array.from(new Set(allItems.map((item) => item.faction).filter(Boolean)))],
    [allItems],
  );

  return (
    <ScrollView
      contentContainerStyle={styles.container}
      contentInsetAdjustmentBehavior="automatic"
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.card}>
        <Text style={styles.title}>مراجعة إرساليات الوقود</Text>
        <Text style={styles.subtitle}>
          مراجعة الإرسالية مع بيانات الموظف والمركبة، ثم الموافقة أو الرفض بسرعة.
        </Text>

        <TextInput
          style={styles.searchInput}
          value={query}
          onChangeText={setQuery}
          placeholder="بحث بالموظف أو المركبة أو الملاحظات"
          placeholderTextColor={palette.textMuted}
          textAlign="right"
        />

        <View style={styles.filtersRow}>
          {STATUS_FILTERS.map((item) => (
            <Pressable
              key={item.value}
              style={({ pressed }) => [
                styles.filterChip,
                filter === item.value && styles.filterChipActive,
                pressed && styles.filterChipPressed,
              ]}
              onPress={() => setFilter(item.value)}
            >
              <Text
                style={[styles.filterChipText, filter === item.value && styles.filterChipTextActive]}
              >
                {item.label}
              </Text>
            </Pressable>
          ))}
        </View>

        <View style={styles.filtersRow}>
          {factions.map((item) => (
            <Pressable
              key={item}
              style={({ pressed }) => [
                styles.filterChip,
                factionFilter === item && styles.filterChipActive,
                pressed && styles.filterChipPressed,
              ]}
              onPress={() => setFactionFilter(item)}
            >
              <Text
                style={[styles.filterChipText, factionFilter === item && styles.filterChipTextActive]}
              >
                {item === "all" ? "كل الفصائل" : item}
              </Text>
            </Pressable>
          ))}
        </View>

        <View style={styles.bulkActionsRow}>
          <Pressable
            style={({ pressed }) => [
              styles.bulkActionButton,
              styles.bulkActionButtonMuted,
              pressed && styles.buttonPressed,
              actionId !== null && styles.buttonDisabled,
            ]}
            disabled={actionId !== null}
            onPress={() =>
              runConfirm("مسح السجلات المراجعة", "سيتم حذف السجلات المقبولة والمرفوضة فقط.", () => {
                void clearEntries("reviewed");
              })
            }
          >
            <Text style={styles.bulkActionTextMuted}>
              {actionId === "clear-reviewed" ? "جاري المسح..." : "مسح المراجعة"}
            </Text>
          </Pressable>

          <Pressable
            style={({ pressed }) => [
              styles.bulkActionButton,
              styles.bulkActionButtonDanger,
              pressed && styles.buttonPressed,
              actionId !== null && styles.buttonDisabled,
            ]}
            disabled={actionId !== null}
            onPress={() =>
              runConfirm("مسح كل سجلات الوقود", "تحذير: سيحذف جميع السجلات بما فيها المعلقة.", () => {
                void clearEntries("all");
              })
            }
          >
            <Text style={styles.bulkActionTextDanger}>
              {actionId === "clear-all" ? "جاري المسح..." : "مسح الكل"}
            </Text>
          </Pressable>
        </View>

        {error ? <Text style={styles.errorText}>{error}</Text> : null}
        {success ? <Text style={styles.successText}>{success}</Text> : null}
      </View>

      {isLoading ? (
        <View style={styles.card}>
          <View style={styles.loadingBox}>
            <ActivityIndicator color={palette.primary} />
            <Text style={styles.loadingText}>جاري تحميل إرساليات الوقود...</Text>
          </View>
        </View>
      ) : null}

      {!isLoading && filteredItems.length === 0 ? (
        <View style={styles.card}>
          <Text style={styles.emptyText}>لا توجد إرساليات مطابقة للفلتر الحالي.</Text>
        </View>
      ) : null}

      {filteredItems.map((item) => {
        const isPending = item.status === FUEL_ENTRY_STATUSES.PENDING;
        const isDeleting = actionId === `delete:${item.id}`;
        const canReview = isPending && actionId !== item.id && !isDeleting;
        const employeeRow = employeesById[item.employeeId];
        const vehicleRow = vehiclesById[item.vehicleId];
        const badge = statusColors(item.status);

        return (
          <View key={item.id} style={styles.card}>
            <View style={styles.itemHeader}>
              <View style={styles.employeeRow}>
                {avatarUrls[item.employeeId] ? (
                  <Image
                    source={{ uri: avatarUrls[item.employeeId] }}
                    style={styles.employeeAvatar}
                    contentFit="cover"
                  />
                ) : (
                  <View style={styles.employeeAvatarFallback}>
                    <Text style={styles.employeeAvatarLetter}>{employeeLabel(employeeRow).slice(0, 1)}</Text>
                  </View>
                )}
                <View style={styles.employeeTextWrap}>
                  <Text style={styles.employeeName}>{employeeLabel(employeeRow)}</Text>
                  <Text style={styles.employeeEmail}>{employeeEmail(employeeRow)}</Text>
                </View>
              </View>

              <View style={[styles.statusPill, { backgroundColor: badge.bg }]}>
                <Text style={[styles.statusPillText, { color: badge.text }]}>{statusLabel(item.status)}</Text>
              </View>
            </View>

            <Text style={styles.itemMeta}>الفصيلة: {item.faction}</Text>
            <Text style={styles.itemMeta}>المركبة: {vehicleLabel(vehicleRow)}</Text>
            <Text style={styles.itemMeta}>نوع الوقود: {item.fuelType}</Text>
            <Text style={styles.itemMeta}>اللترات: {item.quantityLiters}</Text>
            <Text style={styles.itemMeta}>المسافة: {item.distanceKm} كم</Text>
            <Text style={styles.itemMeta}>العداد الحالي: {item.odometerCurrent}</Text>
            <Text style={styles.itemMeta}>العداد الجديد: {item.odometerNew}</Text>
            <Text style={styles.itemMeta}>التوقيع: {item.signatureName || "غير مذكور"}</Text>
            {item.notes ? <Text style={styles.itemMeta}>ملاحظات: {item.notes}</Text> : null}

            {imageUrls[item.id] ? (
              <Image source={{ uri: imageUrls[item.id] }} style={styles.previewImage} contentFit="cover" />
            ) : item.imagePath ? (
              <Text style={styles.imagePendingText}>جاري تجهيز صورة Bon d’essence...</Text>
            ) : (
              <Text style={styles.imagePendingText}>لا توجد صورة Bon d’essence مرفقة.</Text>
            )}

            <Text style={styles.itemDate}>{formatDateTime(new Date(item.createdAt))}</Text>

            {isPending ? (
              <View style={styles.actionsRow}>
                <Pressable
                  style={({ pressed }) => [
                    styles.rejectButton,
                    pressed && canReview && styles.buttonPressed,
                    !canReview && styles.buttonDisabled,
                  ]}
                  disabled={!canReview}
                  onPress={() => void review(item.id, FUEL_ENTRY_STATUSES.REJECTED)}
                >
                  {actionId === item.id ? (
                    <ActivityIndicator color={palette.text} />
                  ) : (
                    <Text style={styles.rejectButtonText}>رفض</Text>
                  )}
                </Pressable>

                <Pressable
                  style={({ pressed }) => [
                    styles.approveButton,
                    pressed && canReview && styles.buttonPressed,
                    !canReview && styles.buttonDisabled,
                  ]}
                  disabled={!canReview}
                  onPress={() => void review(item.id, FUEL_ENTRY_STATUSES.REVIEWED)}
                >
                  {actionId === item.id ? (
                    <ActivityIndicator color="#FFFFFF" />
                  ) : (
                    <Text style={styles.approveButtonText}>موافقة</Text>
                  )}
                </Pressable>
              </View>
            ) : null}

            <Pressable
              style={({ pressed }) => [
                styles.deleteEntryButton,
                pressed && !isDeleting && styles.buttonPressed,
                (actionId !== null || isDeleting) && styles.buttonDisabled,
              ]}
              disabled={actionId !== null || isDeleting}
              onPress={() =>
                runConfirm("حذف سجل الوقود", "سيتم حذف السجل نهائيًا. هل تريد المتابعة؟", () => {
                  void deleteEntry(item.id);
                })
              }
            >
              {isDeleting ? (
                <ActivityIndicator color="#9F1239" />
              ) : (
                <Text style={styles.deleteEntryButtonText}>حذف السجل</Text>
              )}
            </Pressable>
          </View>
        );
      })}
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
  searchInput: {
    borderWidth: 1,
    borderColor: palette.line,
    borderRadius: radius.md,
    backgroundColor: palette.surfaceMuted,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    color: palette.text,
  },
  filtersRow: {
    flexDirection: "row-reverse",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  filterChip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: palette.line,
    backgroundColor: palette.surfaceMuted,
    paddingVertical: 6,
    paddingHorizontal: spacing.md,
  },
  filterChipActive: {
    backgroundColor: palette.primary,
    borderColor: palette.primary,
  },
  filterChipPressed: {
    opacity: 0.8,
  },
  filterChipText: {
    color: palette.text,
    fontWeight: "700",
    fontSize: 13,
  },
  filterChipTextActive: {
    color: "#FFFFFF",
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
  bulkActionsRow: {
    flexDirection: "row-reverse",
    gap: spacing.sm,
  },
  bulkActionButton: {
    flex: 1,
    borderRadius: radius.md,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: spacing.sm,
  },
  bulkActionButtonMuted: {
    borderColor: palette.line,
    backgroundColor: palette.surfaceMuted,
  },
  bulkActionButtonDanger: {
    borderColor: "#FFD1DB",
    backgroundColor: "#FFEAF0",
  },
  bulkActionTextMuted: {
    color: palette.text,
    fontWeight: "800",
  },
  bulkActionTextDanger: {
    color: "#9F1239",
    fontWeight: "800",
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
  itemHeader: {
    flexDirection: "row-reverse",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: spacing.sm,
  },
  employeeRow: {
    flex: 1,
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: spacing.sm,
  },
  employeeAvatar: {
    width: 44,
    height: 44,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: palette.line,
    backgroundColor: "#E9EFF9",
  },
  employeeAvatarFallback: {
    width: 44,
    height: 44,
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
    fontWeight: "900",
    fontSize: 16,
  },
  employeeEmail: {
    textAlign: "right",
    color: palette.textMuted,
    fontSize: 12,
  },
  itemTitle: {
    flex: 1,
    textAlign: "right",
    color: palette.text,
    fontWeight: "800",
    fontSize: 18,
  },
  statusPill: {
    borderRadius: 999,
    backgroundColor: "#E8EEF8",
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
  },
  statusPillText: {
    color: palette.primaryDark,
    fontWeight: "700",
    fontSize: 12,
  },
  itemMeta: {
    textAlign: "right",
    color: palette.textMuted,
    lineHeight: 19,
  },
  previewImage: {
    width: "100%",
    height: 180,
    borderRadius: radius.md,
    backgroundColor: "#E9EFF9",
    borderWidth: 1,
    borderColor: palette.line,
    marginTop: spacing.xs,
  },
  signatureImage: {
    width: "100%",
    height: 100,
    borderRadius: radius.md,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: palette.line,
    marginTop: spacing.xs,
  },
  imagePendingText: {
    textAlign: "right",
    color: palette.textMuted,
    fontSize: 12,
    marginTop: spacing.xs,
  },
  itemDate: {
    textAlign: "right",
    color: palette.textMuted,
    fontSize: 12,
  },
  actionsRow: {
    flexDirection: "row",
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  approveButton: {
    flex: 1,
    borderRadius: radius.md,
    backgroundColor: palette.accent,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: spacing.sm,
  },
  rejectButton: {
    flex: 1,
    borderRadius: radius.md,
    backgroundColor: "#E8EDF7",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: spacing.sm,
  },
  approveButtonText: {
    color: "#FFFFFF",
    fontWeight: "800",
  },
  rejectButtonText: {
    color: palette.text,
    fontWeight: "800",
  },
  buttonPressed: {
    opacity: 0.82,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  deleteEntryButton: {
    borderWidth: 1,
    borderColor: "#FFD1DB",
    backgroundColor: "#FFF3F6",
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: spacing.sm,
    marginTop: spacing.xs,
  },
  deleteEntryButtonText: {
    color: "#9F1239",
    fontWeight: "800",
  },
});


