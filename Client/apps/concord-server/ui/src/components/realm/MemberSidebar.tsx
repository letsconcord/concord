/**
 * MemberSidebar for server UI — single-realm mode.
 *
 * Shows role-grouped online members with profile popovers on hover
 * and context menu on right-click (kick, ban, DM).
 */

import { useMemo } from "react";
import { useMembersStore } from "../../stores/members";
import { useRolesStore } from "../../stores/roles";
import { useRealmStore } from "../../stores/realm";
import { useIdentityStore } from "../../stores/identity";
import { getWebSocketClient } from "../../features/connection/realm-handler";
import { useContextMenu, type ContextMenuEntry } from "../ui/context-menu";
import { ScrollArea } from "../ui/scroll-area";
import { Avatar } from "../ui/avatar";
import { UserProfilePopover } from "../profile/UserProfilePopover";
import { roleColor } from "../../lib/role-color";
import { hasPermission, Permission } from "@concord/protocol";
import { UserX, Ban, MessageSquare } from "lucide-react";
import type { UserProfile, Role } from "@concord/protocol";

interface MemberSidebarProps {
  mobile?: boolean;
}

export function MemberSidebar({ mobile }: MemberSidebarProps) {
  const membersRecord = useMembersStore((s) => s.members);
  const onlineKeys = useMembersStore((s) => s.onlineKeys);
  const roles = useRolesStore((s) => s.roles);
  const membersArray = useMemo(() => Object.values(membersRecord), [membersRecord]);

  const { roleGroups, onlineNoRole, offline } = useMemo(() => {
    const onlineByRole = new Map<string, UserProfile[]>();
    const noRole: UserProfile[] = [];
    const off: UserProfile[] = [];

    for (const m of membersArray) {
      if (!onlineKeys.has(m.publicKey)) {
        off.push(m);
        continue;
      }
      if (m.roleId) {
        const list = onlineByRole.get(m.roleId) ?? [];
        list.push(m);
        onlineByRole.set(m.roleId, list);
      } else {
        noRole.push(m);
      }
    }

    const groups: { role: Role; members: UserProfile[] }[] = [];
    for (const role of roles) {
      const list = onlineByRole.get(role.id);
      if (list && list.length > 0) {
        groups.push({ role, members: list });
      }
    }

    return { roleGroups: groups, onlineNoRole: noRole, offline: off };
  }, [membersArray, onlineKeys, roles]);

  const totalOnline = roleGroups.reduce((n, g) => n + g.members.length, 0) + onlineNoRole.length;
  const ctx = useContextMenu();

  return (
    <div className={`w-60 bg-sidebar-background shrink-0 border-l border-sidebar-border flex-col ${mobile ? "flex" : "hidden lg:flex"}`}>
      <ScrollArea className="flex-1 px-2 pt-4">
        {/* Role-grouped online members */}
        {roleGroups.map(({ role, members: roleMembers }) => (
          <div key={role.id} className="mb-2">
            <div className="px-2 pb-1">
              <span className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: roleColor(role.name) }}>
                {role.name} — {roleMembers.length}
              </span>
            </div>
            {roleMembers.map((member) => (
              <MemberRow key={member.publicKey} member={member} isOnline color={roleColor(role.name)} ctx={ctx} />
            ))}
          </div>
        ))}

        {/* Online without role */}
        {onlineNoRole.length > 0 && (
          <div className="mb-2">
            <div className="px-2 pb-1">
              <span className="text-[11px] font-semibold uppercase text-muted-foreground tracking-wide">
                Online — {roleGroups.length > 0 ? onlineNoRole.length : totalOnline}
              </span>
            </div>
            {onlineNoRole.map((member) => (
              <MemberRow key={member.publicKey} member={member} isOnline ctx={ctx} />
            ))}
          </div>
        )}

        {/* Divider */}
        {offline.length > 0 && totalOnline > 0 && (
          <div className="mx-2 my-3 border-t border-border" />
        )}

        {/* Offline */}
        {offline.length > 0 && (
          <>
            <div className="px-2 pb-2">
              <span className="text-[11px] font-semibold uppercase text-muted-foreground tracking-wide">
                Offline — {offline.length}
              </span>
            </div>
            {offline.map((member) => (
              <MemberRow key={member.publicKey} member={member} isOnline={false} ctx={ctx} />
            ))}
          </>
        )}

        {membersArray.length === 0 && (
          <p className="text-sm text-muted-foreground px-2 py-4">No members yet</p>
        )}
      </ScrollArea>
      {ctx.element}
    </div>
  );
}

function MemberRow({ member, isOnline, color, ctx }: {
  member: UserProfile;
  isOnline: boolean;
  color?: string;
  ctx: ReturnType<typeof useContextMenu>;
}) {
  const myKey = useIdentityStore((s) => s.publicKey);
  const isAdmin = useRealmStore((s) => s.isAdmin);
  const myPerms = useRolesStore((s) => s.myPermissions);
  const allowDm = useRealmStore((s) => s.info.allowDirectMessages);
  const isOwnProfile = myKey === member.publicKey;
  const canKick = !isOwnProfile && (isAdmin || hasPermission(myPerms, Permission.KICK));
  const canBan = !isOwnProfile && (isAdmin || hasPermission(myPerms, Permission.BAN));
  const canDm = !isOwnProfile && !!allowDm;

  function handleContextMenu(e: React.MouseEvent) {
    const items: ContextMenuEntry[] = [];
    if (canDm) {
      items.push({
        label: "Message",
        icon: <MessageSquare className="w-4 h-4" />,
        onClick: () => {
          const client = getWebSocketClient();
          client?.send("dm:open", { targetPublicKey: member.publicKey });
        },
      });
    }
    if (canKick || canBan) {
      if (items.length > 0) items.push({ separator: true });
      if (canKick) {
        items.push({
          label: "Kick",
          icon: <UserX className="w-4 h-4" />,
          onClick: () => {
            const client = getWebSocketClient();
            client?.send("member:kick", { publicKey: member.publicKey });
          },
        });
      }
      if (canBan) {
        items.push({
          label: "Ban",
          icon: <Ban className="w-4 h-4" />,
          variant: "destructive",
          onClick: () => {
            const client = getWebSocketClient();
            client?.send("member:ban", { publicKey: member.publicKey });
          },
        });
      }
    }
    if (items.length > 0) ctx.show(e, items);
  }

  return (
    <UserProfilePopover publicKey={member.publicKey} name={member.name} trigger={
      <button
        onContextMenu={handleContextMenu}
        className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-sidebar-accent/50 cursor-pointer transition-colors ${isOnline ? "" : "opacity-50"}`}
      >
        <Avatar name={member.name} size="sm" status={isOnline ? "online" : "offline"} />
        <span className="text-sm truncate" style={color ? { color } : undefined}>
          {member.name}
        </span>
      </button>
    } />
  );
}
