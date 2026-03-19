import { useVoiceStore } from "../../stores/voice";
import { getWebSocketClient } from "../../features/connection/realm-handler";
import { leaveVoiceChannel } from "../../features/media/voice";
import { PhoneOff, Video, Monitor } from "lucide-react";

export function VoicePanel() {
  const activeChannelId = useVoiceStore((s) => s.activeChannelId);
  const isWebcamOn = useVoiceStore((s) => s.isWebcamOn);
  const isScreenSharing = useVoiceStore((s) => s.isScreenSharing);

  if (!activeChannelId) return null;

  function handleLeave() {
    if (!activeChannelId) return;
    const client = getWebSocketClient();
    if (client) {
      leaveVoiceChannel(activeChannelId, client);
    }
  }

  return (
    <div className="border-t border-sidebar-border bg-sidebar-background shrink-0">
      <div className="px-3 py-2 flex items-center gap-2">
        <div className="flex-1 min-w-0">
          <div className="text-[11px] font-semibold text-identity uppercase tracking-wide">
            Voice Connected
          </div>
          <div className="flex items-center gap-1.5 mt-0.5">
            {isWebcamOn && <Video className="w-3 h-3 text-muted-foreground" />}
            {isScreenSharing && <Monitor className="w-3 h-3 text-identity" />}
          </div>
        </div>
        <button
          onClick={handleLeave}
          className="p-1 rounded hover:bg-destructive/10 cursor-pointer"
          title="Disconnect"
        >
          <PhoneOff className="w-3.5 h-3.5 text-destructive" />
        </button>
      </div>
    </div>
  );
}
