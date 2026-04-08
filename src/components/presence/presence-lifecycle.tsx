import { useEffect, useRef } from "react";
import { AppState, type AppStateStatus } from "react-native";

import { PresenceService } from "@/src/services/supabase/presence.service";
import { useAuthStore } from "@/src/store/auth.store";

const HEARTBEAT_INTERVAL_MS = 30_000;

const isApprovedEmployee = (status: string | null | undefined): boolean => status === "approved";

export default function PresenceLifecycle() {
  const sessionUserId = useAuthStore((state) => state.session?.user?.id ?? null);
  const employee = useAuthStore((state) => state.employee);

  const appStateRef = useRef<AppStateStatus>(AppState.currentState);
  const heartbeatTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    const canTrack = Boolean(sessionUserId && employee?.authUserId && isApprovedEmployee(employee.status));

    const clearHeartbeatTimer = () => {
      if (!heartbeatTimerRef.current) {
        return;
      }

      clearInterval(heartbeatTimerRef.current);
      heartbeatTimerRef.current = null;
    };

    if (!canTrack) {
      clearHeartbeatTimer();
      return undefined;
    }

    void PresenceService.upsertCurrentPresenceOnline();

    heartbeatTimerRef.current = setInterval(() => {
      if (appStateRef.current === "active") {
        void PresenceService.heartbeatPresence();
      }
    }, HEARTBEAT_INTERVAL_MS);

    const subscription = AppState.addEventListener("change", (nextState) => {
      const previousState = appStateRef.current;
      appStateRef.current = nextState;

      if (nextState === "active") {
        void PresenceService.upsertCurrentPresenceOnline();
        return;
      }

      if (previousState === "active" && (nextState === "inactive" || nextState === "background")) {
        void PresenceService.markCurrentPresenceOffline();
      }
    });

    return () => {
      subscription.remove();
      clearHeartbeatTimer();
      void PresenceService.markCurrentPresenceOffline();
    };
  }, [employee?.authUserId, employee?.status, sessionUserId]);

  return null;
}
