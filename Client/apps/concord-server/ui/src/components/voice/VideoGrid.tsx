import { useMemo, useState, useRef, useCallback, useEffect } from "react";
import { useVoiceStore, deriveWebcamStreams, deriveWatchedScreenStream, deriveScreenSharers } from "../../stores/voice";
import { useIdentityStore } from "../../stores/identity";
import { VideoElement } from "./VideoElement";
import { Avatar } from "../ui/avatar";
import { consumeProducer, closeConsumerForProducer } from "../../features/media/voice";
import { getWebSocketClient } from "../../features/connection/realm-handler";
import { Monitor, MicOff, Expand, Shrink, Maximize, X } from "lucide-react";
import { cn } from "@/lib/utils";

export function VideoGrid() {
  const participants = useVoiceStore((s) => s.participants);
  const remoteStreams = useVoiceStore((s) => s.remoteStreams);
  const remoteProducers = useVoiceStore((s) => s.remoteProducers);
  const localWebcamTrack = useVoiceStore((s) => s.localWebcamTrack);
  const localScreenTrack = useVoiceStore((s) => s.localScreenTrack);
  const isWebcamOn = useVoiceStore((s) => s.isWebcamOn);
  const isScreenSharing = useVoiceStore((s) => s.isScreenSharing);
  const watchingScreenId = useVoiceStore((s) => s.watchingScreenId);
  const activeChannelId = useVoiceStore((s) => s.activeChannelId);
  const selfPublicKey = useIdentityStore((s) => s.publicKey);
  const selfName = useIdentityStore((s) => s.name);

  const webcamStreams = useMemo(() => deriveWebcamStreams(remoteStreams), [remoteStreams]);
  const watchedStream = useMemo(() => deriveWatchedScreenStream(remoteStreams, watchingScreenId), [remoteStreams, watchingScreenId]);
  const screenSharers = useMemo(() => deriveScreenSharers(remoteProducers, participants), [remoteProducers, participants]);

  const participantList = useMemo(() => {
    return Array.from(participants.values()).filter((p) => p.publicKey !== selfPublicKey);
  }, [participants, selfPublicKey]);
  const selfParticipant = selfPublicKey ? participants.get(selfPublicKey) : undefined;

  const [localScreenDismissed, setLocalScreenDismissed] = useState(false);

  useEffect(() => {
    if (!localScreenTrack) setLocalScreenDismissed(false);
  }, [localScreenTrack]);

  const showLocalScreen = !!localScreenTrack && !localScreenDismissed;
  const featuredScreenTrack = watchedStream?.track ?? (showLocalScreen ? localScreenTrack : null);
  const hasFeaturedScreen = !!featuredScreenTrack;

  const webcamOwners = useMemo(() => {
    const set = new Set<string>();
    for (const stream of webcamStreams) set.add(stream.producerPublicKey);
    if (isWebcamOn && selfPublicKey) set.add(selfPublicKey);
    return set;
  }, [webcamStreams, isWebcamOn, selfPublicKey]);

  const audioOnlyParticipants = useMemo(() => {
    return Array.from(participants.values()).filter(
      (p) => !webcamOwners.has(p.publicKey) && p.publicKey !== selfPublicKey
    );
  }, [participants, webcamOwners, selfPublicKey]);
  const selfIsAudioOnly = selfPublicKey ? !webcamOwners.has(selfPublicKey) : true;

  async function handleWatchScreen(producerId: string) {
    if (!activeChannelId) return;
    const client = getWebSocketClient();
    if (!client) return;

    const voiceStore = useVoiceStore.getState();

    if (voiceStore.watchingScreenId === producerId) {
      closeConsumerForProducer(producerId);
      voiceStore.setWatchingScreen(null);
      return;
    }

    if (voiceStore.watchingScreenId) {
      closeConsumerForProducer(voiceStore.watchingScreenId);
    }

    try {
      await consumeProducer(activeChannelId, producerId, client);
      voiceStore.setWatchingScreen(producerId);
    } catch (err) {
      console.error("[voice] Failed to consume screen share:", err);
    }
  }

  const [isFocused, setIsFocused] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const screenContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onFullscreenChange() {
      setIsFullscreen(!!document.fullscreenElement);
    }
    document.addEventListener("fullscreenchange", onFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", onFullscreenChange);
  }, []);

  const handleFullscreen = useCallback(() => {
    const el = screenContainerRef.current;
    if (!el) return;

    if (document.fullscreenElement) {
      document.exitFullscreen();
      return;
    }

    if (el.requestFullscreen) {
      el.requestFullscreen();
      return;
    }

    const video = el.querySelector("video");
    if (video && "webkitEnterFullscreen" in video) {
      (video as any).webkitEnterFullscreen();
    }
  }, []);

  function handleStopWatching() {
    const voiceStore = useVoiceStore.getState();

    if (voiceStore.watchingScreenId) {
      closeConsumerForProducer(voiceStore.watchingScreenId);
      voiceStore.setWatchingScreen(null);
    } else {
      setLocalScreenDismissed(true);
    }
  }

  const otherScreenSharers = useMemo(
    () => screenSharers.filter((s) => s.producerId !== watchingScreenId),
    [screenSharers, watchingScreenId]
  );

  // ── Layout: Screen share focused + participant strip below ──
  if (hasFeaturedScreen) {
    const isLocalScreen = !watchedStream;

    return (
      <div className="flex-1 flex flex-col gap-2 p-2 min-h-0">
        {otherScreenSharers.length > 0 && (
          <ScreenShareBanners
            screenSharers={otherScreenSharers}
            watchingScreenId={watchingScreenId}
            onWatch={handleWatchScreen}
          />
        )}

        <div
          ref={screenContainerRef}
          className="group relative flex-1 min-h-0 rounded-xl overflow-hidden bg-black"
        >
          <VideoElement track={featuredScreenTrack} fit="contain" muted={isLocalScreen} />

          <div className="absolute bottom-3 right-3 flex gap-1.5 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
            <button
              onClick={handleStopWatching}
              className="p-2 rounded-lg bg-black/60 text-white hover:bg-red-600/80 backdrop-blur-sm transition-colors cursor-pointer"
              title={isLocalScreen ? "Dismiss preview" : "Stop watching"}
            >
              <X className="w-4 h-4" />
            </button>
            {!isFullscreen && (
              <button
                onClick={() => setIsFocused((f) => !f)}
                className="p-2 rounded-lg bg-black/60 text-white hover:bg-black/80 backdrop-blur-sm transition-colors cursor-pointer"
                title={isFocused ? "Show participants" : "Focus on stream"}
              >
                {isFocused ? <Shrink className="w-4 h-4" /> : <Expand className="w-4 h-4" />}
              </button>
            )}
            <button
              onClick={handleFullscreen}
              className="p-2 rounded-lg bg-black/60 text-white hover:bg-black/80 backdrop-blur-sm transition-colors cursor-pointer"
              title="Fullscreen"
            >
              <Maximize className="w-4 h-4" />
            </button>
          </div>
        </div>

        {isLocalScreen && (
          <div className="text-center text-xs text-muted-foreground py-1">
            You are sharing your screen
          </div>
        )}

        {!isFocused && (
          <div className="flex items-center justify-center gap-2 shrink-0 overflow-x-auto py-1">
            {selfPublicKey && isWebcamOn && localWebcamTrack ? (
              <div className="w-36 shrink-0">
                <WebcamTile
                  track={localWebcamTrack}
                  name={selfName || "You"}
                  muted
                  mirror
                  speaking={selfParticipant?.isSpeaking}
                />
              </div>
            ) : selfPublicKey && selfIsAudioOnly ? (
              <div className={cn(
                "flex flex-col items-center justify-center w-20 h-20 rounded-lg bg-secondary ring-2 transition-[box-shadow] duration-200 shrink-0",
                selfParticipant?.isSpeaking ? "ring-green-500" : "ring-transparent"
              )}>
                <Avatar name={selfName} size="sm" />
                <div className="mt-1 text-[10px] text-foreground truncate max-w-full px-1">{selfName}</div>
              </div>
            ) : null}

            {webcamStreams.map((stream) => {
              const p = participants.get(stream.producerPublicKey);
              return (
                <div key={stream.consumerId} className="w-36 shrink-0">
                  <WebcamTile
                    track={stream.track}
                    name={p?.name ?? stream.producerPublicKey.slice(0, 8)}
                    speaking={p?.isSpeaking}
                  />
                </div>
              );
            })}

            {audioOnlyParticipants.map((p) => (
              <div
                key={p.publicKey}
                className={cn(
                  "flex flex-col items-center justify-center w-20 h-20 rounded-lg bg-secondary ring-2 transition-[box-shadow] duration-200 shrink-0",
                  p.isSpeaking ? "ring-green-500" : "ring-transparent"
                )}
              >
                <Avatar name={p.name} size="sm" />
                <div className="mt-1 flex items-center gap-0.5 max-w-full px-1">
                  <span className="text-[10px] text-foreground truncate">{p.name}</span>
                  {p.isMuted && <MicOff className="w-2.5 h-2.5 text-destructive shrink-0" />}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  // ── Layout: Mixed grid (webcams + audio-only avatar tiles) ──
  return (
    <div className="flex-1 flex flex-col gap-2 p-4 min-h-0">
      <div className="flex gap-2 shrink-0 justify-center flex-wrap">
        {isScreenSharing && localScreenDismissed && (
          <button
            onClick={() => setLocalScreenDismissed(false)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors cursor-pointer bg-identity/10 text-identity hover:bg-identity/20"
          >
            <Monitor className="w-4 h-4" />
            Watch your screen
          </button>
        )}
        {screenSharers.map((s) => (
          <button
            key={s.producerId}
            onClick={() => handleWatchScreen(s.producerId)}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors cursor-pointer",
              watchingScreenId === s.producerId
                ? "bg-identity text-white"
                : "bg-identity/10 text-identity hover:bg-identity/20"
            )}
          >
            <Monitor className="w-4 h-4" />
            Watch {s.name}&apos;s screen
          </button>
        ))}
      </div>

      <div className="flex-1 flex items-center justify-center min-h-0">
        <div className="flex flex-wrap justify-center gap-3 w-full max-w-5xl">
          {selfPublicKey && isWebcamOn && localWebcamTrack ? (
            <div className="w-72">
              <WebcamTile
                track={localWebcamTrack}
                name={selfName || "You"}
                muted
                mirror
                speaking={selfParticipant?.isSpeaking}
              />
            </div>
          ) : selfPublicKey && selfIsAudioOnly ? (
            <div className={cn(
              "flex flex-col items-center justify-center w-28 h-28 rounded-lg bg-secondary ring-2 transition-[box-shadow] duration-200",
              selfParticipant?.isSpeaking ? "ring-green-500" : "ring-transparent"
            )}>
              <Avatar name={selfName} size="lg" />
              <div className="mt-2 text-sm text-foreground truncate max-w-full px-2">{selfName}</div>
            </div>
          ) : null}

          {webcamStreams.map((stream) => {
            const p = participants.get(stream.producerPublicKey);
            return (
              <div key={stream.consumerId} className="w-72">
                <WebcamTile
                  track={stream.track}
                  name={p?.name ?? stream.producerPublicKey.slice(0, 8)}
                  speaking={p?.isSpeaking}
                />
              </div>
            );
          })}

          {audioOnlyParticipants.map((p) => (
            <div
              key={p.publicKey}
              className={cn(
                "flex flex-col items-center justify-center w-28 h-28 rounded-lg bg-secondary ring-2 transition-[box-shadow] duration-200",
                p.isSpeaking ? "ring-green-500" : "ring-transparent"
              )}
            >
              <Avatar name={p.name} size="lg" />
              <div className="mt-2 flex items-center gap-1 max-w-full px-2">
                <span className="text-sm text-foreground truncate">{p.name}</span>
                {p.isMuted && <MicOff className="w-3.5 h-3.5 text-destructive shrink-0" />}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Reusable webcam tile with aspect-ratio lock + gradient name overlay ──

function WebcamTile({
  track,
  name,
  muted,
  mirror,
  speaking,
}: {
  track: MediaStreamTrack;
  name: string;
  muted?: boolean;
  mirror?: boolean;
  speaking?: boolean;
}) {
  const settings = track.getSettings();
  const w = settings.width ?? 16;
  const h = settings.height ?? 9;
  const isPortrait = h > w;

  return (
    <div
      className={cn(
        "relative rounded-xl overflow-hidden bg-black ring-2 transition-[box-shadow] duration-200",
        speaking ? "ring-green-500" : "ring-transparent"
      )}
      style={{ aspectRatio: `${w} / ${h}`, maxHeight: isPortrait ? "24rem" : undefined }}
    >
      <VideoElement track={track} muted={muted} mirror={mirror} />
      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/60 to-transparent px-3 py-2">
        <span className="text-xs font-medium text-white drop-shadow-sm">{name}</span>
      </div>
    </div>
  );
}

// ── Screen share watch banners ──

function ScreenShareBanners({
  screenSharers,
  watchingScreenId,
  onWatch,
}: {
  screenSharers: { publicKey: string; name: string; producerId: string }[];
  watchingScreenId: string | null;
  onWatch: (producerId: string) => void;
}) {
  if (screenSharers.length === 0) return null;

  return (
    <div className="flex gap-2 shrink-0 justify-center">
      {screenSharers.map((s) => (
        <button
          key={s.producerId}
          onClick={() => onWatch(s.producerId)}
          className={cn(
            "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors cursor-pointer",
            watchingScreenId === s.producerId
              ? "bg-identity text-white"
              : "bg-identity/10 text-identity hover:bg-identity/20"
          )}
        >
          <Monitor className="w-4 h-4" />
          Watch {s.name}&apos;s screen
        </button>
      ))}
    </div>
  );
}
