import { useShallow } from "zustand/react/shallow";

import { useAuthStore } from "@/src/store/auth.store";

export const useAuth = () =>
  useAuthStore(
    useShallow((state) => ({
      hasBootstrapped: state.hasBootstrapped,
      isBooting: state.isBooting,
      isSubmitting: state.isSubmitting,
      session: state.session,
      employee: state.employee,
      error: state.error,
      bootstrap: state.bootstrap,
      getSession: state.getSession,
      signIn: state.signIn,
      signUp: state.signUp,
      signOut: state.signOut,
      clearError: state.clearError,
    })),
  );
