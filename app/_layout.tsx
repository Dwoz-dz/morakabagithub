import { Stack, type Href, useRootNavigationState, useRouter, useSegments } from "expo-router";
import * as ExpoSplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { resolveAppRoute } from "@/src/navigation/auth-routing";
import { useAuthStore } from "@/src/store/auth.store";
import { configureArabicTextDefaults } from "@/src/theme/rtl";
import { palette } from "@/src/theme/tokens";

configureArabicTextDefaults();

const BOOT_TIMEOUT_MS = 8_000;
const isNativeRuntime = Platform.OS !== "web";

if (isNativeRuntime) {
  ExpoSplashScreen.preventAutoHideAsync().catch(() => null);
}

export default function RootLayout() {
  const router = useRouter();
  const segments = useSegments();
  const rootNavigationState = useRootNavigationState();
  const [bootTimedOut, setBootTimedOut] = useState(false);

  const bootstrap = useAuthStore((state) => state.bootstrap);
  const hasBootstrapped = useAuthStore((state) => state.hasBootstrapped);
  const isBooting = useAuthStore((state) => state.isBooting);
  const session = useAuthStore((state) => state.session);
  const employee = useAuthStore((state) => state.employee);
  const authError = useAuthStore((state) => state.error);

  useEffect(() => {
    bootstrap();
  }, [bootstrap]);

  useEffect(() => {
    if (isNativeRuntime && hasBootstrapped) {
      ExpoSplashScreen.hideAsync().catch(() => null);
    }
  }, [hasBootstrapped]);

  useEffect(() => {
    if (hasBootstrapped) {
      setBootTimedOut(false);
      return;
    }

    const timeout = setTimeout(() => {
      setBootTimedOut(true);
    }, BOOT_TIMEOUT_MS);

    return () => clearTimeout(timeout);
  }, [hasBootstrapped]);

  const safeReplace = useCallback(
    (href: Href) => {
      requestAnimationFrame(() => {
        if (rootNavigationState?.key) {
          router.replace(href);
        }
      });
    },
    [rootNavigationState?.key, router],
  );

  useEffect(() => {
    if (!rootNavigationState?.key || !hasBootstrapped) {
      return;
    }

    const targetRoute = resolveAppRoute({
      hasBootstrapped,
      session,
      employee,
    });

    const [currentRootSegment, currentChildSegment] = segments as string[];

    if (targetRoute === "/splash") {
      if (currentRootSegment !== "splash") {
        safeReplace("/splash");
      }
      return;
    }

    if (targetRoute.startsWith("/(auth)")) {
      if (currentRootSegment !== "(auth)") {
        safeReplace(targetRoute);
        return;
      }

      const targetAuthScreen = targetRoute.split("/")[2];

      // For guests, both login and register are valid auth-entry screens.
      if (
        !session &&
        targetAuthScreen === "login" &&
        (currentChildSegment === "login" || currentChildSegment === "register")
      ) {
        return;
      }

      if (targetAuthScreen && currentChildSegment !== targetAuthScreen) {
        safeReplace(targetRoute);
      }
      return;
    }

    if (targetRoute.startsWith("/(app)")) {
      if (currentRootSegment !== "(app)") {
        safeReplace(targetRoute);
        return;
      }

      const targetAppScreen = targetRoute.split("/")[2];
      if (targetAppScreen && currentChildSegment !== targetAppScreen) {
        safeReplace(targetRoute);
      }
    }
  }, [employee, hasBootstrapped, rootNavigationState?.key, safeReplace, segments, session]);

  const retryBootstrap = useCallback(() => {
    setBootTimedOut(false);
    bootstrap();
  }, [bootstrap]);

  const showBootOverlay = !hasBootstrapped;
  const showBootFallback = showBootOverlay && bootTimedOut;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <View style={styles.root}>
          <StatusBar style="dark" backgroundColor={palette.background} />
          <Stack
            initialRouteName="splash"
            screenOptions={{
              headerShown: false,
              contentStyle: { backgroundColor: palette.background },
            }}
          >
            <Stack.Screen name="index" />
            <Stack.Screen name="splash" options={{ animation: "fade" }} />
            <Stack.Screen name="(auth)" options={{ animation: "slide_from_right" }} />
            <Stack.Screen name="(app)" options={{ animation: "fade_from_bottom" }} />
          </Stack>

          {showBootOverlay ? (
            <View style={styles.bootOverlay}>
              <View style={styles.bootCard}>
                <ActivityIndicator color={palette.primary} size="large" />
                <Text style={styles.bootTitle}>Morakaba</Text>
                <Text style={styles.bootMessage}>
                  {showBootFallback
                    ? authError ?? "App startup is taking longer than expected."
                    : "Preparing secure mobile session..."}
                </Text>
                {showBootFallback ? (
                  <Pressable
                    accessibilityRole="button"
                    onPress={retryBootstrap}
                    disabled={isBooting}
                    style={({ pressed }) => [
                      styles.retryButton,
                      isBooting && styles.retryButtonDisabled,
                      pressed && !isBooting && styles.retryButtonPressed,
                    ]}
                  >
                    <Text style={styles.retryText}>{isBooting ? "Retrying..." : "Retry"}</Text>
                  </Pressable>
                ) : null}
              </View>
            </View>
          ) : null}
        </View>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  bootOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: palette.background,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  bootCard: {
    width: "100%",
    maxWidth: 360,
    borderRadius: 20,
    padding: 20,
    alignItems: "center",
    gap: 12,
    borderWidth: 1,
    borderColor: palette.line,
    backgroundColor: palette.surface,
  },
  bootTitle: {
    color: palette.text,
    fontSize: 28,
    fontWeight: "900",
  },
  bootMessage: {
    color: palette.textMuted,
    textAlign: "center",
    lineHeight: 20,
    minHeight: 40,
  },
  retryButton: {
    minWidth: 120,
    borderRadius: 12,
    paddingHorizontal: 18,
    paddingVertical: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: palette.primary,
  },
  retryButtonPressed: {
    backgroundColor: palette.primaryDark,
  },
  retryButtonDisabled: {
    opacity: 0.75,
  },
  retryText: {
    color: "#FFFFFF",
    fontWeight: "800",
  },
});
