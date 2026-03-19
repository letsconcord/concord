import { useState, useEffect, useRef } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "../ui/dialog";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "../ui/select";
import { Input } from "../ui/input";
import { Button } from "../ui/button";
import { getWebSocketClient } from "../../features/connection/realm-handler";
import { uploadFile, getFileUrl } from "../../features/files/upload";
import { useRealmStore } from "../../stores/realm";
import { Camera, X } from "lucide-react";

const RETENTION_PRESETS: { label: string; value: number | null }[] = [
  { label: "Forever", value: null },
  { label: "1 week", value: 7 },
  { label: "2 weeks", value: 14 },
  { label: "3 weeks", value: 21 },
  { label: "1 month", value: 30 },
  { label: "2 months", value: 60 },
  { label: "3 months", value: 90 },
  { label: "4 months", value: 120 },
  { label: "5 months", value: 150 },
  { label: "6 months", value: 180 },
  { label: "9 months", value: 270 },
  { label: "1 year", value: 365 },
  { label: "2 years", value: 730 },
];

function retentionToString(value: number | null): string {
  return value === null ? "forever" : String(value);
}

function stringToRetention(str: string): number | null {
  return str === "forever" ? null : parseInt(str, 10);
}

interface RealmSettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function RealmSettingsDialog({
  open,
  onOpenChange,
}: RealmSettingsDialogProps) {
  const realmInfo = useRealmStore((s) => s.info);
  const [name, setName] = useState(realmInfo.name);
  const [description, setDescription] = useState(realmInfo.description ?? "");
  const [allowDm, setAllowDm] = useState(realmInfo.allowDirectMessages ?? false);
  const [messageRetention, setMessageRetention] = useState<number | null>(
    realmInfo.retentionDays ?? null
  );
  const [fileRetention, setFileRetention] = useState<number | null>(
    realmInfo.fileRetentionDays ?? null
  );
  const [thumbnailFileId, setThumbnailFileId] = useState<string | null>(
    realmInfo.thumbnailFileId ?? null
  );
  const [thumbnailPreview, setThumbnailPreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setName(realmInfo.name);
      setDescription(realmInfo.description ?? "");
      setAllowDm(realmInfo.allowDirectMessages ?? false);
      setMessageRetention(realmInfo.retentionDays ?? null);
      setFileRetention(realmInfo.fileRetentionDays ?? null);
      setThumbnailFileId(realmInfo.thumbnailFileId ?? null);
      setThumbnailPreview(null);
    }
  }, [open, realmInfo.name, realmInfo.description, realmInfo.allowDirectMessages, realmInfo.retentionDays, realmInfo.fileRetentionDays, realmInfo.thumbnailFileId]);

  const hasChanges =
    name.trim() !== realmInfo.name ||
    description.trim() !== (realmInfo.description ?? "") ||
    allowDm !== (realmInfo.allowDirectMessages ?? false) ||
    messageRetention !== (realmInfo.retentionDays ?? null) ||
    fileRetention !== (realmInfo.fileRetentionDays ?? null) ||
    thumbnailFileId !== (realmInfo.thumbnailFileId ?? null);

  async function handleThumbnailSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    // Show local preview immediately
    const previewUrl = URL.createObjectURL(file);
    setThumbnailPreview(previewUrl);

    setUploading(true);
    try {
      const result = await uploadFile(file);
      setThumbnailFileId(result.id);
    } catch {
      setThumbnailPreview(null);
    } finally {
      setUploading(false);
    }
  }

  function handleRemoveThumbnail() {
    setThumbnailFileId(null);
    setThumbnailPreview(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function handleSave() {
    const trimmedName = name.trim();
    if (!trimmedName) return;

    const client = getWebSocketClient();
    client?.send("realm:update", {
      name: trimmedName,
      description: description.trim(),
      allowDirectMessages: allowDm,
      retentionDays: messageRetention,
      fileRetentionDays: fileRetention,
      thumbnailFileId,
    });
    onOpenChange(false);
  }

  const currentThumbnailSrc = thumbnailPreview
    ?? (thumbnailFileId ? getFileUrl(thumbnailFileId) : null);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[420px] bg-[rgba(5,8,16,0.75)] backdrop-blur-[16px] backdrop-saturate-[1.8]">
        <DialogHeader>
          <DialogTitle>Realm Settings</DialogTitle>
          <DialogDescription>
            Configure your realm server.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Thumbnail */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">
              Realm Thumbnail
            </label>
            <div className="flex items-center gap-4">
              <div className="relative group">
                {currentThumbnailSrc ? (
                  <div className="relative w-16 h-16 rounded-xl overflow-hidden">
                    <img
                      src={currentThumbnailSrc}
                      alt="Realm thumbnail"
                      className="w-full h-full object-cover"
                    />
                    <button
                      onClick={handleRemoveThumbnail}
                      className="absolute inset-0 flex items-center justify-center bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                    >
                      <X className="w-5 h-5 text-white" />
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="w-16 h-16 rounded-xl border-2 border-dashed border-border flex items-center justify-center text-muted-foreground hover:border-primary hover:text-primary transition-colors cursor-pointer"
                  >
                    <Camera className="w-5 h-5" />
                  </button>
                )}
                {uploading && (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/50 rounded-xl">
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  </div>
                )}
              </div>
              <div className="flex-1">
                <p className="text-xs text-muted-foreground">
                  Square image recommended. Displayed in the realm list.
                </p>
                {currentThumbnailSrc && (
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="text-xs text-primary hover:underline mt-1 cursor-pointer"
                  >
                    Change image
                  </button>
                )}
              </div>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleThumbnailSelect}
              className="hidden"
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">
              Realm Name
            </label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && hasChanges && name.trim()) handleSave();
              }}
              placeholder="My Realm"
              autoFocus
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">
              Description
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What's this realm about?"
              rows={3}
              className="w-full rounded-md border border-border bg-transparent px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:ring-1 focus:ring-ring resize-none"
            />
          </div>

          <label className="flex items-center gap-3 cursor-pointer">
            <button
              type="button"
              role="switch"
              aria-checked={allowDm}
              onClick={() => setAllowDm(!allowDm)}
              className={`relative inline-flex h-5 w-9 shrink-0 rounded-full border-2 border-transparent transition-colors cursor-pointer ${
                allowDm ? "bg-primary" : "bg-muted"
              }`}
            >
              <span
                className={`pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow-sm transition-transform ${
                  allowDm ? "translate-x-4" : "translate-x-0"
                }`}
              />
            </button>
            <div>
              <span className="text-sm font-medium text-foreground">Allow Direct Messages</span>
              <p className="text-xs text-muted-foreground">Let members send private messages to each other.</p>
            </div>
          </label>

          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">
              Message Retention
            </label>
            <Select
              value={retentionToString(messageRetention)}
              onValueChange={(v) => setMessageRetention(stringToRetention(v))}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {RETENTION_PRESETS.map((preset) => (
                  <SelectItem key={retentionToString(preset.value)} value={retentionToString(preset.value)}>
                    {preset.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Automatically delete messages older than this.
            </p>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">
              File Retention
            </label>
            <Select
              value={retentionToString(fileRetention)}
              onValueChange={(v) => setFileRetention(stringToRetention(v))}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {RETENTION_PRESETS.map((preset) => (
                  <SelectItem key={retentionToString(preset.value)} value={retentionToString(preset.value)}>
                    {preset.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Automatically delete uploaded files older than this.
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={(!hasChanges || !name.trim()) && !uploading}
          >
            Save Changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
