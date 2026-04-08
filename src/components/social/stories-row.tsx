import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import type { AnnouncementWithReadState } from "@/src/models";
import { palette, radius, shadows, spacing } from "@/src/theme/tokens";

interface StoriesRowProps {
  items: AnnouncementWithReadState[];
  imageUrls: Record<string, string | null>;
  onOpenStory: (story: AnnouncementWithReadState) => void;
}

const typeBadgeColor = (type: AnnouncementWithReadState["type"]): string => {
  if (type === "urgent") return "#C1440E";
  if (type === "good_news") return "#0C7A49";
  if (type === "reward") return "#946012";
  if (type === "telegram") return "#165C8A";
  return "#4A5E82";
};

const typeBadgeLabel = (type: AnnouncementWithReadState["type"]): string => {
  if (type === "urgent") return "عاجل";
  if (type === "good_news") return "خبر سار";
  if (type === "reward") return "مكافأة";
  if (type === "telegram") return "تلغرام";
  return "عام";
};

export function StoriesRow({ items, imageUrls, onOpenStory }: StoriesRowProps) {
  if (!items.length) {
    return null;
  }

  return (
    <View style={styles.card}>
      <View style={styles.headerRow}>
        <Text style={styles.caption}>الستوري</Text>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.storiesScroll}
      >
        {items.map((item) => {
          const hasUnread = !item.hasOpenedStory;
          const storyImage = imageUrls[item.id] ?? null;

          return (
            <Pressable
              key={item.id}
              style={({ pressed }) => [styles.storyItem, pressed && styles.storyItemPressed]}
              onPress={() => onOpenStory(item)}
            >
              <View style={[styles.storyCircle, hasUnread && styles.storyCircleUnread]}>
                {storyImage ? (
                  <Image source={{ uri: storyImage }} style={styles.storyImage} contentFit="cover" />
                ) : (
                  <View style={styles.storyFallback}>
                    <MaterialCommunityIcons name="image-outline" size={18} color={palette.textMuted} />
                  </View>
                )}
                {hasUnread ? <View style={styles.unreadDot} /> : null}
              </View>

              <Text numberOfLines={1} style={styles.storyLabel}>
                {item.title}
              </Text>

              <View style={[styles.typeBadge, { backgroundColor: `${typeBadgeColor(item.type)}1A` }]}>
                <Text style={[styles.typeBadgeText, { color: typeBadgeColor(item.type) }]}>
                  {typeBadgeLabel(item.type)}
                </Text>
              </View>
            </Pressable>
          );
        })}
      </ScrollView>
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
  caption: {
    textAlign: "right",
    color: palette.text,
    fontWeight: "800",
    fontSize: 16,
  },
  storiesScroll: {
    flexDirection: "row-reverse",
    gap: spacing.sm,
    paddingHorizontal: 2,
  },
  storyItem: {
    width: 88,
    alignItems: "center",
    gap: 6,
  },
  storyItemPressed: {
    opacity: 0.82,
  },
  storyCircle: {
    width: 70,
    height: 70,
    borderRadius: 999,
    borderWidth: 2,
    borderColor: "#D7E3F1",
    backgroundColor: "#EEF3FA",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  storyCircleUnread: {
    borderColor: palette.primary,
  },
  storyImage: {
    width: "100%",
    height: "100%",
  },
  storyFallback: {
    width: "100%",
    height: "100%",
    alignItems: "center",
    justifyContent: "center",
  },
  unreadDot: {
    position: "absolute",
    top: 4,
    right: 4,
    width: 10,
    height: 10,
    borderRadius: 99,
    backgroundColor: "#E65252",
    borderWidth: 1,
    borderColor: "#FFFFFF",
  },
  storyLabel: {
    textAlign: "center",
    color: palette.text,
    fontWeight: "700",
    fontSize: 12,
    width: "100%",
  },
  typeBadge: {
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  typeBadgeText: {
    fontSize: 10,
    fontWeight: "700",
  },
});
