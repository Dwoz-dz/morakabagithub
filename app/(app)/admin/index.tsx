import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import { useRouter, type Href } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { REGISTRATION_REQUEST_STATUSES, type ActivityLog } from "@/src/models";
import { ActivityLogsService } from "@/src/services/supabase/activity-logs.service";
import { EmployeesService } from "@/src/services/supabase/employees.service";
import { FuelService } from "@/src/services/supabase/fuel.service";
import { NotificationsService } from "@/src/services/supabase/notifications.service";
import { RegistrationRequestsService } from "@/src/services/supabase/registration-requests.service";
import { RemindersService } from "@/src/services/supabase/reminders.service";
import { WeaponService } from "@/src/services/supabase/weapon.service";
import { useAuthStore } from "@/src/store/auth.store";
import { palette, radius, shadows, spacing, typography } from "@/src/theme/tokens";
import { formatDateTime } from "@/src/utils/formatting";

interface DashboardMetrics {
  totalEmployees: number;
  pendingRequests: number;
  activeUsers: number;
  pendingWeaponChecks: number;
  unreadAlerts: number;
  pendingFuel: number;
}

interface QuickAction {
  id: string;
  title: string;
  subtitle: string;
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  route: Href;
  tintColor: string;
  iconBackground: string;
}

const INITIAL_METRICS: DashboardMetrics = {
  totalEmployees: 0,
  pendingRequests: 0,
  activeUsers: 0,
  pendingWeaponChecks: 0,
  unreadAlerts: 0,
  pendingFuel: 0,
};

const QUICK_ACTIONS: QuickAction[] = [
  {
    id: "registration-requests",
    title: "طلبات التسجيل",
    subtitle: "اعتماد أو رفض الطلبات الجديدة",
    icon: "account-clock-outline",
    route: "/(app)/admin/registration-requests",
    tintColor: "#164A80",
    iconBackground: "#E5F0FF",
  },
  {
    id: "weekly-rest",
    title: "الراحة الأسبوعية",
    subtitle: "توزيع الراحة على الموظفين",
    icon: "calendar-week",
    route: "/(app)/admin/weekly-rest",
    tintColor: "#0C6A4B",
    iconBackground: "#E6F7EF",
  },
  {
    id: "employee-reminders",
    title: "تذكير الموظفين",
    subtitle: "إدارة مواعيد الفيدونج والسلاح وقسائم الوقود",
    icon: "clock-check-outline",
    route: "/(app)/admin/reminders",
    tintColor: "#165E8A",
    iconBackground: "#E5F3FF",
  },
  {
    id: "broadcast-center",
    title: "مركز البث",
    subtitle: "إعلانات موجهة للشريط الذكي والستوري والخلاصة",
    icon: "bullhorn-variant-outline",
    route: "/(app)/admin/broadcast-center" as Href,
    tintColor: "#7A3A9A",
    iconBackground: "#F4E8FF",
  },
  {
    id: "employees",
    title: "الموظفون",
    subtitle: "إدارة الفصائل والصلاحيات",
    icon: "account-group-outline",
    route: "/(app)/admin/employees",
    tintColor: "#6A3A00",
    iconBackground: "#FFF2E2",
  },
  {
    id: "notifications",
    title: "الإشعارات والرسائل",
    subtitle: "إرسال رسائل لموظف/فصيلة/الجميع",
    icon: "bell-badge-outline",
    route: "/(app)/admin/notifications-messages",
    tintColor: "#5B2A86",
    iconBackground: "#F3E9FF",
  },
  {
    id: "fuel",
    title: "الوقود",
    subtitle: "مراجعة قسائم الوقود المرسلة",
    icon: "fuel",
    route: "/(app)/admin/fuel-submissions",
    tintColor: "#9B3200",
    iconBackground: "#FFEDE4",
  },
  {
    id: "weapon",
    title: "السلاح",
    subtitle: "مراجعة فحوصات السلاح",
    icon: "shield-check-outline",
    route: "/(app)/admin/weapon-submissions",
    tintColor: "#005A68",
    iconBackground: "#E5F6F8",
  },
  {
    id: "faction-chat",
    title: "دردشة الفصائل",
    subtitle: "مراقبة مباشرة والتنقل بين قنوات الفصائل",
    icon: "chat-processing-outline",
    route: "/(app)/admin/faction-chat" as Href,
    tintColor: "#1765A2",
    iconBackground: "#E7F2FF",
  },
];

const actionLabel = (action: string): string => {
  if (action === "registration.approve") return "تم قبول طلب تسجيل";
  if (action === "registration.reject") return "تم رفض طلب تسجيل";
  if (action === "notification.send") return "تم إرسال إشعار";
  if (action === "weapon.submit") return "تم إرسال فحص سلاح";
  if (action === "weapon.review") return "تمت مراجعة فحص سلاح";
  if (action === "fuel.submit") return "تم إرسال استهلاك وقود";
  if (action === "fuel.review") return "تمت مراجعة الوقود";
  if (action === "vehicle.create") return "تمت إضافة مركبة";
  if (action === "vehicle.toggle_active") return "تم تغيير حالة مركبة";
  if (action === "employee.update_role") return "تم تعديل صلاحية موظف";
  if (action === "employee.update_faction") return "تم تعديل فصيلة موظف";
  if (action === "support.reply") return "تم الرد على تذكرة دعم";
  return action;
};

export default function AdminDashboardScreen() {
  const router = useRouter();
  const signOut = useAuthStore((state) => state.signOut);
  const employee = useAuthStore((state) => state.employee);

  const [metrics, setMetrics] = useState<DashboardMetrics>(INITIAL_METRICS);
  const [recentActivity, setRecentActivity] = useState<ActivityLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);

  const lastUpdatedLabel = useMemo(() => {
    if (!lastUpdatedAt) return "--";
    return lastUpdatedAt.toLocaleTimeString("ar-DZ", {
      hour: "2-digit",
      minute: "2-digit",
    });
  }, [lastUpdatedAt]);

  const smartAlerts = useMemo(() => {
    const alerts: string[] = [];

    if (metrics.pendingRequests > 0) {
      alerts.push(`لديك ${metrics.pendingRequests} طلب تسجيل جديد يحتاج مراجعة.`);
    }

    if (metrics.pendingWeaponChecks > 0) {
      alerts.push(`هناك ${metrics.pendingWeaponChecks} فحص سلاح معلق.`);
    }

    if (metrics.pendingFuel > 0) {
      alerts.push(`هناك ${metrics.pendingFuel} سجل وقود بانتظار المراجعة.`);
    }

    if (metrics.unreadAlerts > 0) {
      alerts.push(`يوجد ${metrics.unreadAlerts} تنبيه غير مقروء.`);
    }

    if (alerts.length === 0) {
      alerts.push("كل المؤشرات مستقرة الآن ولا توجد تنبيهات حرجة.");
    }

    return alerts.slice(0, 4);
  }, [metrics.pendingFuel, metrics.pendingRequests, metrics.pendingWeaponChecks, metrics.unreadAlerts]);

  const loadDashboard = useCallback(async (pullToRefresh = false) => {
    if (pullToRefresh) {
      setIsRefreshing(true);
    } else {
      setIsLoading(true);
    }

    setError(null);

    try {
      const [employeesResult, pendingRequestsResult, unreadAlertsResult, pendingWeaponResult, pendingFuelResult, activityResult] =
        await Promise.all([
          EmployeesService.listAllEmployees(),
          RegistrationRequestsService.list(REGISTRATION_REQUEST_STATUSES.PENDING),
          NotificationsService.unreadCount(),
          WeaponService.countPendingForAdmin(),
          FuelService.countPendingForAdmin(),
          ActivityLogsService.listRecent(5),
        ]);

      const employees = employeesResult.data ?? [];

      setMetrics({
        totalEmployees: employees.length,
        pendingRequests: pendingRequestsResult.data?.length ?? 0,
        activeUsers: employees.filter((item) => item.status === "approved").length,
        pendingWeaponChecks: pendingWeaponResult.data ?? 0,
        unreadAlerts: unreadAlertsResult.data ?? 0,
        pendingFuel: pendingFuelResult.data ?? 0,
      });

      setRecentActivity(activityResult.data ?? []);

      const firstError =
        employeesResult.error ??
        pendingRequestsResult.error ??
        unreadAlertsResult.error ??
        pendingWeaponResult.error ??
        pendingFuelResult.error ??
        activityResult.error ??
        null;

      setError(firstError);
      setLastUpdatedAt(new Date());

      if (employee?.authUserId) {
        await RemindersService.dispatchDueReminderNotifications({
          senderAuthUserId: employee.authUserId,
          senderEmployeeId: employee.id,
        });
      }
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "تعذر تحميل لوحة المتابعة.");
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [employee?.authUserId, employee?.id]);

  useFocusEffect(
    useCallback(() => {
      void loadDashboard(false);
    }, [loadDashboard]),
  );

  const renderKpi = (label: string, value: number, icon: keyof typeof MaterialCommunityIcons.glyphMap, accent: string) => (
    <View style={styles.kpiCard}>
      <View style={[styles.kpiIconWrap, { backgroundColor: `${accent}1A` }]}>
        <MaterialCommunityIcons name={icon} size={16} color={accent} />
      </View>
      <Text style={styles.kpiValue}>{isLoading && !isRefreshing ? "..." : value}</Text>
      <Text style={styles.kpiLabel}>{label}</Text>
    </View>
  );

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
            <View style={styles.statusBadge}>
              <MaterialCommunityIcons name={error ? "alert" : "check-circle"} size={14} color="#FFFFFF" />
              <Text style={styles.statusBadgeText}>{error ? "تحتاج مراجعة" : "النظام نشط"}</Text>
            </View>

            <Pressable
              style={({ pressed }) => [styles.refreshButton, pressed && styles.refreshButtonPressed]}
              onPress={() => void loadDashboard(true)}
            >
              <MaterialCommunityIcons name="refresh" size={15} color="#FFFFFF" />
              <Text style={styles.refreshButtonText}>تحديث</Text>
            </Pressable>
          </View>

          <Text style={styles.heroTitle}>لوحة قيادة المدير</Text>
          <Text style={styles.heroSubtitle}>إدارة مباشرة للطلبات، الموظفين، الوقود، السلاح، والتنبيهات من واجهة واحدة.</Text>

          <View style={styles.heroSummaryRow}>
            <View style={styles.heroSummaryChip}>
              <Text style={styles.heroSummaryValue}>{metrics.totalEmployees}</Text>
              <Text style={styles.heroSummaryLabel}>الموظفون</Text>
            </View>
            <View style={styles.heroSummaryChip}>
              <Text style={styles.heroSummaryValue}>{metrics.pendingRequests}</Text>
              <Text style={styles.heroSummaryLabel}>طلبات معلقة</Text>
            </View>
            <View style={styles.heroSummaryChip}>
              <Text style={styles.heroSummaryValue}>{metrics.unreadAlerts}</Text>
              <Text style={styles.heroSummaryLabel}>تنبيهات</Text>
            </View>
          </View>
        </View>

        {error ? (
          <View style={styles.errorBanner}>
            <MaterialCommunityIcons name="alert-circle-outline" size={18} color="#8E3A00" />
            <Text style={styles.errorBannerText}>{error}</Text>
          </View>
        ) : null}

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>مؤشرات التشغيل</Text>
          <Text style={styles.sectionMeta}>آخر تحديث: {lastUpdatedLabel}</Text>
        </View>

        <View style={styles.kpiGrid}>
          {renderKpi("عدد الموظفين", metrics.totalEmployees, "account-group-outline", "#18477D")}
          {renderKpi("الطلبات المعلقة", metrics.pendingRequests, "account-clock-outline", "#6A3A00")}
          {renderKpi("المستخدمون النشطون", metrics.activeUsers, "account-check-outline", "#0C6A4B")}
          {renderKpi("فحوصات السلاح", metrics.pendingWeaponChecks, "shield-alert-outline", "#005A68")}
          {renderKpi("تنبيهات غير مقروءة", metrics.unreadAlerts, "bell-ring-outline", "#5B2A86")}
        </View>

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>الإجراءات السريعة</Text>
          <Text style={styles.sectionMeta}>وحدات الإدارة الأساسية</Text>
        </View>

        <View style={styles.actionsGrid}>
          {QUICK_ACTIONS.map((action) => (
            <Pressable
              key={action.id}
              style={({ pressed }) => [styles.actionCard, pressed && styles.actionCardPressed]}
              onPress={() => router.push(action.route)}
            >
              <View style={[styles.actionIconWrap, { backgroundColor: action.iconBackground }]}>
                <MaterialCommunityIcons name={action.icon} size={20} color={action.tintColor} />
              </View>
              <Text style={styles.actionTitle}>{action.title}</Text>
              <Text style={styles.actionSubtitle}>{action.subtitle}</Text>
              <View style={styles.actionFooter}>
                <Text style={styles.actionFooterText}>فتح</Text>
                <MaterialCommunityIcons name="chevron-left" size={16} color={palette.primaryDark} />
              </View>
            </Pressable>
          ))}
        </View>

        <View style={styles.extraActionsRow}>
          <Pressable
            style={({ pressed }) => [styles.extraAction, pressed && styles.extraActionPressed]}
            onPress={() => router.push("/(app)/admin/vehicles-factions")}
          >
            <MaterialCommunityIcons name="car-multiple" size={18} color={palette.primaryDark} />
            <Text style={styles.extraActionText}>المركبات والفصائل</Text>
          </Pressable>

          <Pressable
            style={({ pressed }) => [styles.extraAction, pressed && styles.extraActionPressed]}
            onPress={() => router.push("/(app)/admin/activity-logs")}
          >
            <MaterialCommunityIcons name="timeline-text-outline" size={18} color={palette.primaryDark} />
            <Text style={styles.extraActionText}>سجل النشاطات</Text>
          </Pressable>

          <Pressable
            style={({ pressed }) => [styles.extraAction, pressed && styles.extraActionPressed]}
            onPress={() => router.push("/(app)/admin/settings")}
          >
            <MaterialCommunityIcons name="cog-outline" size={18} color={palette.primaryDark} />
            <Text style={styles.extraActionText}>الإعدادات</Text>
          </Pressable>
        </View>

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>التنبيهات الذكية</Text>
          <Text style={styles.sectionMeta}>ملخص مباشر</Text>
        </View>

        <View style={styles.alertsCard}>
          {smartAlerts.map((alert, index) => (
            <View key={`${alert}-${index}`} style={styles.alertRow}>
              <View style={styles.alertDot} />
              <Text style={styles.alertText}>{alert}</Text>
            </View>
          ))}
        </View>

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>آخر النشاطات</Text>
          <Pressable
            style={({ pressed }) => [styles.linkButton, pressed && styles.linkButtonPressed]}
            onPress={() => router.push("/(app)/admin/activity-logs")}
          >
            <Text style={styles.linkButtonText}>عرض الكل</Text>
          </Pressable>
        </View>

        <View style={styles.activityCard}>
          {isLoading && recentActivity.length === 0 ? (
            <View style={styles.loadingBox}>
              <ActivityIndicator color={palette.primary} />
              <Text style={styles.loadingText}>جاري تحميل النشاطات...</Text>
            </View>
          ) : null}

          {!isLoading && recentActivity.length === 0 ? (
            <Text style={styles.emptyText}>لا توجد نشاطات حديثة بعد.</Text>
          ) : null}

          {recentActivity.map((item) => (
            <View key={item.id} style={styles.activityRow}>
              <View style={styles.activityLine} />
              <View style={styles.activityContent}>
                <Text style={styles.activityTitle}>{actionLabel(item.action)}</Text>
                <Text style={styles.activityMeta}>{formatDateTime(new Date(item.createdAt))}</Text>
              </View>
            </View>
          ))}
        </View>

        <View style={styles.bottomCard}>
          <Text style={styles.bottomHint}>{employee?.fullName ? `متصل كـ ${employee.fullName}` : "جلسة مدير"}</Text>
          <Pressable
            style={({ pressed }) => [styles.signOutButton, pressed && styles.signOutPressed]}
            onPress={() => void signOut()}
          >
            <MaterialCommunityIcons name="logout" size={18} color="#FFFFFF" />
            <Text style={styles.signOutText}>تسجيل الخروج</Text>
          </Pressable>
        </View>
      </ScrollView>
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
    backgroundColor: palette.primaryDark,
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
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
  },
  statusBadge: {
    borderRadius: 999,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: spacing.xs,
    backgroundColor: "rgba(255,255,255,0.2)",
  },
  statusBadgeText: {
    color: "#FFFFFF",
    fontSize: typography.caption,
    fontWeight: "700",
  },
  refreshButton: {
    borderRadius: 999,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    backgroundColor: "rgba(255,255,255,0.14)",
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: spacing.xs,
  },
  refreshButtonPressed: {
    opacity: 0.86,
  },
  refreshButtonText: {
    color: "#FFFFFF",
    fontWeight: "700",
    fontSize: typography.caption,
  },
  heroTitle: {
    color: "#FFFFFF",
    fontSize: 30,
    fontWeight: "900",
    textAlign: "right",
    marginTop: spacing.lg,
  },
  heroSubtitle: {
    marginTop: spacing.sm,
    color: "rgba(255,255,255,0.9)",
    fontSize: typography.body,
    lineHeight: 22,
    textAlign: "right",
  },
  heroSummaryRow: {
    marginTop: spacing.lg,
    flexDirection: "row-reverse",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  heroSummaryChip: {
    minWidth: 102,
    borderRadius: radius.md,
    backgroundColor: "rgba(255,255,255,0.13)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.2)",
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    alignItems: "center",
  },
  heroSummaryValue: {
    color: "#FFFFFF",
    fontSize: 22,
    fontWeight: "900",
  },
  heroSummaryLabel: {
    marginTop: 2,
    color: "rgba(255,255,255,0.86)",
    fontSize: 11,
    fontWeight: "700",
    textAlign: "center",
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
  sectionHeader: {
    flexDirection: "row-reverse",
    alignItems: "flex-end",
    justifyContent: "space-between",
  },
  sectionTitle: {
    color: palette.text,
    fontSize: 22,
    fontWeight: "900",
    textAlign: "right",
  },
  sectionMeta: {
    color: palette.textMuted,
    fontWeight: "600",
    fontSize: typography.caption,
    textAlign: "left",
  },
  kpiGrid: {
    flexDirection: "row-reverse",
    flexWrap: "wrap",
    gap: spacing.md,
  },
  kpiCard: {
    width: "48%",
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: palette.line,
    backgroundColor: palette.surface,
    padding: spacing.md,
    gap: spacing.xs,
    ...shadows.card,
  },
  kpiIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "flex-end",
  },
  kpiValue: {
    textAlign: "right",
    color: palette.text,
    fontSize: 30,
    fontWeight: "900",
  },
  kpiLabel: {
    textAlign: "right",
    color: palette.textMuted,
    fontSize: typography.caption,
    lineHeight: 17,
  },
  actionsGrid: {
    flexDirection: "row-reverse",
    flexWrap: "wrap",
    gap: spacing.md,
  },
  extraActionsRow: {
    flexDirection: "row-reverse",
    gap: spacing.sm,
  },
  extraAction: {
    flex: 1,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: palette.line,
    backgroundColor: palette.surface,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    ...shadows.card,
  },
  extraActionPressed: {
    opacity: 0.82,
  },
  extraActionText: {
    color: palette.text,
    fontWeight: "700",
    fontSize: 12,
    textAlign: "center",
  },
  actionCard: {
    width: "48%",
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: palette.line,
    backgroundColor: palette.surface,
    padding: spacing.md,
    gap: spacing.sm,
    minHeight: 152,
    ...shadows.card,
  },
  actionCardPressed: {
    opacity: 0.86,
  },
  actionIconWrap: {
    width: 38,
    height: 38,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "flex-end",
  },
  actionTitle: {
    color: palette.text,
    fontWeight: "800",
    textAlign: "right",
    fontSize: 16,
  },
  actionSubtitle: {
    color: palette.textMuted,
    textAlign: "right",
    lineHeight: 19,
    fontSize: 13,
  },
  actionFooter: {
    marginTop: "auto",
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "space-between",
  },
  actionFooterText: {
    color: palette.primaryDark,
    fontWeight: "800",
    fontSize: typography.caption,
  },
  alertsCard: {
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: palette.line,
    backgroundColor: palette.surface,
    padding: spacing.lg,
    gap: spacing.sm,
    ...shadows.card,
  },
  alertRow: {
    flexDirection: "row-reverse",
    alignItems: "flex-start",
    gap: spacing.sm,
  },
  alertDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: palette.primary,
    marginTop: 7,
  },
  alertText: {
    flex: 1,
    textAlign: "right",
    color: palette.text,
    lineHeight: 20,
    fontWeight: "600",
  },
  linkButton: {
    borderRadius: 999,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: palette.line,
    backgroundColor: palette.surface,
  },
  linkButtonPressed: {
    opacity: 0.8,
  },
  linkButtonText: {
    color: palette.primaryDark,
    fontWeight: "700",
    fontSize: 12,
  },
  activityCard: {
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: palette.line,
    backgroundColor: palette.surface,
    padding: spacing.lg,
    gap: spacing.sm,
    ...shadows.card,
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
  activityRow: {
    flexDirection: "row-reverse",
    alignItems: "stretch",
    gap: spacing.sm,
  },
  activityLine: {
    width: 3,
    borderRadius: 99,
    backgroundColor: "#D9E7FA",
  },
  activityContent: {
    flex: 1,
    borderBottomWidth: 1,
    borderBottomColor: palette.line,
    paddingBottom: spacing.sm,
  },
  activityTitle: {
    textAlign: "right",
    color: palette.text,
    fontWeight: "700",
  },
  activityMeta: {
    marginTop: 4,
    textAlign: "right",
    color: palette.textMuted,
    fontSize: typography.caption,
  },
  bottomCard: {
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: palette.line,
    backgroundColor: palette.surface,
    padding: spacing.lg,
    gap: spacing.md,
    ...shadows.card,
  },
  bottomHint: {
    textAlign: "right",
    color: palette.textMuted,
    fontWeight: "600",
    fontSize: typography.caption,
  },
  signOutButton: {
    backgroundColor: "#102A4A",
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    flexDirection: "row-reverse",
    justifyContent: "center",
    alignItems: "center",
    gap: spacing.sm,
  },
  signOutPressed: {
    opacity: 0.88,
  },
  signOutText: {
    color: "#FFFFFF",
    fontWeight: "800",
    fontSize: 14,
  },
});

