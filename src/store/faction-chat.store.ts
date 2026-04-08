import { create } from "zustand";

import type { FactionMessage } from "@/src/models";

interface FactionChatStore {
  unreadByFaction: Record<string, number>;
  latestMessageByFaction: Record<string, FactionMessage | null>;
  activeFaction: string | null;
  isChatOpen: boolean;
  realtimeStatus: string;

  setUnreadSnapshot: (payload: Record<string, number>) => void;
  incrementUnread: (faction: string) => void;
  clearUnreadForFaction: (faction: string) => void;

  setLatestMessage: (message: FactionMessage) => void;
  setLatestSnapshot: (payload: Record<string, FactionMessage | null>) => void;

  setChatContext: (isOpen: boolean, faction: string | null) => void;
  setRealtimeStatus: (status: string) => void;
  reset: () => void;
}

const INITIAL_STATE = {
  unreadByFaction: {} as Record<string, number>,
  latestMessageByFaction: {} as Record<string, FactionMessage | null>,
  activeFaction: null as string | null,
  isChatOpen: false,
  realtimeStatus: "idle",
};

export const useFactionChatStore = create<FactionChatStore>((set) => ({
  ...INITIAL_STATE,

  setUnreadSnapshot: (payload) => set({ unreadByFaction: { ...payload } }),

  incrementUnread: (faction) =>
    set((state) => ({
      unreadByFaction: {
        ...state.unreadByFaction,
        [faction]: (state.unreadByFaction[faction] ?? 0) + 1,
      },
    })),

  clearUnreadForFaction: (faction) =>
    set((state) => ({
      unreadByFaction: {
        ...state.unreadByFaction,
        [faction]: 0,
      },
    })),

  setLatestMessage: (message) =>
    set((state) => ({
      latestMessageByFaction: {
        ...state.latestMessageByFaction,
        [message.faction]: message,
      },
    })),

  setLatestSnapshot: (payload) =>
    set((state) => ({
      latestMessageByFaction: {
        ...state.latestMessageByFaction,
        ...payload,
      },
    })),

  setChatContext: (isOpen, faction) =>
    set({
      isChatOpen: isOpen,
      activeFaction: isOpen ? faction : null,
    }),

  setRealtimeStatus: (status) => set({ realtimeStatus: status }),

  reset: () => set({ ...INITIAL_STATE }),
}));
