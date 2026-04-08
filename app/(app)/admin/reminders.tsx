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

import { DEFAULT_REMINDER_CONFIG, type ReminderConfig } from "@/src/models";
import { RemindersService } from "@/src/services/supabase/reminders.service";
import { useAuthStore } from "@/src/store/auth.store";
import { palette, radius, shadows, spacing } from "@/src/theme/tokens";

const parseDate = (value: string): Date | null => {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const date = new Date(`${trimmed}T00:00:00`);
  if (Number.isNaN(date.getTime())) return null;
  return date;
};

export default function AdminRemindersScreen() {
  const employee = useAuthStore((state) => state.employee);

  const [oilChangeDate, setOilChangeDate] = useState("");
  const [weaponInspectionDate, setWeaponInspectionDate] = useState("");
  const [monthlyFuelBonDay, setMonthlyFuelBonDay] = useState("");
  const [oilLeadDays, setOilLeadDays] = useState(String(DEFAULT_REMINDER_CONFIG.leadDays.oilChange));
  const [weaponLeadDays, setWeaponLeadDays] = useState(
    String(DEFAULT_REMINDER_CONFIG.leadDays.weaponInspection),
  );
  const [bonLeadDays, setBonLeadDays] = useState(String(DEFAULT_REMINDER_CONFIG.leadDays.monthlyFuelBon));

  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isDispatching, setIsDispatching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const config: ReminderConfig = useMemo(
    () => ({
      oilChangeDate: oilChangeDate.trim() || null,
      weaponInspectionDate: weaponInspectionDate.trim() || null,
      monthlyFuelBonDay: monthlyFuelBonDay.trim() ? Number(monthlyFuelBonDay) : null,
      leadDays: {
        oilChange: oilLeadDays.trim() ? Number(oilLeadDays) : DEFAULT_REMINDER_CONFIG.leadDays.oilChange,
        weaponInspection: weaponLeadDays.trim()
          ? Number(weaponLeadDays)
          : DEFAULT_REMINDER_CONFIG.leadDays.weaponInspection,
        monthlyFuelBon: bonLeadDays.trim()
          ? Number(bonLeadDays)
          : DEFAULT_REMINDER_CONFIG.leadDays.monthlyFuelBon,
      },
    }),
    [bonLeadDays, monthlyFuelBonDay, oilChangeDate, oilLeadDays, weaponInspectionDate, weaponLeadDays],
  );

  const countdowns = useMemo(() => RemindersService.buildCountdowns(config), [config]);

  const loadReminders = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    setSuccess(null);

    const result = await RemindersService.getReminderConfig();
    if (result.error || !result.data) {
      setError(result.error ?? "تعذر تحميل إعدادات التذكير.");
      setIsLoading(false);
      return;
    }

    const row = result.data;
    setOilChangeDate(row.oilChangeDate ?? "");
    setWeaponInspectionDate(row.weaponInspectionDate ?? "");
    setMonthlyFuelBonDay(row.monthlyFuelBonDay ? String(row.monthlyFuelBonDay) : "");
    setOilLeadDays(String(row.leadDays.oilChange));
    setWeaponLeadDays(String(row.leadDays.weaponInspection));
    setBonLeadDays(String(row.leadDays.monthlyFuelBon));
    setIsLoading(false);
  }, []);

  const dispatchDueNotifications = useCallback(
    async (silent = false) => {
      if (!employee?.authUserId) {
        setError("تعذر التحقق من الجلسة الحالية.");
        return;
      }

      setIsDispatching(true);
      if (!silent) {
        setError(null);
        setSuccess(null);
      }

      const result = await RemindersService.dispatchDueReminderNotifications({
        senderAuthUserId: employee.authUserId,
        senderEmployeeId: employee.id,
      });

      if (result.error) {
        if (!silent) {
          setError(result.error);
        }
        setIsDispatching(false);
        return;
      }

      if (!silent) {
        const sent = result.data?.sent ?? 0;
        if (sent > 0) {
          setSuccess(`تم إرسال ${sent} تنبيه تذكير للموظفين.`);
        } else {
          setSuccess("لا توجد تنبيهات مستحقة الآن.");
        }
      }

      setIsDispatching(false);
    },
    [employee?.authUserId, employee?.id],
  );

  useFocusEffect(
    useCallback(() => {
      void loadReminders();
      void dispatchDueNotifications(true);
    }, [dispatchDueNotifications, loadReminders]),
  );

  const validate = useCallback((): string | null => {
    if (oilChangeDate.trim() && !parseDate(oilChangeDate)) {
      return "صيغة تاريخ الفيدونج غير صحيحة (YYYY-MM-DD).";
    }

    if (weaponInspectionDate.trim() && !parseDate(weaponInspectionDate)) {
      return "صيغة تاريخ مراقبة السلاح غير صحيحة (YYYY-MM-DD).";
    }

    if (monthlyFuelBonDay.trim()) {
      const day = Number(monthlyFuelBonDay);
      if (Number.isNaN(day) || day < 1 || day > 28) {
        return "يوم قسيمة الوقود يجب أن يكون بين 1 و28.";
      }
    }

    const leads = [
      { label: "مهلة تذكير الفيدونج", value: Number(oilLeadDays) },
      { label: "مهلة تذكير السلاح", value: Number(weaponLeadDays) },
      { label: "مهلة تذكير قسيمة الوقود", value: Number(bonLeadDays) },
    ];

    for (const row of leads) {
      if (Number.isNaN(row.value) || row.value < 0 || row.value > 60) {
        return `${row.label} يجب أن يكون رقمًا من 0 إلى 60.`;
      }
    }

    return null;
  }, [bonLeadDays, monthlyFuelBonDay, oilChangeDate, oilLeadDays, weaponInspectionDate, weaponLeadDays]);

  const save = useCallback(async () => {
    if (!employee?.authUserId) {
      setError("تعذر التحقق من الجلسة الحالية.");
      return;
    }

    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }

    setIsSaving(true);
    setError(null);
    setSuccess(null);

    const result = await RemindersService.saveReminderConfig({
      config,
      updatedBy: employee.authUserId,
    });

    if (result.error) {
      setError(result.error);
      setIsSaving(false);
      return;
    }

    setSuccess("تم حفظ إعدادات التذكير.");
    setIsSaving(false);
    await dispatchDueNotifications(true);
  }, [config, dispatchDueNotifications, employee?.authUserId, validate]);

  const clearAllSchedules = useCallback(async () => {
    if (!employee?.authUserId) {
      setError("تعذر التحقق من الجلسة الحالية.");
      return;
    }

    setIsDeleting(true);
    setError(null);
    setSuccess(null);

    const result = await RemindersService.saveReminderConfig({
      config: {
        oilChangeDate: null,
        weaponInspectionDate: null,
        monthlyFuelBonDay: null,
        leadDays: {
          oilChange: Number(oilLeadDays) || DEFAULT_REMINDER_CONFIG.leadDays.oilChange,
          weaponInspection: Number(weaponLeadDays) || DEFAULT_REMINDER_CONFIG.leadDays.weaponInspection,
          monthlyFuelBon: Number(bonLeadDays) || DEFAULT_REMINDER_CONFIG.leadDays.monthlyFuelBon,
        },
      },
      updatedBy: employee.authUserId,
    });

    if (result.error) {
      setError(result.error);
      setIsDeleting(false);
      return;
    }

    setOilChangeDate("");
    setWeaponInspectionDate("");
    setMonthlyFuelBonDay("");
    setSuccess("تم حذف كل مواعيد التذكير.");
    setIsDeleting(false);
  }, [bonLeadDays, employee?.authUserId, oilLeadDays, weaponLeadDays]);

  const resetDefaults = useCallback(async () => {
    if (!employee?.authUserId) {
      setError("تعذر التحقق من الجلسة الحالية.");
      return;
    }

    setIsResetting(true);
    setError(null);
    setSuccess(null);

    const result = await RemindersService.resetReminderConfig(employee.authUserId);
    if (result.error) {
      setError(result.error);
      setIsResetting(false);
      return;
    }

    setOilChangeDate("");
    setWeaponInspectionDate("");
    setMonthlyFuelBonDay("");
    setOilLeadDays(String(DEFAULT_REMINDER_CONFIG.leadDays.oilChange));
    setWeaponLeadDays(String(DEFAULT_REMINDER_CONFIG.leadDays.weaponInspection));
    setBonLeadDays(String(DEFAULT_REMINDER_CONFIG.leadDays.monthlyFuelBon));
    setSuccess("تمت إعادة ضبط إعدادات التذكير.");
    setIsResetting(false);
  }, [employee?.authUserId]);

  const runConfirm = useCallback((title: string, message: string, onConfirm: () => void) => {
    Alert.alert(title, message, [
      { text: "إلغاء", style: "cancel" },
      { text: "تأكيد", style: "destructive", onPress: onConfirm },
    ]);
  }, []);

  return (
    <ScrollView
      contentContainerStyle={styles.container}
      contentInsetAdjustmentBehavior="automatic"
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.card}>
        <Text style={styles.title}>تذكير الموظفين</Text>
        <Text style={styles.subtitle}>
          تحكم كامل في مواعيد الفيدونج، مراقبة السلاح، وإحضار قسائم الوقود مع عدّ تنازلي مباشر.
        </Text>

        {isLoading ? (
          <View style={styles.loadingBox}>
            <ActivityIndicator color={palette.primary} />
            <Text style={styles.loadingText}>جاري تحميل إعدادات التذكير...</Text>
          </View>
        ) : (
          <>
            <View style={styles.kpiStrip}>
              {countdowns.map((row) => (
                <View
                  key={row.type}
                  style={[
                    styles.kpiCard,
                    row.isOverdue && styles.kpiCardDanger,
                    row.daysRemaining === 0 && styles.kpiCardToday,
                  ]}
                >
                  <Text style={styles.kpiTitle}>{row.title}</Text>
                  <Text style={styles.kpiValue}>
                    {row.daysRemaining === null ? "--" : row.daysRemaining < 0 ? "متأخر" : row.daysRemaining}
                  </Text>
                  <Text style={styles.kpiMeta}>
                    {row.dueDate ? `الموعد: ${row.dueDate}` : "غير محدد"}
                  </Text>
                </View>
              ))}
            </View>

            <View style={styles.formSection}>
              <Text style={styles.sectionTitle}>تواريخ التذكير</Text>
              <TextInput
                style={styles.input}
                value={oilChangeDate}
                onChangeText={setOilChangeDate}
                placeholder="تاريخ الفيدونج - YYYY-MM-DD"
                placeholderTextColor={palette.textMuted}
                textAlign="right"
              />
              <TextInput
                style={styles.input}
                value={weaponInspectionDate}
                onChangeText={setWeaponInspectionDate}
                placeholder="تاريخ مراقبة السلاح - YYYY-MM-DD"
                placeholderTextColor={palette.textMuted}
                textAlign="right"
              />
              <TextInput
                style={styles.input}
                value={monthlyFuelBonDay}
                onChangeText={setMonthlyFuelBonDay}
                placeholder="يوم قسيمة الوقود الشهري (1-28)"
                placeholderTextColor={palette.textMuted}
                textAlign="right"
                keyboardType="numeric"
              />
            </View>

            <View style={styles.formSection}>
              <Text style={styles.sectionTitle}>مهلة التذكير (قابلة للتعديل)</Text>
              <TextInput
                style={styles.input}
                value={oilLeadDays}
                onChangeText={setOilLeadDays}
                placeholder="مهلة تذكير الفيدونج (بالأيام)"
                placeholderTextColor={palette.textMuted}
                textAlign="right"
                keyboardType="numeric"
              />
              <TextInput
                style={styles.input}
                value={weaponLeadDays}
                onChangeText={setWeaponLeadDays}
                placeholder="مهلة تذكير السلاح (بالأيام)"
                placeholderTextColor={palette.textMuted}
                textAlign="right"
                keyboardType="numeric"
              />
              <TextInput
                style={styles.input}
                value={bonLeadDays}
                onChangeText={setBonLeadDays}
                placeholder="مهلة تذكير قسيمة الوقود (بالأيام)"
                placeholderTextColor={palette.textMuted}
                textAlign="right"
                keyboardType="numeric"
              />
            </View>

            <View style={styles.actionsRow}>
              <Pressable
                style={({ pressed }) => [
                  styles.actionButton,
                  styles.actionButtonPrimary,
                  pressed && !isSaving && styles.buttonPressed,
                  isSaving && styles.buttonDisabled,
                ]}
                disabled={isSaving}
                onPress={() => void save()}
              >
                {isSaving ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <Text style={styles.actionButtonPrimaryText}>حفظ</Text>
                )}
              </Pressable>

              <Pressable
                style={({ pressed }) => [
                  styles.actionButton,
                  styles.actionButtonSecondary,
                  pressed && !isDispatching && styles.buttonPressed,
                  isDispatching && styles.buttonDisabled,
                ]}
                disabled={isDispatching}
                onPress={() => void dispatchDueNotifications(false)}
              >
                {isDispatching ? (
                  <ActivityIndicator color={palette.primaryDark} />
                ) : (
                  <Text style={styles.actionButtonSecondaryText}>إرسال التنبيهات الآن</Text>
                )}
              </Pressable>
            </View>

            <View style={styles.actionsRow}>
              <Pressable
                style={({ pressed }) => [
                  styles.actionButton,
                  styles.actionButtonMuted,
                  pressed && !isResetting && styles.buttonPressed,
                  isResetting && styles.buttonDisabled,
                ]}
                disabled={isResetting}
                onPress={() =>
                  runConfirm("إعادة ضبط", "سيتم إعادة الإعدادات للوضع الافتراضي.", () => {
                    void resetDefaults();
                  })
                }
              >
                {isResetting ? (
                  <ActivityIndicator color={palette.text} />
                ) : (
                  <Text style={styles.actionButtonMutedText}>إعادة الضبط</Text>
                )}
              </Pressable>

              <Pressable
                style={({ pressed }) => [
                  styles.actionButton,
                  styles.actionButtonDanger,
                  pressed && !isDeleting && styles.buttonPressed,
                  isDeleting && styles.buttonDisabled,
                ]}
                disabled={isDeleting}
                onPress={() =>
                  runConfirm("حذف المواعيد", "سيتم حذف كل مواعيد التذكير الحالية.", () => {
                    void clearAllSchedules();
                  })
                }
              >
                {isDeleting ? (
                  <ActivityIndicator color="#9F1239" />
                ) : (
                  <Text style={styles.actionButtonDangerText}>حذف المواعيد</Text>
                )}
              </Pressable>
            </View>

            {error ? <Text style={styles.errorText}>{error}</Text> : null}
            {success ? <Text style={styles.successText}>{success}</Text> : null}
          </>
        )}
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
  kpiStrip: {
    flexDirection: "row-reverse",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  kpiCard: {
    width: "31.5%",
    minHeight: 112,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: palette.line,
    backgroundColor: palette.surfaceMuted,
    padding: spacing.sm,
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
  },
  kpiCardDanger: {
    borderColor: "#FFD1DB",
    backgroundColor: "#FFF3F6",
  },
  kpiCardToday: {
    borderColor: "#D2F4E0",
    backgroundColor: "#ECFBF3",
  },
  kpiTitle: {
    textAlign: "center",
    color: palette.text,
    fontWeight: "700",
    fontSize: 12,
  },
  kpiValue: {
    color: palette.text,
    fontSize: 24,
    fontWeight: "900",
  },
  kpiMeta: {
    textAlign: "center",
    color: palette.textMuted,
    fontSize: 11,
  },
  formSection: {
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: palette.line,
    backgroundColor: palette.surfaceMuted,
    padding: spacing.md,
    gap: spacing.sm,
  },
  sectionTitle: {
    textAlign: "right",
    color: palette.text,
    fontWeight: "800",
    fontSize: 15,
  },
  input: {
    borderWidth: 1,
    borderColor: palette.line,
    borderRadius: radius.md,
    backgroundColor: palette.surface,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    color: palette.text,
  },
  actionsRow: {
    flexDirection: "row-reverse",
    gap: spacing.sm,
  },
  actionButton: {
    flex: 1,
    borderRadius: radius.md,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: spacing.md,
  },
  actionButtonPrimary: {
    borderColor: palette.primary,
    backgroundColor: palette.primary,
  },
  actionButtonSecondary: {
    borderColor: "#C9D9F0",
    backgroundColor: "#E7F0FD",
  },
  actionButtonMuted: {
    borderColor: palette.line,
    backgroundColor: "#EDF1F8",
  },
  actionButtonDanger: {
    borderColor: "#FFD1DB",
    backgroundColor: "#FFF3F6",
  },
  actionButtonPrimaryText: {
    color: "#FFFFFF",
    fontWeight: "800",
  },
  actionButtonSecondaryText: {
    color: palette.primaryDark,
    fontWeight: "800",
  },
  actionButtonMutedText: {
    color: palette.text,
    fontWeight: "800",
  },
  actionButtonDangerText: {
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
  buttonPressed: {
    opacity: 0.82,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
});
