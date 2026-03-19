import { useRef, useEffect } from "react";
import { cn } from "@/lib/utils";

interface VideoElementProps {
  track: MediaStreamTrack;
  muted?: boolean;
  mirror?: boolean;
  /** "cover" crops to fill container (webcams), "contain" fits entire frame (screen shares) */
  fit?: "cover" | "contain";
  className?: string;
}

export function VideoElement({ track, muted = false, mirror = false, fit = "cover", className }: VideoElementProps) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;

    el.srcObject = new MediaStream([track]);

    // Explicit play() — autoPlay attribute alone can be silently blocked
    el.play().catch((err) => {
      console.warn("[video] Autoplay blocked for remote track:", err);
    });

    return () => {
      el.srcObject = null;
    };
  }, [track]);

  return (
    <video
      ref={videoRef}
      autoPlay
      playsInline
      muted={muted}
      className={cn(
        "w-full h-full bg-black",
        fit === "contain" ? "object-contain" : "object-cover",
        mirror && "scale-x-[-1]",
        className
      )}
    />
  );
}
