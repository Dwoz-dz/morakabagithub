import { type ReactNode } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";

import { palette, radius, shadows, spacing, typography } from "@/src/theme/tokens";

interface DashboardShellProps {
  badgeText: string;
  title: string;
  subtitle: string;
  children?: ReactNode;
}

export const DashboardShell = ({
  badgeText,
  title,
  subtitle,
  children,
}: DashboardShellProps) => {
  return (
    <ScrollView
      contentContainerStyle={styles.container}
      showsVerticalScrollIndicator={false}
      contentInsetAdjustmentBehavior="automatic"
    >
      <View style={styles.heroCard}>
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{badgeText}</Text>
        </View>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.subtitle}>{subtitle}</Text>
      </View>

      {children}
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    padding: spacing.xl,
    gap: spacing.lg,
    backgroundColor: palette.background,
  },
  heroCard: {
    backgroundColor: palette.surface,
    borderRadius: radius.xl,
    padding: spacing.xl,
    borderWidth: 1,
    borderColor: palette.line,
    gap: spacing.sm,
    ...shadows.card,
  },
  badge: {
    alignSelf: "flex-start",
    backgroundColor: palette.surfaceMuted,
    borderRadius: 999,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  badgeText: {
    fontSize: typography.caption,
    color: palette.primaryDark,
    fontWeight: "700",
  },
  title: {
    fontSize: typography.title,
    color: palette.text,
    fontWeight: "800",
    textAlign: "right",
  },
  subtitle: {
    fontSize: typography.body,
    color: palette.textMuted,
    textAlign: "right",
    lineHeight: 22,
  },
});

