import "dotenv/config";

import { createServer } from "node:http";

import { createApp } from "./app.ts";
import { startEngagementCron } from "./jobs/engagementCron.ts";
import { initWebsocket } from "./websocket.ts";

const port = Number(process.env.API_PORT ?? 4000);
const { app, allowedOrigins } = createApp();

const server = createServer(app);

initWebsocket(server, allowedOrigins);
startEngagementCron();

server.listen(port, () => {
  console.log(`Earnify API listening on http://localhost:${port}`);
});
