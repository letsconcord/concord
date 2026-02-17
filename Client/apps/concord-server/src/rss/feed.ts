import type { FastifyInstance } from "fastify";
import { Feed } from "feed";
import { getRealmInfo } from "../realm/realm.js";
import { getChannels } from "../realm/channels.js";
import { getAuthenticatedConnections } from "../ws/connections.js";
import config from "../config.js";

export function registerRssRoutes(app: FastifyInstance): void {
  app.get("/rss", async (_request, reply) => {
    const realm = getRealmInfo();
    const channels = getChannels();
    const memberCount = getAuthenticatedConnections().length;

    const feed = new Feed({
      title: realm.name,
      description: realm.description ?? "",
      id: realm.id,
      link: `concord://${config.host}:${config.port}`,
      updated: new Date(realm.createdAt),
      copyright: "",
    });

    feed.addItem({
      title: realm.name,
      id: realm.id,
      link: `concord://${config.host}:${config.port}`,
      description: `${realm.description ?? ""} | ${channels.length} channels | ${memberCount} online`,
      date: new Date(realm.createdAt),
    });

    return reply.header("Content-Type", "application/atom+xml").send(feed.atom1());
  });
}
