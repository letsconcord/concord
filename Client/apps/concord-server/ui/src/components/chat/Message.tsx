/**
 * Message component for server UI.
 *
 * Adaptations from client version:
 * - Uses single-realm stores instead of multi-realm
 * - Uses bridge.requestOpenExternal() instead of Tauri shell.open()
 * - Simplified: no UserProfilePopover, no role colors (Phase 3+)
 */

import { useMemo, useState, useEffect, type ReactNode } from "react";
import type { DisplayMessage } from "../../stores/messages";
import { useRealmStore } from "../../stores/realm";
import { useIdentityStore } from "../../stores/identity";
import { Avatar } from "../ui/avatar";
import { getFileUrl, downloadDecryptedBlob, downloadDecryptedFile } from "../../features/files/upload";
import { useLightboxStore } from "../ui/image-lightbox";
import { getKeys } from "../../features/bridge/iframe-bridge";
import { requestOpenExternal } from "../../features/bridge/iframe-bridge";
import { FileIcon, Download, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface MessageProps {
  message: DisplayMessage;
  showHeader: boolean;
}

function formatTime(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  });
}

const FILE_PATTERN = /\[file:([^:]+):([^\]]+)\]/g;
const GIF_PATTERN = /\[gif:(https?:\/\/[^\]]+)\]/g;
const IMAGE_EXTS = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg"]);

function openExternalLink(url: string) {
  requestOpenExternal(url);
}

// ── Markdown rendering ──

const CODE_BLOCK_RE = /```(\w*)\n?([\s\S]*?)```/g;
const INLINE_RE = /`([^`\n]+)`|\*\*([^*\n]+)\*\*|\*([^*\n]+)\*|~~([^~\n]+)~~|\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)|(https?:\/\/[^\s<>"')\]]+)/g;

function renderLink(url: string, label: string, key: number): ReactNode {
  return (
    <a
      key={key}
      href={url}
      onClick={(e) => { e.preventDefault(); openExternalLink(url); }}
      className="text-primary hover:underline cursor-pointer break-all"
    >
      {label}
    </a>
  );
}

function renderInline(text: string): ReactNode[] {
  const result: ReactNode[] = [];
  let lastIndex = 0;

  for (const match of text.matchAll(INLINE_RE)) {
    if (match.index > lastIndex) result.push(text.slice(lastIndex, match.index));
    const key = result.length;

    if (match[1] !== undefined) {
      result.push(<code key={key} className="bg-secondary px-1.5 py-0.5 rounded text-[0.8125rem] font-mono">{match[1]}</code>);
    } else if (match[2] !== undefined) {
      result.push(<strong key={key}>{match[2]}</strong>);
    } else if (match[3] !== undefined) {
      result.push(<em key={key}>{match[3]}</em>);
    } else if (match[4] !== undefined) {
      result.push(<del key={key} className="text-muted-foreground">{match[4]}</del>);
    } else if (match[5] !== undefined && match[6] !== undefined) {
      result.push(renderLink(match[6], match[5], key));
    } else if (match[7] !== undefined) {
      result.push(renderLink(match[7], match[7], key));
    }

    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) result.push(text.slice(lastIndex));
  return result;
}

function renderMarkdown(text: string): ReactNode {
  const segments: { type: "text" | "code"; content: string }[] = [];
  let lastIndex = 0;

  for (const match of text.matchAll(CODE_BLOCK_RE)) {
    if (match.index > lastIndex) segments.push({ type: "text", content: text.slice(lastIndex, match.index) });
    segments.push({ type: "code", content: match[2] });
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) segments.push({ type: "text", content: text.slice(lastIndex) });

  if (segments.length === 1 && segments[0].type === "text") return renderTextSegment(segments[0].content);

  return segments.map((seg, i) => {
    if (seg.type === "code") {
      return (
        <pre key={i} className="bg-secondary rounded-md p-3 my-1 overflow-x-auto max-w-full">
          <code className="text-[0.8125rem] font-mono whitespace-pre">{seg.content}</code>
        </pre>
      );
    }
    return <span key={i}>{renderTextSegment(seg.content)}</span>;
  });
}

function renderTextSegment(text: string): ReactNode {
  const lines = text.split("\n");
  return lines.flatMap((line, i, arr) => {
    const nodes: ReactNode[] = [];
    if (line.startsWith("> ")) {
      nodes.push(<span key={i} className="border-l-2 border-muted-foreground/40 pl-2 text-muted-foreground block my-0.5">{renderInline(line.slice(2))}</span>);
    } else if (line !== "") {
      nodes.push(<span key={i}>{renderInline(line)}</span>);
    }
    if (i < arr.length - 1) nodes.push(<br key={`br-${i}`} />);
    return nodes;
  });
}

// ── File parsing ──

function isImage(filename: string): boolean {
  const ext = filename.substring(filename.lastIndexOf(".")).toLowerCase();
  return IMAGE_EXTS.has(ext);
}

function guessMimeType(filename: string): string {
  const ext = filename.substring(filename.lastIndexOf(".")).toLowerCase();
  const map: Record<string, string> = { ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".gif": "image/gif", ".webp": "image/webp", ".svg": "image/svg+xml" };
  return map[ext] ?? "application/octet-stream";
}

interface FileRef { fileId: string; filename: string; }

function parseContent(content: string) {
  const images: FileRef[] = [];
  const files: FileRef[] = [];
  const gifs: string[] = [];
  let text = content;

  const regex = new RegExp(FILE_PATTERN);
  let match: RegExpExecArray | null;
  while ((match = regex.exec(content)) !== null) {
    const [, fileId, filename] = match;
    (isImage(filename) ? images : files).push({ fileId, filename });
  }

  const gifRegex = new RegExp(GIF_PATTERN);
  let gifMatch: RegExpExecArray | null;
  while ((gifMatch = gifRegex.exec(content)) !== null) gifs.push(gifMatch[1]);

  text = text.replace(FILE_PATTERN, "").replace(GIF_PATTERN, "").trim();
  return { images, files, gifs, text };
}

// ── Message component ──

export function Message({ message, showHeader }: MessageProps) {
  const publicKey = useIdentityStore((s) => s.publicKey);
  const isOwn = publicKey === message.senderPublicKey;

  const keys = getKeys();
  const effectiveKey = keys.channelKeys.get(message.channelId) ?? keys.realmKey ?? null;

  const { images, files, gifs, text } = useMemo(
    () => parseContent(message.content),
    [message.content]
  );

  const content = (
    <div className="min-w-0">
      {showHeader && (
        <div className="flex items-baseline gap-2">
          <button className="text-sm font-semibold hover:underline cursor-pointer">
            {message.profile.name}
          </button>
          <span className="text-[11px] text-muted-foreground">{formatTime(message.createdAt)}</span>
        </div>
      )}

      {images.length > 0 && <ImageGallery images={images} encryptionKey={effectiveKey} />}

      {gifs.length > 0 && (
        <div className="mt-1 mb-1">
          {gifs.map((url, i) => (
            <img key={i} src={url} alt="GIF" className="max-w-full md:max-w-sm max-h-64 rounded-xl" loading="lazy" />
          ))}
        </div>
      )}

      {text && (
        <div className="text-sm text-foreground break-words overflow-hidden">
          {renderMarkdown(text)}
        </div>
      )}

      {files.length > 0 && (
        <div className="flex flex-wrap gap-2 mt-1">
          {files.map((f) =>
            effectiveKey ? (
              <DecryptedFileLink key={f.fileId} fileId={f.fileId} filename={f.filename} encryptionKey={effectiveKey} />
            ) : (
              <a
                key={f.fileId}
                href={getFileUrl(f.fileId)}
                download={f.filename}
                className="inline-flex items-center gap-1.5 px-3 py-2 bg-secondary rounded-lg text-sm hover:bg-accent transition-colors"
              >
                <FileIcon className="w-4 h-4 text-muted-foreground" />
                <span className="text-foreground">{f.filename}</span>
                <Download className="w-3.5 h-3.5 text-muted-foreground ml-1" />
              </a>
            )
          )}
        </div>
      )}
    </div>
  );

  if (!showHeader) {
    return (
      <div className={cn("group flex items-start px-4 py-0.5 hover:bg-accent/30 -mx-4", isOwn && "border-l-2 border-primary/40")}>
        <div className="w-8 shrink-0 flex items-center justify-center">
          <span className="text-[10px] text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity">{formatTime(message.createdAt)}</span>
        </div>
        <div className="ml-2 min-w-0">{content}</div>
      </div>
    );
  }

  return (
    <div className={cn("group flex items-start px-4 pt-5 pb-0.5 hover:bg-accent/30 -mx-4", isOwn && "border-l-2 border-primary/40")}>
      <button className="cursor-pointer hover:opacity-80 transition-opacity mt-0.5 shrink-0">
        <Avatar name={message.profile.name} size="md" />
      </button>
      <div className="ml-2 min-w-0">{content}</div>
    </div>
  );
}

// ── Decrypted image ──

function DecryptedImage({ fileId, filename, encryptionKey, onClick, className }: {
  fileId: string; filename: string; encryptionKey: Uint8Array | null; onClick?: () => void; className?: string;
}) {
  const [src, setSrc] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let revoked = false;
    let objectUrl: string | null = null;

    if (!encryptionKey) {
      setSrc(getFileUrl(fileId));
      setLoading(false);
      return;
    }

    downloadDecryptedBlob(fileId, guessMimeType(filename), encryptionKey)
      .then((url) => { if (!revoked) { objectUrl = url; setSrc(url); setLoading(false); } else { URL.revokeObjectURL(url); } })
      .catch(() => { if (!revoked) { setSrc(null); setLoading(false); } });

    return () => { revoked = true; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [fileId, encryptionKey, filename]);

  if (loading) {
    return <div className={cn("flex items-center justify-center bg-secondary rounded-xl", className)} style={{ minWidth: 120, minHeight: 80 }}><Loader2 className="w-5 h-5 text-muted-foreground animate-spin" /></div>;
  }
  if (!src) {
    return <div className={cn("flex items-center justify-center bg-secondary rounded-xl text-xs text-muted-foreground", className)} style={{ minWidth: 120, minHeight: 80 }}>Failed to decrypt</div>;
  }
  return <button className="block max-w-full cursor-pointer hover:opacity-95 transition-opacity" onClick={onClick}><img src={src} alt={filename} className={className} loading="lazy" /></button>;
}

// ── Decrypted file link ──

function DecryptedFileLink({ fileId, filename, encryptionKey }: { fileId: string; filename: string; encryptionKey: Uint8Array; }) {
  const [downloading, setDownloading] = useState(false);

  async function handleDownload() {
    setDownloading(true);
    try {
      const bytes = await downloadDecryptedFile(fileId, encryptionKey);
      const blob = new Blob([bytes.buffer as ArrayBuffer]);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = filename; a.click();
      URL.revokeObjectURL(url);
    } finally { setDownloading(false); }
  }

  return (
    <button onClick={handleDownload} disabled={downloading} className="inline-flex items-center gap-1.5 px-3 py-2 bg-secondary rounded-lg text-sm hover:bg-accent transition-colors cursor-pointer">
      {downloading ? <Loader2 className="w-4 h-4 text-muted-foreground animate-spin" /> : <FileIcon className="w-4 h-4 text-muted-foreground" />}
      <span className="text-foreground">{filename}</span>
      <Download className="w-3.5 h-3.5 text-muted-foreground ml-1" />
    </button>
  );
}

// ── Image gallery ──

function ImageGallery({ images, encryptionKey }: { images: FileRef[]; encryptionKey: Uint8Array | null; }) {
  const openLightbox = useLightboxStore((s) => s.open);

  function handleClick(index: number) {
    if (encryptionKey) {
      Promise.all(
        images.map((img) =>
          downloadDecryptedBlob(img.fileId, guessMimeType(img.filename), encryptionKey)
        )
      ).then((urls) => {
        openLightbox(
          urls.map((url, i) => ({ src: url, alt: images[i].filename })),
          index
        );
      });
      return;
    }

    openLightbox(
      images.map((img) => ({
        src: getFileUrl(img.fileId),
        alt: img.filename,
      })),
      index
    );
  }

  if (images.length === 1) {
    const img = images[0];
    return (
      <div className="mt-1 mb-1 rounded-xl overflow-hidden">
        <DecryptedImage fileId={img.fileId} filename={img.filename} encryptionKey={encryptionKey} onClick={() => handleClick(0)} className="max-w-full md:max-w-md max-h-80 object-contain rounded-xl" />
      </div>
    );
  }

  return (
    <div className="flex flex-wrap gap-1 mt-1 mb-1">
      {images.map((img, i) => (
        <div key={img.fileId} className="rounded-lg overflow-hidden">
          <DecryptedImage fileId={img.fileId} filename={img.filename} encryptionKey={encryptionKey} onClick={() => handleClick(i)} className="max-w-[200px] max-h-48 object-contain rounded-lg" />
        </div>
      ))}
    </div>
  );
}
