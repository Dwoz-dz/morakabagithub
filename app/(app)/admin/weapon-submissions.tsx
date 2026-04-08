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
  WEAPON_SUBMISSION_STATUSES,
  type Employee,
  type WeaponSubmission,
  type WeaponSubmissionStatus,
} from "@/src/models";
import { EmployeesService } from "@/src/services/supabase/employees.service";
import { resolveStoragePathOrUrl } from "@/src/services/supabase/storage.service";
import { WeaponService } from "@/src/services/supabase/weapon.service";
import { useAuthStore } from "@/src/store/auth.store";
import { palette, radius, shadows, spacing } from "@/src/theme/tokens";
import { formatDateTime } from "@/src/utils/formatting";

const STATUS_FILTERS: { label: string; value: WeaponSubmissionStatus | "all" }[] = [
  { label: "الكل", value: "all" },
  { label: "معلق", value: WEAPON_SUBMISSION_STATUSES.PENDING },
  { label: "مراجع", value: WEAPON_SUBMISSION_STATUSES.REVIEWED },
  { label: "مرفوض", value: WEAPON_SUBMISSION_STATUSES.REJECTED },
];

const statusLabel = (status: WeaponSubmissionStatus): string => {
  if (status === WEAPON_SUBMISSION_STATUSES.PENDING) return "قيد المراجعة";
  if (status === WEAPON_SUBMISSION_STATUSES.REVIEWED) return "مراجع";
  return "مرفوض";
};

const statusColors = (status: WeaponSubmissionStatus): { bg: string; text: string } => {
  if (status === WEAPON_SUBMISSION_STATUSES.PENDING) return { bg: "#FFF3DA", text: "#8A5A00" };
  if (status === WEAPON_SUBMISSION_STATUSES.REVIEWED) return { bg: "#DDF7E8", text: "#0E6C3A" };
  return { bg: "#FFE8E8", text: "#A71D2A" };
};

const employeeLabel = (row?: Employee): string => row?.fullName ?? "غير معروف";
const employeeEmail = (row?: Employee): string => row?.email ?? "بدون بريد";

export default function WeaponSubmissionsAdminScreen() {
  const employee = useAuthStore((state) => state.employee);
  const isAdmin = employee?.role === "admin";

  const [allItems, setAllItems] = useState<WeaponSubmission[]>([]);
  const [employeesById, setEmployeesById] = useState<Record<string, Employee>>({});
  const [imageUrls, setImageUrls] = useState<Record<string, string>>({});
  const [signatureUrls, setSignatureUrls] = useState<Record<string, string>>({});
  const [avatarUrls, setAvatarUrls] = useState<Record<string, string>>({});

  const [filter, setFilter] = useState<WeaponSubmissionStatus | "all">("all");
  const [factionFilter, setFactionFilter] = useState<string>("all");
  const [query, setQuery] = useState("");

  const [isLoading, setIsLoading] = useState(true);
  const [actionId, setActionId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const filteredItems = useMemo(() => {
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

      const owner = employeesById[item.employeeId];
      const haystack = [
        owner?.fullName ?? "",
        owner?.email ?? "",
        item.faction ?? "",
        item.weaponType ?? "",
        item.serialNumber ?? "",
        item.signatureName ?? "",
        item.notes ?? "",
      ]
        .join(" ")
        .toLowerCase();

      return haystack.includes(normalizedQuery);
    });
  }, [allItems, employeesById, factionFilter, filter, query]);

  const factions = useMemo(
    () => ["all", ...Array.from(new Set(allItems.map((item) => item.faction).filter(Boolean))).sort((a, b) => a.localeCompare(b))],
    [allItems],
  );

  const runConfirm = useCallback((title: string, message: string, onConfirm: () => void) => {
    Alert.alert(title, message, [
      { text: "إلغاء", style: "cancel" },
      { text: "تأكيد", style: "destructive", onPress: onConfirm },
    ]);
  }, []);

  const loadItems = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    setSuccess(null);

    const [submissionsResult, employeesResult] = await Promise.all([
      WeaponService.listForCurrentUser(200),
      EmployeesService.listAllEmployees(),
    ]);

    const firstError = submissionsResult.error ?? employeesResult.error ?? null;
    if (submissionsResult.error) {
      setError(firstError);
      setAllItems([]);
      setEmployeesById({});
      setImageUrls({});
      setSignatureUrls({});
      setAvatarUrls({});
      setIsLoading(false);
      return;
    }

    const submissions = submissionsResult.data ?? [];
    const employees = employeesResult.data ?? [];
    const employeesMap: Record<string, Employee> = {};
    employees.forEach((row) => {
      employeesMap[row.id] = row;
    });

    setAllItems(submissions);
    setEmployeesById(employeesMap);
    setError(firstError);
    setIsLoading(false);

    const needsImages = submissions.filter((item) => item.imagePath);
    const needsSignatures = submissions.filter((item) => item.signaturePath);
    const employeesWithAvatar = employees.filter((row) => row.avatarUrl);

    if (!needsImages.length && !needsSignatures.length && !employeesWithAvatar.length) {
      setImageUrls({});
      setSignatureUrls({});
      setAvatarUrls({});
      return;
    }

    const [imageEntries, signatureEntries, avatarEntries] = await Promise.all([
      Promise.all(
        needsImages.map(async (item) => {
          const response = await resolveStoragePathOrUrl({
            bucket: "weapon-checks",
            pathOrUrl: item.imagePath as string,
            expiresIn: 3600,
          });

          return [item.id, response.url] as const;
        }),
      ),
      Promise.all(
        needsSignatures.map(async (item) => {
          const response = await resolveStoragePathOrUrl({
            bucket: "weapon-checks",
            pathOrUrl: item.signaturePath as string,
            expiresIn: 3600,
          });

          return [item.id, response.url] as const;
        }),
      ),
      Promise.all(
        employeesWithAvatar.map(async (row) => {
          const response = await resolveStoragePathOrUrl({
            bucket: "profile-avatars",
            pathOrUrl: row.avatarUrl as string,
            expiresIn: 3600,
          });

          return [row.id, response.url] as const;
        }),
      ),
    ]);

    const nextImageUrls: Record<string, string> = {};
    imageEntries.forEach(([id, url]) => {
      if (url) {
        nextImageUrls[id] = url;
      }
    });

    const nextSignatureUrls: Record<string, string> = {};
    signatureEntries.forEach(([id, url]) => {
      if (url) {
        nextSignatureUrls[id] = url;
      }
    });

    const nextAvatarUrls: Record<string, string> = {};
    avatarEntries.forEach(([id, url]) => {
      if (url) {
        nextAvatarUrls[id] = url;
      }
    });

    setImageUrls(nextImageUrls);
    setSignatureUrls(nextSignatureUrls);
    setAvatarUrls(nextAvatarUrls);
  }, []);

  useFocusEffect(
    useCallback(() => {
      void loadItems();
    }, [loadItems]),
  );

  const review = useCallback(
    async (submissionId: string, status: WeaponSubmissionStatus) => {
      if (!employee?.authUserId || !isAdmin) {
        setError("هذه العملية مخصصة للمدير فقط.");
        return;
      }

      setActionId(submissionId);
      setError(null);
      setSuccess(null);

      const result = await WeaponService.reviewSubmission({
        submissionId,
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
          item.id === submissionId
            ? {
                ...item,
                status,
                reviewedBy: employee.authUserId,
                reviewedAt: new Date().toISOString(),
              }
            : item,
        ),
      );

      setSuccess(status === WEAPON_SUBMISSION_STATUSES.REVIEWED ? "تم اعتماد الفحص." : "تم رفض الفحص.");
      setActionId(null);
    },
    [employee?.authUserId, employee?.id, isAdmin],
  );

  const deleteSubmission = useCallback(
    async (submissionId: string) => {
      if (!employee?.authUserId || !isAdmin) {
        setError("هذه العملية مخصصة للمدير فقط.");
        return;
      }

      setActionId(`delete:${submissionId}`);
      setError(null);
      setSuccess(null);

      const result = await WeaponService.deleteSubmissionForAdmin({
        submissionId,
        actorAuthUserId: employee.authUserId,
        actorEmployeeId: employee.id,
      });

      if (result.error) {
        setError(result.error);
        setActionId(null);
        return;
      }

      setAllItems((prev) => prev.filter((item) => item.id !== submissionId));
      setImageUrls((prev) => {
        if (!prev[submissionId]) return prev;
        const next = { ...prev };
        delete next[submissionId];
        return next;
      });
      setSignatureUrls((prev) => {
        if (!prev[submissionId]) return prev;
        const next = { ...prev };
        delete next[submissionId];
        return next;
      });
      setSuccess("تم حذف سجل فحص السلاح.");
      setActionId(null);
    },
    [employee?.authUserId, employee?.id, isAdmin],
  );

  const clearSubmissions = useCallback(
    async (scope: "all" | "reviewed") => {
      if (!employee?.authUserId || !isAdmin) {
        setError("هذه العملية مخصصة للمدير فقط.");
        return;
      }

      const actionKey = scope === "all" ? "clear-all" : "clear-reviewed";
      setActionId(actionKey);
      setError(null);
      setSuccess(null);

      const result = await WeaponService.clearSubmissionsForAdmin({
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
        setSignatureUrls({});
      } else {
        setAllItems((prev) =>
          prev.filter(
            (item) =>
              item.status !== WEAPON_SUBMISSION_STATUSES.REVIEWED &&
              item.status !== WEAPON_SUBMISSION_STATUSES.REJECTED,
          ),
        );
      }

      const deletedCount = result.data ?? 0;
      setSuccess(
        deletedCount > 0 ? `تم مسح ${deletedCount} سجل.` : "لا توجد سجلات مطابقة للمسح.",
      );
      setActionId(null);
    },
    [employee?.authUserId, employee?.id, isAdmin],
  );

  return (
    <ScrollView
      contentContainerStyle={styles.container}
      contentInsetAdjustmentBehavior="automatic"
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.card}>
        <Text style={styles.title}>مراجعة فحوصات السلاح</Text>
        <Text style={styles.subtitle}>
          إدارة كاملة لسجلات الفحص: مراجعة، حذف سجل مفرد، مسح السجلات المراجعة أو مسح كل السجلات.
        </Text>

        <TextInput
          style={styles.searchInput}
          value={query}
          onChangeText={setQuery}
          placeholder="بحث بالموظف، الفصيلة، نوع السلاح، الرقم التسلسلي أو الملاحظات"
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
              <Text style={[styles.filterChipText, filter === item.value && styles.filterChipTextActive]}>
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
                style={[
                  styles.filterChipText,
                  factionFilter === item && styles.filterChipTextActive,
                ]}
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
              runConfirm("مسح السجلات المراجعة", "سيتم حذف السجلات المراجعة والمرفوضة فقط.", () => {
                void clearSubmissions("reviewed");
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
              runConfirm("مسح كل سجلات السلاح", "تحذير: سيتم حذف جميع السجلات نهائيًا.", () => {
                void clearSubmissions("all");
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
            <Text style={styles.loadingText}>جاري تحميل إرساليات السلاح...</Text>
          </View>
        </View>
      ) : null}

      {!isLoading && filteredItems.length === 0 ? (
        <View style={styles.card}>
          <Text style={styles.emptyText}>لا توجد سجلات مطابقة للفلاتر الحالية.</Text>
        </View>
      ) : null}

      {filteredItems.map((item) => {
        const owner = employeesById[item.employeeId];
        const badge = statusColors(item.status);
        const isPending = item.status === WEAPON_SUBMISSION_STATUSES.PENDING;
        const isReviewing = actionId === item.id;
        const isDeleting = actionId === `delete:${item.id}`;
        const canReview = isPending && !isReviewing && actionId === null;

        return (
          <View key={item.id} style={styles.card}>
            <View style={styles.itemHeader}>
              <View style={styles.employeeRow}>
                {avatarUrls[item.employeeId] ? (
                  <Image source={{ uri: avatarUrls[item.employeeId] }} style={styles.employeeAvatar} contentFit="cover" />
                ) : (
                  <View style={styles.employeeAvatarFallback}>
                    <Text style={styles.employeeAvatarLetter}>{employeeLabel(owner).slice(0, 1)}</Text>
                  </View>
                )}
                <View style={styles.employeeTextWrap}>
                  <Text style={styles.employeeName}>{employeeLabel(owner)}</Text>
                  <Text style={styles.employeeEmail}>{employeeEmail(owner)}</Text>
                </View>
              </View>

              <View style={[styles.statusPill, { backgroundColor: badge.bg }]}>
                <Text style={[styles.statusPillText, { color: badge.text }]}>{statusLabel(item.status)}</Text>
              </View>
            </View>

            <Text style={styles.itemMeta}>الفصيلة: {item.faction}</Text>
            <Text style={styles.itemMeta}>نوع السلاح: {item.weaponType}</Text>
            <Text style={styles.itemMeta}>الرقم التسلسلي: {item.serialNumber || "غير مذكور"}</Text>
            <Text style={styles.itemMeta}>تاريخ الفحص: {item.checkDate}</Text>
            <Text style={styles.itemMeta}>اسم التوقيع: {item.signatureName || "غير مذكور"}</Text>
            {item.notes ? <Text style={styles.itemMeta}>ملاحظات: {item.notes}</Text> : null}

            {imageUrls[item.id] ? (
              <Image source={{ uri: imageUrls[item.id] }} style={styles.previewImage} contentFit="cover" />
            ) : item.imagePath ? (
              <Text style={styles.imagePendingText}>جاري تجهيز صورة الفحص...</Text>
            ) : (
              <Text style={styles.imagePendingText}>لا توجد صورة مرفقة.</Text>
            )}

            {signatureUrls[item.id] ? (
              <Image source={{ uri: signatureUrls[item.id] }} style={styles.signatureImage} contentFit="contain" />
            ) : item.signaturePath ? (
              <Text style={styles.imagePendingText}>جاري تجهيز صورة الإمضاء...</Text>
            ) : null}

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
                  onPress={() => void review(item.id, WEAPON_SUBMISSION_STATUSES.REJECTED)}
                >
                  {isReviewing ? <ActivityIndicator color={palette.text} /> : <Text style={styles.rejectButtonText}>رفض</Text>}
                </Pressable>

                <Pressable
                  style={({ pressed }) => [
                    styles.approveButton,
                    pressed && canReview && styles.buttonPressed,
                    !canReview && styles.buttonDisabled,
                  ]}
                  disabled={!canReview}
                  onPress={() => void review(item.id, WEAPON_SUBMISSION_STATUSES.REVIEWED)}
                >
                  {isReviewing ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.approveButtonText}>اعتماد</Text>}
                </Pressable>
              </View>
            ) : null}

            <Pressable
              style={({ pressed }) => [
                styles.deleteButton,
                pressed && !isDeleting && styles.buttonPressed,
                (actionId !== null || isDeleting) && styles.buttonDisabled,
              ]}
              disabled={actionId !== null || isDeleting}
              onPress={() =>
                runConfirm("حذف سجل فحص السلاح", "سيتم حذف هذا السجل نهائيًا.", () => {
                  void deleteSubmission(item.id);
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
  statusPill: {
    borderRadius: 999,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
  },
  statusPillText: {
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
  deleteButton: {
    borderWidth: 1,
    borderColor: "#FFD1DB",
    backgroundColor: "#FFF3F6",
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: spacing.sm,
    marginTop: spacing.xs,
  },
  deleteButtonText: {
    color: "#9F1239",
    fontWeight: "800",
  },
  buttonPressed: {
    opacity: 0.82,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
});
