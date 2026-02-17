import fs from "node:fs";
import config from "../config.js";

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

/** Delete a physical file from local storage or S3. Returns true on success. */
export async function deletePhysicalFile(storagePath: string): Promise<boolean> {
  try {
    if (config.s3) {
      const { DeleteObjectCommand } = await import("@aws-sdk/client-s3");
      const client = await getS3Client();
      await client.send(
        new DeleteObjectCommand({
          Bucket: config.s3.bucket,
          Key: storagePath,
        })
      );
    } else {
      if (fs.existsSync(storagePath)) {
        fs.unlinkSync(storagePath);
      }
    }
    return true;
  } catch (err) {
    console.error(`[files] Failed to delete physical file ${storagePath}:`, err);
    return false;
  }
}
