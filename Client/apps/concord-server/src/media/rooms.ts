import type { types as MediasoupTypes } from "mediasoup";
import type { WebSocket } from "ws";
import { createRouter } from "./sfu.js";
import config from "../config.js";

export type ProducerKind = "mic" | "webcam" | "screen";

export interface ProducerInfo {
  producer: MediasoupTypes.Producer;
  kind: "audio" | "video";
  producerKind: ProducerKind;
}

export interface VoiceParticipant {
  publicKey: string;
  name: string;
  ws: WebSocket;
  sendTransport?: MediasoupTypes.WebRtcTransport;
  recvTransport?: MediasoupTypes.WebRtcTransport;
  producers: Map<string, ProducerInfo>;
  consumers: Map<string, MediasoupTypes.Consumer>;
}

export interface VoiceRoom {
  channelId: string;
  router: MediasoupTypes.Router;
  participants: Map<string, VoiceParticipant>;
}

const rooms = new Map<string, VoiceRoom>();

export async function getOrCreateRoom(channelId: string): Promise<VoiceRoom> {
  if (rooms.has(channelId)) {
    return rooms.get(channelId)!;
  }

  const router = await createRouter();
  const room: VoiceRoom = {
    channelId,
    router,
    participants: new Map(),
  };
  rooms.set(channelId, room);
  return room;
}

export function getRoom(channelId: string): VoiceRoom | undefined {
  return rooms.get(channelId);
}

export function removeParticipant(channelId: string, publicKey: string): void {
  const room = rooms.get(channelId);
  if (!room) return;

  const participant = room.participants.get(publicKey);
  if (participant) {
    for (const info of participant.producers.values()) {
      info.producer.close();
    }
    for (const consumer of participant.consumers.values()) {
      consumer.close();
    }
    participant.sendTransport?.close();
    participant.recvTransport?.close();
    room.participants.delete(publicKey);
  }

  // Clean up empty rooms
  if (room.participants.size === 0) {
    room.router.close();
    rooms.delete(channelId);
  }
}

export function getRoomParticipantList(
  channelId: string
): { publicKey: string; name: string }[] {
  const room = rooms.get(channelId);
  if (!room) return [];
  return Array.from(room.participants.values()).map((p) => ({
    publicKey: p.publicKey,
    name: p.name,
  }));
}

/** Get all voice participants across all rooms, keyed by channelId */
export function getAllVoiceParticipants(): Record<string, { publicKey: string; name: string }[]> {
  const result: Record<string, { publicKey: string; name: string }[]> = {};
  for (const [channelId, room] of rooms) {
    if (room.participants.size > 0) {
      result[channelId] = Array.from(room.participants.values()).map((p) => ({
        publicKey: p.publicKey,
        name: p.name,
      }));
    }
  }
  return result;
}

/** Get channel IDs that have active screen shares, mapped to the public keys sharing */
export function getScreenShareChannels(): Record<string, string[]> {
  const result: Record<string, string[]> = {};
  for (const [channelId, room] of rooms) {
    const sharers: string[] = [];
    for (const [pk, participant] of room.participants) {
      for (const info of participant.producers.values()) {
        if (info.producerKind === "screen") {
          sharers.push(pk);
          break;
        }
      }
    }
    if (sharers.length > 0) {
      result[channelId] = sharers;
    }
  }
  return result;
}

/** Get all ProducerInfo entries for a room, excluding a given publicKey */
export function getOtherProducers(
  channelId: string,
  excludePublicKey: string
): { producerId: string; producerPublicKey: string; kind: "audio" | "video"; producerKind: ProducerKind }[] {
  const room = rooms.get(channelId);
  if (!room) return [];

  const result: { producerId: string; producerPublicKey: string; kind: "audio" | "video"; producerKind: ProducerKind }[] = [];
  for (const [pk, participant] of room.participants) {
    if (pk === excludePublicKey) continue;
    for (const [producerId, info] of participant.producers) {
      result.push({
        producerId,
        producerPublicKey: pk,
        kind: info.kind,
        producerKind: info.producerKind,
      });
    }
  }
  return result;
}

// ── Transport helpers ──

export async function createTransport(
  channelId: string,
  publicKey: string,
  direction: "send" | "recv"
): Promise<{
  id: string;
  iceParameters: unknown;
  iceCandidates: unknown;
  dtlsParameters: unknown;
}> {
  const room = rooms.get(channelId);
  if (!room) throw new Error("Room not found");

  const participant = room.participants.get(publicKey);
  if (!participant) throw new Error("Participant not found");

  const transport = await room.router.createWebRtcTransport({
    listenInfos: [
      {
        protocol: "udp",
        ip: config.mediasoupListenIp,
        announcedAddress: config.mediasoupAnnouncedIp,
      },
      {
        protocol: "tcp",
        ip: config.mediasoupListenIp,
        announcedAddress: config.mediasoupAnnouncedIp,
      },
    ],
    enableUdp: true,
    enableTcp: true,
    preferUdp: true,
  });

  if (direction === "send") {
    participant.sendTransport = transport;
  } else {
    participant.recvTransport = transport;
  }

  return {
    id: transport.id,
    iceParameters: transport.iceParameters,
    iceCandidates: transport.iceCandidates,
    dtlsParameters: transport.dtlsParameters,
  };
}

export async function connectTransport(
  channelId: string,
  publicKey: string,
  transportId: string,
  dtlsParameters: MediasoupTypes.DtlsParameters
): Promise<void> {
  const room = rooms.get(channelId);
  if (!room) throw new Error("Room not found");

  const participant = room.participants.get(publicKey);
  if (!participant) throw new Error("Participant not found");

  const transport =
    participant.sendTransport?.id === transportId
      ? participant.sendTransport
      : participant.recvTransport?.id === transportId
        ? participant.recvTransport
        : null;

  if (!transport) throw new Error("Transport not found");

  await transport.connect({ dtlsParameters });
}

export async function createProducer(
  channelId: string,
  publicKey: string,
  kind: "audio" | "video",
  rtpParameters: MediasoupTypes.RtpParameters,
  producerKind: ProducerKind
): Promise<string> {
  const room = rooms.get(channelId);
  if (!room) throw new Error("Room not found");

  const participant = room.participants.get(publicKey);
  if (!participant) throw new Error("Participant not found");
  if (!participant.sendTransport) throw new Error("No send transport");

  const producer = await participant.sendTransport.produce({
    kind,
    rtpParameters,
  });

  participant.producers.set(producer.id, { producer, kind, producerKind });

  return producer.id;
}

export async function createConsumer(
  channelId: string,
  publicKey: string,
  producerId: string
): Promise<{
  consumerId: string;
  producerId: string;
  kind: "audio" | "video";
  rtpParameters: unknown;
  producerKind: ProducerKind;
  producerPublicKey: string;
} | null> {
  const room = rooms.get(channelId);
  if (!room) {
    console.warn("[voice] createConsumer: room not found for", channelId);
    return null;
  }

  const participant = room.participants.get(publicKey);
  if (!participant?.recvTransport) {
    console.warn("[voice] createConsumer: no recvTransport for", publicKey);
    return null;
  }

  // Find the producer across all participants
  let foundInfo: ProducerInfo | undefined;
  let foundPublicKey = "";
  for (const [pk, p] of room.participants) {
    const info = p.producers.get(producerId);
    if (info) {
      foundInfo = info;
      foundPublicKey = pk;
      break;
    }
  }

  if (!foundInfo) {
    console.warn("[voice] createConsumer: producer not found", producerId);
    return null;
  }

  // Use router capabilities for canConsume check — all client devices
  // were loaded from these capabilities so they're guaranteed compatible
  const rtpCapabilities = room.router.rtpCapabilities;

  if (!room.router.canConsume({ producerId, rtpCapabilities })) {
    console.warn("[voice] createConsumer: canConsume returned false for", producerId);
    return null;
  }

  const consumer = await participant.recvTransport.consume({
    producerId,
    rtpCapabilities,
    paused: false,
  });

  participant.consumers.set(consumer.id, consumer);

  console.log("[voice] Consumer created:", consumer.id, "for producer", producerId, "(", foundInfo.producerKind, ")");

  return {
    consumerId: consumer.id,
    producerId,
    kind: consumer.kind as "audio" | "video",
    rtpParameters: consumer.rtpParameters,
    producerKind: foundInfo.producerKind,
    producerPublicKey: foundPublicKey,
  };
}

export function closeProducer(
  channelId: string,
  publicKey: string,
  producerId: string
): ProducerInfo | null {
  const room = rooms.get(channelId);
  if (!room) return null;

  const participant = room.participants.get(publicKey);
  if (!participant) return null;

  const info = participant.producers.get(producerId);
  if (!info) return null;

  info.producer.close();
  participant.producers.delete(producerId);
  return info;
}
