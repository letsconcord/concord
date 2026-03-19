import { useEffect, useState, useCallback } from "react";
import {
  initBridge,
  destroyBridge,
  onInit,
  onProfileUpdate,
  isEmbedded,
  reportSidebarState,
} from "./features/bridge/iframe-bridge";
import { connect } from "./features/connection/realm-handler";
import { useIdentityStore } from "./stores/identity";
import { useRealmStore } from "./stores/realm";
import { ChannelSidebar } from "./components/realm/ChannelSidebar";
import { MainContent } from "./components/chat/MainContent";
import { MemberSidebar } from "./components/realm/MemberSidebar";
import { ImageLightbox } from "./components/ui/image-lightbox";

export default function App() {
  const [initialized, setInitialized] = useState(false);
  const [showMembers, setShowMembers] = useState(true);
  const [mobileChannels, setMobileChannels] = useState(false);
  const [mobileMembers, setMobileMembers] = useState(false);
  const status = useRealmStore((s) => s.status);
  const realmName = useRealmStore((s) => s.info.name);
  const realmError = useRealmStore((s) => s.error);
  const identity = useIdentityStore((s) => s.publicKey);

  const closeMobileSidebars = useCallback(() => {
    setMobileChannels(false);
    setMobileMembers(false);
    reportSidebarState(false);
  }, []);

  const toggleMobileChannels = useCallback(() => {
    setMobileChannels((v) => {
      const next = !v;
      reportSidebarState(next);
      return next;
    });
    setMobileMembers(false);
  }, []);

  const toggleMembers = useCallback(() => {
    if (window.innerWidth < 768) {
      setMobileMembers((v) => !v);
      setMobileChannels(false);
    } else {
      setShowMembers((v) => !v);
    }
  }, []);

  // Suppress default browser context menu
  useEffect(() => {
    function block(e: MouseEvent) { e.preventDefault(); }
    document.addEventListener("contextmenu", block);
    return () => document.removeEventListener("contextmenu", block);
  }, []);

  useEffect(() => {
    initBridge();

    const unsubInit = onInit((data) => {
      useIdentityStore.getState().setIdentity(
        data.publicKey,
        data.name,
        data.bio
      );
      setInitialized(true);
      connect();
    });

    const unsubProfile = onProfileUpdate((name, bio) => {
      useIdentityStore.getState().updateProfile(name, bio);
    });

    return () => {
      unsubInit();
      unsubProfile();
      destroyBridge();
    };
  }, []);

  // Standalone dev mode — not inside iframe
  if (!isEmbedded() && !initialized) {
    return (
      <div className="flex h-screen items-center justify-center bg-background text-foreground">
        <div className="text-center space-y-4">
          <h1 className="text-2xl font-heading font-bold gradient-text">
            Concord Realm UI
          </h1>
          <p className="text-text-secondary text-sm">
            Running in standalone dev mode.
          </p>
          <p className="text-xs text-muted-foreground">
            To connect, embed this UI in the Tauri shell or provide bridge init data.
          </p>
          <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
            <span className="inline-block w-2 h-2 rounded-full bg-primary animate-glow-pulse" />
            iframe bridge ready — waiting for parent
          </div>
        </div>
      </div>
    );
  }

  // Waiting for bridge init
  if (!initialized) {
    return (
      <div className="flex h-screen items-center justify-center bg-background text-foreground">
        <div className="text-center space-y-3">
          <div className="text-sm text-muted-foreground">Connecting...</div>
          <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
            <span className="inline-block w-2 h-2 rounded-full bg-primary animate-glow-pulse" />
            Waiting for shell
          </div>
        </div>
      </div>
    );
  }

  // Connecting state
  if (status !== "connected") {
    return (
      <div className="flex h-screen items-center justify-center bg-background text-foreground">
        <div className="text-center space-y-4">
          <h1 className="text-xl font-heading font-bold gradient-text">
            {realmName || "Realm"}
          </h1>
          <div className="flex items-center justify-center gap-2 text-sm">
            <span
              className={`inline-block w-2 h-2 rounded-full ${
                status === "connecting"
                  ? "bg-yellow-500 animate-glow-pulse"
                  : "bg-red-500"
              }`}
            />
            <span className="text-muted-foreground capitalize">{status}</span>
          </div>
          {status === "error" && (
            <p className="text-xs text-destructive">{realmError}</p>
          )}
        </div>
      </div>
    );
  }

  // Connected — 3-panel layout with mobile drawers
  return (
    <div className="flex h-screen bg-background text-foreground">
      {/* Desktop: always visible */}
      <div className="hidden md:flex shrink-0">
        <ChannelSidebar />
      </div>

      <MainContent
        onToggleSidebar={toggleMobileChannels}
        onToggleMembers={toggleMembers}
      />

      {/* Desktop: inline member sidebar */}
      {showMembers && (
        <div className="hidden lg:flex shrink-0">
          <MemberSidebar />
        </div>
      )}

      {/* Mobile: channel sidebar drawer */}
      {mobileChannels && (
        <>
          <div className="fixed inset-0 z-40 bg-black/50 md:hidden" onClick={closeMobileSidebars} />
          <div className="fixed inset-y-0 left-[60px] z-50 md:hidden animate-slide-in-left h-dvh">
            <ChannelSidebar onNavigate={closeMobileSidebars} />
          </div>
        </>
      )}

      {/* Mobile: member sidebar drawer */}
      {mobileMembers && (
        <>
          <div className="fixed inset-0 z-40 bg-black/50 md:hidden" onClick={closeMobileSidebars} />
          <div className="fixed inset-y-0 right-0 z-50 md:hidden animate-slide-in-right">
            <MemberSidebar mobile />
          </div>
        </>
      )}
      <ImageLightbox />
    </div>
  );
}
