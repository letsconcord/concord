import { useRef, useEffect } from "react";
import { useVoiceStore } from "../../stores/voice";

function AudioTrack({ track }: { track: MediaStreamTrack }) {
  const audioRef = useRef<HTMLAudioElement>(null);

  useEffect(() => {
    const el = audioRef.current;
    if (!el) return;

    const stream = new MediaStream([track]);
    el.srcObject = stream;

    // autoPlay attribute alone is unreliable — Chromium/WebView2 can silently
    // block it. Explicitly calling play() with catch ensures audio actually starts.
    el.play().catch((err) => {
      console.warn("[audio] Autoplay blocked for remote track, retrying on user gesture:", err);
      const resume = () => {
        el.play().catch(() => {});
        document.removeEventListener("click", resume);
        document.removeEventListener("keydown", resume);
      };
      document.addEventListener("click", resume, { once: true });
      document.addEventListener("keydown", resume, { once: true });
    });

    return () => {
      el.srcObject = null;
    };
  }, [track]);

  return <audio ref={audioRef} autoPlay playsInline />;
}

export function AudioConsumers() {
  const remoteStreams = useVoiceStore((s) => s.remoteStreams);
  const isDeafened = useVoiceStore((s) => s.isDeafened);

  if (isDeafened) return null;

  const audioStreams = Array.from(remoteStreams.values()).filter(
    (s) => s.kind === "audio"
  );

  if (audioStreams.length === 0) return null;

  return (
    <div className="hidden">
      {audioStreams.map((stream) => (
        <AudioTrack key={stream.consumerId} track={stream.track} />
      ))}
    </div>
  );
}
