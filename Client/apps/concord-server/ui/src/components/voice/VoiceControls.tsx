import { useState } from "react";
import { useVoiceStore } from "../../stores/voice";
import { getWebSocketClient } from "../../features/connection/realm-handler";
import {
  leaveVoiceChannel,
  toggleMuteAudio,
  produceWebcam,
  stopWebcam,
  produceScreen,
  stopScreen,
} from "../../features/media/voice";
import { Mic, MicOff, Video, VideoOff, Monitor, MonitorOff, PhoneOff } from "lucide-react";
import { cn } from "@/lib/utils";

export function VoiceControls() {
  const activeChannelId = useVoiceStore((s) => s.activeChannelId);
  const isMuted = useVoiceStore((s) => s.isMuted);
  const isWebcamOn = useVoiceStore((s) => s.isWebcamOn);
  const isScreenSharing = useVoiceStore((s) => s.isScreenSharing);
  const [busy, setBusy] = useState(false);

  if (!activeChannelId) return null;

  function handleMicToggle() {
    toggleMuteAudio();
  }

  async function handleWebcamToggle() {
    if (busy) return;
    const client = getWebSocketClient();
    if (!client || !activeChannelId) return;
    setBusy(true);
    try {
      if (isWebcamOn) {
        await stopWebcam(activeChannelId, client);
      } else {
        await produceWebcam(activeChannelId, client);
      }
    } catch (err) {
      console.error("[voice] Webcam toggle failed:", err);
    } finally {
      setBusy(false);
    }
  }

  async function handleScreenToggle() {
    if (busy) return;
    const client = getWebSocketClient();
    if (!client || !activeChannelId) return;
    setBusy(true);
    try {
      if (isScreenSharing) {
        await stopScreen(activeChannelId, client);
      } else {
        await produceScreen(activeChannelId, client);
      }
    } catch (err) {
      console.error("[voice] Screen share toggle failed:", err);
    } finally {
      setBusy(false);
    }
  }

  function handleLeave() {
    const client = getWebSocketClient();
    if (!client || !activeChannelId) return;
    leaveVoiceChannel(activeChannelId, client);
  }

  return (
    <div className="flex items-center justify-center gap-2 py-3 px-4 bg-secondary/50 border-t border-border shrink-0">
      <ControlButton
        onClick={handleMicToggle}
        active={!isMuted}
        title={isMuted ? "Unmute" : "Mute"}
      >
        {isMuted ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
      </ControlButton>

      <ControlButton
        onClick={handleWebcamToggle}
        active={isWebcamOn}
        disabled={busy}
        title={isWebcamOn ? "Turn off camera" : "Turn on camera"}
      >
        {isWebcamOn ? <Video className="w-5 h-5" /> : <VideoOff className="w-5 h-5" />}
      </ControlButton>

      <ControlButton
        onClick={handleScreenToggle}
        active={isScreenSharing}
        disabled={busy}
        title={isScreenSharing ? "Stop sharing" : "Share screen"}
      >
        {isScreenSharing ? <Monitor className="w-5 h-5" /> : <MonitorOff className="w-5 h-5" />}
      </ControlButton>

      <ControlButton
        onClick={handleLeave}
        variant="destructive"
        title="Leave call"
      >
        <PhoneOff className="w-5 h-5" />
      </ControlButton>
    </div>
  );
}

function ControlButton({
  onClick,
  active,
  disabled,
  variant,
  title,
  children,
}: {
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
  variant?: "destructive";
  title: string;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={cn(
        "p-3 rounded-full transition-colors cursor-pointer",
        variant === "destructive"
          ? "bg-destructive/10 text-destructive hover:bg-destructive/20"
          : active
            ? "bg-foreground/10 text-foreground hover:bg-foreground/15"
            : "bg-secondary text-muted-foreground hover:bg-secondary/80",
        disabled && "opacity-50 cursor-not-allowed"
      )}
    >
      {children}
    </button>
  );
}
