import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import { useRouter, type Href } from "expo-router";
import { Image } from "expo-image";
import { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import {
  DEFAULT_REMINDER_CONFIG,
  type AnnouncementWithReadState,
  type Presence,
  WEEKLY_REST_DAY_LABELS,
  WEAPON_SUBMISSION_STATUSES,
  type NotificationItem,
  type ReminderCountdown,
  type WeeklyRestAssignment,
} from "@/src/models";
import { LatestUpdatesFeed } from "@/src/components/social/latest-updates-feed";
import { SmartTicker } from "@/src/components/social/smart-ticker";
import { StoriesRow } from "@/src/components/social/stories-row";
import { AnnouncementsService } from "@/src/services/supabase/announcements.service";
import { AppSettingsService } from "@/src/services/supabase/app-settings.service";
import { FuelService } from "@/src/services/supabase/fuel.service";
import { NotificationsService } from "@/src/services/supabase/notifications.service";
import { PresenceService } from "@/src/services/supabase/presence.service";
import { RemindersService } from "@/src/services/supabase/reminders.service";
import { resolveStoragePathOrUrl } from "@/src/services/supabase/storage.service";
import { VehiclesService } from "@/src/services/supabase/vehicles.service";
import { WeaponService } from "@/src/services/supabase/weapon.service";
import { WeeklyRestService } from "@/src/services/supabase/weekly-rest.service";
import { useAuthStore } from "@/src/store/auth.store";
import { useFactionChatStore } from "@/src/store/faction-chat.store";
import { palette, radius, shadows, spacing, typography } from "@/src/theme/tokens";
import { formatDateTime } from "@/src/utils/formatting";

interface MemberMetrics {
  unreadNotifications: number;
  weeklyRestAssignments: number;
  pendingFuelSubmissions: number;
  pendingWeaponSubmissions: number;
}

interface QuickAction {
  id: string;
  title: string;
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  route: Href;
  color: string;
}

interface DashboardAlert {
  id: string;
  text: string;
  tone: "info" | "success" | "danger";
}

const INITIAL_METRICS: MemberMetrics = {
  unreadNotifications: 0,
  weeklyRestAssignments: 0,
  pendingFuelSubmissions: 0,
  pendingWeaponSubmissions: 0,
};

const QUICK_ACTIONS: QuickAction[] = [
  { id: "notifications", title: "الإشعارات", icon: "bell-outline", route: "/(app)/member/notifications", color: "#18477D" },
  { id: "rest", title: "راحتي الأسبوعية", icon: "calendar-week", route: "/(app)/member/my-weekly-rest", color: "#0C6A4B" },
  { id: "fuel", title: "الوقود", icon: "fuel", route: "/(app)/member/fuel-form", color: "#9B3200" },
  { id: "weapon", title: "السلاح", icon: "shield-check-outline", route: "/(app)/member/weapon-verification", color: "#005A68" },
  { id: "profile", title: "ملفي الشخصي", icon: "account-circle-outline", route: "/(app)/member/profile", color: "#5B2A86" },
  { id: "support", title: "الدعم", icon: "lifebuoy", route: "/(app)/member/support", color: "#7D4E12" },
  { id: "devices", title: "الأجهزة", icon: "cellphone-link", route: "/(app)/member/linked-devices", color: "#2A6478" },
  { id: "settings", title: "الإعدادات", icon: "cog-outline", route: "/(app)/member/settings", color: "#444B5D" },
  { id: "terms", title: "الشروط", icon: "file-document-outline", route: "/(app)/member/terms", color: "#174A3E" },
];

const restSummary = (assignment: WeeklyRestAssignment | null): string => {
  if (!assignment) {
    return "لم يتم تحديد راحة أسبوعية جديدة بعد.";
  }

  const dayLabels = assignment.days.map((day) => WEEKLY_REST_DAY_LABELS[day]).join("، ");
  return `راحتك: ${dayLabels} (أسبوع ${assignment.weekStartDate}).`;
};

const truncateText = (value: string, maxLength = 92): string => {
  const normalized = value.trim();
  if (!normalized) {
    return "";
  }

  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, maxLength - 1)}…`;
};

const chatStatusText = (status: string): string => {
  if (status === "SUBSCRIBED") return "مباشر";
  if (status === "connecting") return "جارٍ الاتصال";
  if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
    return "إعادة الاتصال";
  }

  return "مزامنة";
};

const announcementTypeLabel = (type: AnnouncementWithReadState["type"] | null | undefined): string => {
  if (!type) return "عام";
  if (type === "urgent") return "عاجل";
  if (type === "telegram") return "تلغرام";
  if (type === "reward") return "مكافأة";
  if (type === "good_news") return "خبر سار";
  return "عام";
};

export default function MemberDashboardScreen() {
  const router = useRouter();
  const signOut = useAuthStore((state) => state.signOut);
  const bootstrap = useAuthStore((state) => state.bootstrap);
  const employee = useAuthStore((state) => state.employee);
  const unreadByFaction = useFactionChatStore((state) => state.unreadByFaction);
  const latestMessageByFaction = useFactionChatStore((state) => state.latestMessageByFaction);
  const chatRealtimeStatus = useFactionChatStore((state) => state.realtimeStatus);

  const [metrics, setMetrics] = useState<MemberMetrics>(INITIAL_METRICS);
  const [latestNotifications, setLatestNotifications] = useState<NotificationItem[]>([]);
  const [alerts, setAlerts] = useState<DashboardAlert[]>([]);
  const [reminderCountdowns, setReminderCountdowns] = useState<ReminderCountdown[]>([]);
  const [avatarPreviewUrl, setAvatarPreviewUrl] = useState<string | null>(null);
  const [tickerAnnouncements, setTickerAnnouncements] = useState<AnnouncementWithReadState[]>([]);
  const [storiesAnnouncements, setStoriesAnnouncements] = useState<AnnouncementWithReadState[]>([]);
  const [feedAnnouncements, setFeedAnnouncements] = useState<AnnouncementWithReadState[]>([]);
  const [storiesImageUrls, setStoriesImageUrls] = useState<Record<string, string | null>>({});
  const [feedImageUrls, setFeedImageUrls] = useState<Record<string, string | null>>({});
  const [selectedStory, setSelectedStory] = useState<AnnouncementWithReadState | null>(null);
  const [selectedStoryImageUrl, setSelectedStoryImageUrl] = useState<string | null>(null);
  const [isStoryViewerVisible, setIsStoryViewerVisible] = useState(false);
  const [isDrawerVisible, setIsDrawerVisible] = useState(false);
  const [onlineUsers, setOnlineUsers] = useState<Presence[]>([]);
  const [recentUsers, setRecentUsers] = useState<Presence[]>([]);
  const [presenceAvatarUrls, setPresenceAvatarUrls] = useState<Record<string, string | null>>({});

  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const resolveAnnouncementImages = useCallback(
    async (items: AnnouncementWithReadState[]) => {
      const withImage = items.filter((item) => Boolean(item.imageUrl));
      if (!withImage.length) {
        return {} as Record<string, string | null>;
      }

      const pairs = await Promise.all(
        withImage.map(async (item) => {
          const resolveResult = await resolveStoragePathOrUrl({
            bucket: "announcements-media",
            pathOrUrl: item.imageUrl,
            expiresIn: 3600,
          });

          return { id: item.id, url: resolveResult.url ?? null };
        }),
      );

      const map: Record<string, string | null> = {};
      pairs.forEach((pair) => {
        map[pair.id] = pair.url;
      });

      return map;
    },
    [],
  );

  const resolvePresenceAvatars = useCallback(async (items: Presence[]) => {
    const withAvatar = items.filter((item) => Boolean(item.avatarUrl));
    if (!withAvatar.length) {
      return {} as Record<string, string | null>;
    }

    const pairs = await Promise.all(
      withAvatar.map(async (item) => {
        const resolveResult = await resolveStoragePathOrUrl({
          bucket: "profile-avatars",
          pathOrUrl: item.avatarUrl,
          expiresIn: 3600,
        });

        return { id: item.userId, url: resolveResult.url ?? null };
      }),
    );

    const map: Record<string, string | null> = {};
    pairs.forEach((pair) => {
      map[pair.id] = pair.url;
    });

    return map;
  }, []);

  const loadDashboard = useCallback(
    async (pullToRefresh = false) => {
      if (pullToRefresh) {
        setIsRefreshing(true);
      } else {
        setIsLoading(true);
      }

      setError(null);
      try {
        if (!employee?.authUserId) {
          await bootstrap();
          setError("تعذر تحميل حساب الموظف، حاول تحديث الصفحة.");
          return;
        }

        if (employee.avatarUrl) {
          const avatarResult = await resolveStoragePathOrUrl({
            bucket: "profile-avatars",
            pathOrUrl: employee.avatarUrl,
            expiresIn: 3600,
          });
          setAvatarPreviewUrl(avatarResult.url ?? null);
        } else {
          setAvatarPreviewUrl(null);
        }

        const [
          notificationsResult,
          restResult,
          fuelResult,
          weaponResult,
          vehiclesResult,
          settingsResult,
          reminderConfigResult,
          tickerResult,
          storiesResult,
          feedResult,
          onlinePresenceResult,
          recentPresenceResult,
        ] = await Promise.all([
          NotificationsService.listMy(100),
          WeeklyRestService.listMyAssignments(12),
          FuelService.listForCurrentUser(100),
          WeaponService.listForCurrentUser(100),
          VehiclesService.listAvailableForCurrentUser(),
          AppSettingsService.listSettings(),
          RemindersService.getReminderConfig(),
          AnnouncementsService.listTickerAnnouncementsForCurrentUser(),
          AnnouncementsService.listStoriesForCurrentUser(),
          AnnouncementsService.listFeedAnnouncementsForCurrentUser(),
          PresenceService.listVisibleOnlineUsers(36),
          PresenceService.listVisibleRecentUsers(60),
        ]);

        const notifications = notificationsResult.data ?? [];
        const restAssignments = restResult.data ?? [];
        const fuelEntries = fuelResult.data ?? [];
        const weaponEntries = weaponResult.data ?? [];
        const vehicles = (vehiclesResult.data ?? []).filter((vehicle) =>
          employee.faction ? vehicle.faction === employee.faction : true,
        );
        const settings = settingsResult.data ?? [];
        const reminderConfig = reminderConfigResult.data ?? DEFAULT_REMINDER_CONFIG;
        const countdownRows = RemindersService.buildCountdowns(reminderConfig);
        setReminderCountdowns(countdownRows);

        const tickerItems = tickerResult.data ?? [];
        const storiesItems = storiesResult.data ?? [];
        const feedItems = feedResult.data ?? [];
        const onlinePresenceItems = (onlinePresenceResult.data ?? []).filter(
          (item) => item.userId !== employee.authUserId,
        );
        const recentPresenceItems = (recentPresenceResult.data ?? []).filter(
          (item) => item.userId !== employee.authUserId,
        );

        setTickerAnnouncements(tickerItems);
        setStoriesAnnouncements(storiesItems);
        setFeedAnnouncements(feedItems);
        setOnlineUsers(onlinePresenceItems);
        setRecentUsers(recentPresenceItems);

        const [storiesMap, feedMap, presenceMap] = await Promise.all([
          resolveAnnouncementImages(storiesItems),
          resolveAnnouncementImages(feedItems),
          resolvePresenceAvatars(recentPresenceItems),
        ]);

        setStoriesImageUrls(storiesMap);
        setFeedImageUrls(feedMap);
        setPresenceAvatarUrls(presenceMap);

        const maintenanceThreshold = Number(
          settings.find((item) => item.key === "notifications_defaults")?.value?.maintenanceThresholdKm ?? 300,
        );
        const alertRows: DashboardAlert[] = [];

        const nextRest = restAssignments.find((item) => item.status === "active") ?? null;
        if (nextRest) {
          alertRows.push({
            id: `rest-${nextRest.id}`,
            text: restSummary(nextRest),
            tone: "info",
          });
        }

        const latestWeaponDecision = weaponEntries.find(
          (item) => item.status !== WEAPON_SUBMISSION_STATUSES.PENDING,
        );
        if (latestWeaponDecision?.status === WEAPON_SUBMISSION_STATUSES.REVIEWED) {
          alertRows.push({
            id: `weapon-ok-${latestWeaponDecision.id}`,
            text: "لقد تم قبول مراقبة سلاحك",
            tone: "success",
          });
        }
        if (latestWeaponDecision?.status === WEAPON_SUBMISSION_STATUSES.REJECTED) {
          alertRows.push({
            id: `weapon-reject-${latestWeaponDecision.id}`,
            text: "تم رفض مراقبة سلاحك، توجه إلى المكتب للمراقبة",
            tone: "danger",
          });
        }

        vehicles.forEach((vehicle) => {
          if (vehicle.maintenanceDueKm === null) {
            return;
          }

          const remaining = vehicle.maintenanceDueKm - vehicle.lastOdometer;
          if (remaining <= 0) {
            alertRows.push({
              id: `maint-late-${vehicle.id}`,
              text: `المركبة ${vehicle.name}: موعد الصيانة متأخر (${Math.abs(Math.round(remaining))} كم).`,
              tone: "danger",
            });
          } else if (remaining <= maintenanceThreshold) {
            alertRows.push({
              id: `maint-near-${vehicle.id}`,
              text: `المركبة ${vehicle.name}: بقي ${Math.round(remaining)} كم على موعد الصيانة.`,
              tone: "info",
            });
          }
        });

        countdownRows.forEach((row) => {
          if (!row.dueDate || row.daysRemaining === null) {
            return;
          }

          if (row.daysRemaining < 0) {
            alertRows.push({
              id: `rem-overdue-${row.type}`,
              text: `${row.title}: الموعد متجاوز (${row.dueDate}).`,
              tone: "danger",
            });
            return;
          }

          if (row.daysRemaining === 0) {
            alertRows.push({
              id: `rem-today-${row.type}`,
              text: `اليوم موعد ${row.title}.`,
              tone: "success",
            });
            return;
          }

          if (row.daysRemaining <= row.leadDays) {
            alertRows.push({
              id: `rem-near-${row.type}`,
              text: `تبقّى ${row.daysRemaining} يوم على ${row.title} (${row.dueDate}).`,
              tone: "info",
            });
          }
        });

        if (alertRows.length === 0) {
          alertRows.push({
            id: "no-alerts",
            text: "لا توجد تنبيهات حرجة الآن.",
            tone: "info",
          });
        }

        setMetrics({
          unreadNotifications: notifications.filter((item) => !item.isRead).length,
          weeklyRestAssignments: restAssignments.length,
          pendingFuelSubmissions: fuelEntries.filter((item) => item.status === "pending").length,
          pendingWeaponSubmissions: weaponEntries.filter((item) => item.status === "pending").length,
        });

        setLatestNotifications(notifications.slice(0, 3));
        setAlerts(alertRows.slice(0, 6));

        const firstError =
          notificationsResult.error ??
          restResult.error ??
          fuelResult.error ??
          weaponResult.error ??
          vehiclesResult.error ??
          settingsResult.error ??
          reminderConfigResult.error ??
          tickerResult.error ??
          storiesResult.error ??
          feedResult.error ??
          onlinePresenceResult.error ??
          recentPresenceResult.error ??
          null;

        setError(firstError);
      } catch (exception) {
        setError(exception instanceof Error ? exception.message : "حدث خطأ أثناء تحميل لوحة الموظف.");
      } finally {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    },
    [
      bootstrap,
      employee?.authUserId,
      employee?.avatarUrl,
      employee?.faction,
      resolveAnnouncementImages,
      resolvePresenceAvatars,
    ],
  );

  useFocusEffect(
    useCallback(() => {
      void loadDashboard(false);
    }, [loadDashboard]),
  );

  const openAnnouncementViewer = useCallback(
    async (
      announcement: AnnouncementWithReadState,
      imageMap: Record<string, string | null>,
    ) => {
      setSelectedStory(announcement);
      setIsStoryViewerVisible(true);

      const cached = imageMap[announcement.id] ?? null;
      if (cached) {
        setSelectedStoryImageUrl(cached);
        return;
      }

      if (!announcement.imageUrl) {
        setSelectedStoryImageUrl(null);
        return;
      }

      const resolveResult = await resolveStoragePathOrUrl({
        bucket: "announcements-media",
        pathOrUrl: announcement.imageUrl,
        expiresIn: 3600,
      });
      setSelectedStoryImageUrl(resolveResult.url ?? null);
    },
    [],
  );

  const handleOpenStory = useCallback(
    async (story: AnnouncementWithReadState) => {
      await openAnnouncementViewer(story, storiesImageUrls);

      if (story.hasOpenedStory) {
        return;
      }

      const result = await AnnouncementsService.markStoryOpened(story.id);
      if (result.error) {
        return;
      }

      const openedAt = result.data?.openedStoryAt ?? new Date().toISOString();

      const patchStoryRead = (item: AnnouncementWithReadState) =>
        item.id === story.id
          ? {
              ...item,
              hasOpenedStory: true,
              openedStoryAt: openedAt,
            }
          : item;

      setStoriesAnnouncements((prev) => prev.map(patchStoryRead));
      setFeedAnnouncements((prev) => prev.map(patchStoryRead));
      setTickerAnnouncements((prev) => prev.map(patchStoryRead));
    },
    [openAnnouncementViewer, storiesImageUrls],
  );

  const handleOpenFeedItem = useCallback(
    async (item: AnnouncementWithReadState) => {
      await openAnnouncementViewer(item, feedImageUrls);

      if (item.hasReadFeed) {
        return;
      }

      const result = await AnnouncementsService.markFeedRead(item.id);
      if (result.error) {
        return;
      }

      const readAt = result.data?.readFeedAt ?? new Date().toISOString();
      const patchFeedRead = (announcement: AnnouncementWithReadState) =>
        announcement.id === item.id
          ? {
              ...announcement,
              hasReadFeed: true,
              readFeedAt: readAt,
            }
          : announcement;

      setFeedAnnouncements((prev) => prev.map(patchFeedRead));
      setStoriesAnnouncements((prev) => prev.map(patchFeedRead));
      setTickerAnnouncements((prev) => prev.map(patchFeedRead));
    },
    [feedImageUrls, openAnnouncementViewer],
  );

  const closeStoryViewer = useCallback(() => {
    setIsStoryViewerVisible(false);
    setSelectedStory(null);
    setSelectedStoryImageUrl(null);
  }, []);

  const closeDrawer = useCallback(() => {
    setIsDrawerVisible(false);
  }, []);

  const openDrawer = useCallback(() => {
    setIsDrawerVisible(true);
  }, []);

  const openFactionChatFromDrawer = useCallback(() => {
    setIsDrawerVisible(false);
    router.push("/(app)/member/faction-chat" as Href);
  }, [router]);

  const openNotificationsFromDrawer = useCallback(() => {
    setIsDrawerVisible(false);
    router.push("/(app)/member/notifications");
  }, [router]);

  const formatLastSeen = useCallback((iso: string) => {
    const parsed = new Date(iso);
    if (Number.isNaN(parsed.getTime())) {
      return "--";
    }

    return formatDateTime(parsed);
  }, []);

  const factionKey = employee?.faction?.trim() ?? "";
  const factionChatUnread = factionKey ? unreadByFaction[factionKey] ?? 0 : 0;
  const totalChatUnread = useMemo(
    () => Object.values(unreadByFaction).reduce((sum, count) => sum + count, 0),
    [unreadByFaction],
  );
  const latestFactionMessage = factionKey ? latestMessageByFaction[factionKey] ?? null : null;
  const latestFactionPreview = latestFactionMessage ? truncateText(latestFactionMessage.content) : "";
  const chatPreviewText =
    factionChatUnread > 0
      ? `لديك ${factionChatUnread} رسائل جديدة من فصيلتك`
      : latestFactionPreview || "لا توجد رسائل جديدة في دردشة الفصيلة.";
  const chatStatusLabel = chatStatusText(chatRealtimeStatus);
  const chatBadgeText = totalChatUnread > 99 ? "99+" : `${totalChatUnread}`;

  const displayName = employee?.fullName?.trim() || "الموظف";
  const faction = employee?.faction?.trim() || "غير محددة";

  return (
    <SafeAreaView style={styles.safeArea} edges={["top"]}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={() => void loadDashboard(true)}
            tintColor={palette.primary}
            colors={[palette.primary]}
          />
        }
      >
        <View style={styles.heroCard}>
          <View style={styles.heroBubbleTop} />
          <View style={styles.heroBubbleBottom} />

          <View style={styles.heroTopRow}>
            <View style={styles.roleBadge}>
              <Text style={styles.roleBadgeText}>موظف</Text>
            </View>
            <View style={styles.heroTopActions}>
              <Pressable style={({ pressed }) => [styles.menuButton, pressed && styles.refreshPressed]} onPress={openDrawer}>
                <MaterialCommunityIcons name="menu" size={17} color="#FFFFFF" />
                <Text style={styles.refreshText}>القائمة</Text>
                {totalChatUnread > 0 ? <View style={styles.menuIndicatorDot} /> : null}
              </Pressable>
              <Pressable style={({ pressed }) => [styles.refreshButton, pressed && styles.refreshPressed]} onPress={() => void loadDashboard(true)}>
                <MaterialCommunityIcons name="refresh" size={15} color="#FFFFFF" />
                <Text style={styles.refreshText}>تحديث</Text>
              </Pressable>
            </View>
          </View>

          <View style={styles.heroIdentityRow}>
            {avatarPreviewUrl ? (
              <Image source={{ uri: avatarPreviewUrl }} style={styles.heroAvatar} contentFit="cover" />
            ) : (
              <View style={styles.heroAvatarFallback}>
                <Text style={styles.heroAvatarLetter}>{displayName.slice(0, 1)}</Text>
              </View>
            )}
            <View style={styles.heroIdentityText}>
              <Text style={styles.heroTitle}>{`أهلاً بك ${displayName}`}</Text>
              <Text style={styles.heroSubtitle}>فصيلتك الحالية: {faction}</Text>
            </View>
          </View>

          <View style={styles.metricsRow}>
            <View style={styles.metricChip}>
              <Text style={styles.metricValue}>{metrics.unreadNotifications}</Text>
              <Text style={styles.metricLabel}>غير مقروءة</Text>
            </View>
            <View style={styles.metricChip}>
              <Text style={styles.metricValue}>{metrics.pendingFuelSubmissions}</Text>
              <Text style={styles.metricLabel}>وقود معلق</Text>
            </View>
            <View style={styles.metricChip}>
              <Text style={styles.metricValue}>{metrics.pendingWeaponSubmissions}</Text>
              <Text style={styles.metricLabel}>سلاح معلق</Text>
            </View>
          </View>
        </View>

        {error ? (
          <View style={styles.errorBanner}>
            <MaterialCommunityIcons name="alert-circle-outline" size={18} color="#8E3A00" />
            <Text style={styles.errorBannerText}>{error}</Text>
          </View>
        ) : null}

        <SmartTicker items={tickerAnnouncements} />

        <StoriesRow
          items={storiesAnnouncements}
          imageUrls={storiesImageUrls}
          onOpenStory={(story) => {
            void handleOpenStory(story);
          }}
        />

        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>تنبيهات ذكية</Text>
          {isLoading ? (
            <View style={styles.loadingBox}>
              <ActivityIndicator color={palette.primary} />
              <Text style={styles.loadingText}>جاري تحليل التنبيهات...</Text>
            </View>
          ) : (
            alerts.map((alert) => (
              <View key={alert.id} style={styles.alertRow}>
                <View
                  style={[
                    styles.alertDot,
                    alert.tone === "success" && styles.alertDotSuccess,
                    alert.tone === "danger" && styles.alertDotDanger,
                  ]}
                />
                <Text
                  style={[
                    styles.alertText,
                    alert.tone === "success" && styles.alertTextSuccess,
                    alert.tone === "danger" && styles.alertTextDanger,
                  ]}
                >
                  {alert.text}
                </Text>
              </View>
            ))
          )}
        </View>

        <Pressable
          style={({ pressed }) => [styles.chatPreviewCard, pressed && styles.actionCardPressed]}
          onPress={openFactionChatFromDrawer}
        >
          <View style={styles.chatPreviewHeader}>
            <View style={styles.chatPreviewTitleWrap}>
              <Text style={styles.chatPreviewTitle}>دردشة الفصيلة</Text>
              <Text style={styles.chatPreviewSubtitle}>{chatPreviewText}</Text>
            </View>

            <View style={styles.chatPreviewIconWrap}>
              <MaterialCommunityIcons name="chat-outline" size={18} color={palette.primary} />
              {totalChatUnread > 0 ? (
                <View style={styles.chatPreviewBadge}>
                  <Text style={styles.chatPreviewBadgeText}>{chatBadgeText}</Text>
                </View>
              ) : null}
            </View>
          </View>

          <View style={styles.chatPreviewFooter}>
            <Text style={styles.chatPreviewMeta}>
              {latestFactionMessage
                ? `آخر رسالة: ${formatDateTime(new Date(latestFactionMessage.createdAt))}`
                : "افتح الدردشة لبدء المحادثة."}
            </Text>
            <View
              style={[
                styles.chatPreviewStatus,
                totalChatUnread > 0 && styles.chatPreviewStatusUnread,
              ]}
            >
              <Text style={styles.chatPreviewStatusText}>{chatStatusLabel}</Text>
            </View>
          </View>
        </Pressable>

        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>العد التنازلي للمواعيد</Text>
          <View style={styles.countdownGrid}>
            {reminderCountdowns.map((row) => (
              <View
                key={row.type}
                style={[
                  styles.countdownCard,
                  row.isOverdue && styles.countdownCardDanger,
                  row.daysRemaining === 0 && styles.countdownCardToday,
                ]}
              >
                <Text style={styles.countdownTitle}>{row.title}</Text>
                <Text style={styles.countdownValue}>
                  {row.daysRemaining === null
                    ? "--"
                    : row.daysRemaining < 0
                      ? "متأخر"
                      : `${row.daysRemaining}`}
                </Text>
                <Text style={styles.countdownMeta}>
                  {row.dueDate ? `الموعد: ${row.dueDate}` : "غير محدد"}
                </Text>
              </View>
            ))}
          </View>
        </View>

        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>إجراءاتي السريعة</Text>
          <View style={styles.actionsGrid}>
            {QUICK_ACTIONS.map((action) => (
              <Pressable
                key={action.id}
                style={({ pressed }) => [styles.actionCard, pressed && styles.actionCardPressed]}
                onPress={() => router.push(action.route)}
              >
                <View style={[styles.actionIconWrap, { backgroundColor: `${action.color}1A` }]}>
                  <MaterialCommunityIcons name={action.icon} size={18} color={action.color} />
                </View>
                <Text style={styles.actionTitle}>{action.title}</Text>
              </Pressable>
            ))}
          </View>
        </View>

        <LatestUpdatesFeed
          items={feedAnnouncements}
          imageUrls={feedImageUrls}
          onOpenItem={(item) => {
            void handleOpenFeedItem(item);
          }}
        />

        <Pressable
          style={({ pressed }) => [styles.onlinePreviewCard, pressed && styles.actionCardPressed]}
          onPress={openDrawer}
        >
          <View style={styles.onlinePreviewHeader}>
            <MaterialCommunityIcons name="account-group-outline" size={18} color={palette.primary} />
            <Text style={styles.onlinePreviewTitle}>
              {onlineUsers.length} زملاء متصلين الآن
            </Text>
          </View>

          {onlineUsers.length === 0 ? (
            <Text style={styles.onlinePreviewEmpty}>لا يوجد زملاء متصلون حاليًا.</Text>
          ) : (
            <View style={styles.onlinePreviewAvatars}>
              {onlineUsers.slice(0, 6).map((user) => {
                const avatarUri = presenceAvatarUrls[user.userId] ?? null;
                const label = (user.displayName ?? "ز").trim();

                return (
                  <View key={user.userId} style={styles.onlinePreviewAvatarWrap}>
                    {avatarUri ? (
                      <Image source={{ uri: avatarUri }} style={styles.onlinePreviewAvatar} contentFit="cover" />
                    ) : (
                      <View style={styles.onlinePreviewAvatarFallback}>
                        <Text style={styles.onlinePreviewAvatarLetter}>{label.slice(0, 1)}</Text>
                      </View>
                    )}
                    <View style={styles.onlineRingDot} />
                  </View>
                );
              })}
            </View>
          )}
        </Pressable>

        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>آخر الرسائل</Text>
          {latestNotifications.length === 0 ? (
            <Text style={styles.emptyText}>لا توجد رسائل حديثة.</Text>
          ) : (
            latestNotifications.map((item) => (
              <View key={item.id} style={styles.notificationRow}>
                <View style={[styles.notificationDot, { backgroundColor: item.isRead ? "#8CBFA2" : "#D16A6A" }]} />
                <View style={styles.notificationBody}>
                  <Text style={styles.notificationTitle}>{item.title || "إشعار"}</Text>
                  <Text style={styles.notificationMessage}>{item.message}</Text>
                  <Text style={styles.notificationMeta}>{formatDateTime(new Date(item.createdAt))}</Text>
                </View>
              </View>
            ))
          )}
        </View>

        <Pressable style={({ pressed }) => [styles.signOutButton, pressed && styles.signOutPressed]} onPress={() => void signOut()}>
          <MaterialCommunityIcons name="logout" size={18} color="#FFFFFF" />
          <Text style={styles.signOutText}>تسجيل الخروج</Text>
        </Pressable>
      </ScrollView>

      <Modal
        visible={isDrawerVisible}
        transparent
        animationType="fade"
        onRequestClose={closeDrawer}
      >
        <View style={styles.drawerOverlay}>
          <Pressable style={styles.drawerBackdrop} onPress={closeDrawer} />
          <View style={styles.drawerPanel}>
            <View style={styles.drawerHeader}>
              <Pressable style={styles.drawerClose} onPress={closeDrawer}>
                <MaterialCommunityIcons name="close" size={18} color={palette.text} />
              </Pressable>
              <Text style={styles.drawerTitle}>القائمة</Text>
            </View>

            <View style={styles.drawerActions}>
              <Pressable style={styles.drawerActionButton} onPress={openNotificationsFromDrawer}>
                <MaterialCommunityIcons name="bell-outline" size={16} color={palette.primary} />
                <Text style={styles.drawerActionText}>الإشعارات</Text>
              </Pressable>
              <Pressable style={styles.drawerActionButton} onPress={openFactionChatFromDrawer}>
                <MaterialCommunityIcons name="chat-outline" size={16} color={palette.primary} />
                <Text style={styles.drawerActionText}>فتح دردشة الفصيلة</Text>
                {totalChatUnread > 0 ? (
                  <View style={styles.drawerActionBadge}>
                    <Text style={styles.drawerActionBadgeText}>{chatBadgeText}</Text>
                  </View>
                ) : null}
              </Pressable>
            </View>

            <Text style={styles.drawerSectionTitle}>الأصدقاء المتصلون</Text>
            {onlineUsers.length === 0 ? (
              <Text style={styles.drawerEmptyText}>لا يوجد زملاء متصلون الآن.</Text>
            ) : (
              onlineUsers.slice(0, 12).map((user) => {
                const avatarUri = presenceAvatarUrls[user.userId] ?? null;
                const label = (user.displayName ?? "ز").trim();

                return (
                  <View key={`online-${user.userId}`} style={styles.drawerUserRow}>
                    <View style={styles.drawerUserTextWrap}>
                      <Text style={styles.drawerUserName}>{user.displayName ?? "زميل"}</Text>
                      {employee?.role === "admin" && user.faction ? (
                        <Text style={styles.drawerUserMeta}>{user.faction}</Text>
                      ) : (
                        <Text style={styles.drawerUserMeta}>متصل الآن</Text>
                      )}
                    </View>

                    <View style={styles.drawerAvatarWrap}>
                      {avatarUri ? (
                        <Image source={{ uri: avatarUri }} style={styles.drawerAvatar} contentFit="cover" />
                      ) : (
                        <View style={styles.drawerAvatarFallback}>
                          <Text style={styles.drawerAvatarLetter}>{label.slice(0, 1)}</Text>
                        </View>
                      )}
                      <View style={styles.drawerOnlineDot} />
                    </View>
                  </View>
                );
              })
            )}

            <Text style={styles.drawerSectionTitle}>آخر ظهور</Text>
            {recentUsers.filter((item) => !item.isOnline).length === 0 ? (
              <Text style={styles.drawerEmptyText}>لا توجد بيانات ظهور حديثة.</Text>
            ) : (
              recentUsers.filter((item) => !item.isOnline).slice(0, 8).map((user) => {
                const avatarUri = presenceAvatarUrls[user.userId] ?? null;
                const label = (user.displayName ?? "ز").trim();

                return (
                  <View key={`recent-${user.userId}`} style={styles.drawerUserRow}>
                    <View style={styles.drawerUserTextWrap}>
                      <Text style={styles.drawerUserName}>{user.displayName ?? "زميل"}</Text>
                      <Text style={styles.drawerUserMeta}>
                        آخر ظهور: {formatLastSeen(user.lastSeen)}
                      </Text>
                    </View>

                    <View style={styles.drawerAvatarWrap}>
                      {avatarUri ? (
                        <Image source={{ uri: avatarUri }} style={styles.drawerAvatar} contentFit="cover" />
                      ) : (
                        <View style={styles.drawerAvatarFallback}>
                          <Text style={styles.drawerAvatarLetter}>{label.slice(0, 1)}</Text>
                        </View>
                      )}
                    </View>
                  </View>
                );
              })
            )}
          </View>
        </View>
      </Modal>

      <Modal
        visible={isStoryViewerVisible}
        transparent
        animationType="fade"
        onRequestClose={closeStoryViewer}
      >
        <View style={styles.storyViewerOverlay}>
          <Pressable style={styles.storyViewerBackdrop} onPress={closeStoryViewer} />
          <View style={styles.storyViewerCard}>
            <View style={styles.storyViewerHeader}>
              <Pressable style={styles.storyViewerClose} onPress={closeStoryViewer}>
                <MaterialCommunityIcons name="close" size={18} color={palette.text} />
              </Pressable>
              <Text style={styles.storyViewerType}>{announcementTypeLabel(selectedStory?.type)}</Text>
            </View>

            {selectedStoryImageUrl ? (
              <Image
                source={{ uri: selectedStoryImageUrl }}
                style={styles.storyViewerImage}
                contentFit="cover"
              />
            ) : (
              <View style={styles.storyViewerImageFallback}>
                <MaterialCommunityIcons name="image-outline" size={26} color={palette.textMuted} />
              </View>
            )}

            <Text style={styles.storyViewerTitle}>
              {selectedStory?.emoji ? `${selectedStory.emoji} ` : ""}
              {selectedStory?.title ?? ""}
            </Text>
            <Text style={styles.storyViewerMessage}>{selectedStory?.message ?? ""}</Text>
            <Text style={styles.storyViewerDate}>
              {selectedStory ? formatDateTime(new Date(selectedStory.createdAt)) : ""}
            </Text>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: palette.background,
  },
  scroll: {
    flex: 1,
    backgroundColor: palette.background,
  },
  content: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xxl,
    gap: spacing.md,
  },
  heroCard: {
    borderRadius: radius.xl,
    padding: spacing.lg,
    backgroundColor: "#10395F",
    overflow: "hidden",
    ...shadows.card,
  },
  heroBubbleTop: {
    position: "absolute",
    top: -68,
    right: -50,
    width: 190,
    height: 190,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.16)",
  },
  heroBubbleBottom: {
    position: "absolute",
    bottom: -84,
    left: -50,
    width: 220,
    height: 220,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.12)",
  },
  heroTopRow: {
    flexDirection: "row-reverse",
    justifyContent: "space-between",
    alignItems: "center",
    gap: spacing.sm,
  },
  heroTopActions: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: spacing.xs,
  },
  roleBadge: {
    borderRadius: 999,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    backgroundColor: "rgba(255,255,255,0.18)",
  },
  roleBadgeText: {
    color: "#FFFFFF",
    fontWeight: "700",
    fontSize: typography.caption,
  },
  refreshButton: {
    borderRadius: 999,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    backgroundColor: "rgba(255,255,255,0.16)",
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: spacing.xs,
  },
  menuButton: {
    borderRadius: 999,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    backgroundColor: "rgba(255,255,255,0.16)",
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: spacing.xs,
  },
  menuIndicatorDot: {
    width: 8,
    height: 8,
    borderRadius: 99,
    backgroundColor: "#FF6B6B",
    borderWidth: 1,
    borderColor: "#FFFFFF",
  },
  refreshPressed: {
    opacity: 0.82,
  },
  refreshText: {
    color: "#FFFFFF",
    fontWeight: "700",
    fontSize: typography.caption,
  },
  heroIdentityRow: {
    marginTop: spacing.lg,
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  heroIdentityText: {
    flex: 1,
    alignItems: "flex-end",
  },
  heroAvatar: {
    width: 56,
    height: 56,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.35)",
    backgroundColor: "rgba(255,255,255,0.14)",
  },
  heroAvatarFallback: {
    width: 56,
    height: 56,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.35)",
    backgroundColor: "rgba(255,255,255,0.18)",
    alignItems: "center",
    justifyContent: "center",
  },
  heroAvatarLetter: {
    color: "#FFFFFF",
    fontWeight: "900",
    fontSize: 20,
  },
  heroTitle: {
    textAlign: "right",
    color: "#FFFFFF",
    fontSize: 28,
    fontWeight: "900",
  },
  heroSubtitle: {
    marginTop: spacing.xs,
    textAlign: "right",
    color: "rgba(255,255,255,0.9)",
    fontWeight: "600",
  },
  metricsRow: {
    marginTop: spacing.lg,
    flexDirection: "row-reverse",
    gap: spacing.sm,
    flexWrap: "wrap",
  },
  metricChip: {
    minWidth: 100,
    borderRadius: radius.md,
    backgroundColor: "rgba(255,255,255,0.13)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    alignItems: "center",
  },
  metricValue: {
    color: "#FFFFFF",
    fontWeight: "900",
    fontSize: 22,
  },
  metricLabel: {
    marginTop: 2,
    color: "rgba(255,255,255,0.86)",
    fontWeight: "700",
    fontSize: 11,
  },
  errorBanner: {
    borderRadius: radius.md,
    backgroundColor: "#FFF1E6",
    borderWidth: 1,
    borderColor: "#FFD3B8",
    padding: spacing.md,
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: spacing.sm,
  },
  errorBannerText: {
    flex: 1,
    color: "#8E3A00",
    fontWeight: "700",
    textAlign: "right",
    lineHeight: 20,
  },
  sectionCard: {
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: palette.line,
    backgroundColor: palette.surface,
    padding: spacing.lg,
    gap: spacing.sm,
    ...shadows.card,
  },
  sectionTitle: {
    textAlign: "right",
    color: palette.text,
    fontWeight: "800",
    fontSize: 18,
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
  alertRow: {
    flexDirection: "row-reverse",
    alignItems: "flex-start",
    gap: spacing.sm,
  },
  alertDot: {
    width: 8,
    height: 8,
    borderRadius: 99,
    marginTop: 7,
    backgroundColor: palette.primary,
  },
  alertDotSuccess: {
    backgroundColor: palette.accent,
  },
  alertDotDanger: {
    backgroundColor: palette.danger,
  },
  alertText: {
    flex: 1,
    textAlign: "right",
    color: palette.text,
    lineHeight: 20,
    fontWeight: "600",
  },
  alertTextSuccess: {
    color: "#0E6C3A",
  },
  alertTextDanger: {
    color: "#B42318",
  },
  chatPreviewCard: {
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: palette.line,
    backgroundColor: palette.surface,
    padding: spacing.lg,
    gap: spacing.sm,
    ...shadows.card,
  },
  chatPreviewHeader: {
    flexDirection: "row-reverse",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  chatPreviewTitleWrap: {
    flex: 1,
    alignItems: "flex-end",
    gap: 4,
  },
  chatPreviewTitle: {
    textAlign: "right",
    color: palette.text,
    fontWeight: "800",
    fontSize: 16,
  },
  chatPreviewSubtitle: {
    textAlign: "right",
    color: palette.textMuted,
    lineHeight: 20,
    fontWeight: "600",
  },
  chatPreviewIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#CFE1F7",
    backgroundColor: "#EAF3FF",
    alignItems: "center",
    justifyContent: "center",
  },
  chatPreviewBadge: {
    position: "absolute",
    top: -8,
    left: -8,
    minWidth: 20,
    height: 20,
    borderRadius: 99,
    paddingHorizontal: 5,
    backgroundColor: "#E02D2D",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#FFFFFF",
  },
  chatPreviewBadgeText: {
    color: "#FFFFFF",
    fontWeight: "900",
    fontSize: 11,
  },
  chatPreviewFooter: {
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  chatPreviewMeta: {
    flex: 1,
    textAlign: "right",
    color: palette.textMuted,
    fontSize: 12,
    fontWeight: "600",
  },
  chatPreviewStatus: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#CFE1F7",
    backgroundColor: "#EDF4FF",
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
  },
  chatPreviewStatusUnread: {
    borderColor: "#FFD2D2",
    backgroundColor: "#FFF0F0",
  },
  chatPreviewStatusText: {
    color: "#25527A",
    fontWeight: "800",
    fontSize: 11,
  },
  countdownGrid: {
    flexDirection: "row-reverse",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  countdownCard: {
    width: "31.5%",
    minHeight: 110,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: palette.line,
    backgroundColor: palette.surfaceMuted,
    padding: spacing.sm,
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
  },
  countdownCardDanger: {
    borderColor: "#FFD1DB",
    backgroundColor: "#FFF3F6",
  },
  countdownCardToday: {
    borderColor: "#D2F4E0",
    backgroundColor: "#ECFBF3",
  },
  countdownTitle: {
    textAlign: "center",
    color: palette.text,
    fontWeight: "700",
    fontSize: 12,
  },
  countdownValue: {
    color: palette.text,
    fontSize: 24,
    fontWeight: "900",
  },
  countdownMeta: {
    textAlign: "center",
    color: palette.textMuted,
    fontSize: 11,
  },
  actionsGrid: {
    flexDirection: "row-reverse",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  actionCard: {
    width: "31.5%",
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: palette.line,
    backgroundColor: palette.surfaceMuted,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xs,
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  actionCardPressed: {
    opacity: 0.82,
  },
  actionIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  actionTitle: {
    textAlign: "center",
    color: palette.text,
    fontWeight: "700",
    fontSize: 12,
    lineHeight: 16,
  },
  onlinePreviewCard: {
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: palette.line,
    backgroundColor: palette.surface,
    padding: spacing.md,
    gap: spacing.sm,
    ...shadows.card,
  },
  onlinePreviewHeader: {
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  onlinePreviewTitle: {
    flex: 1,
    textAlign: "right",
    color: palette.text,
    fontWeight: "800",
    fontSize: 15,
  },
  onlinePreviewEmpty: {
    textAlign: "right",
    color: palette.textMuted,
    fontWeight: "600",
  },
  onlinePreviewAvatars: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: spacing.sm,
  },
  onlinePreviewAvatarWrap: {
    width: 34,
    height: 34,
    borderRadius: 999,
  },
  onlinePreviewAvatar: {
    width: "100%",
    height: "100%",
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#C6D9EE",
    backgroundColor: palette.surfaceMuted,
  },
  onlinePreviewAvatarFallback: {
    width: "100%",
    height: "100%",
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#C6D9EE",
    backgroundColor: "#EDF4FC",
    alignItems: "center",
    justifyContent: "center",
  },
  onlinePreviewAvatarLetter: {
    color: palette.text,
    fontWeight: "800",
    fontSize: 12,
  },
  onlineRingDot: {
    position: "absolute",
    right: 0,
    bottom: 0,
    width: 10,
    height: 10,
    borderRadius: 99,
    backgroundColor: "#1AA45F",
    borderWidth: 1,
    borderColor: "#FFFFFF",
  },
  emptyText: {
    textAlign: "right",
    color: palette.textMuted,
  },
  notificationRow: {
    flexDirection: "row-reverse",
    alignItems: "flex-start",
    gap: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: palette.line,
    paddingBottom: spacing.sm,
  },
  notificationDot: {
    width: 8,
    height: 8,
    borderRadius: 99,
    marginTop: 6,
  },
  notificationBody: {
    flex: 1,
    gap: 4,
  },
  notificationTitle: {
    textAlign: "right",
    color: palette.text,
    fontWeight: "800",
  },
  notificationMessage: {
    textAlign: "right",
    color: palette.text,
    lineHeight: 20,
  },
  notificationMeta: {
    textAlign: "right",
    color: palette.textMuted,
    fontSize: 12,
  },
  signOutButton: {
    borderRadius: radius.md,
    backgroundColor: "#102A4A",
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row-reverse",
    gap: spacing.sm,
    paddingVertical: spacing.md,
    ...shadows.card,
  },
  signOutPressed: {
    opacity: 0.85,
  },
  signOutText: {
    color: "#FFFFFF",
    fontWeight: "800",
  },
  drawerOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.34)",
    justifyContent: "center",
    paddingHorizontal: spacing.lg,
  },
  drawerBackdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  drawerPanel: {
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: palette.line,
    backgroundColor: palette.surface,
    padding: spacing.lg,
    gap: spacing.sm,
    maxHeight: "82%",
    ...shadows.card,
  },
  drawerHeader: {
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "space-between",
  },
  drawerClose: {
    width: 32,
    height: 32,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: palette.line,
    backgroundColor: palette.surfaceMuted,
    alignItems: "center",
    justifyContent: "center",
  },
  drawerTitle: {
    textAlign: "right",
    color: palette.text,
    fontWeight: "900",
    fontSize: 20,
  },
  drawerActions: {
    flexDirection: "row-reverse",
    gap: spacing.sm,
  },
  drawerActionButton: {
    flex: 1,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: palette.line,
    backgroundColor: palette.surfaceMuted,
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xs,
    paddingVertical: spacing.sm,
  },
  drawerActionText: {
    color: palette.text,
    fontWeight: "700",
    fontSize: 12,
  },
  drawerActionBadge: {
    minWidth: 20,
    height: 20,
    borderRadius: 99,
    paddingHorizontal: 5,
    backgroundColor: "#E02D2D",
    alignItems: "center",
    justifyContent: "center",
  },
  drawerActionBadgeText: {
    color: "#FFFFFF",
    fontWeight: "900",
    fontSize: 11,
  },
  drawerSectionTitle: {
    marginTop: spacing.xs,
    textAlign: "right",
    color: palette.text,
    fontWeight: "800",
    fontSize: 14,
  },
  drawerEmptyText: {
    textAlign: "right",
    color: palette.textMuted,
    fontWeight: "600",
    fontSize: 12,
  },
  drawerUserRow: {
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "space-between",
    borderWidth: 1,
    borderColor: palette.line,
    borderRadius: radius.md,
    backgroundColor: palette.surfaceMuted,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    gap: spacing.sm,
  },
  drawerUserTextWrap: {
    flex: 1,
    alignItems: "flex-end",
    gap: 2,
  },
  drawerUserName: {
    textAlign: "right",
    color: palette.text,
    fontWeight: "800",
    fontSize: 13,
  },
  drawerUserMeta: {
    textAlign: "right",
    color: palette.textMuted,
    fontWeight: "600",
    fontSize: 11,
  },
  drawerAvatarWrap: {
    width: 34,
    height: 34,
    borderRadius: 999,
  },
  drawerAvatar: {
    width: "100%",
    height: "100%",
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#C6D9EE",
    backgroundColor: palette.surface,
  },
  drawerAvatarFallback: {
    width: "100%",
    height: "100%",
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#C6D9EE",
    backgroundColor: "#EAF2FC",
    alignItems: "center",
    justifyContent: "center",
  },
  drawerAvatarLetter: {
    color: palette.text,
    fontWeight: "800",
    fontSize: 12,
  },
  drawerOnlineDot: {
    position: "absolute",
    right: 0,
    bottom: 0,
    width: 9,
    height: 9,
    borderRadius: 99,
    backgroundColor: "#14A155",
    borderWidth: 1,
    borderColor: "#FFFFFF",
  },
  storyViewerOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.38)",
    justifyContent: "center",
    paddingHorizontal: spacing.lg,
  },
  storyViewerBackdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  storyViewerCard: {
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: palette.line,
    backgroundColor: palette.surface,
    padding: spacing.lg,
    gap: spacing.md,
    ...shadows.card,
  },
  storyViewerHeader: {
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "space-between",
  },
  storyViewerClose: {
    width: 32,
    height: 32,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: palette.line,
    backgroundColor: palette.surfaceMuted,
    alignItems: "center",
    justifyContent: "center",
  },
  storyViewerType: {
    textAlign: "right",
    color: palette.textMuted,
    fontWeight: "700",
    textTransform: "uppercase",
    fontSize: 11,
  },
  storyViewerImage: {
    width: "100%",
    height: 240,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: palette.line,
    backgroundColor: palette.surfaceMuted,
  },
  storyViewerImageFallback: {
    width: "100%",
    height: 120,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: palette.line,
    backgroundColor: palette.surfaceMuted,
    alignItems: "center",
    justifyContent: "center",
  },
  storyViewerTitle: {
    textAlign: "right",
    color: palette.text,
    fontWeight: "900",
    fontSize: 18,
  },
  storyViewerMessage: {
    textAlign: "right",
    color: palette.text,
    lineHeight: 22,
    fontWeight: "600",
  },
  storyViewerDate: {
    textAlign: "right",
    color: palette.textMuted,
    fontSize: 12,
    fontWeight: "600",
  },
});


