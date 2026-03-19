import { useState, useEffect, useRef } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "../ui/dialog";
import { Input } from "../ui/input";
import { Button } from "../ui/button";
import { getWebSocketClient } from "../../features/connection/realm-handler";
import { useRealmStore } from "../../stores/realm";
import { requestChannelPassword } from "../../features/bridge/iframe-bridge";
import { cn } from "@/lib/utils";
import { Hash, Volume2, Lock, LockOpen } from "lucide-react";

interface CreateChannelDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultType: "text" | "voice";
}

export function CreateChannelDialog({
  open,
  onOpenChange,
  defaultType,
}: CreateChannelDialogProps) {
  const [name, setName] = useState("");
  const [type, setType] = useState<"text" | "voice">(defaultType);
  const [encrypted, setEncrypted] = useState(false);
  const [password, setPassword] = useState("");
  const pendingPassword = useRef<{ name: string; password: string } | null>(null);

  // Reset form when dialog opens
  useEffect(() => {
    if (open) {
      setName("");
      setType(defaultType);
      setEncrypted(false);
      setPassword("");
    }
  }, [open, defaultType]);

  // Watch for the new channel to appear so we can derive the key for the creator
  const channels = useRealmStore((s) => s.channels);
  useEffect(() => {
    if (!pendingPassword.current || !channels) return;
    const { name: pendingName } = pendingPassword.current;
    const newChannel = channels.find(
      (c) => c.name === pendingName && c.encrypted
    );
    if (newChannel) {
      // Request parent shell to derive the channel key via the bridge
      requestChannelPassword(newChannel.id, newChannel.name);
      pendingPassword.current = null;
    }
  }, [channels]);

  function handleCreate() {
    const trimmed = name.trim();
    if (!trimmed) return;
    if (encrypted && !password.trim()) return;

    // If encrypted, queue so we request key derivation when channel:create arrives
    if (encrypted && password.trim()) {
      pendingPassword.current = { name: trimmed, password: password.trim() };
    }

    const client = getWebSocketClient();
    client?.send("channel:create", {
      name: trimmed,
      type,
      encrypted,
    });
    onOpenChange(false);
  }

  const canCreate = name.trim().length > 0 && (!encrypted || password.trim().length > 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[420px]">
        <DialogHeader>
          <DialogTitle>Create Channel</DialogTitle>
          <DialogDescription>
            Add a new channel to this realm.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-2">
          {/* Channel type toggle */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">
              Channel Type
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setType("text")}
                className={cn(
                  "flex items-center gap-2.5 px-3.5 py-2.5 rounded-lg border text-sm cursor-pointer transition-all",
                  type === "text"
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border bg-secondary/50 text-muted-foreground hover:border-muted-foreground/40"
                )}
              >
                <Hash className="w-4 h-4" />
                <div className="text-left">
                  <div className="font-medium">Text</div>
                  <div className="text-[11px] opacity-70">Send messages</div>
                </div>
              </button>
              <button
                type="button"
                onClick={() => setType("voice")}
                className={cn(
                  "flex items-center gap-2.5 px-3.5 py-2.5 rounded-lg border text-sm cursor-pointer transition-all",
                  type === "voice"
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border bg-secondary/50 text-muted-foreground hover:border-muted-foreground/40"
                )}
              >
                <Volume2 className="w-4 h-4" />
                <div className="text-left">
                  <div className="font-medium">Voice</div>
                  <div className="text-[11px] opacity-70">Talk with others</div>
                </div>
              </button>
            </div>
          </div>

          {/* Channel name */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">
              Channel Name
            </label>
            <div className="relative">
              {type === "text" ? (
                <Hash className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              ) : (
                <Volume2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              )}
              <Input
                className="pl-9"
                value={name}
                onChange={(e) => setName(e.target.value.toLowerCase().replace(/\s+/g, "-"))}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && canCreate) handleCreate();
                }}
                placeholder="new-channel"
                autoFocus
              />
            </div>
          </div>

          {/* Encryption toggle */}
          {type === "text" && (
            <div className="space-y-3">
              <button
                type="button"
                onClick={() => setEncrypted(!encrypted)}
                className={cn(
                  "w-full flex items-center gap-3 px-3.5 py-2.5 rounded-lg border text-sm cursor-pointer transition-all",
                  encrypted
                    ? "border-identity bg-identity/10"
                    : "border-border bg-secondary/50 hover:border-muted-foreground/40"
                )}
              >
                {encrypted ? (
                  <Lock className="w-4 h-4 text-identity shrink-0" />
                ) : (
                  <LockOpen className="w-4 h-4 text-muted-foreground shrink-0" />
                )}
                <div className="text-left flex-1">
                  <div className={cn("font-medium", encrypted ? "text-identity" : "text-muted-foreground")}>
                    Encrypted Channel
                  </div>
                  <div className="text-[11px] text-muted-foreground">
                    {encrypted
                      ? "Messages will be encrypted with a password"
                      : "Anyone in the realm can read messages"}
                  </div>
                </div>
                <div
                  className={cn(
                    "w-9 h-5 rounded-full transition-colors relative",
                    encrypted ? "bg-identity" : "bg-muted"
                  )}
                >
                  <div
                    className={cn(
                      "absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform",
                      encrypted ? "translate-x-4" : "translate-x-0.5"
                    )}
                  />
                </div>
              </button>

              {encrypted && (
                <div className="space-y-2 pl-1">
                  <label className="text-sm font-medium text-foreground">
                    Channel Password
                  </label>
                  <Input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && canCreate) handleCreate();
                    }}
                    placeholder="Enter a password"
                  />
                  <p className="text-[11px] text-muted-foreground leading-relaxed">
                    Share this password with members who should access this channel.
                  </p>
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleCreate} disabled={!canCreate}>
            Create Channel
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
