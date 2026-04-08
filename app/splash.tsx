import { ActivityIndicator, StyleSheet, Text, View } from "react-native";

import { palette, spacing, typography } from "@/src/theme/tokens";

export default function SplashScreen() {
  return (
    <View style={styles.container}>
      <View style={styles.logoCircle}>
        <Text style={styles.logoText}>M</Text>
      </View>

      <Text style={styles.title}>Morakaba</Text>
      <Text style={styles.subtitle}>فرقة البحث و الوقاية</Text>
      <ActivityIndicator color={palette.primary} style={styles.loader} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: palette.background,
    gap: spacing.md,
  },
  logoCircle: {
    width: 92,
    height: 92,
    borderRadius: 46,
    backgroundColor: palette.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  logoText: {
    color: "#FFFFFF",
    fontWeight: "900",
    fontSize: 42,
  },
  title: {
    fontSize: 34,
    fontWeight: "900",
    color: palette.text,
    letterSpacing: 0.5,
  },
  subtitle: {
    fontSize: typography.subtitle,
    color: palette.textMuted,
    fontWeight: "600",
  },
  loader: {
    marginTop: spacing.lg,
  },
});

