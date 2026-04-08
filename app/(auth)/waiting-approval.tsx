import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";

import { useAuthStore } from "@/src/store/auth.store";
import { palette, radius, spacing } from "@/src/theme/tokens";

export default function WaitingApprovalScreen() {
  const bootstrap = useAuthStore((state) => state.bootstrap);
  const signOut = useAuthStore((state) => state.signOut);
  const employee = useAuthStore((state) => state.employee);
  const isBooting = useAuthStore((state) => state.isBooting);

  return (
    <View style={styles.container}>
      <View style={styles.card}>
        <Text style={styles.title}>الطلب قيد المراجعة</Text>
        <Text style={styles.subtitle}>
          تم استلام طلبك بنجاح. بعد اعتماد المدير سيتم فتح الوصول تلقائيا.
        </Text>

        <View style={styles.statusPill}>
          <Text style={styles.statusPillText}>Pending Approval</Text>
        </View>

        {employee?.email ? <Text style={styles.email}>{employee.email}</Text> : null}

        <View style={styles.progressRow}>
          <ActivityIndicator color={palette.warning} />
          <Text style={styles.progressText}>يتم التحقق من حالة الحساب...</Text>
        </View>

        <Pressable
          style={({ pressed }) => [styles.primaryButton, pressed && styles.primaryPressed]}
          onPress={bootstrap}
        >
          {isBooting ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text style={styles.primaryButtonText}>تحديث الحالة</Text>
          )}
        </Pressable>

        <Pressable style={styles.secondaryButton} onPress={signOut}>
          <Text style={styles.secondaryButtonText}>تسجيل الخروج</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: palette.background,
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.xl,
  },
  card: {
    width: "100%",
    backgroundColor: palette.surface,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: palette.line,
    padding: spacing.xl,
    gap: spacing.md,
  },
  title: {
    textAlign: "right",
    color: palette.text,
    fontSize: 26,
    fontWeight: "800",
  },
  subtitle: {
    textAlign: "right",
    color: palette.textMuted,
    lineHeight: 22,
    fontSize: 15,
  },
  statusPill: {
    alignSelf: "flex-end",
    backgroundColor: "#FFF5E7",
    borderRadius: 999,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  statusPillText: {
    color: palette.warning,
    fontWeight: "700",
    fontSize: 12,
  },
  email: {
    textAlign: "right",
    color: palette.text,
    fontWeight: "600",
  },
  progressRow: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: spacing.sm,
  },
  progressText: {
    color: palette.textMuted,
  },
  primaryButton: {
    backgroundColor: palette.primary,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    alignItems: "center",
  },
  primaryPressed: {
    backgroundColor: palette.primaryDark,
  },
  primaryButtonText: {
    color: "#FFFFFF",
    fontWeight: "800",
    fontSize: 15,
  },
  secondaryButton: {
    borderWidth: 1,
    borderColor: palette.line,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    alignItems: "center",
    backgroundColor: palette.surfaceMuted,
  },
  secondaryButtonText: {
    color: palette.text,
    fontWeight: "700",
  },
});

