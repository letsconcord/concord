/**
 * Members store for the server UI.
 * Simplified single-realm version — no per-realm maps.
 */

import { create } from "zustand";
import type { UserProfile } from "@concord/protocol";

interface MembersState {
  members: Record<string, UserProfile>;
  onlineKeys: Set<string>;
  setMembers: (members: UserProfile[]) => void;
  setOnlineKeys: (keys: string[]) => void;
  addMember: (member: UserProfile) => void;
  removeMember: (publicKey: string) => void;
  setOnline: (publicKey: string) => void;
  setOffline: (publicKey: string) => void;
  setMemberRole: (publicKey: string, roleId: string | undefined) => void;
  getMembersArray: () => UserProfile[];
}

export const useMembersStore = create<MembersState>((set, get) => ({
  members: {},
  onlineKeys: new Set(),

  setMembers: (members) => {
    const map: Record<string, UserProfile> = {};
    for (const m of members) map[m.publicKey] = m;
    set({ members: map });
  },

  setOnlineKeys: (keys) => set({ onlineKeys: new Set(keys) }),

  addMember: (member) =>
    set((state) => {
      const existing = state.members[member.publicKey];
      return {
        members: {
          ...state.members,
          [member.publicKey]: existing
            ? { ...existing, ...member, roleId: member.roleId ?? existing.roleId }
            : member,
        },
      };
    }),

  removeMember: (publicKey) =>
    set((state) => {
      const { [publicKey]: _, ...rest } = state.members;
      return { members: rest };
    }),

  setOnline: (publicKey) =>
    set((state) => {
      const next = new Set(state.onlineKeys);
      next.add(publicKey);
      return { onlineKeys: next };
    }),

  setOffline: (publicKey) =>
    set((state) => {
      const next = new Set(state.onlineKeys);
      next.delete(publicKey);
      return { onlineKeys: next };
    }),

  setMemberRole: (publicKey, roleId) =>
    set((state) => {
      const member = state.members[publicKey];
      if (!member) return state;
      return {
        members: {
          ...state.members,
          [publicKey]: { ...member, roleId },
        },
      };
    }),

  getMembersArray: () => Object.values(get().members),
}));
