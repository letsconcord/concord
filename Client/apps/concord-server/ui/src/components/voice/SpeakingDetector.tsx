import { useEffect, useRef } from "react";
import { useVoiceStore } from "../../stores/voice";
import { useIdentityStore } from "../../stores/identity";

const SPEAKING_THRESHOLD = 15; // Average frequency amplitude (0–255) to consider "speaking"
const SILENCE_DELAY = 300; // ms before marking as not speaking (avoids flicker)
const POLL_INTERVAL = 50; // ms between audio level checks

interface TrackAnalyser {
  publicKey: string;
  source: MediaStreamAudioSourceNode;
  analyser: AnalyserNode;
  lastSpeaking: number;
}

/**
 * Invisible component that monitors audio levels for all voice participants.
 * Updates isSpeaking in the voice store based on audio energy.
 * Mount when in a voice channel, unmount when leaving.
 */
export function SpeakingDetector() {
  const localAudioTrack = useVoiceStore((s) => s.localAudioTrack);
  const remoteStreams = useVoiceStore((s) => s.remoteStreams);
  const selfKey = useIdentityStore((s) => s.publicKey);

  const audioCtxRef = useRef<AudioContext | null>(null);
  const analysersRef = useRef<Map<string, TrackAnalyser>>(new Map());
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Sync analysers with current tracks
  useEffect(() => {
    if (!audioCtxRef.current) {
      audioCtxRef.current = new AudioContext();
    }
    const ctx = audioCtxRef.current;

    // Build desired set of track IDs
    const desired = new Map<string, { track: MediaStreamTrack; publicKey: string }>();

    if (localAudioTrack && selfKey) {
      desired.set(`local:${selfKey}`, { track: localAudioTrack, publicKey: selfKey });
    }

    for (const stream of remoteStreams.values()) {
      if (stream.kind === "audio") {
        desired.set(`remote:${stream.producerPublicKey}`, {
          track: stream.track,
          publicKey: stream.producerPublicKey,
        });
      }
    }

    // Add analysers for new tracks
    for (const [id, { track, publicKey }] of desired) {
      if (!analysersRef.current.has(id)) {
        try {
          const mediaStream = new MediaStream([track]);
          const source = ctx.createMediaStreamSource(mediaStream);
          const analyser = ctx.createAnalyser();
          analyser.fftSize = 256;
          analyser.smoothingTimeConstant = 0.3;
          source.connect(analyser);
          analysersRef.current.set(id, { publicKey, source, analyser, lastSpeaking: 0 });
        } catch {
          // Track may be ended or invalid
        }
      }
    }

    // Remove analysers for tracks no longer present
    for (const [id, entry] of analysersRef.current) {
      if (!desired.has(id)) {
        entry.source.disconnect();
        analysersRef.current.delete(id);
      }
    }

    // Ensure polling is running if we have analysers
    if (!timerRef.current && analysersRef.current.size > 0) {
      startPolling();
    }
    if (analysersRef.current.size === 0 && timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, [localAudioTrack, remoteStreams, selfKey]);

  function startPolling() {
    const dataArray = new Uint8Array(128);

    timerRef.current = setInterval(() => {
      const now = Date.now();
      const store = useVoiceStore.getState();

      for (const entry of analysersRef.current.values()) {
        entry.analyser.getByteFrequencyData(dataArray);

        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) {
          sum += dataArray[i];
        }
        const avg = sum / dataArray.length;

        if (avg > SPEAKING_THRESHOLD) {
          entry.lastSpeaking = now;
          store.setSpeaking(entry.publicKey, true);
        } else if (now - entry.lastSpeaking > SILENCE_DELAY) {
          store.setSpeaking(entry.publicKey, false);
        }
      }
    }, POLL_INTERVAL);
  }

  // Full cleanup on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      for (const entry of analysersRef.current.values()) {
        entry.source.disconnect();
      }
      analysersRef.current.clear();
      if (audioCtxRef.current) {
        audioCtxRef.current.close();
        audioCtxRef.current = null;
      }
    };
  }, []);

  return null;
}
