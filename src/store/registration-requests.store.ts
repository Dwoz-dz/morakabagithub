import { create } from "zustand";

import {
  REGISTRATION_REQUEST_STATUSES,
  type RegistrationRequest,
} from "@/src/models";
import {
  RegistrationRequestsService,
  type RegistrationDecision,
  type RegistrationRequestFilter,
} from "@/src/services/supabase/registration-requests.service";

interface RegistrationRequestsStore {
  requests: RegistrationRequest[];
  filter: RegistrationRequestFilter;
  isLoading: boolean;
  actionRequestId: string | null;
  error: string | null;

  setFilter: (filter: RegistrationRequestFilter) => void;
  fetchRequests: (nextFilter?: RegistrationRequestFilter) => Promise<void>;
  processRequest: (
    request: RegistrationRequest,
    decision: RegistrationDecision,
    actor?: { authUserId?: string | null; employeeId?: string | null },
  ) => Promise<boolean>;
  clearError: () => void;
}

const applyFilter = (
  requests: RegistrationRequest[],
  filter: RegistrationRequestFilter,
): RegistrationRequest[] => {
  if (filter === "all") {
    return requests;
  }

  return requests.filter((request) => request.status === filter);
};

export const useRegistrationRequestsStore = create<RegistrationRequestsStore>()((set, get) => ({
  requests: [],
  filter: REGISTRATION_REQUEST_STATUSES.PENDING,
  isLoading: false,
  actionRequestId: null,
  error: null,

  setFilter: (filter) => {
    set({ filter });
  },

  fetchRequests: async (nextFilter) => {
    const activeFilter = nextFilter ?? get().filter;
    set({ isLoading: true, error: null, filter: activeFilter });

    const result = await RegistrationRequestsService.list(activeFilter);
    if (result.error) {
      set({ isLoading: false, error: result.error });
      return;
    }

    set({
      isLoading: false,
      requests: result.data ?? [],
      error: null,
    });
  },

  processRequest: async (request, decision, actor) => {
    set({ actionRequestId: request.id, error: null });

    const result = await RegistrationRequestsService.processRequest({
      request,
      decision,
      actorAuthUserId: actor?.authUserId ?? null,
      actorEmployeeId: actor?.employeeId ?? null,
    });

    if (result.error || !result.data) {
      set({ actionRequestId: null, error: result.error ?? "Failed to process request." });
      return false;
    }

    const currentFilter = get().filter;
    const currentRequests = get().requests;

    const nextRequests = currentRequests.map((currentRequest) =>
      currentRequest.id === result.data?.id ? result.data : currentRequest,
    );

    set({
      actionRequestId: null,
      requests: applyFilter(nextRequests, currentFilter),
      error: null,
    });

    return true;
  },

  clearError: () => set({ error: null }),
}));
