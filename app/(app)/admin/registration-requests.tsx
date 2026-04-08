import { useCallback, memo } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextStyle,
  View,
  ViewStyle,
} from "react-native";
import { useFocusEffect } from "@react-navigation/native";

import {
  REGISTRATION_REQUEST_STATUSES,
  type RegistrationRequest,
  type RegistrationRequestStatus,
} from "@/src/models";
import { useRegistrationRequestsStore } from "@/src/store";
import { useAuthStore } from "@/src/store/auth.store";
import { palette, radius, spacing, typography } from "@/src/theme/tokens";
import { formatDateTime } from "@/src/utils/formatting";

const FILTER_OPTIONS: { label: string; value: RegistrationRequestStatus | "all" }[] = [
  { label: "قيد المراجعة", value: REGISTRATION_REQUEST_STATUSES.PENDING },
  { label: "الكل", value: "all" },
  { label: "مقبول", value: REGISTRATION_REQUEST_STATUSES.APPROVED },
  { label: "مرفوض", value: REGISTRATION_REQUEST_STATUSES.REJECTED },
];

const statusToLabel = (status: RegistrationRequestStatus): string => {
  if (status === REGISTRATION_REQUEST_STATUSES.APPROVED) {
    return "مقبول";
  }
  if (status === REGISTRATION_REQUEST_STATUSES.REJECTED) {
    return "مرفوض";
  }
  return "قيد المراجعة";
};

const STATUS_CHIP_STYLE_BY_STATUS: Record<RegistrationRequestStatus, ViewStyle> = {
  [REGISTRATION_REQUEST_STATUSES.PENDING]: { backgroundColor: "#FFF4E5" },
  [REGISTRATION_REQUEST_STATUSES.APPROVED]: { backgroundColor: "#E7F8EF" },
  [REGISTRATION_REQUEST_STATUSES.REJECTED]: { backgroundColor: "#FBEAEA" },
};

const STATUS_CHIP_TEXT_STYLE_BY_STATUS: Record<RegistrationRequestStatus, TextStyle> = {
  [REGISTRATION_REQUEST_STATUSES.PENDING]: { color: "#8E5A15" },
  [REGISTRATION_REQUEST_STATUSES.APPROVED]: { color: "#0F7D5A" },
  [REGISTRATION_REQUEST_STATUSES.REJECTED]: { color: "#A12E2E" },
};

interface RequestCardProps {
  request: RegistrationRequest;
  isSubmitting: boolean;
  onApprove: (request: RegistrationRequest) => void;
  onReject: (request: RegistrationRequest) => void;
}

const RequestCard = memo(({ request, isSubmitting, onApprove, onReject }: RequestCardProps) => {
  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <Text style={styles.nameText}>{request.fullName}</Text>
        <View style={[styles.statusChip, STATUS_CHIP_STYLE_BY_STATUS[request.status]]}>
          <Text style={[styles.statusChipText, STATUS_CHIP_TEXT_STYLE_BY_STATUS[request.status]]}>
            {statusToLabel(request.status)}
          </Text>
        </View>
      </View>

      <Text style={styles.metaLine}>البريد: {request.email}</Text>
      <Text style={styles.metaLine}>الفصيلة: {request.faction}</Text>
      <Text style={styles.metaLine}>تاريخ الطلب: {formatDateTime(new Date(request.createdAt))}</Text>

      {request.status === REGISTRATION_REQUEST_STATUSES.PENDING ? (
        <View style={styles.actionsRow}>
          <Pressable
            style={({ pressed }) => [
              styles.rejectButton,
              pressed && styles.rejectButtonPressed,
              isSubmitting && styles.actionButtonDisabled,
            ]}
            disabled={isSubmitting}
            onPress={() => onReject(request)}
          >
            <Text style={styles.rejectButtonText}>{isSubmitting ? "..." : "رفض"}</Text>
          </Pressable>

          <Pressable
            style={({ pressed }) => [
              styles.approveButton,
              pressed && styles.approveButtonPressed,
              isSubmitting && styles.actionButtonDisabled,
            ]}
            disabled={isSubmitting}
            onPress={() => onApprove(request)}
          >
            <Text style={styles.approveButtonText}>{isSubmitting ? "..." : "موافقة"}</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
});

RequestCard.displayName = "RequestCard";

export default function RegistrationRequestsScreen() {
  const currentEmployee = useAuthStore((state) => state.employee);
  const requests = useRegistrationRequestsStore((state) => state.requests);
  const filter = useRegistrationRequestsStore((state) => state.filter);
  const isLoading = useRegistrationRequestsStore((state) => state.isLoading);
  const actionRequestId = useRegistrationRequestsStore((state) => state.actionRequestId);
  const error = useRegistrationRequestsStore((state) => state.error);
  const setFilter = useRegistrationRequestsStore((state) => state.setFilter);
  const fetchRequests = useRegistrationRequestsStore((state) => state.fetchRequests);
  const processRequest = useRegistrationRequestsStore((state) => state.processRequest);
  const clearError = useRegistrationRequestsStore((state) => state.clearError);

  useFocusEffect(
    useCallback(() => {
      void fetchRequests(filter);
    }, [fetchRequests, filter]),
  );

  const handleFilterPress = useCallback(
    (nextFilter: RegistrationRequestStatus | "all") => {
      if (error) {
        clearError();
      }

      setFilter(nextFilter);
      void fetchRequests(nextFilter);
    },
    [clearError, error, fetchRequests, setFilter],
  );

  const handleApprove = useCallback(
    (request: RegistrationRequest) => {
      Alert.alert("تأكيد الموافقة", `هل تريد اعتماد طلب ${request.fullName}؟`, [
        { text: "إلغاء", style: "cancel" },
        {
          text: "موافقة",
          style: "default",
          onPress: () => {
            void processRequest(request, REGISTRATION_REQUEST_STATUSES.APPROVED, {
              authUserId: currentEmployee?.authUserId,
              employeeId: currentEmployee?.id ?? null,
            });
          },
        },
      ]);
    },
    [currentEmployee?.authUserId, currentEmployee?.id, processRequest],
  );

  const handleReject = useCallback(
    (request: RegistrationRequest) => {
      Alert.alert("تأكيد الرفض", `هل تريد رفض طلب ${request.fullName}؟`, [
        { text: "إلغاء", style: "cancel" },
        {
          text: "رفض",
          style: "destructive",
          onPress: () => {
            void processRequest(request, REGISTRATION_REQUEST_STATUSES.REJECTED, {
              authUserId: currentEmployee?.authUserId,
              employeeId: currentEmployee?.id ?? null,
            });
          },
        },
      ]);
    },
    [currentEmployee?.authUserId, currentEmployee?.id, processRequest],
  );

  const renderItem = useCallback(
    ({ item }: { item: RegistrationRequest }) => (
      <RequestCard
        request={item}
        isSubmitting={actionRequestId === item.id}
        onApprove={handleApprove}
        onReject={handleReject}
      />
    ),
    [actionRequestId, handleApprove, handleReject],
  );

  return (
    <View style={styles.screen}>
      <FlatList
        data={requests}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl
            refreshing={isLoading}
            onRefresh={() => {
              void fetchRequests(filter);
            }}
            tintColor={palette.primary}
          />
        }
        ListHeaderComponent={
          <View style={styles.headerContainer}>
            <Text style={styles.headerTitle}>طلبات التسجيل</Text>
            <Text style={styles.headerSubtitle}>
              راجع الطلبات الجديدة وقرر الموافقة أو الرفض حسب صلاحيات الإدارة.
            </Text>

            <View style={styles.filterRow}>
              {FILTER_OPTIONS.map((option) => (
                <Pressable
                  key={option.value}
                  style={[
                    styles.filterChip,
                    filter === option.value && styles.filterChipActive,
                  ]}
                  onPress={() => handleFilterPress(option.value)}
                >
                  <Text
                    style={[
                      styles.filterChipText,
                      filter === option.value && styles.filterChipTextActive,
                    ]}
                  >
                    {option.label}
                  </Text>
                </Pressable>
              ))}
            </View>

            {error ? <Text style={styles.errorText}>{error}</Text> : null}
          </View>
        }
        ListEmptyComponent={
          isLoading ? (
            <View style={styles.emptyBox}>
              <ActivityIndicator color={palette.primary} />
              <Text style={styles.emptyText}>جاري تحميل الطلبات...</Text>
            </View>
          ) : (
            <View style={styles.emptyBox}>
              <Text style={styles.emptyText}>لا توجد طلبات مطابقة لهذا الفلتر.</Text>
            </View>
          )
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: palette.background,
  },
  listContent: {
    padding: spacing.xl,
    gap: spacing.md,
    paddingBottom: spacing.xxl,
  },
  headerContainer: {
    backgroundColor: palette.surface,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: palette.line,
    padding: spacing.xl,
    gap: spacing.md,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: "900",
    color: palette.text,
    textAlign: "right",
  },
  headerSubtitle: {
    color: palette.textMuted,
    lineHeight: 21,
    textAlign: "right",
    fontSize: typography.body,
  },
  filterRow: {
    flexDirection: "row-reverse",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  filterChip: {
    backgroundColor: palette.surfaceMuted,
    borderRadius: 999,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  filterChipActive: {
    backgroundColor: palette.primary,
  },
  filterChipText: {
    color: palette.textMuted,
    fontWeight: "700",
    fontSize: 13,
  },
  filterChipTextActive: {
    color: "#FFFFFF",
  },
  errorText: {
    color: palette.danger,
    textAlign: "right",
    fontWeight: "600",
  },
  card: {
    backgroundColor: palette.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: palette.line,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  cardHeader: {
    flexDirection: "row-reverse",
    justifyContent: "space-between",
    alignItems: "center",
    gap: spacing.sm,
  },
  nameText: {
    color: palette.text,
    fontWeight: "800",
    fontSize: 18,
    textAlign: "right",
    flex: 1,
  },
  statusChip: {
    borderRadius: 999,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
  },
  statusChipText: {
    fontWeight: "800",
    fontSize: 12,
  },
  metaLine: {
    color: palette.textMuted,
    textAlign: "right",
    fontSize: 13,
    lineHeight: 19,
  },
  actionsRow: {
    flexDirection: "row",
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  approveButton: {
    flex: 1,
    borderRadius: radius.md,
    backgroundColor: palette.accent,
    paddingVertical: spacing.sm,
    alignItems: "center",
  },
  approveButtonPressed: {
    opacity: 0.86,
  },
  approveButtonText: {
    color: "#FFFFFF",
    fontWeight: "800",
  },
  rejectButton: {
    flex: 1,
    borderRadius: radius.md,
    backgroundColor: "#E8EDF7",
    paddingVertical: spacing.sm,
    alignItems: "center",
  },
  rejectButtonPressed: {
    opacity: 0.8,
  },
  rejectButtonText: {
    color: "#283A52",
    fontWeight: "800",
  },
  actionButtonDisabled: {
    opacity: 0.5,
  },
  emptyBox: {
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: palette.line,
    backgroundColor: palette.surface,
    padding: spacing.xl,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
  },
  emptyText: {
    color: palette.textMuted,
    textAlign: "center",
    fontWeight: "600",
  },
});
