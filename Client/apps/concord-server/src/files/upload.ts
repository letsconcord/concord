import type { FastifyInstance } from "fastify";
import multipart from "@fastify/multipart";
import path from "node:path";
import fs from "node:fs";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";
import { v4 as uuid } from "uuid";
import { getDb } from "../db/database.js";
import config from "../config.js";

// Lazy-loaded S3 client — only imported when S3 is configured
let s3Client: import("@aws-sdk/client-s3").S3Client | null = null;

async function getS3Client(): Promise<import("@aws-sdk/client-s3").S3Client> {
  if (s3Client) return s3Client;
  if (!config.s3) throw new Error("S3 not configured");

  const { S3Client } = await import("@aws-sdk/client-s3");
  s3Client = new S3Client({
    endpoint: config.s3.endpoint,
    region: config.s3.region,
    credentials: {
      accessKeyId: config.s3.accessKey,
      secretAccessKey: config.s3.secretKey,
    },
    forcePathStyle: true,
  });
  return s3Client;
}

function getTotalStorageBytes(): number {
  const row = getDb()
    .prepare("SELECT COALESCE(SUM(size), 0) as total FROM attachments")
    .get() as { total: number };
  return row.total;
}

export async function registerFileRoutes(app: FastifyInstance): Promise<void> {
  // Only create uploads dir when using local storage
  if (!config.s3) {
    const uploadsDir = path.join(config.dataDir, "uploads");
    fs.mkdirSync(uploadsDir, { recursive: true });
  }

  await app.register(multipart, { limits: { fileSize: config.maxFileSize } });

  app.post("/files", async (request, reply) => {
    try {
      const data = await request.file();
      if (!data) {
        return reply.code(400).send({ error: "No file provided" });
      }

      // Collect file data into buffer to determine size before storage
      const chunks: Buffer[] = [];
      for await (const chunk of data.file) {
        chunks.push(chunk);
      }
      const fileBuffer = Buffer.concat(chunks);
      const fileSize = fileBuffer.length;

      // Enforce storage limit
      if (config.maxStorageBytes > 0) {
        const currentTotal = getTotalStorageBytes();
        if (currentTotal + fileSize > config.maxStorageBytes) {
          return reply.code(413).send({ error: "Storage limit exceeded" });
        }
      }

      const id = uuid();

      if (config.s3) {
        // S3-compatible storage (Cloudflare R2)
        const { PutObjectCommand } = await import("@aws-sdk/client-s3");
        const client = await getS3Client();
        const key = `uploads/${id}`;

        await client.send(
          new PutObjectCommand({
            Bucket: config.s3.bucket,
            Key: key,
            Body: fileBuffer,
            ContentType: data.mimetype,
          })
        );

        getDb()
          .prepare(
            "INSERT INTO attachments (id, message_id, filename, mime_type, size, storage_path, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
          )
          .run(id, null, data.filename, data.mimetype, fileSize, key, Date.now());
      } else {
        // Local filesystem storage
        const uploadsDir = path.join(config.dataDir, "uploads");
        const storagePath = path.join(uploadsDir, id);
        fs.writeFileSync(storagePath, fileBuffer);

        getDb()
          .prepare(
            "INSERT INTO attachments (id, message_id, filename, mime_type, size, storage_path, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
          )
          .run(id, null, data.filename, data.mimetype, fileSize, storagePath, Date.now());
      }

      return reply.send({ id, filename: data.filename, size: fileSize });
    } catch (err) {
      console.error("[files] Upload failed:", err);
      return reply.code(500).send({ error: "Upload failed" });
    }
  });

  app.get<{ Params: { id: string } }>("/files/:id", async (request, reply) => {
    const { id } = request.params;
    const row = getDb()
      .prepare("SELECT * FROM attachments WHERE id = ?")
      .get(id) as Record<string, unknown> | undefined;

    if (!row) {
      return reply.code(404).send({ error: "File not found" });
    }

    if (config.s3) {
      // Stream from S3
      const { GetObjectCommand } = await import("@aws-sdk/client-s3");
      const client = await getS3Client();

      const response = await client.send(
        new GetObjectCommand({
          Bucket: config.s3.bucket,
          Key: row.storage_path as string,
        })
      );

      if (!response.Body) {
        return reply.code(404).send({ error: "File not found in storage" });
      }

      return reply
        .header("Content-Type", row.mime_type as string)
        .header(
          "Content-Disposition",
          `attachment; filename="${row.filename as string}"`
        )
        .send(Readable.fromWeb(response.Body.transformToWebStream() as any));
    } else {
      // Stream from local filesystem
      const stream = fs.createReadStream(row.storage_path as string);
      return reply
        .header("Content-Type", row.mime_type as string)
        .header(
          "Content-Disposition",
          `attachment; filename="${row.filename as string}"`
        )
        .send(stream);
    }
  });
}
