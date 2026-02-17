import fs from "node:fs";
import path from "node:path";
import { getDb } from "../db/database.js";
import { getRealmInfo } from "../realm/realm.js";
import { deletePhysicalFile } from "../files/delete.js";
import config from "../config.js";

const DAY_MS = 24 * 60 * 60 * 1000;

/** Delete messages older than the configured retention period, cleaning up associated files. */
export function pruneOldMessages(): number {
  const realm = getRealmInfo();
  if (!realm.retentionDays) return 0;

  const db = getDb();
  const cutoff = Date.now() - realm.retentionDays * DAY_MS;

  // Collect storage paths for attachments that will cascade-delete with the messages
  const orphanedFiles = db
    .prepare(
      `SELECT a.storage_path FROM attachments a
       JOIN messages m ON a.message_id = m.id
       WHERE m.created_at < ?`
    )
    .all(cutoff) as { storage_path: string }[];

  const result = db
    .prepare("DELETE FROM messages WHERE created_at < ?")
    .run(cutoff);

  // Async cleanup of physical files (best-effort)
  if (orphanedFiles.length > 0) {
    void cleanupPhysicalFiles(orphanedFiles.map((f) => f.storage_path));
  }

  return result.changes;
}

/** Delete file attachments older than the configured file retention period. */
export function pruneOldFiles(): number {
  const realm = getRealmInfo();
  if (!realm.fileRetentionDays) return 0;

  const db = getDb();
  const cutoff = Date.now() - realm.fileRetentionDays * DAY_MS;

  const expiredFiles = db
    .prepare("SELECT id, storage_path FROM attachments WHERE created_at < ?")
    .all(cutoff) as { id: string; storage_path: string }[];

  if (expiredFiles.length === 0) return 0;

  // Delete physical files then DB records
  const ids = expiredFiles.map((f) => f.id);
  const placeholders = ids.map(() => "?").join(",");
  db.prepare(`DELETE FROM attachments WHERE id IN (${placeholders})`).run(...ids);

  void cleanupPhysicalFiles(expiredFiles.map((f) => f.storage_path));

  return expiredFiles.length;
}

/** Scan local uploads directory for files with no matching attachment record. */
export function pruneOrphanedFiles(): number {
  // Only applicable for local storage
  if (config.s3) return 0;

  const uploadsDir = path.join(config.dataDir, "uploads");
  if (!fs.existsSync(uploadsDir)) return 0;

  const db = getDb();
  const files = fs.readdirSync(uploadsDir);
  let cleaned = 0;

  for (const file of files) {
    const filePath = path.join(uploadsDir, file);
    const row = db
      .prepare("SELECT 1 FROM attachments WHERE storage_path = ? OR id = ?")
      .get(filePath, file);

    if (!row) {
      try {
        fs.unlinkSync(filePath);
        cleaned++;
      } catch {
        // Skip files that can't be deleted
      }
    }
  }

  return cleaned;
}

async function cleanupPhysicalFiles(paths: string[]): Promise<void> {
  for (const storagePath of paths) {
    await deletePhysicalFile(storagePath);
  }
}

/** Start periodic retention pruning (daily, with immediate run on startup). */
export function startRetentionCron(): NodeJS.Timeout {
  // Run immediately on startup
  runRetention();

  // Then run daily
  return setInterval(runRetention, DAY_MS);
}

function runRetention(): void {
  const deletedMessages = pruneOldMessages();
  if (deletedMessages > 0) {
    console.log(`[retention] Pruned ${deletedMessages} old messages`);
  }

  const deletedFiles = pruneOldFiles();
  if (deletedFiles > 0) {
    console.log(`[retention] Pruned ${deletedFiles} old file attachments`);
  }

  const orphans = pruneOrphanedFiles();
  if (orphans > 0) {
    console.log(`[retention] Cleaned up ${orphans} orphaned files`);
  }
}
