import { Pressable, StyleSheet, Text, View } from "react-native";

import { EMPLOYEE_STATUSES } from "@/src/models";
import { useAuthStore } from "@/src/store/auth.store";
import { palette, radius, spacing } from "@/src/theme/tokens";

const getStatusMessage = (status: string | undefined) => {
  if (status === EMPLOYEE_STATUSES.REJECTED) {
    return "تم رفض طلب التسجيل من الإدارة. راجع الدعم الفني إذا كان هناك خطأ.";
  }

  if (status === EMPLOYEE_STATUSES.FROZEN) {
    return "الحساب مجمد حاليا من الإدارة. يرجى التواصل مع المدير لإعادة التفعيل.";
  }

  if (status === EMPLOYEE_STATUSES.BLOCKED) {
    return "الحساب محظور حاليا. يرجى مراجعة الدعم الفني قبل محاولة الدخول مجددا.";
  }

  return "لا يمكن الوصول للحساب حاليا.";
};

export default function BlockedStatusScreen() {
  const employee = useAuthStore((state) => state.employee);
  const signOut = useAuthStore((state) => state.signOut);

  return (
    <View style={styles.container}>
      <View style={styles.card}>
        <Text style={styles.badge}>Account Restricted</Text>
        <Text style={styles.title}>تعذر الدخول</Text>
        <Text style={styles.message}>{getStatusMessage(employee?.status)}</Text>

        <Pressable style={styles.signOutButton} onPress={signOut}>
          <Text style={styles.signOutText}>تسجيل الخروج</Text>
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
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: "#F0C7C7",
    backgroundColor: "#FFF5F5",
    padding: spacing.xl,
    gap: spacing.md,
  },
  badge: {
    alignSelf: "flex-end",
    color: palette.danger,
    fontWeight: "700",
    fontSize: 12,
  },
  title: {
    textAlign: "right",
    color: "#852121",
    fontSize: 28,
    fontWeight: "900",
  },
  message: {
    textAlign: "right",
    color: "#8A3A3A",
    lineHeight: 24,
    fontSize: 15,
  },
  signOutButton: {
    marginTop: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: palette.danger,
    paddingVertical: spacing.md,
    alignItems: "center",
  },
  signOutText: {
    color: "#FFFFFF",
    fontWeight: "800",
    fontSize: 15,
  },
});
