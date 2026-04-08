import Constants from "expo-constants";
import { useFocusEffect } from "@react-navigation/native";
import { useRouter } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { AppSettingsService } from "@/src/services/supabase/app-settings.service";
import { useAuthStore } from "@/src/store/auth.store";
import { palette, radius, shadows, spacing } from "@/src/theme/tokens";
import { formatDateTime } from "@/src/utils/formatting";

export default function MemberSettingsScreen() {
  const router = useRouter();
  const employee = useAuthStore((state) => state.employee);
  const signOut = useAuthStore((state) => state.signOut);

  const [supportPhone, setSupportPhone] = useState<string | null>(null);
  const [supportEmail, setSupportEmail] = useState<string | null>(null);
  const [termsVersion, setTermsVersion] = useState("1.0");
  const [maintenanceThresholdKm, setMaintenanceThresholdKm] = useState(300);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<string | null>(null);

  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const appVersion = useMemo(
    () => Constants.expoConfig?.version ?? "1.0.0",
    [],
  );

  const loadSettings = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    const result = await AppSettingsService.listSettings();
    if (result.error) {
      setError(result.error);
      setIsLoading(false);
      return;
    }

    const settings = result.data ?? [];
    const appMeta = settings.find((item) => item.key === "app_meta")?.value ?? {};
    const defaults = settings.find((item) => item.key === "notifications_defaults")?.value ?? {};

    setSupportPhone((appMeta.supportPhone as string | undefined) ?? null);
    setSupportEmail((appMeta.supportEmail as string | undefined) ?? null);
    setTermsVersion((appMeta.termsVersion as string | undefined) ?? "1.0");
    setMaintenanceThresholdKm(
      Number((defaults.maintenanceThresholdKm as number | undefined) ?? 300),
    );

    const latest = settings
      .map((item) => item.updatedAt)
      .sort((a, b) => (a > b ? -1 : 1))[0];
    setLastUpdatedAt(latest ?? null);

    setIsLoading(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      void loadSettings();
    }, [loadSettings]),
  );

  return (
    <ScrollView
      contentContainerStyle={styles.container}
      contentInsetAdjustmentBehavior="automatic"
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.card}>
        <Text style={styles.title}>إعدادات الحساب</Text>
        <Text style={styles.subtitle}>
          إدارة إعداداتك الشخصية والوصول إلى المعلومات الرسمية للتطبيق.
        </Text>

        {isLoading ? (
          <View style={styles.loadingBox}>
            <ActivityIndicator color={palette.primary} />
            <Text style={styles.loadingText}>جاري تحميل الإعدادات...</Text>
          </View>
        ) : null}

        {error ? <Text style={styles.errorText}>{error}</Text> : null}

        {!isLoading ? (
          <>
            <View style={styles.metaRow}>
              <Text style={styles.metaValue}>{employee?.fullName ?? "--"}</Text>
              <Text style={styles.metaLabel}>الاسم</Text>
            </View>
            <View style={styles.metaRow}>
              <Text style={styles.metaValue}>{employee?.email ?? "--"}</Text>
              <Text style={styles.metaLabel}>البريد</Text>
            </View>
            <View style={styles.metaRow}>
              <Text style={styles.metaValue}>{employee?.faction ?? "--"}</Text>
              <Text style={styles.metaLabel}>الفصيلة</Text>
            </View>
            <View style={styles.metaRow}>
              <Text style={styles.metaValue}>{appVersion}</Text>
              <Text style={styles.metaLabel}>إصدار التطبيق</Text>
            </View>
            <View style={styles.metaRow}>
              <Text style={styles.metaValue}>{termsVersion}</Text>
              <Text style={styles.metaLabel}>نسخة الشروط</Text>
            </View>
            <View style={styles.metaRow}>
              <Text style={styles.metaValue}>{maintenanceThresholdKm} كم</Text>
              <Text style={styles.metaLabel}>حد تنبيه الصيانة</Text>
            </View>
            <View style={styles.metaRow}>
              <Text style={styles.metaValue}>{supportPhone ?? "--"}</Text>
              <Text style={styles.metaLabel}>رقم الدعم</Text>
            </View>
            <View style={styles.metaRow}>
              <Text style={styles.metaValue}>{supportEmail ?? "--"}</Text>
              <Text style={styles.metaLabel}>بريد الدعم</Text>
            </View>
            {lastUpdatedAt ? (
              <Text style={styles.metaFootnote}>
                آخر تحديث عام: {formatDateTime(new Date(lastUpdatedAt))}
              </Text>
            ) : null}
          </>
        ) : null}
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>روابط سريعة</Text>

        <View style={styles.actionsGrid}>
          <Pressable
            style={({ pressed }) => [styles.actionBtn, pressed && styles.buttonPressed]}
            onPress={() => router.push("/(app)/member/profile")}
          >
            <Text style={styles.actionBtnText}>ملفي الشخصي</Text>
          </Pressable>

          <Pressable
            style={({ pressed }) => [styles.actionBtn, pressed && styles.buttonPressed]}
            onPress={() => router.push("/(app)/member/linked-devices")}
          >
            <Text style={styles.actionBtnText}>الأجهزة المرتبطة</Text>
          </Pressable>

          <Pressable
            style={({ pressed }) => [styles.actionBtn, pressed && styles.buttonPressed]}
            onPress={() => router.push("/(app)/member/terms")}
          >
            <Text style={styles.actionBtnText}>الشروط والأحكام</Text>
          </Pressable>

          <Pressable
            style={({ pressed }) => [styles.actionBtn, pressed && styles.buttonPressed]}
            onPress={() => router.push("/(app)/member/support")}
          >
            <Text style={styles.actionBtnText}>الدعم الفني</Text>
          </Pressable>
        </View>
      </View>

      <Pressable
        style={({ pressed }) => [styles.signOutButton, pressed && styles.buttonPressed]}
        onPress={() => void signOut()}
      >
        <Text style={styles.signOutButtonText}>تسجيل الخروج</Text>
      </Pressable>
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
  errorText: {
    textAlign: "right",
    color: palette.danger,
    fontWeight: "700",
  },
  metaRow: {
    flexDirection: "row-reverse",
    justifyContent: "space-between",
    alignItems: "center",
    borderBottomWidth: 1,
    borderBottomColor: palette.line,
    paddingBottom: spacing.sm,
  },
  metaLabel: {
    color: palette.textMuted,
    fontWeight: "700",
  },
  metaValue: {
    color: palette.text,
    maxWidth: "68%",
    textAlign: "right",
    fontWeight: "700",
  },
  metaFootnote: {
    textAlign: "right",
    color: palette.textMuted,
    fontSize: 12,
    marginTop: spacing.xs,
  },
  sectionTitle: {
    textAlign: "right",
    color: palette.text,
    fontWeight: "800",
    fontSize: 18,
  },
  actionsGrid: {
    flexDirection: "row-reverse",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  actionBtn: {
    width: "48%",
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: palette.line,
    backgroundColor: palette.surfaceMuted,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: spacing.md,
  },
  actionBtnText: {
    color: palette.text,
    fontWeight: "700",
    fontSize: 12,
  },
  signOutButton: {
    borderRadius: radius.md,
    backgroundColor: "#0F2A4D",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: spacing.md,
    ...shadows.card,
  },
  signOutButtonText: {
    color: "#FFFFFF",
    fontWeight: "800",
  },
  buttonPressed: {
    opacity: 0.84,
  },
});

