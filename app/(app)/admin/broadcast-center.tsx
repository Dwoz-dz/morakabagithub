import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import { Image } from "expo-image";
import { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";

import { FACTION_OPTIONS } from "@/src/constants/factions";
import {
  type Announcement,
  type AnnouncementTargetRole,
  type AnnouncementType,
} from "@/src/models";
import { AnnouncementsService } from "@/src/services/supabase/announcements.service";
import {
  resolveStoragePathOrUrl,
  uploadAnnouncementMediaFile,
} from "@/src/services/supabase/storage.service";
import { useAuthStore } from "@/src/store/auth.store";
import { palette, radius, shadows, spacing, typography } from "@/src/theme/tokens";
import { pickSingleImage } from "@/src/utils/image-picker";

const ROLE_OPTIONS: AnnouncementTargetRole[] = ["all", "member", "admin"];
const TYPE_OPTIONS: AnnouncementType[] = [
  "info",
  "urgent",
  "telegram",
  "reward",
  "good_news",
];

const ROLE_LABELS: Record<AnnouncementTargetRole, string> = {
  all: "الكل",
  member: "الموظفون",
  admin: "المدير",
};

const TYPE_LABELS: Record<AnnouncementType, string> = {
  info: "عام",
  urgent: "عاجل",
  telegram: "تلغرام",
  reward: "مكافأة",
  good_news: "خبر سار",
};

const CHANNEL_LABELS = {
  ticker: "الشريط الذكي",
  stories: "الستوري",
  feed: "الخلاصة",
};

const isExternalUrl = (value: string): boolean => /^https?:\/\//i.test(value);

const toUiDateTimeValue = (value: string | null): string => (value ? value : "");

const fromUiDateTimeValue = (value: string): string | null => {
  const trimmed = value.trim();
  if (!trimmed.length) return null;

  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed.toISOString();
};

const formatCompactDate = (value: string): string =>
  new Date(value).toLocaleString("ar-DZ", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });

export default function BroadcastCenterScreen() {
  const employee = useAuthStore((state) => state.employee);

  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [readStats, setReadStats] = useState<Record<string, { feedReads: number; storyOpens: number }>>({});
  const [resolvedImageUrls, setResolvedImageUrls] = useState<Record<string, string | null>>({});

  const [editingId, setEditingId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [type, setType] = useState<AnnouncementType>("info");
  const [emoji, setEmoji] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [targetRoles, setTargetRoles] = useState<AnnouncementTargetRole[]>(["all"]);
  const [targetFactions, setTargetFactions] = useState<string[]>(["all"]);
  const [showInTicker, setShowInTicker] = useState(true);
  const [showInStories, setShowInStories] = useState(true);
  const [showInFeed, setShowInFeed] = useState(true);
  const [priorityInput, setPriorityInput] = useState("0");
  const [isActive, setIsActive] = useState(true);
  const [startsAtInput, setStartsAtInput] = useState("");
  const [expiresAtInput, setExpiresAtInput] = useState("");

  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const titleText = editingId ? "مركز البث (وضع التعديل)" : "مركز البث";
  const submitLabel = editingId ? "تحديث الإعلان" : "إنشاء إعلان";

  const resetForm = useCallback(() => {
    setEditingId(null);
    setTitle("");
    setMessage("");
    setType("info");
    setEmoji("");
    setImageUrl("");
    setPreviewUrl(null);
    setTargetRoles(["all"]);
    setTargetFactions(["all"]);
    setShowInTicker(true);
    setShowInStories(true);
    setShowInFeed(true);
    setPriorityInput("0");
    setIsActive(true);
    setStartsAtInput("");
    setExpiresAtInput("");
  }, []);

  const resolveAnnouncementImage = useCallback(async (rawPathOrUrl: string | null) => {
    if (!rawPathOrUrl) {
      return null;
    }

    const resolveResult = await resolveStoragePathOrUrl({
      bucket: "announcements-media",
      pathOrUrl: rawPathOrUrl,
      expiresIn: 3600,
    });
    return resolveResult.url ?? null;
  }, []);

  const hydrateImages = useCallback(
    async (items: Announcement[]) => {
      const imageCandidates = items.filter((item) => item.imageUrl);
      if (!imageCandidates.length) {
        setResolvedImageUrls({});
        return;
      }

      const pairs = await Promise.all(
        imageCandidates.map(async (item) => ({
          id: item.id,
          url: await resolveAnnouncementImage(item.imageUrl),
        })),
      );

      const nextMap: Record<string, string | null> = {};
      pairs.forEach((pair) => {
        nextMap[pair.id] = pair.url;
      });
      setResolvedImageUrls(nextMap);
    },
    [resolveAnnouncementImage],
  );

  const loadData = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const listResult = await AnnouncementsService.adminListAll(260);
      if (listResult.error) {
        setError(listResult.error);
        setAnnouncements([]);
        setReadStats({});
        setResolvedImageUrls({});
        setIsLoading(false);
        return;
      }

      const items = listResult.data ?? [];
      setAnnouncements(items);

      const ids = items.map((item) => item.id);
      const statsResult = await AnnouncementsService.adminListReadStats(ids);
      if (statsResult.error) {
        setError(statsResult.error);
      } else {
        setReadStats(statsResult.data ?? {});
      }

      await hydrateImages(items);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "تعذر تحميل مركز البث.");
      setAnnouncements([]);
      setReadStats({});
      setResolvedImageUrls({});
    } finally {
      setIsLoading(false);
    }
  }, [hydrateImages]);

  useFocusEffect(
    useCallback(() => {
      void loadData();
    }, [loadData]),
  );

  const toggleRole = useCallback((role: AnnouncementTargetRole) => {
    setTargetRoles((previous) => {
      if (role === "all") {
        return ["all"];
      }

      const withoutAll = previous.filter((item) => item !== "all");
      if (withoutAll.includes(role)) {
        const next = withoutAll.filter((item) => item !== role);
        return next.length ? next : ["all"];
      }

      return [...withoutAll, role];
    });
  }, []);

  const toggleFaction = useCallback((faction: string) => {
    setTargetFactions((previous) => {
      if (faction === "all") {
        return ["all"];
      }

      const withoutAll = previous.filter((item) => item !== "all");
      if (withoutAll.includes(faction)) {
        const next = withoutAll.filter((item) => item !== faction);
        return next.length ? next : ["all"];
      }

      return [...withoutAll, faction];
    });
  }, []);

  const onPickAndUploadImage = useCallback(async () => {
    setError(null);
    setSuccess(null);

    const userId = employee?.authUserId ?? "";
    if (!userId.trim()) {
      setError("تعذر التحقق من جلسة المدير الحالية.");
      return;
    }

    const picked = await pickSingleImage();
    if (!picked) {
      return;
    }

    setIsUploading(true);
    try {
      const uploadResult = await uploadAnnouncementMediaFile({
        userId,
        fileUri: picked.uri,
        fileName: picked.fileName,
        contentType: picked.mimeType,
      });

      if (uploadResult.error || !uploadResult.path) {
        setError(uploadResult.error ?? "فشل رفع الصورة.");
        return;
      }

      setImageUrl(uploadResult.path);
      const signedUrl = await resolveAnnouncementImage(uploadResult.path);
      setPreviewUrl(signedUrl);
      setSuccess("تم رفع الصورة وربطها بهذا الإعلان.");
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "فشل رفع الصورة.");
    } finally {
      setIsUploading(false);
    }
  }, [employee?.authUserId, resolveAnnouncementImage]);

  const onResolveManualImageUrl = useCallback(async () => {
    setError(null);
    setSuccess(null);

    const rawValue = imageUrl.trim();
    if (!rawValue.length) {
      setPreviewUrl(null);
      return;
    }

    const resolved = await resolveAnnouncementImage(rawValue);
    setPreviewUrl(resolved);
    if (!resolved && !isExternalUrl(rawValue)) {
      setError("تعذر تحويل مسار التخزين إلى رابط عرض.");
    }
  }, [imageUrl, resolveAnnouncementImage]);

  const onSave = useCallback(async () => {
    setIsSaving(true);
    setError(null);
    setSuccess(null);

    try {
      const priority = Number.parseInt(priorityInput.trim() || "0", 10);
      const payload = {
        title: title.trim(),
        message: message.trim(),
        type,
        emoji: emoji.trim() || null,
        imageUrl: imageUrl.trim() || null,
        targetRoles,
        targetFactions,
        showInTicker,
        showInStories,
        showInFeed,
        priority: Number.isFinite(priority) ? priority : 0,
        isActive,
        startsAt: fromUiDateTimeValue(startsAtInput),
        expiresAt: fromUiDateTimeValue(expiresAtInput),
      };

      const result = editingId
        ? await AnnouncementsService.adminUpdateAnnouncement({ id: editingId, ...payload })
        : await AnnouncementsService.adminCreateAnnouncement(payload);

      if (result.error) {
        setError(result.error);
        setIsSaving(false);
        return;
      }

      setSuccess(editingId ? "تم تحديث الإعلان." : "تم إنشاء الإعلان.");
      resetForm();
      await loadData();
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "تعذر حفظ الإعلان.");
    } finally {
      setIsSaving(false);
    }
  }, [
    editingId,
    emoji,
    expiresAtInput,
    imageUrl,
    isActive,
    loadData,
    message,
    priorityInput,
    resetForm,
    showInFeed,
    showInStories,
    showInTicker,
    startsAtInput,
    targetFactions,
    targetRoles,
    title,
    type,
  ]);

  const onStartEdit = useCallback(
    async (item: Announcement) => {
      setError(null);
      setSuccess(null);

      setEditingId(item.id);
      setTitle(item.title);
      setMessage(item.message);
      setType(item.type);
      setEmoji(item.emoji ?? "");
      setImageUrl(item.imageUrl ?? "");
      setTargetRoles(item.targetRoles.length ? item.targetRoles : ["all"]);
      setTargetFactions(item.targetFactions.length ? item.targetFactions : ["all"]);
      setShowInTicker(item.showInTicker);
      setShowInStories(item.showInStories);
      setShowInFeed(item.showInFeed);
      setPriorityInput(String(item.priority));
      setIsActive(item.isActive);
      setStartsAtInput(toUiDateTimeValue(item.startsAt));
      setExpiresAtInput(toUiDateTimeValue(item.expiresAt));

      const resolved = item.id in resolvedImageUrls ? resolvedImageUrls[item.id] : await resolveAnnouncementImage(item.imageUrl);
      setPreviewUrl(resolved);
    },
    [resolveAnnouncementImage, resolvedImageUrls],
  );

  const onToggleActive = useCallback(
    async (item: Announcement) => {
      setError(null);
      setSuccess(null);
      const result = await AnnouncementsService.adminToggleActive(item.id, !item.isActive);
      if (result.error) {
        setError(result.error);
        return;
      }

      setSuccess(result.data?.isActive ? "تم تفعيل الإعلان." : "تم إيقاف الإعلان.");
      await loadData();
    },
    [loadData],
  );

  const onDelete = useCallback(
    (announcementId: string) => {
      Alert.alert("حذف الإعلان", "لا يمكن التراجع عن هذا الإجراء.", [
        { text: "إلغاء", style: "cancel" },
        {
          text: "حذف",
          style: "destructive",
          onPress: () => {
            void (async () => {
              setError(null);
              setSuccess(null);
              const result = await AnnouncementsService.adminDeleteAnnouncement(announcementId);
              if (result.error) {
                setError(result.error);
                return;
              }
              setSuccess("تم حذف الإعلان.");
              if (editingId === announcementId) {
                resetForm();
              }
              await loadData();
            })();
          },
        },
      ]);
    },
    [editingId, loadData, resetForm],
  );

  const channelsHint = useMemo(() => {
    const labels: string[] = [];
    if (showInTicker) labels.push(CHANNEL_LABELS.ticker);
    if (showInStories) labels.push(CHANNEL_LABELS.stories);
    if (showInFeed) labels.push(CHANNEL_LABELS.feed);
    return labels.join(" | ");
  }, [showInFeed, showInStories, showInTicker]);

  return (
    <ScrollView
      contentContainerStyle={styles.container}
      contentInsetAdjustmentBehavior="automatic"
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.card}>
        <Text style={styles.title}>{titleText}</Text>
        <Text style={styles.subtitle}>
          أنشئ بثًا موجّهًا للشريط الذكي والستوري والخلاصة مع استهداف دقيق للفئات والفصائل.
        </Text>

        <TextInput
          style={styles.input}
          value={title}
          onChangeText={setTitle}
          placeholder="عنوان الإعلان"
          placeholderTextColor={palette.textMuted}
          textAlign="right"
        />

        <TextInput
          style={[styles.input, styles.messageInput]}
          value={message}
          onChangeText={setMessage}
          placeholder="نص الإعلان"
          placeholderTextColor={palette.textMuted}
          textAlign="right"
          multiline
        />

        <View style={styles.row}>
          <TextInput
            style={[styles.input, styles.rowInput]}
            value={emoji}
            onChangeText={setEmoji}
            placeholder="رمز تعبيري (اختياري)"
            placeholderTextColor={palette.textMuted}
            textAlign="right"
            maxLength={8}
          />
          <TextInput
            style={[styles.input, styles.rowInput]}
            value={priorityInput}
            onChangeText={setPriorityInput}
            placeholder="الأولوية (رقم)"
            placeholderTextColor={palette.textMuted}
            textAlign="right"
            keyboardType="numeric"
          />
        </View>

        <View style={styles.selectorWrap}>
          <Text style={styles.selectorTitle}>النوع</Text>
          <View style={styles.selectorRowWrap}>
            {TYPE_OPTIONS.map((option) => (
              <Pressable
                key={option}
                style={({ pressed }) => [
                  styles.selectorChip,
                  type === option && styles.selectorChipActive,
                  pressed && styles.selectorChipPressed,
                ]}
                onPress={() => setType(option)}
              >
                <Text style={[styles.selectorChipText, type === option && styles.selectorChipTextActive]}>
                  {TYPE_LABELS[option]}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        <View style={styles.selectorWrap}>
          <Text style={styles.selectorTitle}>الفئات المستهدفة</Text>
          <View style={styles.selectorRowWrap}>
            {ROLE_OPTIONS.map((option) => {
              const selected = targetRoles.includes(option);
              return (
                <Pressable
                  key={option}
                  style={({ pressed }) => [
                    styles.selectorChip,
                    selected && styles.selectorChipActive,
                    pressed && styles.selectorChipPressed,
                  ]}
                  onPress={() => toggleRole(option)}
                >
                  <Text style={[styles.selectorChipText, selected && styles.selectorChipTextActive]}>
                    {ROLE_LABELS[option]}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        <View style={styles.selectorWrap}>
          <Text style={styles.selectorTitle}>الفصائل المستهدفة</Text>
          <View style={styles.selectorRowWrap}>
            <Pressable
              style={({ pressed }) => [
                styles.selectorChip,
                targetFactions.includes("all") && styles.selectorChipActive,
                pressed && styles.selectorChipPressed,
              ]}
              onPress={() => toggleFaction("all")}
            >
              <Text
                style={[
                  styles.selectorChipText,
                  targetFactions.includes("all") && styles.selectorChipTextActive,
                ]}
              >
                كل الفصائل
              </Text>
            </Pressable>

            {FACTION_OPTIONS.map((option) => {
              const selected = targetFactions.includes(option);
              return (
                <Pressable
                  key={option}
                  style={({ pressed }) => [
                    styles.selectorChip,
                    selected && styles.selectorChipActive,
                    pressed && styles.selectorChipPressed,
                  ]}
                  onPress={() => toggleFaction(option)}
                >
                  <Text style={[styles.selectorChipText, selected && styles.selectorChipTextActive]}>
                    {option}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        <View style={styles.toggleRow}>
          <View style={styles.toggleItem}>
            <Text style={styles.toggleLabel}>إظهار في الشريط الذكي</Text>
            <Switch value={showInTicker} onValueChange={setShowInTicker} />
          </View>
          <View style={styles.toggleItem}>
            <Text style={styles.toggleLabel}>إظهار في الستوري</Text>
            <Switch value={showInStories} onValueChange={setShowInStories} />
          </View>
          <View style={styles.toggleItem}>
            <Text style={styles.toggleLabel}>إظهار في الخلاصة</Text>
            <Switch value={showInFeed} onValueChange={setShowInFeed} />
          </View>
        </View>
        <Text style={styles.channelsHint}>{channelsHint || "لم يتم اختيار قناة عرض"}</Text>

        <View style={styles.toggleItemSingle}>
          <Text style={styles.toggleLabel}>نشط</Text>
          <Switch value={isActive} onValueChange={setIsActive} />
        </View>

        <View style={styles.row}>
          <TextInput
            style={[styles.input, styles.rowInput]}
            value={startsAtInput}
            onChangeText={setStartsAtInput}
            placeholder="يبدأ في (ISO)"
            placeholderTextColor={palette.textMuted}
            textAlign="right"
          />
          <TextInput
            style={[styles.input, styles.rowInput]}
            value={expiresAtInput}
            onChangeText={setExpiresAtInput}
            placeholder="ينتهي في (ISO)"
            placeholderTextColor={palette.textMuted}
            textAlign="right"
          />
        </View>

        <View style={styles.imageSection}>
          <TextInput
            style={styles.input}
            value={imageUrl}
            onChangeText={setImageUrl}
            placeholder="رابط الصورة أو مسار التخزين"
            placeholderTextColor={palette.textMuted}
            textAlign="right"
          />
          <View style={styles.imageActionsRow}>
            <Pressable
              style={({ pressed }) => [styles.secondaryButton, pressed && styles.buttonPressed]}
              onPress={() => void onResolveManualImageUrl()}
            >
              <Text style={styles.secondaryButtonText}>معاينة الصورة</Text>
            </Pressable>
            <Pressable
              style={({ pressed }) => [
                styles.secondaryButton,
                pressed && styles.buttonPressed,
                isUploading && styles.buttonDisabled,
              ]}
              onPress={() => void onPickAndUploadImage()}
              disabled={isUploading}
            >
              {isUploading ? (
                <ActivityIndicator color={palette.primary} />
              ) : (
                <Text style={styles.secondaryButtonText}>رفع من الجهاز</Text>
              )}
            </Pressable>
          </View>

          {previewUrl ? (
            <Image source={{ uri: previewUrl }} style={styles.previewImage} contentFit="cover" />
          ) : null}
        </View>

        {error ? <Text style={styles.errorText}>{error}</Text> : null}
        {success ? <Text style={styles.successText}>{success}</Text> : null}

        <View style={styles.formActionsRow}>
          <Pressable
            style={({ pressed }) => [
              styles.submitButton,
              pressed && styles.buttonPressed,
              isSaving && styles.buttonDisabled,
            ]}
            onPress={() => void onSave()}
            disabled={isSaving}
          >
            {isSaving ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <>
                <MaterialCommunityIcons name="content-save-outline" size={16} color="#FFFFFF" />
                <Text style={styles.submitButtonText}>{submitLabel}</Text>
              </>
            )}
          </Pressable>

          <Pressable
            style={({ pressed }) => [styles.cancelButton, pressed && styles.buttonPressed]}
            onPress={resetForm}
          >
            <Text style={styles.cancelButtonText}>إعادة ضبط النموذج</Text>
          </Pressable>
        </View>
      </View>

      <View style={styles.card}>
        <View style={styles.listHeader}>
          <Text style={styles.sectionTitle}>سجل الإعلانات</Text>
          <Pressable style={({ pressed }) => [styles.refreshPill, pressed && styles.buttonPressed]} onPress={() => void loadData()}>
            <Text style={styles.refreshPillText}>تحديث</Text>
          </Pressable>
        </View>

        {isLoading ? (
          <View style={styles.loadingBox}>
            <ActivityIndicator color={palette.primary} />
            <Text style={styles.loadingText}>جارٍ تحميل الإعلانات...</Text>
          </View>
        ) : null}

        {!isLoading && !announcements.length ? (
          <Text style={styles.emptyText}>لا توجد إعلانات بعد.</Text>
        ) : null}

        {announcements.map((item) => {
          const stats = readStats[item.id] ?? { feedReads: 0, storyOpens: 0 };
          const rowImageUrl = resolvedImageUrls[item.id] ?? null;

          return (
            <View key={item.id} style={styles.itemRow}>
              <View style={styles.itemTopRow}>
                <View
                  style={[
                    styles.statusBadge,
                    item.isActive ? styles.statusBadgeActive : styles.statusBadgeInactive,
                  ]}
                >
                  <Text
                    style={[
                      styles.statusBadgeText,
                      item.isActive ? styles.statusBadgeTextActive : styles.statusBadgeTextInactive,
                    ]}
                  >
                    {item.isActive ? "نشط" : "غير نشط"}
                  </Text>
                </View>
                <Text style={styles.itemDate}>{formatCompactDate(item.createdAt)}</Text>
              </View>

              <Text style={styles.itemTitle}>
                {item.emoji ? `${item.emoji} ` : ""}
                {item.title}
              </Text>
              <Text style={styles.itemMessage}>{item.message}</Text>

              {rowImageUrl ? <Image source={{ uri: rowImageUrl }} style={styles.itemImage} contentFit="cover" /> : null}

              <View style={styles.metaRow}>
                <Text style={styles.metaText}>النوع: {TYPE_LABELS[item.type]}</Text>
                <Text style={styles.metaText}>الأولوية: {item.priority}</Text>
              </View>
              <View style={styles.metaRow}>
                <Text style={styles.metaText}>
                  الفئات: {item.targetRoles.map((role) => ROLE_LABELS[role]).join("، ")}
                </Text>
                <Text style={styles.metaText}>
                  الفصائل: {item.targetFactions.includes("all") ? "كل الفصائل" : item.targetFactions.join("، ")}
                </Text>
              </View>
              <View style={styles.metaRow}>
                <Text style={styles.metaText}>القنوات: {[
                  item.showInTicker ? CHANNEL_LABELS.ticker : null,
                  item.showInStories ? CHANNEL_LABELS.stories : null,
                  item.showInFeed ? CHANNEL_LABELS.feed : null,
                ].filter(Boolean).join(" | ")}</Text>
              </View>
              <View style={styles.metaRow}>
                <Text style={styles.metaText}>فتحات الستوري: {stats.storyOpens}</Text>
                <Text style={styles.metaText}>قراءات الخلاصة: {stats.feedReads}</Text>
              </View>

              <View style={styles.itemActionsRow}>
                <Pressable
                  style={({ pressed }) => [styles.rowButton, pressed && styles.buttonPressed]}
                  onPress={() => void onStartEdit(item)}
                >
                  <Text style={styles.rowButtonText}>تعديل</Text>
                </Pressable>
                <Pressable
                  style={({ pressed }) => [styles.rowButton, pressed && styles.buttonPressed]}
                  onPress={() => void onToggleActive(item)}
                >
                  <Text style={styles.rowButtonText}>{item.isActive ? "إيقاف" : "تفعيل"}</Text>
                </Pressable>
                <Pressable
                  style={({ pressed }) => [
                    styles.rowButtonDanger,
                    pressed && styles.buttonPressed,
                  ]}
                  onPress={() => onDelete(item.id)}
                >
                  <Text style={styles.rowButtonDangerText}>حذف</Text>
                </Pressable>
              </View>
            </View>
          );
        })}
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
  input: {
    borderWidth: 1,
    borderColor: palette.line,
    borderRadius: radius.md,
    backgroundColor: palette.surfaceMuted,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    color: palette.text,
  },
  messageInput: {
    minHeight: 96,
    textAlignVertical: "top",
  },
  row: {
    flexDirection: "row-reverse",
    gap: spacing.sm,
  },
  rowInput: {
    flex: 1,
  },
  selectorWrap: {
    gap: spacing.sm,
  },
  selectorTitle: {
    textAlign: "right",
    color: palette.text,
    fontWeight: "700",
    fontSize: typography.body,
  },
  selectorRowWrap: {
    flexDirection: "row-reverse",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  selectorChip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: palette.line,
    backgroundColor: palette.surfaceMuted,
    paddingVertical: 7,
    paddingHorizontal: spacing.md,
  },
  selectorChipActive: {
    borderColor: palette.primary,
    backgroundColor: "#E8F1FF",
  },
  selectorChipPressed: {
    opacity: 0.84,
  },
  selectorChipText: {
    color: palette.text,
    fontWeight: "700",
  },
  selectorChipTextActive: {
    color: palette.primaryDark,
  },
  toggleRow: {
    flexDirection: "row-reverse",
    flexWrap: "wrap",
    gap: spacing.sm,
    justifyContent: "space-between",
  },
  toggleItem: {
    width: "31%",
    borderWidth: 1,
    borderColor: palette.line,
    borderRadius: radius.md,
    backgroundColor: palette.surfaceMuted,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    alignItems: "center",
    gap: 6,
  },
  toggleItemSingle: {
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "space-between",
    borderWidth: 1,
    borderColor: palette.line,
    borderRadius: radius.md,
    backgroundColor: palette.surfaceMuted,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  toggleLabel: {
    color: palette.text,
    fontWeight: "700",
    textAlign: "center",
    fontSize: 12,
  },
  channelsHint: {
    textAlign: "right",
    color: palette.textMuted,
    fontSize: 12,
    fontWeight: "600",
  },
  imageSection: {
    gap: spacing.sm,
  },
  imageActionsRow: {
    flexDirection: "row-reverse",
    gap: spacing.sm,
  },
  previewImage: {
    width: "100%",
    height: 180,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: palette.line,
    backgroundColor: palette.surfaceMuted,
  },
  secondaryButton: {
    flex: 1,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: palette.line,
    backgroundColor: palette.surfaceMuted,
    paddingVertical: spacing.sm,
    alignItems: "center",
    justifyContent: "center",
  },
  secondaryButtonText: {
    color: palette.text,
    fontWeight: "700",
    fontSize: 12,
  },
  formActionsRow: {
    flexDirection: "row-reverse",
    gap: spacing.sm,
  },
  submitButton: {
    flex: 1,
    borderRadius: radius.md,
    backgroundColor: palette.primary,
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    paddingVertical: spacing.md,
  },
  submitButtonText: {
    color: "#FFFFFF",
    fontWeight: "800",
    fontSize: 13,
  },
  cancelButton: {
    flex: 1,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: palette.line,
    backgroundColor: palette.surfaceMuted,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: spacing.md,
  },
  cancelButtonText: {
    color: palette.text,
    fontWeight: "700",
    fontSize: 12,
  },
  buttonPressed: {
    opacity: 0.84,
  },
  buttonDisabled: {
    opacity: 0.65,
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
  listHeader: {
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "space-between",
  },
  sectionTitle: {
    textAlign: "right",
    color: palette.text,
    fontWeight: "800",
    fontSize: 18,
  },
  refreshPill: {
    borderRadius: 999,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: palette.line,
    backgroundColor: palette.surfaceMuted,
  },
  refreshPillText: {
    color: palette.primaryDark,
    fontWeight: "700",
    fontSize: 12,
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
    fontWeight: "600",
  },
  emptyText: {
    textAlign: "right",
    color: palette.textMuted,
    fontWeight: "600",
  },
  itemRow: {
    borderWidth: 1,
    borderColor: palette.line,
    borderRadius: radius.lg,
    backgroundColor: palette.surfaceMuted,
    padding: spacing.md,
    gap: spacing.sm,
  },
  itemTopRow: {
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "space-between",
  },
  statusBadge: {
    borderRadius: 999,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
  },
  statusBadgeActive: {
    backgroundColor: "#E8FAEF",
  },
  statusBadgeInactive: {
    backgroundColor: "#FFF0F0",
  },
  statusBadgeText: {
    fontWeight: "800",
    fontSize: 11,
  },
  statusBadgeTextActive: {
    color: "#0B7A46",
  },
  statusBadgeTextInactive: {
    color: "#B42318",
  },
  itemDate: {
    color: palette.textMuted,
    fontSize: 11,
    fontWeight: "600",
  },
  itemTitle: {
    textAlign: "right",
    color: palette.text,
    fontWeight: "800",
    fontSize: 15,
  },
  itemMessage: {
    textAlign: "right",
    color: palette.text,
    lineHeight: 20,
  },
  itemImage: {
    width: "100%",
    height: 140,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: palette.line,
    backgroundColor: palette.surface,
  },
  metaRow: {
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  metaText: {
    flex: 1,
    textAlign: "right",
    color: palette.textMuted,
    fontWeight: "600",
    fontSize: 12,
  },
  itemActionsRow: {
    flexDirection: "row-reverse",
    gap: spacing.sm,
  },
  rowButton: {
    flex: 1,
    borderWidth: 1,
    borderColor: palette.line,
    borderRadius: radius.md,
    backgroundColor: palette.surface,
    paddingVertical: spacing.sm,
    alignItems: "center",
  },
  rowButtonText: {
    color: palette.text,
    fontWeight: "700",
    fontSize: 12,
  },
  rowButtonDanger: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#F5C2C9",
    borderRadius: radius.md,
    backgroundColor: "#FCEAEC",
    paddingVertical: spacing.sm,
    alignItems: "center",
  },
  rowButtonDangerText: {
    color: palette.danger,
    fontWeight: "700",
    fontSize: 12,
  },
});
