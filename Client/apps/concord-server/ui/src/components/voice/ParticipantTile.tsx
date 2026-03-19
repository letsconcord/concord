import type { VoiceParticipant } from "../../stores/voice";
import { Avatar } from "../ui/avatar";
import { MicOff } from "lucide-react";
import { cn } from "@/lib/utils";

interface ParticipantTileProps {
  participant: VoiceParticipant;
}

export function ParticipantTile({ participant }: ParticipantTileProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center p-4 rounded-lg bg-secondary",
        participant.isSpeaking && "ring-2 ring-green-500"
      )}
    >
      <Avatar name={participant.name} size="lg" />
      <div className="mt-2 flex items-center gap-1">
        <span className="text-sm text-foreground">{participant.name}</span>
        {participant.isMuted && (
          <MicOff className="w-3.5 h-3.5 text-destructive" />
        )}
      </div>
    </div>
  );
}
