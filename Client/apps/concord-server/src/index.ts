import Fastify from "fastify";
import cors from "@fastify/cors";
import websocket from "@fastify/websocket";
import { initDb, closeDb } from "./db/database.js";
import { ensureRealm, syncRealmConfig } from "./realm/realm.js";
import { ensureDefaultChannels } from "./realm/channels.js";
import { handleConnection } from "./ws/handler.js";
import { registerFileRoutes } from "./files/upload.js";
import { registerRssRoutes } from "./rss/feed.js";
import { startRetentionCron } from "./messages/retention.js";
import { initSfu } from "./media/sfu.js";
import config, { isPrivateIp } from "./config.js";

async function main() {
  // Initialize database
  initDb();
  const realm = ensureRealm();
  syncRealmConfig();
  ensureDefaultChannels();

  console.log(`[realm] "${realm.name}" (${realm.id})`);
  if (config.encrypted) {
    console.log(`[realm] Encryption enabled`);
  }
  if (config.admins.length > 0) {
    console.log(`[realm] Admins: ${config.admins.join(", ")}`);
  }

  // Initialize mediasoup SFU for voice channels
  try {
    await initSfu();
    console.log(`[sfu] Voice channels ready (announced IP: ${config.mediasoupAnnouncedIp}; Port range: 10000-10100)`);
    if (isPrivateIp(config.mediasoupAnnouncedIp)) {
      console.warn(`[sfu] WARNING: Announced IP "${config.mediasoupAnnouncedIp}" is a private address.`);
      console.warn(`[sfu] Voice/video will NOT work for users on other networks.`);
      console.warn(`[sfu] Set MEDIASOUP_ANNOUNCED_IP to your server's public IP for cross-network voice.`);
    }
  } catch (err) {
    console.warn(`[sfu] Voice unavailable — mediasoup failed to initialize:`, (err as Error).message);
  }

  // Create Fastify server
  const app = Fastify({ logger: false });
  await app.register(cors, { origin: true });
  await app.register(websocket);

  // WebSocket endpoint
  app.get("/ws", { websocket: true }, (socket) => {
    handleConnection(socket);
  });

  // File upload/download
  await registerFileRoutes(app);

  // RSS feed
  registerRssRoutes(app);

  // Health check
  app.get("/health", async () => ({ status: "ok", realm: realm.name }));

  // Start retention cron
  const retentionTimer = startRetentionCron();

  // Start server
  await app.listen({ port: config.port, host: config.host });
  console.log(`[server] Listening on ${config.host}:${config.port}`);

  // Graceful shutdown
  const shutdown = async () => {
    console.log("\n[server] Shutting down...");
    clearInterval(retentionTimer);
    await app.close();
    closeDb();
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((err) => {
  console.error("[server] Fatal error:", err);
  process.exit(1);
});
