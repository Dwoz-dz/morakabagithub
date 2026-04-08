import AsyncStorage from "@react-native-async-storage/async-storage";
import type { Session } from "@supabase/supabase-js";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import type { Employee } from "@/src/models";
import { AuthService } from "@/src/services/supabase/auth.service";
import { PresenceService } from "@/src/services/supabase/presence.service";

interface AuthStore {
  hasBootstrapped: boolean;
  isBooting: boolean;
  isSubmitting: boolean;
  session: Session | null;
  employee: Employee | null;
  error: string | null;

  bootstrap: () => Promise<void>;
  getSession: () => Promise<Session | null>;
  signIn: (email: string, password: string) => Promise<boolean>;
  signUp: (params: {
    fullName: string;
    email: string;
    password: string;
    faction: string;
  }) => Promise<boolean>;
  signOut: () => Promise<void>;
  clearError: () => void;
}

interface PersistedAuthState {
  session: Session | null;
  employee: Employee | null;
}

export const useAuthStore = create<AuthStore>()(
  persist(
    (set) => ({
      hasBootstrapped: false,
      isBooting: false,
      isSubmitting: false,
      session: null,
      employee: null,
      error: null,

      bootstrap: async () => {
        set({ isBooting: true, error: null });
        try {
          const result = await AuthService.bootstrap();
          if (result.error) {
            set({
              hasBootstrapped: true,
              isBooting: false,
              session: null,
              employee: null,
              error: result.error,
            });
            return;
          }

          set({
            hasBootstrapped: true,
            isBooting: false,
            session: result.data?.session ?? null,
            employee: result.data?.employee ?? null,
            error: null,
          });
        } catch (error) {
          set({
            hasBootstrapped: true,
            isBooting: false,
            session: null,
            employee: null,
            error: error instanceof Error ? error.message : "Unexpected bootstrap failure.",
          });
        }
      },

      getSession: async () => {
        const result = await AuthService.getSession();
        if (result.error) {
          set({ error: result.error });
          return null;
        }

        set({ session: result.data ?? null });
        return result.data ?? null;
      },

      signIn: async (email, password) => {
        set({ isSubmitting: true, error: null });

        const result = await AuthService.signIn(email, password);
        if (result.error) {
          set({ isSubmitting: false, error: result.error });
          return false;
        }

        set({
          isSubmitting: false,
          session: result.data?.session ?? null,
          employee: result.data?.employee ?? null,
          error: null,
        });

        return true;
      },

      signUp: async ({ fullName, email, password, faction }) => {
        set({ isSubmitting: true, error: null });

        const result = await AuthService.signUp({
          fullName,
          email,
          password,
          faction,
        });

        if (result.error) {
          set({ isSubmitting: false, error: result.error });
          return false;
        }

        set({
          isSubmitting: false,
          session: result.data?.session ?? null,
          employee: result.data?.employee ?? null,
          error: null,
        });

        return true;
      },

      signOut: async () => {
        set({ isSubmitting: true, error: null });

        try {
          await PresenceService.markCurrentPresenceOffline();
        } catch {
          // Best effort only; sign-out must continue.
        }

        const result = await AuthService.signOut();
        if (result.error) {
          set({ isSubmitting: false, error: result.error });
          return;
        }

        set({
          isSubmitting: false,
          session: null,
          employee: null,
          error: null,
        });
      },

      clearError: () => set({ error: null }),
    }),
    {
      name: "morakaba-auth-v2",
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state): PersistedAuthState => ({
        session: state.session,
        employee: state.employee,
      }),
    },
  ),
);
