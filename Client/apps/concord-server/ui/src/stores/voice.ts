/**
 * Voice store for the server UI — full version with mediasoup state.
 * Mirrors the client's voice.ts store.
 */

import { create } from "zustand";

export type ProducerKind = "mic" | "webcam" | "screen";

export interface VoiceParticipant {
  publicKey: string;
  name: string;
  isMuted: boolean;
  isSpeaking: boolean;
  hasWebcam: boolean;
  hasScreen: boolean;
}

export interface RemoteProducer {
  producerId: string;
  producerPublicKey: string;
  kind: "audio" | "video";
  producerKind: ProducerKind;
}

export interface RemoteStream {
  consumerId: string;
  producerId: string;
  producerPublicKey: string;
  kind: "audio" | "video";
  producerKind: ProducerKind;
  track: MediaStreamTrack;
}

interface ChannelParticipantInfo {
  publicKey: string;
  name: string;
}

interface VoiceState {
  activeChannelId: string | null;
  isMuted: boolean;
  isDeafened: boolean;
  participants: Map<string, VoiceParticipant>;
  isWebcamOn: boolean;
  isScreenSharing: boolean;
  localAudioTrack: MediaStreamTrack | null;
  localWebcamTrack: MediaStreamTrack | null;
  localScreenTrack: MediaStreamTrack | null;
  remoteProducers: Map<string, RemoteProducer>;
  remoteStreams: Map<string, RemoteStream>;
  watchingScreenId: string | null;
  voiceChannelParticipants: Map<string, Map<string, ChannelParticipantInfo>>;
  screenShareChannels: Map<string, Set<string>>;

  joinVoice: (channelId: string) => void;
  leaveVoice: () => void;
  toggleMute: () => void;
  toggleDeafen: () => void;
  addParticipant: (participant: VoiceParticipant) => void;
  removeParticipant: (publicKey: string) => void;
  updateParticipantMedia: (publicKey: string, update: { hasWebcam?: boolean; hasScreen?: boolean }) => void;
  setSpeaking: (publicKey: string, isSpeaking: boolean) => void;
  setLocalAudioTrack: (track: MediaStreamTrack | null) => void;
  setWebcamOn: (on: boolean, track?: MediaStreamTrack | null) => void;
  setScreenSharing: (on: boolean, track?: MediaStreamTrack | null) => void;
  addRemoteProducer: (producer: RemoteProducer) => void;
  removeRemoteProducer: (producerId: string) => void;
  addRemoteStream: (stream: RemoteStream) => void;
  removeRemoteStream: (consumerId: string) => void;
  setWatchingScreen: (producerId: string | null) => void;
  addChannelParticipant: (channelId: string, info: ChannelParticipantInfo) => void;
  removeChannelParticipant: (channelId: string, publicKey: string) => void;
  setChannelParticipants: (channelId: string, participants: ChannelParticipantInfo[]) => void;
  clearChannelParticipants: () => void;
  addScreenSharer: (channelId: string, publicKey: string) => void;
  removeScreenSharer: (channelId: string, publicKey: string) => void;
  setScreenSharers: (data: Record<string, string[]>) => void;
}

export const useVoiceStore = create<VoiceState>((set) => ({
  activeChannelId: null,
  isMuted: false,
  isDeafened: false,
  participants: new Map(),
  isWebcamOn: false,
  isScreenSharing: false,
  localAudioTrack: null,
  localWebcamTrack: null,
  localScreenTrack: null,
  remoteProducers: new Map(),
  remoteStreams: new Map(),
  watchingScreenId: null,
  voiceChannelParticipants: new Map(),
  screenShareChannels: new Map(),

  joinVoice: (channelId) =>
    set({
      activeChannelId: channelId,
      participants: new Map(),
      remoteProducers: new Map(),
      remoteStreams: new Map(),
      isWebcamOn: false,
      isScreenSharing: false,
      localAudioTrack: null,
      localWebcamTrack: null,
      localScreenTrack: null,
      watchingScreenId: null,
    }),

  leaveVoice: () =>
    set({
      activeChannelId: null,
      participants: new Map(),
      remoteProducers: new Map(),
      remoteStreams: new Map(),
      isWebcamOn: false,
      isScreenSharing: false,
      localAudioTrack: null,
      localWebcamTrack: null,
      localScreenTrack: null,
      watchingScreenId: null,
    }),

  toggleMute: () => set((s) => ({ isMuted: !s.isMuted })),
  toggleDeafen: () => set((s) => ({ isDeafened: !s.isDeafened })),

  addParticipant: (participant) =>
    set((state) => {
      const participants = new Map(state.participants);
      participants.set(participant.publicKey, participant);
      return { participants };
    }),

  removeParticipant: (publicKey) =>
    set((state) => {
      const participants = new Map(state.participants);
      participants.delete(publicKey);
      return { participants };
    }),

  updateParticipantMedia: (publicKey, update) =>
    set((state) => {
      const participants = new Map(state.participants);
      const existing = participants.get(publicKey);
      if (existing) participants.set(publicKey, { ...existing, ...update });
      return { participants };
    }),

  setSpeaking: (publicKey, isSpeaking) =>
    set((state) => {
      const existing = state.participants.get(publicKey);
      if (!existing || existing.isSpeaking === isSpeaking) return state;
      const participants = new Map(state.participants);
      participants.set(publicKey, { ...existing, isSpeaking });
      return { participants };
    }),

  setLocalAudioTrack: (track) => set({ localAudioTrack: track }),
  setWebcamOn: (on, track) => set({ isWebcamOn: on, localWebcamTrack: track ?? null }),
  setScreenSharing: (on, track) => set({ isScreenSharing: on, localScreenTrack: track ?? null }),

  addRemoteProducer: (producer) =>
    set((state) => {
      const remoteProducers = new Map(state.remoteProducers);
      remoteProducers.set(producer.producerId, producer);
      return { remoteProducers };
    }),

  removeRemoteProducer: (producerId) =>
    set((state) => {
      const remoteProducers = new Map(state.remoteProducers);
      remoteProducers.delete(producerId);
      return { remoteProducers };
    }),

  addRemoteStream: (stream) =>
    set((state) => {
      const remoteStreams = new Map(state.remoteStreams);
      remoteStreams.set(stream.consumerId, stream);
      return { remoteStreams };
    }),

  removeRemoteStream: (consumerId) =>
    set((state) => {
      const remoteStreams = new Map(state.remoteStreams);
      remoteStreams.delete(consumerId);
      return { remoteStreams };
    }),

  setWatchingScreen: (producerId) => set({ watchingScreenId: producerId }),

  addChannelParticipant: (channelId, info) =>
    set((state) => {
      const map = new Map(state.voiceChannelParticipants);
      const channelMap = new Map(map.get(channelId) ?? []);
      channelMap.set(info.publicKey, info);
      map.set(channelId, channelMap);
      return { voiceChannelParticipants: map };
    }),

  removeChannelParticipant: (channelId, publicKey) =>
    set((state) => {
      const map = new Map(state.voiceChannelParticipants);
      const channelMap = new Map(map.get(channelId) ?? []);
      channelMap.delete(publicKey);
      if (channelMap.size === 0) map.delete(channelId);
      else map.set(channelId, channelMap);
      return { voiceChannelParticipants: map };
    }),

  setChannelParticipants: (channelId, participants) =>
    set((state) => {
      const map = new Map(state.voiceChannelParticipants);
      const channelMap = new Map<string, ChannelParticipantInfo>();
      for (const p of participants) channelMap.set(p.publicKey, p);
      if (channelMap.size > 0) map.set(channelId, channelMap);
      return { voiceChannelParticipants: map };
    }),

  clearChannelParticipants: () => set({ voiceChannelParticipants: new Map() }),

  addScreenSharer: (channelId, publicKey) =>
    set((state) => {
      const map = new Map(state.screenShareChannels);
      const channelSet = new Set(map.get(channelId));
      channelSet.add(publicKey);
      map.set(channelId, channelSet);
      return { screenShareChannels: map };
    }),

  removeScreenSharer: (channelId, publicKey) =>
    set((state) => {
      const map = new Map(state.screenShareChannels);
      const existing = map.get(channelId);
      if (!existing?.has(publicKey)) return state;
      const channelSet = new Set(existing);
      channelSet.delete(publicKey);
      if (channelSet.size === 0) map.delete(channelId);
      else map.set(channelId, channelSet);
      return { screenShareChannels: map };
    }),

  setScreenSharers: (data) =>
    set(() => {
      const map = new Map<string, Set<string>>();
      for (const [channelId, publicKeys] of Object.entries(data)) {
        map.set(channelId, new Set(publicKeys));
      }
      return { screenShareChannels: map };
    }),
}));

// ── Derived data helpers (use inside useMemo, NOT as Zustand selectors) ──

export function deriveWebcamStreams(remoteStreams: Map<string, RemoteStream>): RemoteStream[] {
  const streams: RemoteStream[] = [];
  for (const stream of remoteStreams.values()) {
    if (stream.producerKind === "webcam") streams.push(stream);
  }
  return streams;
}

export function deriveWatchedScreenStream(
  remoteStreams: Map<string, RemoteStream>,
  watchingScreenId: string | null
): RemoteStream | null {
  if (!watchingScreenId) return null;
  for (const stream of remoteStreams.values()) {
    if (stream.producerId === watchingScreenId) return stream;
  }
  return null;
}

export function deriveScreenSharers(
  remoteProducers: Map<string, RemoteProducer>,
  participants: Map<string, VoiceParticipant>
): { publicKey: string; name: string; producerId: string }[] {
  const sharers: { publicKey: string; name: string; producerId: string }[] = [];
  for (const producer of remoteProducers.values()) {
    if (producer.producerKind === "screen") {
      const participant = participants.get(producer.producerPublicKey);
      sharers.push({
        publicKey: producer.producerPublicKey,
        name: participant?.name ?? producer.producerPublicKey.slice(0, 8),
        producerId: producer.producerId,
      });
    }
  }
  return sharers;
}
