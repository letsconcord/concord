import { useVoiceStore } from "../../stores/voice";
import { Avatar } from "../ui/avatar";
import { Monitor } from "lucide-react";

interface VoiceChannelParticipantsProps {
  channelId: string;
  onJoin?: () => void;
}

export function VoiceChannelParticipants({ channelId, onJoin }: VoiceChannelParticipantsProps) {
  const channelMap = useVoiceStore(
    (s) => s.voiceChannelParticipants.get(channelId)
  );

  if (!channelMap || channelMap.size === 0) return null;

  const participants = Array.from(channelMap.values());

  return (
    <div
      className={onJoin ? "pl-7 space-y-0.5 pb-1 cursor-pointer rounded-md hover:bg-sidebar-accent/30 transition-colors" : "pl-7 space-y-0.5 pb-1"}
      onClick={onJoin}
      role={onJoin ? "button" : undefined}
    >
      {participants.map((p) => {
        const voiceParticipant = useVoiceStore.getState().participants.get(p.publicKey);
        return (
          <div
            key={p.publicKey}
            className="flex items-center gap-1.5 px-1 py-0.5 rounded text-[13px] text-sidebar-foreground/80"
          >
            <Avatar name={p.name} size="xs" />
            <span className="truncate flex-1">{p.name}</span>
            {voiceParticipant?.hasScreen && (
              <span className="flex items-center gap-0.5 text-[10px] font-medium text-identity bg-identity/10 px-1 py-0.5 rounded">
                <Monitor className="w-2.5 h-2.5" />
                LIVE
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}
