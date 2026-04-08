import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useEffect, useMemo, useRef, useState } from "react";
import { Animated, StyleSheet, Text, View } from "react-native";

import type { AnnouncementWithReadState } from "@/src/models";
import { palette, radius, shadows, spacing } from "@/src/theme/tokens";

interface SmartTickerProps {
  items: AnnouncementWithReadState[];
}

const SHORT_TEXT_MAX = 84;

const truncate = (value: string, max: number): string =>
  value.length > max ? `${value.slice(0, max)}...` : value;

const priorityTone = (priority: number): "high" | "normal" => (priority >= 80 ? "high" : "normal");

export function SmartTicker({ items }: SmartTickerProps) {
  const [index, setIndex] = useState(0);
  const opacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    setIndex(0);
    opacity.setValue(1);
  }, [items.length, opacity]);

  useEffect(() => {
    if (items.length <= 1) {
      return;
    }

    const interval = setInterval(() => {
      Animated.sequence([
        Animated.timing(opacity, {
          toValue: 0.15,
          duration: 240,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 1,
          duration: 280,
          useNativeDriver: true,
        }),
      ]).start();

      setIndex((previous) => (previous + 1) % items.length);
    }, 4800);

    return () => clearInterval(interval);
  }, [items.length, opacity]);

  const current = items[index] ?? null;
  const isVisible = Boolean(current);
  const tone = priorityTone(current?.priority ?? 0);

  const iconName = useMemo(() => {
    if (!current) {
      return "bullhorn-outline" as const;
    }
    if (current.type === "urgent") return "alert-circle-outline" as const;
    if (current.type === "telegram") return "send-outline" as const;
    if (current.type === "good_news") return "party-popper" as const;
    if (current.type === "reward") return "gift-outline" as const;
    return "information-outline" as const;
  }, [current]);

  if (!isVisible || !current) {
    return null;
  }

  return (
    <View style={[styles.card, tone === "high" && styles.cardHighPriority]}>
      <Animated.View style={[styles.row, { opacity }]}>
        <View style={[styles.iconWrap, tone === "high" && styles.iconWrapHighPriority]}>
          <MaterialCommunityIcons
            name={iconName}
            size={16}
            color={tone === "high" ? "#A23A17" : palette.primary}
          />
        </View>

        <View style={styles.content}>
          <Text style={styles.title}>
            {current.emoji ? `${current.emoji} ` : ""}
            {current.title}
          </Text>
          <Text style={styles.message}>{truncate(current.message, SHORT_TEXT_MAX)}</Text>
        </View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: "#CFE0F4",
    backgroundColor: "#EFF5FD",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    ...shadows.card,
  },
  cardHighPriority: {
    borderColor: "#FFD5C4",
    backgroundColor: "#FFF3EE",
  },
  row: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: spacing.sm,
  },
  iconWrap: {
    width: 28,
    height: 28,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#DDEBFA",
  },
  iconWrapHighPriority: {
    backgroundColor: "#FFE2D5",
  },
  content: {
    flex: 1,
    gap: 2,
  },
  title: {
    textAlign: "right",
    color: palette.text,
    fontWeight: "800",
    fontSize: 13,
  },
  message: {
    textAlign: "right",
    color: palette.textMuted,
    fontWeight: "600",
    fontSize: 12,
  },
});

