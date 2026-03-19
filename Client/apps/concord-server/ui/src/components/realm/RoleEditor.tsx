import { useState } from "react";
import { useRolesStore } from "../../stores/roles";
import { useMembersStore } from "../../stores/members";
import { getWebSocketClient } from "../../features/connection/realm-handler";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../ui/dialog";
import { ScrollArea } from "../ui/scroll-area";
import { Avatar } from "../ui/avatar";
import { roleColor } from "../../lib/role-color";
import { Permission } from "@concord/protocol";
import { GripVertical, Pencil, Trash2, Plus, X, Check, Search } from "lucide-react";
import type { Role } from "@concord/protocol";

interface RoleEditorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const PERMISSION_DEFS = [
  { perm: Permission.KICK, label: "Kick" },
  { perm: Permission.BAN, label: "Ban" },
  { perm: Permission.MANAGE_CHANNELS, label: "Manage Channels" },
  { perm: Permission.MANAGE_ROLES, label: "Manage Roles" },
];

function PermChip({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium cursor-pointer transition-all ${
        active
          ? "bg-green-500/15 text-green-400 ring-1 ring-green-500/30"
          : "bg-secondary text-muted-foreground hover:bg-secondary/80"
      }`}
    >
      {active && <Check className="w-3 h-3" />}
      {label}
    </button>
  );
}

export function RoleEditor({ open, onOpenChange }: RoleEditorProps) {
  const roles = useRolesStore((s) => s.roles);
  const members = useMembersStore.getState().getMembersArray();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editPerms, setEditPerms] = useState(0);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [newPerms, setNewPerms] = useState(0);
  const [assigningRoleId, setAssigningRoleId] = useState<string | null>(null);
  const [assignSearch, setAssignSearch] = useState("");
  const [dragIdx, setDragIdx] = useState<number | null>(null);

  const client = getWebSocketClient();

  function startEdit(role: Role) {
    setEditingId(role.id);
    setEditName(role.name);
    setEditPerms(role.permissions);
  }

  function saveEdit() {
    if (!editingId || !editName.trim()) return;
    client?.send("role:update", { roleId: editingId, name: editName.trim(), permissions: editPerms });
    setEditingId(null);
  }

  function handleDelete(roleId: string) {
    client?.send("role:delete", { roleId });
  }

  function handleCreate() {
    if (!newName.trim()) return;
    client?.send("role:create", { name: newName.trim(), permissions: newPerms });
    setNewName("");
    setNewPerms(0);
    setCreating(false);
  }

  function handleAssign(publicKey: string) {
    if (!assigningRoleId) return;
    client?.send("role:assign", { publicKey, roleId: assigningRoleId });
    setAssigningRoleId(null);
    setAssignSearch("");
  }

  function handleUnassign(publicKey: string) {
    client?.send("role:assign", { publicKey, roleId: null });
  }

  function togglePerm(current: number, perm: number): number {
    return current ^ perm;
  }

  function openAssignPanel(roleId: string) {
    if (assigningRoleId === roleId) {
      setAssigningRoleId(null);
      setAssignSearch("");
    } else {
      setAssigningRoleId(roleId);
      setAssignSearch("");
    }
  }

  // Drag and drop reordering
  function handleDragStart(idx: number) {
    setDragIdx(idx);
  }

  function handleDragOver(e: React.DragEvent, idx: number) {
    e.preventDefault();
    if (dragIdx === null || dragIdx === idx) return;
    const reordered = [...roles];
    const [moved] = reordered.splice(dragIdx, 1);
    reordered.splice(idx, 0, moved);
    useRolesStore.getState().reorderRoles(reordered);
    setDragIdx(idx);
  }

  function handleDragEnd() {
    if (dragIdx !== null) {
      const order = roles.map((r) => r.id);
      client?.send("role:reorder", { order });
    }
    setDragIdx(null);
  }

  const previewColor = newName.trim() ? roleColor(newName.trim()) : "hsl(0, 0%, 50%)";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[480px] max-h-[80vh] flex flex-col bg-[rgba(5,8,16,0.85)] backdrop-blur-[16px] backdrop-saturate-[1.8]">
        <DialogHeader>
          <DialogTitle>{creating ? "Create Role" : "Roles"}</DialogTitle>
        </DialogHeader>

        <ScrollArea className="flex-1 -mx-6 px-6">
          {/* Existing roles — hidden during creation to focus */}
          {!creating && roles.length === 0 && (
            <p className="text-sm text-muted-foreground py-4">No roles yet. Create one to get started.</p>
          )}

          {!creating && roles.map((role, idx) => (
            <div
              key={role.id}
              draggable
              onDragStart={() => handleDragStart(idx)}
              onDragOver={(e) => handleDragOver(e, idx)}
              onDragEnd={handleDragEnd}
              className="flex items-start gap-2 py-2 border-b border-border/50 group"
            >
              <GripVertical className="w-4 h-4 text-muted-foreground mt-1 cursor-grab shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />

              {editingId === role.id ? (
                <div className="flex-1 space-y-2">
                  <input
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    className="w-full px-2 py-1 rounded bg-secondary text-sm text-foreground border border-border focus:outline-none focus:ring-1 focus:ring-primary"
                    autoFocus
                  />
                  <div className="flex flex-wrap gap-1.5">
                    {PERMISSION_DEFS.map(({ perm, label }) => (
                      <PermChip
                        key={perm}
                        active={(editPerms & perm) === perm}
                        label={label}
                        onClick={() => setEditPerms(togglePerm(editPerms, perm))}
                      />
                    ))}
                  </div>
                  <div className="flex gap-1">
                    <button onClick={saveEdit} className="p-1 rounded hover:bg-accent cursor-pointer text-green-500">
                      <Check className="w-4 h-4" />
                    </button>
                    <button onClick={() => setEditingId(null)} className="p-1 rounded hover:bg-accent cursor-pointer text-muted-foreground">
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span
                        className="w-3 h-3 rounded-full shrink-0"
                        style={{ backgroundColor: roleColor(role.name) }}
                      />
                      <span className="text-sm font-medium text-foreground truncate">{role.name}</span>
                      <div className="flex gap-1 ml-auto">
                        {PERMISSION_DEFS.filter(({ perm }) => (role.permissions & perm) === perm).map(({ label }) => (
                          <span key={label} className="text-[10px] px-1.5 py-0.5 rounded-full bg-green-500/15 text-green-400">
                            {label}
                          </span>
                        ))}
                      </div>
                    </div>
                    {/* Members with this role */}
                    <div className="flex flex-wrap gap-1 mt-1.5">
                      {members.filter((m) => m.roleId === role.id).map((m) => (
                        <span key={m.publicKey} className="text-[11px] px-1.5 py-0.5 rounded-full bg-secondary/50 text-muted-foreground flex items-center gap-1">
                          {m.name}
                          <button onClick={() => handleUnassign(m.publicKey)} className="hover:text-foreground cursor-pointer">
                            <X className="w-3 h-3" />
                          </button>
                        </span>
                      ))}
                      <button
                        onClick={() => openAssignPanel(role.id)}
                        className="text-[11px] px-1.5 py-0.5 rounded-full bg-primary/10 text-primary hover:bg-primary/20 cursor-pointer"
                      >
                        + Assign
                      </button>
                    </div>
                    {/* Member assignment dropdown with search */}
                    {assigningRoleId === role.id && (
                      <MemberAssignPanel
                        members={members.filter((m) => m.roleId !== role.id)}
                        search={assignSearch}
                        onSearchChange={setAssignSearch}
                        onAssign={handleAssign}
                      />
                    )}
                  </div>
                  <button onClick={() => startEdit(role)} className="p-1 rounded hover:bg-accent cursor-pointer text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity">
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  <button onClick={() => handleDelete(role.id)} className="p-1 rounded hover:bg-destructive/10 cursor-pointer text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </>
              )}
            </div>
          ))}

          {/* Create new role — card style */}
          {creating ? (
            <div className="mt-3 rounded-lg border border-border/60 bg-secondary/30 overflow-hidden">
              {/* Card header with live color preview */}
              <div
                className="h-8 transition-colors"
                style={{ background: `linear-gradient(135deg, ${previewColor}40, ${previewColor}15)` }}
              />
              <div className="p-3 space-y-3">
                <div className="flex items-center gap-2">
                  <span
                    className="w-3.5 h-3.5 rounded-full shrink-0 transition-colors"
                    style={{ backgroundColor: previewColor }}
                  />
                  <input
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder="Role name"
                    className="flex-1 px-2 py-1 rounded bg-secondary text-sm text-foreground border border-border focus:outline-none focus:ring-1 focus:ring-primary"
                    autoFocus
                  />
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {PERMISSION_DEFS.map(({ perm, label }) => (
                    <PermChip
                      key={perm}
                      active={(newPerms & perm) === perm}
                      label={label}
                      onClick={() => setNewPerms(togglePerm(newPerms, perm))}
                    />
                  ))}
                </div>
                <div className="flex gap-2 pt-1">
                  <button
                    onClick={handleCreate}
                    disabled={!newName.trim()}
                    className="px-3 py-1.5 rounded-md text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 cursor-pointer"
                  >
                    Create
                  </button>
                  <button
                    onClick={() => { setCreating(false); setNewName(""); setNewPerms(0); }}
                    className="px-3 py-1.5 rounded-md text-sm text-muted-foreground hover:bg-accent cursor-pointer"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setCreating(true)}
              className="flex items-center gap-2 w-full mt-3 px-3 py-2 rounded-md text-sm text-muted-foreground hover:bg-accent hover:text-foreground transition-colors cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              Create Role
            </button>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}

/** Member assignment panel with search and avatar rows */
function MemberAssignPanel({ members, search, onSearchChange, onAssign }: {
  members: { publicKey: string; name: string }[];
  search: string;
  onSearchChange: (v: string) => void;
  onAssign: (publicKey: string) => void;
}) {
  const filtered = search.trim()
    ? members.filter((m) => m.name.toLowerCase().includes(search.toLowerCase()))
    : members;

  return (
    <div className="mt-2 rounded-md border border-border/50 bg-secondary/40 overflow-hidden">
      {/* Search bar */}
      <div className="flex items-center gap-2 px-2 py-1.5 border-b border-border/30">
        <Search className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
        <input
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Search members..."
          className="flex-1 bg-transparent text-xs text-foreground placeholder:text-muted-foreground/60 focus:outline-none"
          autoFocus
        />
      </div>
      {/* Member list */}
      <div className="max-h-40 overflow-y-auto p-1">
        {filtered.length === 0 && (
          <p className="text-xs text-muted-foreground px-2 py-2 text-center">No members found</p>
        )}
        {filtered.map((m) => (
          <button
            key={m.publicKey}
            onClick={() => onAssign(m.publicKey)}
            className="w-full flex items-center gap-2 px-2 py-1.5 text-xs text-foreground hover:bg-accent rounded cursor-pointer transition-colors"
          >
            <Avatar name={m.name} size="xs" />
            <span className="truncate">{m.name}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
