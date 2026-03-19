import { create } from "zustand";
import { reportUnread } from "../features/bridge/iframe-bridge";

const HIDDEN_DMS_KEY = "concord:hiddenDms";

function persistHiddenDms(ids: Set<string>): void {
  localStorage.setItem(HIDDEN_DMS_KEY, JSON.stringify([...ids]));
}

function loadHiddenDms(): Set<string> {
  try {
    const raw = localStorage.getItem(HIDDEN_DMS_KEY);
    return raw ? new Set(JSON.parse(raw)) : new Set();
  } catch {
    return new Set();
  }
}

interface NotificationsState {
  unreadCounts: Record<string, number>;
  hiddenDmIds: Set<string>;

  incrementUnread: (channelId: string) => void;
  markRead: (channelId: string) => void;
  clearAll: () => void;
  getTotalUnread: () => number;
  hideDm: (channelId: string) => void;
  unhideDm: (channelId: string) => void;
  isDmHidden: (channelId: string) => boolean;
  restoreHiddenDms: () => void;
}

export const useNotificationsStore = create<NotificationsState>((set, get) => ({
  unreadCounts: {},
  hiddenDmIds: loadHiddenDms(),

  incrementUnread: (channelId) => {
    // If a hidden DM gets a new message, unhide it
    const hidden = get().hiddenDmIds;
    if (hidden.has(channelId)) {
      const next = new Set(hidden);
      next.delete(channelId);
      persistHiddenDms(next);
      set({ hiddenDmIds: next });
    }

    set((state) => ({
      unreadCounts: {
        ...state.unreadCounts,
        [channelId]: (state.unreadCounts[channelId] ?? 0) + 1,
      },
    }));
    // Report total to parent for sidebar badge
    const total = get().getTotalUnread();
    reportUnread(total);
  },

  markRead: (channelId) =>
    set((state) => {
      if (!(channelId in state.unreadCounts)) return state;
      const { [channelId]: _, ...rest } = state.unreadCounts;
      reportUnread(Object.values(rest).reduce((a, b) => a + b, 0));
      return { unreadCounts: rest };
    }),

  clearAll: () => {
    set({ unreadCounts: {} });
    reportUnread(0);
  },

  getTotalUnread: () => {
    const counts = get().unreadCounts;
    return Object.values(counts).reduce((a, b) => a + b, 0);
  },

  hideDm: (channelId) =>
    set((state) => {
      const next = new Set(state.hiddenDmIds);
      next.add(channelId);
      persistHiddenDms(next);
      return { hiddenDmIds: next };
    }),

  unhideDm: (channelId) =>
    set((state) => {
      const next = new Set(state.hiddenDmIds);
      next.delete(channelId);
      persistHiddenDms(next);
      return { hiddenDmIds: next };
    }),

  isDmHidden: (channelId) => get().hiddenDmIds.has(channelId),

  restoreHiddenDms: () => set({ hiddenDmIds: loadHiddenDms() }),
}));
