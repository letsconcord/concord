import { Device, type types as MediasoupTypes } from "mediasoup-client";
import { useVoiceStore } from "../../stores/voice";
import type { WebSocketClient } from "../connection/websocket-client";
import type { Envelope } from "@concord/protocol";
import { playJoinSound, playLeaveSound } from "./sounds";

let device: Device | null = null;
let sendTransport: MediasoupTypes.Transport | null = null;
let recvTransport: MediasoupTypes.Transport | null = null;
let audioProducer: MediasoupTypes.Producer | null = null;
let webcamProducer: MediasoupTypes.Producer | null = null;
let screenProducer: MediasoupTypes.Producer | null = null;
const consumers = new Map<string, MediasoupTypes.Consumer>();

function waitForEvent<T = unknown>(
  client: WebSocketClient,
  type: string,
  predicate?: (payload: T) => boolean,
  timeout = 10000
): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      unsub();
      reject(new Error(`Timeout waiting for ${type}`));
    }, timeout);

    const unsub = client.on(type, (envelope: Envelope) => {
      const payload = envelope.payload as T;
      if (!predicate || predicate(payload)) {
        clearTimeout(timer);
        unsub();
        resolve(payload);
      }
    });
  });
}

export async function joinVoiceChannel(
  channelId: string,
  client: WebSocketClient
): Promise<void> {
  client.send("voice:join", { channelId });
}

export function confirmVoiceJoined(channelId: string): void {
  useVoiceStore.getState().joinVoice(channelId);
  playJoinSound();
}

export function leaveVoiceChannel(
  channelId: string,
  client: WebSocketClient
): void {
  client.send("voice:leave", { channelId });
  playLeaveSound();

  if (audioProducer) {
    const track = audioProducer.track;
    audioProducer.close();
    track?.stop();
    audioProducer = null;
  }
  if (webcamProducer) {
    const track = webcamProducer.track;
    webcamProducer.close();
    track?.stop();
    webcamProducer = null;
  }
  if (screenProducer) {
    const track = screenProducer.track;
    screenProducer.close();
    track?.stop();
    screenProducer = null;
  }

  for (const consumer of consumers.values()) {
    consumer.close();
  }
  consumers.clear();

  sendTransport?.close();
  recvTransport?.close();
  sendTransport = null;
  recvTransport = null;
  device = null;

  useVoiceStore.getState().leaveVoice();
}

export async function initDevice(rtpCapabilities: unknown): Promise<void> {
  device = new Device();
  await device.load({
    routerRtpCapabilities: rtpCapabilities as MediasoupTypes.RtpCapabilities,
  });
}

export async function createTransports(
  channelId: string,
  client: WebSocketClient,
  iceServers?: RTCIceServer[]
): Promise<void> {
  if (!device) throw new Error("Device not loaded");

  client.send("voice:create-transport", { channelId, direction: "send" });
  const sendParams = await waitForEvent<{
    direction: string;
    transportId: string;
    iceParameters: MediasoupTypes.IceParameters;
    iceCandidates: MediasoupTypes.IceCandidate[];
    dtlsParameters: MediasoupTypes.DtlsParameters;
  }>(client, "voice:transport-created", (p) => p.direction === "send");

  sendTransport = device.createSendTransport({
    id: sendParams.transportId,
    iceParameters: sendParams.iceParameters,
    iceCandidates: sendParams.iceCandidates,
    dtlsParameters: sendParams.dtlsParameters,
    iceServers,
  });

  sendTransport.on("connect", ({ dtlsParameters }, callback, errback) => {
    try {
      client.send("voice:connect-transport", {
        channelId,
        transportId: sendTransport!.id,
        dtlsParameters,
      });
      setTimeout(callback, 100);
    } catch (err) {
      errback(err as Error);
    }
  });

  sendTransport.on("produce", ({ kind, rtpParameters, appData }, callback, errback) => {
    try {
      const producerKind = (appData.producerKind as string) ?? "mic";
      client.send("voice:produce", { channelId, kind, rtpParameters, producerKind });
      waitForEvent<{ producerId: string }>(client, "voice:produced")
        .then(({ producerId }) => callback({ id: producerId }))
        .catch(errback);
    } catch (err) {
      errback(err as Error);
    }
  });

  client.send("voice:create-transport", { channelId, direction: "recv" });
  const recvParams = await waitForEvent<{
    direction: string;
    transportId: string;
    iceParameters: MediasoupTypes.IceParameters;
    iceCandidates: MediasoupTypes.IceCandidate[];
    dtlsParameters: MediasoupTypes.DtlsParameters;
  }>(client, "voice:transport-created", (p) => p.direction === "recv");

  recvTransport = device.createRecvTransport({
    id: recvParams.transportId,
    iceParameters: recvParams.iceParameters,
    iceCandidates: recvParams.iceCandidates,
    dtlsParameters: recvParams.dtlsParameters,
    iceServers,
  });

  recvTransport.on("connect", ({ dtlsParameters }, callback, errback) => {
    try {
      client.send("voice:connect-transport", {
        channelId,
        transportId: recvTransport!.id,
        dtlsParameters,
      });
      setTimeout(callback, 100);
    } catch (err) {
      errback(err as Error);
    }
  });
}

export async function produceAudio(
  channelId: string,
  client: WebSocketClient
): Promise<void> {
  if (!sendTransport) throw new Error("No send transport");

  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const track = stream.getAudioTracks()[0];

  audioProducer = await sendTransport.produce({
    track,
    appData: { producerKind: "mic" },
  });

  const { isMuted, isDeafened } = useVoiceStore.getState();
  if (isMuted || isDeafened) {
    audioProducer.pause();
  }

  useVoiceStore.getState().setLocalAudioTrack(track);
}

export function toggleMuteAudio(): void {
  const store = useVoiceStore.getState();
  if (store.isMuted) {
    if (!store.isDeafened && audioProducer) audioProducer.resume();
  } else {
    if (audioProducer) audioProducer.pause();
  }
  store.toggleMute();
}

export function toggleDeafenAudio(): void {
  const store = useVoiceStore.getState();
  if (store.isDeafened) {
    if (!store.isMuted && audioProducer) audioProducer.resume();
  } else {
    if (audioProducer) audioProducer.pause();
  }
  store.toggleDeafen();
}

// ── Webcam ──

export async function produceWebcam(
  channelId: string,
  client: WebSocketClient
): Promise<void> {
  if (!sendTransport) throw new Error("No send transport");

  const stream = await navigator.mediaDevices.getUserMedia({
    video: { width: { ideal: 1280 }, height: { ideal: 720 } },
  });
  const track = stream.getVideoTracks()[0];

  webcamProducer = await sendTransport.produce({
    track,
    appData: { producerKind: "webcam" },
  });

  useVoiceStore.getState().setWebcamOn(true, track);
}

export async function stopWebcam(
  channelId: string,
  client: WebSocketClient
): Promise<void> {
  if (!webcamProducer) return;

  const track = webcamProducer.track;
  const producerId = webcamProducer.id;
  webcamProducer.close();
  track?.stop();
  webcamProducer = null;

  client.send("voice:close-producer", { channelId, producerId });
  useVoiceStore.getState().setWebcamOn(false);
}

// ── Screen sharing ──

export async function produceScreen(
  channelId: string,
  client: WebSocketClient
): Promise<void> {
  if (!sendTransport) throw new Error("No send transport");

  const stream = await navigator.mediaDevices.getDisplayMedia({
    video: true,
    audio: false,
  });
  const track = stream.getVideoTracks()[0];

  // Handle user stopping share via OS UI
  track.onended = () => {
    stopScreen(channelId, client);
  };

  screenProducer = await sendTransport.produce({
    track,
    appData: { producerKind: "screen" },
  });

  useVoiceStore.getState().setScreenSharing(true, track);
}

export async function stopScreen(
  channelId: string,
  client: WebSocketClient
): Promise<void> {
  if (!screenProducer) return;

  const track = screenProducer.track;
  const producerId = screenProducer.id;
  screenProducer.close();
  track?.stop();
  screenProducer = null;

  client.send("voice:close-producer", { channelId, producerId });
  useVoiceStore.getState().setScreenSharing(false);
}

export function isRecvTransportReady(): boolean {
  return !!recvTransport && !!device;
}

export async function consumeProducer(
  channelId: string,
  producerId: string,
  client: WebSocketClient
): Promise<void> {
  if (!recvTransport || !device) throw new Error("No recv transport or device");

  client.send("voice:consume", { channelId, producerId });

  const result = await waitForEvent<{
    consumerId: string;
    producerId: string;
    kind: "audio" | "video";
    rtpParameters: MediasoupTypes.RtpParameters;
    producerKind: "mic" | "webcam" | "screen";
    producerPublicKey: string;
  }>(client, "voice:consumed", (p) => p.producerId === producerId);

  const consumer = await recvTransport.consume({
    id: result.consumerId,
    producerId: result.producerId,
    kind: result.kind,
    rtpParameters: result.rtpParameters,
  });

  await consumer.resume();
  consumers.set(consumer.id, consumer);

  useVoiceStore.getState().addRemoteStream({
    consumerId: consumer.id,
    producerId: result.producerId,
    producerPublicKey: result.producerPublicKey,
    kind: result.kind,
    producerKind: result.producerKind,
    track: consumer.track,
  });
}

export function closeConsumerForProducer(producerId: string): void {
  const store = useVoiceStore.getState();
  for (const [consumerId, consumer] of consumers) {
    if (consumer.producerId === producerId) {
      consumer.close();
      consumers.delete(consumerId);
      store.removeRemoteStream(consumerId);
      break;
    }
  }
}
