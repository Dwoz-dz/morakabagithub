import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { Pressable, StyleSheet, Text, View } from "react-native";

import type { AnnouncementWithReadState } from "@/src/models";
import { palette, radius, shadows, spacing } from "@/src/theme/tokens";

interface LatestUpdatesFeedProps {
  items: AnnouncementWithReadState[];
  imageUrls: Record<string, string | null>;
  onOpenItem: (item: AnnouncementWithReadState) => void;
}

const toArabicNumber = (value: number): string => new Intl.NumberFormat("ar-DZ").format(value);

const relativeTime = (isoDate: string): string => {
  const now = Date.now();
  const value = new Date(isoDate).getTime();
  if (Number.isNaN(value)) {
    return "--";
  }

  const deltaMs = now - value;
  const mins = Math.round(deltaMs / 60_000);
  if (mins < 1) return "الآن";
  if (mins < 60) return `${toArabicNumber(mins)} د`;

  const hours = Math.round(mins / 60);
  if (hours < 24) return `${toArabicNumber(hours)} س`;

  const days = Math.round(hours / 24);
  if (days < 7) return `${toArabicNumber(days)} ي`;

  return new Date(isoDate).toLocaleDateString("ar-DZ", {
    month: "2-digit",
    day: "2-digit",
  });
};

const typeIcon = (type: AnnouncementWithReadState["type"]): keyof typeof MaterialCommunityIcons.glyphMap => {
  if (type === "urgent") return "alert-circle-outline";
  if (type === "telegram") return "send-outline";
  if (type === "reward") return "gift-outline";
  if (type === "good_news") return "party-popper";
  return "information-outline";
};

const typeColor = (type: AnnouncementWithReadState["type"]): string => {
  if (type === "urgent") return "#B32A10";
  if (type === "telegram") return "#155E8D";
  if (type === "reward") return "#8A620D";
  if (type === "good_news") return "#0B7A43";
  return "#4C5B74";
};

const shortText = (value: string): string => (value.length > 100 ? `${value.slice(0, 100)}...` : value);

export function LatestUpdatesFeed({ items, imageUrls, onOpenItem }: LatestUpdatesFeedProps) {
  if (!items.length) {
    return null;
  }

  return (
    <View style={styles.card}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>آخر المستجدات</Text>
      </View>

      {items.map((item) => {
        const color = typeColor(item.type);
        const icon = typeIcon(item.type);
        const unread = !item.hasReadFeed;
        const imageUrl = imageUrls[item.id] ?? null;

        return (
          <Pressable
            key={item.id}
            style={({ pressed }) => [
              styles.row,
              unread && styles.rowUnread,
              pressed && styles.rowPressed,
            ]}
            onPress={() => onOpenItem(item)}
          >
            <View style={styles.rowTop}>
              <View style={styles.rowMeta}>
                <Text style={styles.timeText}>{relativeTime(item.createdAt)}</Text>
                {unread ? <View style={styles.unreadDot} /> : null}
              </View>
              <View style={styles.typeWrap}>
                <MaterialCommunityIcons name={icon} size={15} color={color} />
              </View>
            </View>

            <Text style={styles.rowTitle}>
              {item.emoji ? `${item.emoji} ` : ""}
              {item.title}
            </Text>
            <Text style={styles.rowMessage}>{shortText(item.message)}</Text>

            {imageUrl ? (
              <Image source={{ uri: imageUrl }} style={styles.rowImage} contentFit="cover" />
            ) : null}
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: palette.line,
    backgroundColor: palette.surface,
    padding: spacing.md,
    gap: spacing.sm,
    ...shadows.card,
  },
  headerRow: {
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "space-between",
  },
  title: {
    textAlign: "right",
    color: palette.text,
    fontWeight: "800",
    fontSize: 17,
  },
  row: {
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: palette.line,
    backgroundColor: palette.surfaceMuted,
    padding: spacing.sm,
    gap: 6,
  },
  rowUnread: {
    borderColor: "#C8D9EF",
    backgroundColor: "#F4F9FF",
  },
  rowPressed: {
    opacity: 0.86,
  },
  rowTop: {
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "space-between",
  },
  rowMeta: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 6,
  },
  timeText: {
    color: palette.textMuted,
    fontSize: 11,
    fontWeight: "700",
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 99,
    backgroundColor: "#DA3D3D",
  },
  typeWrap: {
    width: 24,
    height: 24,
    borderRadius: 999,
    backgroundColor: "#E7EEF9",
    alignItems: "center",
    justifyContent: "center",
  },
  rowTitle: {
    textAlign: "right",
    color: palette.text,
    fontWeight: "800",
    fontSize: 13,
  },
  rowMessage: {
    textAlign: "right",
    color: palette.textMuted,
    lineHeight: 18,
    fontWeight: "600",
    fontSize: 12,
  },
  rowImage: {
    width: "100%",
    height: 130,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: palette.line,
    backgroundColor: palette.surface,
  },
});
