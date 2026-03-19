/**
 * ChannelSidebar for server UI — single-realm mode.
 *
 * Includes admin features: create channels, realm settings, role editor.
 */

import { useState } from "react";
import { useRealmStore } from "../../stores/realm";
import { useIdentityStore } from "../../stores/identity";
import { useVoiceStore } from "../../stores/voice";
import { useRolesStore } from "../../stores/roles";
import { useMembersStore } from "../../stores/members";
import { useNotificationsStore } from "../../stores/notifications";
import { getWebSocketClient } from "../../features/connection/realm-handler";
import { joinVoiceChannel, leaveVoiceChannel } from "../../features/media/voice";
import { requestChannelPassword, getKeys } from "../../features/bridge/iframe-bridge";
import { VoicePanel } from "../voice/VoiceChannel";
import { VoiceChannelParticipants } from "../voice/VoiceChannelParticipants";
import { CreateChannelDialog } from "./CreateChannelDialog";
import { RealmSettingsDialog } from "./RealmSettingsDialog";
import { RoleEditor } from "./RoleEditor";
import { ScrollArea } from "../ui/scroll-area";
import { Avatar } from "../ui/avatar";
import { useContextMenu } from "../ui/context-menu";
import { cn } from "@/lib/utils";
import { hasPermission, Permission } from "@concord/protocol";
import {
  Hash,
  Volume2,
  Plus,
  Trash2,
  Lock,
  Settings,
  Shield,
  ChevronDown,
  EyeOff,
} from "lucide-react";

interface ChannelSidebarProps {
  onNavigate?: () => void;
}

export function ChannelSidebar({ onNavigate }: ChannelSidebarProps) {
  const realmInfo = useRealmStore((s) => s.info);
  const channels = useRealmStore((s) => s.channels);
  const activeChannelId = useRealmStore((s) => s.activeChannelId);
  const isAdmin = useRealmStore((s) => s.isAdmin);
  const setActiveChannel = useRealmStore((s) => s.setActiveChannel);
  const publicKey = useIdentityStore((s) => s.publicKey);
  const voiceChannelId = useVoiceStore((s) => s.activeChannelId);
  const screenShareChannels = useVoiceStore((s) => s.screenShareChannels);
  const myPerms = useRolesStore((s) => s.myPermissions);
  const unreadCounts = useNotificationsStore((s) => s.unreadCounts);
  const markRead = useNotificationsStore((s) => s.markRead);
  const members = useMembersStore((s) => s.members);
  const onlineKeys = useMembersStore((s) => s.onlineKeys);

  const canManageChannels = isAdmin || hasPermission(myPerms, Permission.MANAGE_CHANNELS);
  const canManageRoles = isAdmin || hasPermission(myPerms, Permission.MANAGE_ROLES);

  // Dialog state
  const [showCreateChannel, setShowCreateChannel] = useState(false);
  const [createChannelType, setCreateChannelType] = useState<"text" | "voice">("text");
  const [showRealmSettings, setShowRealmSettings] = useState(false);
  const [showRoleEditor, setShowRoleEditor] = useState(false);
  const [showRealmMenu, setShowRealmMenu] = useState(false);
  const dmCtx = useContextMenu();

  const hiddenDmIds = useNotificationsStore((s) => s.hiddenDmIds);
  const hideDm = useNotificationsStore((s) => s.hideDm);

  const textChannels = channels.filter((c) => c.type === "text");
  const voiceChannels = channels.filter((c) => c.type === "voice");
  const dmChannels = channels.filter((c) => c.type === "dm" && !hiddenDmIds.has(c.id));

  function joinChannel(channelId: string) {
    setActiveChannel(channelId);
    markRead(channelId);
    const client = getWebSocketClient();
    client?.send("channel:join", { channelId });
  }

  function handleChannelClick(channel: { id: string; name: string; encrypted: boolean }) {
    if (channel.encrypted) {
      const keys = getKeys();
      if (!keys.channelKeys.has(channel.id)) {
        requestChannelPassword(channel.id, channel.name);
        return;
      }
    }
    joinChannel(channel.id);
    onNavigate?.();
  }

  function handleVoiceChannelClick(channelId: string) {
    const client = getWebSocketClient();
    if (!client) return;

    if (voiceChannelId === channelId) {
      setActiveChannel(channelId);
    } else {
      if (voiceChannelId) {
        leaveVoiceChannel(voiceChannelId, client);
      }
      joinVoiceChannel(channelId, client);
      setActiveChannel(channelId);
    }
    onNavigate?.();
  }

  function handleDeleteChannel(channelId: string) {
    const client = getWebSocketClient();
    client?.send("channel:delete", { channelId });
  }

  function openCreateChannel(type: "text" | "voice") {
    setCreateChannelType(type);
    setShowCreateChannel(true);
  }

  const hasAdminMenu = isAdmin || canManageRoles;

  return (
    <div className="flex flex-col w-60 h-full bg-sidebar-background shrink-0 border-r border-sidebar-border pb-14">
      {/* Realm header */}
      <div className="h-12 px-4 flex items-center border-b border-sidebar-border shrink-0 relative">
        <span className="font-semibold text-foreground truncate flex-1">
          {realmInfo.name}
        </span>
        {hasAdminMenu && (
          <button
            onClick={() => setShowRealmMenu((v) => !v)}
            className="p-1 rounded hover:bg-sidebar-accent cursor-pointer text-muted-foreground hover:text-foreground transition-colors"
          >
            <ChevronDown className="w-4 h-4" />
          </button>
        )}
        {/* Realm admin dropdown menu */}
        {showRealmMenu && (
          <div className="absolute right-2 top-11 w-48 rounded-md bg-popover border border-border shadow-lg py-1 z-50">
            {isAdmin && (
              <button
                onClick={() => { setShowRealmMenu(false); setShowRealmSettings(true); }}
                className="flex items-center gap-2 w-full px-3 py-1.5 text-sm text-foreground hover:bg-accent cursor-pointer transition-colors"
              >
                <Settings className="w-3.5 h-3.5" />
                Realm Settings
              </button>
            )}
            {canManageRoles && (
              <button
                onClick={() => { setShowRealmMenu(false); setShowRoleEditor(true); }}
                className="flex items-center gap-2 w-full px-3 py-1.5 text-sm text-foreground hover:bg-accent cursor-pointer transition-colors"
              >
                <Shield className="w-3.5 h-3.5" />
                Roles
              </button>
            )}
          </div>
        )}
      </div>

      {/* Channel list */}
      <ScrollArea className="flex-1 pt-2">
        {/* Text channels */}
        <div className="px-2 mb-1">
          <div className="flex items-center px-1 py-1">
            <span className="text-[11px] font-semibold uppercase text-muted-foreground tracking-wide flex-1">
              Text Channels
            </span>
            {canManageChannels && (
              <button
                onClick={() => openCreateChannel("text")}
                className="p-0.5 rounded hover:bg-sidebar-accent cursor-pointer text-muted-foreground hover:text-foreground"
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {textChannels.map((channel) => {
            const unread = activeChannelId !== channel.id ? (unreadCounts[channel.id] ?? 0) : 0;
            return (
              <div key={channel.id} className="group flex items-center">
                <button
                  onClick={() => handleChannelClick(channel)}
                  className={cn(
                    "flex-1 flex items-center gap-1.5 px-2 py-1.5 rounded-md text-sm cursor-pointer transition-colors",
                    activeChannelId === channel.id
                      ? "bg-sidebar-accent text-sidebar-accent-foreground"
                      : unread > 0
                        ? "text-sidebar-accent-foreground font-semibold hover:bg-sidebar-accent/50"
                        : "text-sidebar-foreground hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground"
                  )}
                >
                  {channel.encrypted ? (
                    <Lock className="w-4 h-4 shrink-0 text-identity/60" />
                  ) : (
                    <Hash className="w-4 h-4 shrink-0 opacity-60" />
                  )}
                  <span className="truncate">{channel.name}</span>
                  {unread > 0 && (
                    <span className="ml-auto shrink-0 min-w-[18px] h-[18px] px-1 rounded-full bg-primary text-primary-foreground text-[11px] font-bold flex items-center justify-center">
                      {unread > 99 ? "99+" : unread}
                    </span>
                  )}
                </button>
                {canManageChannels && textChannels.length > 1 && (
                  <button
                    onClick={() => handleDeleteChannel(channel.id)}
                    className="p-1 rounded opacity-0 group-hover:opacity-100 hover:bg-destructive/10 cursor-pointer text-muted-foreground hover:text-destructive transition-opacity"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                )}
              </div>
            );
          })}
        </div>

        {/* Voice channels */}
        <div className="px-2 mt-3">
          <div className="flex items-center px-1 py-1">
            <span className="text-[11px] font-semibold uppercase text-muted-foreground tracking-wide flex-1">
              Voice Channels
            </span>
            {canManageChannels && (
              <button
                onClick={() => openCreateChannel("voice")}
                className="p-0.5 rounded hover:bg-sidebar-accent cursor-pointer text-muted-foreground hover:text-foreground"
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {voiceChannels.map((channel) => {
            return (
              <div key={channel.id}>
                <div className="group flex items-center">
                  <button
                    onClick={() => handleVoiceChannelClick(channel.id)}
                    className={cn(
                      "flex-1 flex items-center gap-1.5 px-2 py-1.5 rounded-md text-sm cursor-pointer transition-colors",
                      voiceChannelId === channel.id
                        ? "bg-primary/10 text-primary"
                        : "text-sidebar-foreground hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground"
                    )}
                  >
                    <Volume2 className="w-4 h-4 shrink-0 opacity-60" />
                    <span className="truncate">{channel.name}</span>
                    {screenShareChannels.has(channel.id) && (
                      <span className="ml-auto shrink-0 px-1.5 py-0.5 rounded text-[10px] font-bold leading-none bg-destructive text-white uppercase tracking-wide">
                        LIVE
                      </span>
                    )}
                  </button>
                </div>
                <VoiceChannelParticipants channelId={channel.id} />
              </div>
            );
          })}
        </div>

        {/* Direct Messages */}
        {dmChannels.length > 0 && (
          <div className="px-2 mt-3">
            <div className="flex items-center px-1 py-1">
              <span className="text-[11px] font-semibold uppercase text-muted-foreground tracking-wide flex-1">
                Direct Messages
              </span>
            </div>

            {dmChannels.map((channel) => {
              const otherKey = channel.participants?.find((k) => k !== publicKey);
              const otherProfile = otherKey ? members[otherKey] : undefined;
              const otherName = otherProfile?.name ?? otherKey?.slice(0, 8) ?? "Unknown";
              const isOnline = otherKey ? onlineKeys.has(otherKey) : false;
              const dmUnread = activeChannelId !== channel.id ? (unreadCounts[channel.id] ?? 0) : 0;

              return (
                <button
                  key={channel.id}
                  onClick={() => { joinChannel(channel.id); onNavigate?.(); }}
                  onContextMenu={(e) => dmCtx.show(e, [
                    {
                      label: "Hide Conversation",
                      icon: <EyeOff className="w-4 h-4" />,
                      onClick: () => hideDm(channel.id),
                    },
                  ])}
                  className={cn(
                    "w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-sm cursor-pointer transition-colors",
                    activeChannelId === channel.id
                      ? "bg-sidebar-accent text-sidebar-accent-foreground"
                      : dmUnread > 0
                        ? "text-sidebar-accent-foreground font-semibold hover:bg-sidebar-accent/50"
                        : "text-sidebar-foreground hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground"
                  )}
                >
                  <div className="relative shrink-0">
                    <Avatar name={otherName} size="xs" />
                    <span className={cn(
                      "absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-sidebar-background",
                      isOnline ? "bg-green-500" : "bg-muted-foreground/40"
                    )} />
                  </div>
                  <span className="truncate">{otherName}</span>
                  {dmUnread > 0 && (
                    <span className="ml-auto shrink-0 min-w-[18px] h-[18px] px-1 rounded-full bg-primary text-primary-foreground text-[11px] font-bold flex items-center justify-center">
                      {dmUnread > 99 ? "99+" : dmUnread}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </ScrollArea>

      {dmCtx.element}

      {/* Voice connected panel — docked at bottom */}
      <VoicePanel />

      {/* Admin dialogs */}
      <CreateChannelDialog
        open={showCreateChannel}
        onOpenChange={setShowCreateChannel}
        defaultType={createChannelType}
      />
      <RealmSettingsDialog
        open={showRealmSettings}
        onOpenChange={setShowRealmSettings}
      />
      <RoleEditor
        open={showRoleEditor}
        onOpenChange={setShowRoleEditor}
      />
    </div>
  );
}
