import { useEffect } from "react";
import { useRealmStore } from "../../stores/realm";
import { useIdentityStore } from "../../stores/identity";
import { useMembersStore } from "../../stores/members";
import { useNotificationsStore } from "../../stores/notifications";
import { useVoiceStore } from "../../stores/voice";
import { ChannelHeader } from "./ChannelHeader";
import { MessageList } from "./MessageList";
import { VideoGrid } from "../voice/VideoGrid";
import { VoiceControls } from "../voice/VoiceControls";
import { AudioConsumers } from "../voice/AudioConsumers";
import { SpeakingDetector } from "../voice/SpeakingDetector";
import { Headphones } from "lucide-react";

interface MainContentProps {
  onToggleSidebar?: () => void;
  onToggleMembers?: () => void;
}

export function MainContent({ onToggleSidebar, onToggleMembers }: MainContentProps) {
  const activeChannelId = useRealmStore((s) => s.activeChannelId);
  const channels = useRealmStore((s) => s.channels);
  const realmName = useRealmStore((s) => s.info.name);
  const publicKey = useIdentityStore((s) => s.publicKey);
  const members = useMembersStore((s) => s.members);
  const markRead = useNotificationsStore((s) => s.markRead);

  const voiceChannelId = useVoiceStore((s) => s.activeChannelId);

  const activeChannel = channels.find((c) => c.id === activeChannelId);

  useEffect(() => {
    if (activeChannelId) markRead(activeChannelId);
  }, [activeChannelId, markRead]);

  if (!activeChannel) {
    return (
      <div className="flex-1 flex items-center justify-center bg-background">
        <p className="text-muted-foreground">Select a channel</p>
      </div>
    );
  }

  // Resolve display name for DM channels
  let displayName = activeChannel.name;
  if (activeChannel.type === "dm" && activeChannel.participants) {
    const otherKey = activeChannel.participants.find((k) => k !== publicKey);
    if (otherKey) {
      displayName = members[otherKey]?.name ?? otherKey.slice(0, 8);
    }
  }

  const isVoiceChannel = activeChannel.type === "voice";
  const isInVoiceCall = isVoiceChannel && voiceChannelId === activeChannel.id;

  return (
    <div className="flex-1 flex flex-col bg-background min-w-0">
      <ChannelHeader
        channel={activeChannel}
        realmName={realmName}
        onToggleSidebar={onToggleSidebar}
        onToggleMembers={onToggleMembers}
      />

      {isVoiceChannel ? (
        isInVoiceCall ? (
          <>
            <VideoGrid />
            <VoiceControls />
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center bg-gradient-to-b from-background via-background to-secondary/30">
            <div className="text-center space-y-3">
              <Headphones className="w-12 h-12 text-muted-foreground/40 mx-auto" />
              <p className="text-muted-foreground text-sm">
                Click to join the voice channel
              </p>
            </div>
          </div>
        )
      ) : (
        <MessageList
          channelId={activeChannel.id}
          channelName={displayName}
          channelEncrypted={activeChannel.encrypted}
          isDm={activeChannel.type === "dm"}
        />
      )}

      {/* Audio + speaking detection — always mounted when in any voice call */}
      {voiceChannelId && (
        <>
          <AudioConsumers />
          <SpeakingDetector />
        </>
      )}
    </div>
  );
}
