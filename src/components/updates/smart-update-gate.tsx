import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";
import * as Linking from "expo-linking";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  AppState,
  BackHandler,
  Easing,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { EMPLOYEE_ROLES, type AppUpdate, type EmployeeRole, type UpdateResolution } from "@/src/models";
import { AppUpdatesService } from "@/src/services/supabase/app-updates.service";
import { resolveStoragePathOrUrl } from "@/src/services/supabase/storage.service";
import { useAuthStore } from "@/src/store/auth.store";

const FOREGROUND_RECHECK_GUARD_MS = 20_000;

const TRANSITION_STEPS = ["التحقق من التحديث", "تجهيز صفحة التحديث", "تحويلك الآن"] as const;

const UPDATE_DISMISSED_PREFIX = "morakaba:update-dismissed:";
const UPDATE_FORCE_LOGOUT_PREFIX = "morakaba:update-force-logout:";
const UPDATE_STORAGE_PREFIXES = [UPDATE_DISMISSED_PREFIX, UPDATE_FORCE_LOGOUT_PREFIX] as const;

const EMPTY_UPDATE_RESOLUTION: UpdateResolution = {
  requirement: "none",
  activeUpdate: null,
  history: [],
  shouldForceLogout: false,
};

const buildUpdateStorageSuffix = (update: AppUpdate): string => `${update.id}:${update.version}`;

const buildDismissKey = (update: AppUpdate): string =>
  `${UPDATE_DISMISSED_PREFIX}${buildUpdateStorageSuffix(update)}`;

const buildForceLogoutKey = (update: AppUpdate): string =>
  `${UPDATE_FORCE_LOGOUT_PREFIX}${buildUpdateStorageSuffix(update)}`;

const getUpdateStorageSuffix = (key: string): string | null => {
  for (const prefix of UPDATE_STORAGE_PREFIXES) {
    if (!key.startsWith(prefix)) {
      continue;
    }

    const suffix = key.slice(prefix.length).trim();
    return suffix || null;
  }

  return null;
};

const buildScopedUpdateSuffixes = (resolution: UpdateResolution): Set<string> => {
  const suffixes = new Set<string>();

  if (resolution.activeUpdate) {
    suffixes.add(buildUpdateStorageSuffix(resolution.activeUpdate));
  }

  resolution.history.forEach((item) => {
    suffixes.add(buildUpdateStorageSuffix(item));
  });

  return suffixes;
};

const clearStaleUpdateStorage = async (allowedSuffixes: Set<string>): Promise<void> => {
  try {
    const keys = await AsyncStorage.getAllKeys();
    const staleKeys = keys.filter((key) => {
      const suffix = getUpdateStorageSuffix(key);
      if (!suffix) {
        return false;
      }

      return !allowedSuffixes.has(suffix);
    });

    if (!staleKeys.length) {
      return;
    }

    await AsyncStorage.multiRemove(staleKeys);
  } catch {
    // Best effort cache cleanup.
  }
};

const getCurrentAppVersion = (): string => {
  const version =
    Constants.expoConfig?.version ??
    (Constants as unknown as { manifest2?: { extra?: { expoClient?: { version?: string } } } }).manifest2?.extra
      ?.expoClient?.version;

  return typeof version === "string" && version.trim() ? version.trim() : "0.0.0";
};

const formatPublishedAt = (value: string | null): string | null => {
  if (!value) return null;

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;

  return parsed.toLocaleDateString("ar-DZ", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
};

const resolvePreferredUpdateUrl = async (
  update: AppUpdate,
): Promise<{ url: string | null; error: string | null }> => {
  if (Platform.OS === "android") {
    if (update.apkPath) {
      const resolved = await resolveStoragePathOrUrl({
        bucket: "app-updates-apk",
        pathOrUrl: update.apkPath,
        expiresIn: 3600,
      });

      if (resolved.error) {
        return { url: null, error: resolved.error };
      }

      if (resolved.url) {
        return { url: resolved.url, error: null };
      }
    }

    return { url: update.androidUrl ?? update.iosUrl ?? null, error: null };
  }

  return { url: update.iosUrl ?? update.androidUrl ?? null, error: null };
};

const normalizeRuntimeRole = (role: EmployeeRole): EmployeeRole =>
  role === EMPLOYEE_ROLES.ADMIN ? EMPLOYEE_ROLES.ADMIN : EMPLOYEE_ROLES.MEMBER;

const normalizeRuntimeTargetRoles = (update: AppUpdate): AppUpdate["targetRoles"] => {
  const validRoles = update.targetRoles.filter(
    (role): role is AppUpdate["targetRoles"][number] =>
      role === EMPLOYEE_ROLES.MEMBER || role === EMPLOYEE_ROLES.ADMIN || role === "all",
  );

  if (!validRoles.length) {
    return [];
  }

  if (validRoles.includes("all")) {
    return ["all"];
  }

  return Array.from(new Set(validRoles));
};

const matchesUpdateRole = (role: EmployeeRole, update: AppUpdate | null): boolean => {
  if (!update) {
    return false;
  }

  const targetRoles = normalizeRuntimeTargetRoles(update);
  if (!targetRoles.length) {
    return false;
  }

  const normalizedRole = normalizeRuntimeRole(role);
  return targetRoles.includes("all") || targetRoles.includes(normalizedRole);
};

export default function SmartUpdateGate() {
  const insets = useSafeAreaInsets();
  const session = useAuthStore((state) => state.session);
  const employee = useAuthStore((state) => state.employee);
  const signOut = useAuthStore((state) => state.signOut);

  const currentVersion = useMemo(() => getCurrentAppVersion(), []);
  const appStateRef = useRef(AppState.currentState);
  const isCheckingRef = useRef(false);
  const lastCheckAtRef = useRef(0);
  const lastIdentityRef = useRef<string | null>(null);

  const [resolution, setResolution] = useState<UpdateResolution>(EMPTY_UPDATE_RESOLUTION);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [isActionBusy, setIsActionBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [transitionPercent, setTransitionPercent] = useState(0);
  const [transitionStepIndex, setTransitionStepIndex] = useState(0);

  const overlayOpacity = useRef(new Animated.Value(0)).current;
  const cardTranslateY = useRef(new Animated.Value(26)).current;
  const progressValue = useRef(new Animated.Value(0)).current;

  const visible = resolution.requirement === "mandatory" || resolution.requirement === "optional";
  const activeUpdate = resolution.activeUpdate;
  const identityKey =
    session && employee ? `${session.user.id}:${normalizeRuntimeRole(employee.role)}` : null;
  const previousUpdates = useMemo(
    () => resolution.history.filter((item) => item.id !== activeUpdate?.id).slice(0, 4),
    [activeUpdate?.id, resolution.history],
  );

  const resetTransitionState = useCallback(() => {
    setIsTransitioning(false);
    setTransitionPercent(0);
    setTransitionStepIndex(0);
    progressValue.stopAnimation();
    progressValue.setValue(0);
  }, [progressValue]);

  const animateIn = useCallback(() => {
    overlayOpacity.setValue(0);
    cardTranslateY.setValue(26);
    Animated.parallel([
      Animated.timing(overlayOpacity, {
        toValue: 1,
        duration: 240,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(cardTranslateY, {
        toValue: 0,
        duration: 280,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();
  }, [cardTranslateY, overlayOpacity]);

  const hideOptionalPrompt = useCallback(
    async (update: AppUpdate) => {
      const dismissKey = buildDismissKey(update);
      await AsyncStorage.setItem(dismissKey, new Date().toISOString());
      setResolution((prev) => ({
        ...prev,
        requirement: "none",
        activeUpdate: null,
        shouldForceLogout: false,
      }));
      setActionError(null);
      setShowHistory(false);
      resetTransitionState();
    },
    [resetTransitionState],
  );

  const runCheck = useCallback(
    async (reason: "startup" | "foreground" | "login") => {
      if (!session || !employee) {
        await clearStaleUpdateStorage(new Set<string>());
        setResolution(EMPTY_UPDATE_RESOLUTION);
        setActionError(null);
        setShowHistory(false);
        resetTransitionState();
        return;
      }

      const now = Date.now();
      if (reason === "foreground" && now - lastCheckAtRef.current < FOREGROUND_RECHECK_GUARD_MS) {
        return;
      }

      if (isCheckingRef.current) {
        return;
      }

      isCheckingRef.current = true;
      lastCheckAtRef.current = now;

      try {
        const result = await AppUpdatesService.evaluateForCurrentUser({
          currentVersion,
          role: employee.role,
        });

        if (result.error || !result.data) {
          setResolution(EMPTY_UPDATE_RESOLUTION);
          setActionError(result.error ?? "تعذر التحقق من التحديثات.");
          setShowHistory(false);
          resetTransitionState();
          return;
        }

        const nextResolution = result.data;
        const scopedActive = matchesUpdateRole(employee.role, nextResolution.activeUpdate)
          ? nextResolution.activeUpdate
          : null;
        const scopedHistory = nextResolution.history.filter((item) => matchesUpdateRole(employee.role, item));
        const scopedResolution: UpdateResolution = {
          requirement: scopedActive ? nextResolution.requirement : "none",
          activeUpdate: scopedActive,
          history: scopedHistory,
          shouldForceLogout: scopedActive ? nextResolution.shouldForceLogout : false,
        };
        const nextActive = scopedResolution.activeUpdate;
        await clearStaleUpdateStorage(buildScopedUpdateSuffixes(scopedResolution));

        if (!nextActive) {
          setResolution(scopedResolution);
          setActionError(null);
          setShowHistory(false);
          resetTransitionState();
          return;
        }

        if (scopedResolution.shouldForceLogout) {
          const forceKey = buildForceLogoutKey(nextActive);
          const alreadyApplied = await AsyncStorage.getItem(forceKey);
          if (!alreadyApplied) {
            await AsyncStorage.setItem(forceKey, new Date().toISOString());
            await signOut();
            return;
          }
        }

        if (scopedResolution.requirement === "optional") {
          const dismissKey = buildDismissKey(nextActive);
          const isDismissed = await AsyncStorage.getItem(dismissKey);
          if (isDismissed) {
            setResolution({
              ...scopedResolution,
              requirement: "none",
              activeUpdate: null,
              shouldForceLogout: false,
            });
            setShowHistory(false);
            resetTransitionState();
            return;
          }
        }

        setResolution(scopedResolution);
        setActionError(null);
      } finally {
        isCheckingRef.current = false;
      }
    },
    [currentVersion, employee, resetTransitionState, session, signOut],
  );

  useEffect(() => {
    if (lastIdentityRef.current === null) {
      lastIdentityRef.current = identityKey;
      return;
    }

    if (lastIdentityRef.current === identityKey) {
      return;
    }

    lastIdentityRef.current = identityKey;
    setResolution(EMPTY_UPDATE_RESOLUTION);
    setActionError(null);
    setShowHistory(false);
    resetTransitionState();
    void clearStaleUpdateStorage(new Set<string>());
  }, [identityKey, resetTransitionState]);

  const startStoreTransition = useCallback(async () => {
    if (!activeUpdate) return;

    const resolvedUrl = await resolvePreferredUpdateUrl(activeUpdate);
    if (resolvedUrl.error) {
      setActionError("تعذر تجهيز ملف التحديث من Supabase Storage.");
      return;
    }

    const downloadUrl = resolvedUrl.url;
    if (!downloadUrl) {
      setActionError("رابط التحديث غير متوفر لهذا الإصدار.");
      return;
    }

    setActionError(null);
    setIsActionBusy(true);
    setIsTransitioning(true);

    try {
      const canOpen = await Linking.canOpenURL(downloadUrl);
      if (!canOpen) {
        setActionError("تعذر فتح رابط التحديث. تحقق من الرابط المنشور.");
        setIsTransitioning(false);
        setIsActionBusy(false);
        return;
      }

      progressValue.setValue(0);
      Animated.timing(progressValue, {
        toValue: 1,
        duration: 2700,
        easing: Easing.inOut(Easing.cubic),
        useNativeDriver: false,
      }).start(async ({ finished }) => {
        if (!finished) {
          setIsActionBusy(false);
          return;
        }

        try {
          await Linking.openURL(downloadUrl);
          if (resolution.requirement === "optional") {
            await hideOptionalPrompt(activeUpdate);
          }
        } catch {
          setActionError("تعذر فتح صفحة التحديث. حاول مرة أخرى.");
        } finally {
          setIsActionBusy(false);
          if (resolution.requirement !== "optional") {
            setIsTransitioning(false);
          }
        }
      });
    } catch {
      setActionError("حدث خطأ أثناء تجهيز التحديث.");
      setIsActionBusy(false);
      setIsTransitioning(false);
    }
  }, [activeUpdate, hideOptionalPrompt, progressValue, resolution.requirement]);

  useEffect(() => {
    void runCheck("startup");
  }, [runCheck]);

  useEffect(() => {
    if (!session || !employee) return;
    void runCheck("login");
  }, [employee, runCheck, session]);

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (nextState) => {
      const cameFromBackground =
        appStateRef.current === "inactive" || appStateRef.current === "background";
      appStateRef.current = nextState;

      if (cameFromBackground && nextState === "active") {
        void runCheck("foreground");
      }
    });

    return () => {
      subscription.remove();
    };
  }, [runCheck]);

  useEffect(() => {
    const listenerId = progressValue.addListener(({ value }) => {
      const percent = Math.max(0, Math.min(100, Math.round(value * 100)));
      setTransitionPercent(percent);

      if (value < 0.34) {
        setTransitionStepIndex(0);
        return;
      }

      if (value < 0.78) {
        setTransitionStepIndex(1);
        return;
      }

      setTransitionStepIndex(2);
    });

    return () => {
      progressValue.removeListener(listenerId);
    };
  }, [progressValue]);

  useEffect(() => {
    if (visible) {
      animateIn();
      return;
    }

    setShowHistory(false);
    resetTransitionState();
  }, [animateIn, resetTransitionState, visible]);

  useEffect(() => {
    if (!employee) {
      return;
    }

    const scopedActive = matchesUpdateRole(employee.role, resolution.activeUpdate) ? resolution.activeUpdate : null;
    const scopedHistory = resolution.history.filter((item) => matchesUpdateRole(employee.role, item));

    const hasHistoryMismatch = scopedHistory.length !== resolution.history.length;
    const hasActiveMismatch = Boolean(resolution.activeUpdate && !scopedActive);
    if (!hasHistoryMismatch && !hasActiveMismatch) {
      return;
    }

    setResolution((prev) => ({
      requirement: scopedActive ? prev.requirement : "none",
      activeUpdate: scopedActive,
      history: scopedHistory,
      shouldForceLogout: scopedActive ? prev.shouldForceLogout : false,
    }));

    setShowHistory(false);
    if (!scopedActive) {
      resetTransitionState();
    }
  }, [employee, resolution.activeUpdate, resolution.history, resetTransitionState]);

  useEffect(() => {
    if (resolution.requirement !== "mandatory") {
      return;
    }

    const backSubscription = BackHandler.addEventListener("hardwareBackPress", () => true);
    return () => {
      backSubscription.remove();
    };
  }, [resolution.requirement]);

  const renderReleaseNotes = () => {
    if (!activeUpdate) return null;

    const notes = activeUpdate.releaseNotes.length
      ? activeUpdate.releaseNotes
      : ["تم إصدار تحديث جديد يتضمن تحسينات عامة وتجربة أكثر استقرارًا."];

    return (
      <View style={styles.notesCard}>
        <Text style={styles.notesTitle}>ملاحظات الإصدار</Text>
        {notes.map((note) => (
          <Text key={note} style={styles.noteRow}>
            • {note}
          </Text>
        ))}
      </View>
    );
  };

  if (!employee || !visible || !activeUpdate || !matchesUpdateRole(employee.role, activeUpdate)) {
    return null;
  }

  const publishedLabel = formatPublishedAt(activeUpdate.publishedAt);
  const progressWidth = progressValue.interpolate({
    inputRange: [0, 1],
    outputRange: ["0%", "100%"],
  });

  return (
    <Animated.View
      style={[
        styles.overlay,
        {
          paddingTop: Math.max(insets.top, 18),
          paddingBottom: Math.max(insets.bottom, 20),
          opacity: overlayOpacity,
        },
      ]}
      pointerEvents="auto"
    >
      <Animated.View style={[styles.card, { transform: [{ translateY: cardTranslateY }] }]}>
        <View style={styles.header}>
          <View style={styles.iconWrap}>
            <Text style={styles.iconGlyph}>⇪</Text>
          </View>
          <View style={styles.headerTextWrap}>
            <Text style={styles.headerLabel}>تحديث التطبيق</Text>
            <Text style={styles.headerTitle}>تحديث Morakaba</Text>
          </View>
        </View>

        <View style={styles.badgesRow}>
          <View style={styles.badge}>
            <Text style={styles.badgeText}>v{activeUpdate.version}</Text>
          </View>
          <View style={[styles.badge, resolution.requirement === "mandatory" && styles.badgeMandatory]}>
            <Text style={[styles.badgeText, resolution.requirement === "mandatory" && styles.badgeMandatoryText]}>
              {resolution.requirement === "mandatory" ? "إجباري" : "اختياري"}
            </Text>
          </View>
        </View>

        <Text style={styles.updateTitle}>{activeUpdate.title}</Text>
        {publishedLabel ? <Text style={styles.publishedAtText}>نُشر في {publishedLabel}</Text> : null}

        {!isTransitioning ? renderReleaseNotes() : null}

        {!isTransitioning && previousUpdates.length ? (
          <View style={styles.historyWrap}>
            <Pressable onPress={() => setShowHistory((prev) => !prev)} style={styles.historyToggle}>
              <Text style={styles.historyToggleText}>
                {showHistory ? "إخفاء سجل الإصدارات" : "عرض سجل الإصدارات الأخيرة"}
              </Text>
            </Pressable>

            {showHistory ? (
              <View style={styles.historyList}>
                {previousUpdates.map((item) => (
                  <View key={item.id} style={styles.historyItem}>
                    <Text style={styles.historyVersion}>v{item.version}</Text>
                    <Text style={styles.historyDate}>{formatPublishedAt(item.publishedAt) ?? "--"}</Text>
                  </View>
                ))}
              </View>
            ) : null}
          </View>
        ) : null}

        {isTransitioning ? (
          <View style={styles.transitionWrap}>
            <Text style={styles.transitionTitle}>جاري تجهيز التحديث...</Text>
            <Text style={styles.transitionStep}>{TRANSITION_STEPS[transitionStepIndex]}</Text>
            <View style={styles.progressTrack}>
              <Animated.View style={[styles.progressFill, { width: progressWidth }]} />
            </View>
            <Text style={styles.progressPercent}>{transitionPercent}%</Text>
          </View>
        ) : null}

        {actionError ? <Text style={styles.errorText}>{actionError}</Text> : null}

        <View style={styles.actionsRow}>
          {resolution.requirement === "optional" && !isTransitioning ? (
            <Pressable
              style={({ pressed }) => [styles.secondaryButton, pressed && styles.buttonPressed]}
              disabled={isActionBusy}
              onPress={() => void hideOptionalPrompt(activeUpdate)}
            >
              <Text style={styles.secondaryButtonText}>لاحقًا</Text>
            </Pressable>
          ) : null}

          {!isTransitioning ? (
            <Pressable
              style={({ pressed }) => [styles.primaryButton, pressed && styles.buttonPressed]}
              disabled={isActionBusy}
              onPress={() => void startStoreTransition()}
            >
              {isActionBusy ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text style={styles.primaryButtonText}>تحديث الآن</Text>
              )}
            </Pressable>
          ) : null}
        </View>
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 9999,
    backgroundColor: "rgba(6, 12, 24, 0.82)",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 18,
  },
  card: {
    width: "100%",
    maxWidth: 430,
    borderRadius: 30,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
    backgroundColor: "#101A2C",
    paddingHorizontal: 18,
    paddingTop: 18,
    paddingBottom: 16,
    gap: 12,
  },
  header: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 12,
  },
  iconWrap: {
    width: 46,
    height: 46,
    borderRadius: 14,
    backgroundColor: "rgba(77, 129, 220, 0.22)",
    alignItems: "center",
    justifyContent: "center",
  },
  iconGlyph: {
    color: "#D5E5FF",
    fontSize: 22,
    fontWeight: "900",
  },
  headerTextWrap: {
    flex: 1,
    gap: 2,
  },
  headerLabel: {
    textAlign: "right",
    color: "#9CB4DA",
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0.4,
  },
  headerTitle: {
    textAlign: "right",
    color: "#F4F8FF",
    fontSize: 22,
    fontWeight: "900",
  },
  badgesRow: {
    flexDirection: "row-reverse",
    gap: 8,
  },
  badge: {
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: "rgba(220, 230, 255, 0.1)",
    borderWidth: 1,
    borderColor: "rgba(223, 232, 255, 0.2)",
  },
  badgeText: {
    color: "#D6E4FF",
    fontSize: 12,
    fontWeight: "800",
  },
  badgeMandatory: {
    backgroundColor: "rgba(255, 99, 99, 0.18)",
    borderColor: "rgba(255, 150, 150, 0.38)",
  },
  badgeMandatoryText: {
    color: "#FFD4D4",
  },
  updateTitle: {
    textAlign: "right",
    color: "#ECF3FF",
    fontSize: 18,
    fontWeight: "800",
    lineHeight: 25,
  },
  publishedAtText: {
    textAlign: "right",
    color: "#A4B9DA",
    fontSize: 12,
  },
  notesCard: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(212, 224, 255, 0.12)",
    backgroundColor: "rgba(220, 233, 255, 0.08)",
    padding: 12,
    gap: 8,
  },
  notesTitle: {
    textAlign: "right",
    color: "#E9F1FF",
    fontSize: 13,
    fontWeight: "800",
  },
  noteRow: {
    textAlign: "right",
    color: "#D5E2F8",
    lineHeight: 20,
  },
  historyWrap: {
    gap: 8,
  },
  historyToggle: {
    alignSelf: "flex-end",
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(200, 220, 255, 0.25)",
    paddingVertical: 6,
    paddingHorizontal: 10,
  },
  historyToggleText: {
    color: "#C8DBFF",
    fontSize: 12,
    fontWeight: "700",
  },
  historyList: {
    gap: 6,
  },
  historyItem: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(203, 220, 255, 0.16)",
    backgroundColor: "rgba(213, 226, 255, 0.08)",
    paddingVertical: 8,
    paddingHorizontal: 10,
    flexDirection: "row-reverse",
    justifyContent: "space-between",
    alignItems: "center",
  },
  historyVersion: {
    color: "#E7F0FF",
    fontWeight: "800",
  },
  historyDate: {
    color: "#AEC3E6",
    fontSize: 12,
  },
  transitionWrap: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(218, 231, 255, 0.14)",
    backgroundColor: "rgba(213, 227, 255, 0.08)",
    padding: 12,
    gap: 8,
  },
  transitionTitle: {
    textAlign: "right",
    color: "#ECF4FF",
    fontWeight: "800",
    fontSize: 14,
  },
  transitionStep: {
    textAlign: "right",
    color: "#D4E2F7",
    fontSize: 13,
  },
  progressTrack: {
    height: 10,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.12)",
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    borderRadius: 999,
    backgroundColor: "#7FA9FF",
  },
  progressPercent: {
    textAlign: "right",
    color: "#CFE0FF",
    fontWeight: "800",
  },
  errorText: {
    textAlign: "right",
    color: "#FFD2D2",
    fontWeight: "700",
  },
  actionsRow: {
    marginTop: 4,
    flexDirection: "row-reverse",
    gap: 8,
  },
  primaryButton: {
    flex: 1,
    minHeight: 46,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#4F84DF",
  },
  primaryButtonText: {
    color: "#FFFFFF",
    fontWeight: "900",
    fontSize: 15,
  },
  secondaryButton: {
    minHeight: 46,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.2)",
    paddingHorizontal: 20,
  },
  secondaryButtonText: {
    color: "#D8E6FF",
    fontWeight: "800",
  },
  buttonPressed: {
    opacity: 0.84,
  },
});

