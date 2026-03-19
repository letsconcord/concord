import { useState, useRef, useCallback } from "react";
import { Popover, PopoverTrigger, PopoverContent } from "../ui/popover";
import { Dialog, DialogContent, VisuallyHidden, DialogTitle } from "../ui/dialog";
import { Avatar } from "../ui/avatar";
import { useMembersStore } from "../../stores/members";
import { useIdentityStore } from "../../stores/identity";
import { useRealmStore } from "../../stores/realm";
import { useRolesStore } from "../../stores/roles";
import { getWebSocketClient } from "../../features/connection/realm-handler";
import { Check, Copy, MessageSquare, UserX, Ban, MoreHorizontal } from "lucide-react";
import { hasPermission, Permission } from "@concord/protocol";
import { roleColor } from "../../lib/role-color";

interface UserProfilePopoverProps {
  publicKey: string;
  name: string;
  trigger: React.ReactNode;
  side?: "left" | "right" | "top" | "bottom";
}

const OPEN_DELAY = 300;
const CLOSE_DELAY = 200;

function useIsMobile(): boolean {
  return typeof window !== "undefined" && window.innerWidth < 768;
}

export function UserProfilePopover({ publicKey, name, trigger, side = "right" }: UserProfilePopoverProps) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const currentUserKey = useIdentityStore((s) => s.publicKey);
  const openTimer = useRef<ReturnType<typeof setTimeout>>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout>>(null);
  const isMobile = useIsMobile();

  // Look up bio and role from members store
  const member = useMembersStore((s) => s.members[publicKey]);
  const bio = member?.bio;
  const memberRoleId = member?.roleId;

  const isOwnProfile = currentUserKey === publicKey;
  const truncatedKey = `${publicKey.slice(0, 6)}...${publicKey.slice(-4)}`;

  // Check if DMs are enabled
  const allowDm = useRealmStore((s) => s.info.allowDirectMessages);
  const canDm = !isOwnProfile && !!allowDm;

  // Permission checks for kick/ban
  const myPerms = useRolesStore((s) => s.myPermissions);
  const isAdmin = useRealmStore((s) => s.isAdmin);
  const canKick = !isOwnProfile && (isAdmin || hasPermission(myPerms, Permission.KICK));
  const canBan = !isOwnProfile && (isAdmin || hasPermission(myPerms, Permission.BAN));

  // Get role info for badge
  const role = useRolesStore((s) => {
    if (!memberRoleId) return undefined;
    return s.roles.find((r) => r.id === memberRoleId);
  });

  function handleOpenDm() {
    const client = getWebSocketClient();
    client?.send("dm:open", { targetPublicKey: publicKey });
    setOpen(false);
  }

  function handleKick() {
    const client = getWebSocketClient();
    client?.send("member:kick", { publicKey });
    setOpen(false);
  }

  function handleBan() {
    const client = getWebSocketClient();
    client?.send("member:ban", { publicKey });
    setOpen(false);
  }

  const handleOpen = useCallback(() => {
    if (closeTimer.current) {
      clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
    openTimer.current = setTimeout(() => setOpen(true), OPEN_DELAY);
  }, []);

  const handleClose = useCallback(() => {
    if (openTimer.current) {
      clearTimeout(openTimer.current);
      openTimer.current = null;
    }
    closeTimer.current = setTimeout(() => setOpen(false), CLOSE_DELAY);
  }, []);

  function handleCopyKey() {
    navigator.clipboard.writeText(publicKey).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  const hasModActions = canKick || canBan;

  const profileContent = (
    <>
      {/* Banner + moderation menu */}
      <div className="relative h-16 bg-gradient-to-r from-primary/30 to-primary/10">
        {hasModActions && (
          <div className="absolute top-2 right-2">
            <button
              onClick={(e) => { e.stopPropagation(); setShowMenu((v) => !v); }}
              className="p-1 rounded-full bg-black/30 hover:bg-black/50 text-white/80 hover:text-white cursor-pointer transition-colors"
            >
              <MoreHorizontal className="w-4 h-4" />
            </button>
            {showMenu && (
              <div className="absolute right-0 top-8 w-36 rounded-md bg-popover border border-border shadow-lg py-1 z-50">
                {canKick && (
                  <button
                    onClick={handleKick}
                    className="flex items-center gap-2 w-full px-3 py-1.5 text-sm text-foreground hover:bg-accent cursor-pointer transition-colors"
                  >
                    <UserX className="w-3.5 h-3.5" />
                    Kick
                  </button>
                )}
                {canBan && (
                  <button
                    onClick={handleBan}
                    className="flex items-center gap-2 w-full px-3 py-1.5 text-sm text-destructive hover:bg-destructive/10 cursor-pointer transition-colors"
                  >
                    <Ban className="w-3.5 h-3.5" />
                    Ban
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Avatar overlapping banner */}
      <div className="px-4 -mt-8">
        <Avatar name={name} size="xl" className="border-4 border-popover" />
      </div>

      {/* Profile info */}
      <div className="px-4 pt-2 pb-4 space-y-2">
        <div>
          <span className="text-base font-bold text-foreground">{name}</span>
          {isOwnProfile && (
            <span className="ml-2 text-[10px] text-muted-foreground bg-secondary px-1.5 py-0.5 rounded-full">
              you
            </span>
          )}
        </div>

        {/* Role badge */}
        {role && (
          <span
            className="inline-block text-[11px] font-semibold px-2 py-0.5 rounded-full"
            style={{ color: roleColor(role.name), backgroundColor: `${roleColor(role.name)}20` }}
          >
            {role.name}
          </span>
        )}

        {bio && (
          <p className="text-sm text-muted-foreground">{bio}</p>
        )}

        <div className="flex items-center gap-1.5 mt-2">
          <code className="text-xs font-mono text-identity bg-secondary px-2 py-1 rounded flex-1 truncate">
            {truncatedKey}
          </code>
          <button
            onClick={handleCopyKey}
            className="p-1 rounded hover:bg-secondary cursor-pointer text-muted-foreground hover:text-foreground transition-colors"
            title="Copy public key"
          >
            {copied ? (
              <Check className="w-3.5 h-3.5 text-identity" />
            ) : (
              <Copy className="w-3.5 h-3.5" />
            )}
          </button>
        </div>

        {canDm && (
          <button
            onClick={handleOpenDm}
            className="flex items-center gap-2 w-full mt-2 px-3 py-2 rounded-md text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors cursor-pointer"
          >
            <MessageSquare className="w-4 h-4" />
            Message
          </button>
        )}
      </div>
    </>
  );

  // Mobile: use Dialog
  if (isMobile) {
    return (
      <>
        <div onClick={() => setOpen(true)}>
          {trigger}
        </div>
        <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) setShowMenu(false); }}>
          <DialogContent className="p-0 overflow-hidden max-w-sm">
            <VisuallyHidden><DialogTitle>{name}</DialogTitle></VisuallyHidden>
            {profileContent}
          </DialogContent>
        </Dialog>
      </>
    );
  }

  // Desktop: use Popover with hover
  return (
    <Popover open={open} onOpenChange={(v) => { setOpen(v); if (!v) setShowMenu(false); }}>
      <PopoverTrigger asChild>
        <div onMouseEnter={handleOpen} onMouseLeave={handleClose}>
          {trigger}
        </div>
      </PopoverTrigger>
      <PopoverContent
        side={side}
        className="w-72 p-0 overflow-hidden"
        onMouseEnter={handleOpen}
        onMouseLeave={handleClose}
      >
        {profileContent}
      </PopoverContent>
    </Popover>
  );
}
