import { useFocusEffect } from "@react-navigation/native";
import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

import type { LinkedDevice } from "@/src/models";
import { LinkedDevicesService } from "@/src/services/supabase/linked-devices.service";
import { palette, radius, shadows, spacing } from "@/src/theme/tokens";
import { formatDateTime } from "@/src/utils/formatting";

export default function LinkedDevicesScreen() {
  const [devices, setDevices] = useState<LinkedDevice[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isWorking, setIsWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadDevices = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    const result = await LinkedDevicesService.listMyDevices(60);
    if (result.error) {
      setError(result.error);
      setDevices([]);
      setIsLoading(false);
      return;
    }

    setDevices(result.data ?? []);
    setIsLoading(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      void loadDevices();
    }, [loadDevices]),
  );

  const confirmRemove = useCallback(
    (device: LinkedDevice) => {
      Alert.alert(
        "إزالة جهاز",
        `هل تريد إزالة الجهاز "${device.deviceName}" من الحساب؟`,
        [
          { text: "إلغاء", style: "cancel" },
          {
            text: "إزالة",
            style: "destructive",
            onPress: () => {
              void (async () => {
                setIsWorking(true);
                const result = await LinkedDevicesService.removeDevice(device.id);
                if (result.error) {
                  setError(result.error);
                  setIsWorking(false);
                  return;
                }
                setDevices((prev) => prev.filter((item) => item.id !== device.id));
                setIsWorking(false);
              })();
            },
          },
        ],
      );
    },
    [],
  );

  return (
    <ScrollView
      contentContainerStyle={styles.container}
      contentInsetAdjustmentBehavior="automatic"
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.card}>
        <Text style={styles.title}>الأجهزة المرتبطة</Text>
        <Text style={styles.subtitle}>
          هذه قائمة الأجهزة التي تم استخدامها للدخول إلى حسابك.
        </Text>

        <Pressable
          style={({ pressed }) => [styles.refreshButton, pressed && styles.buttonPressed]}
          onPress={() => void loadDevices()}
          disabled={isLoading}
        >
          <Text style={styles.refreshButtonText}>تحديث القائمة</Text>
        </Pressable>

        {error ? <Text style={styles.errorText}>{error}</Text> : null}
      </View>

      <View style={styles.card}>
        {isLoading ? (
          <View style={styles.loadingBox}>
            <ActivityIndicator color={palette.primary} />
            <Text style={styles.loadingText}>جاري تحميل الأجهزة...</Text>
          </View>
        ) : null}

        {!isLoading && devices.length === 0 ? (
          <Text style={styles.emptyText}>لا توجد أجهزة مرتبطة حالياً.</Text>
        ) : null}

        {devices.map((device) => (
          <View key={device.id} style={styles.deviceRow}>
            <View style={styles.rowHeader}>
              <Text style={styles.deviceName}>{device.deviceName}</Text>
              <Text style={styles.platformBadge}>{device.platform.toUpperCase()}</Text>
            </View>

            <Text style={styles.deviceMeta}>
              آخر ظهور: {formatDateTime(new Date(device.lastSeenAt))}
            </Text>
            <Text style={styles.deviceMeta}>
              إصدار التطبيق: {device.appVersion ?? "غير معروف"}
            </Text>
            <Text style={styles.deviceMeta} numberOfLines={1}>
              Device ID: {device.deviceId}
            </Text>

            <Pressable
              style={({ pressed }) => [
                styles.removeButton,
                isWorking && styles.buttonDisabled,
                pressed && !isWorking && styles.buttonPressed,
              ]}
              disabled={isWorking}
              onPress={() => confirmRemove(device)}
            >
              <Text style={styles.removeButtonText}>إزالة هذا الجهاز</Text>
            </Pressable>
          </View>
        ))}
      </View>

      <View style={styles.noteCard}>
        <Text style={styles.noteText}>
          إزالة الجهاز من هذه القائمة تمنع ظهوره كسجل مرتبط. إذا فقدت جهازًا، غيّر كلمة المرور فورًا لتعزيز الأمان.
        </Text>
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
    gap: spacing.sm,
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
  refreshButton: {
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: palette.line,
    backgroundColor: palette.surfaceMuted,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: spacing.sm,
  },
  refreshButtonText: {
    color: palette.text,
    fontWeight: "700",
  },
  errorText: {
    textAlign: "right",
    color: palette.danger,
    fontWeight: "700",
  },
  loadingBox: {
    flexDirection: "row-reverse",
    justifyContent: "center",
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: spacing.md,
  },
  loadingText: {
    color: palette.textMuted,
  },
  emptyText: {
    textAlign: "right",
    color: palette.textMuted,
  },
  deviceRow: {
    borderTopWidth: 1,
    borderTopColor: palette.line,
    paddingTop: spacing.sm,
    gap: 5,
  },
  rowHeader: {
    flexDirection: "row-reverse",
    justifyContent: "space-between",
    alignItems: "center",
    gap: spacing.sm,
  },
  deviceName: {
    flex: 1,
    textAlign: "right",
    color: palette.text,
    fontWeight: "800",
  },
  platformBadge: {
    borderRadius: 999,
    overflow: "hidden",
    backgroundColor: "#E7EFFA",
    color: palette.primaryDark,
    fontWeight: "800",
    fontSize: 11,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
  },
  deviceMeta: {
    textAlign: "right",
    color: palette.textMuted,
    fontSize: 12,
  },
  removeButton: {
    marginTop: spacing.xs,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: "#F5C2C9",
    backgroundColor: "#FDEEF1",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: spacing.sm,
  },
  removeButtonText: {
    color: palette.danger,
    fontWeight: "700",
    fontSize: 12,
  },
  noteCard: {
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: "#D8E6F8",
    backgroundColor: "#F4F8FF",
    padding: spacing.md,
  },
  noteText: {
    textAlign: "right",
    color: "#20446B",
    lineHeight: 20,
    fontWeight: "600",
  },
  buttonPressed: {
    opacity: 0.84,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
});

