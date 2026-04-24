import "dotenv/config";

import { createServer } from "node:http";

import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import passport from "passport";

import { prisma } from "@earnify/db";
import type { ApiHealthResponse } from "@earnify/shared";

import { authRouter } from "./auth/routes.ts";
import "./auth/passport.ts";
import { startEngagementCron } from "./jobs/engagementCron.ts";
import { globalErrorHandler, notFoundHandler } from "./middleware/error-handler.ts";
import { adminRouter } from "./routes/admin.ts";
import { campaignsRouter } from "./routes/campaigns.ts";
import { dashboardRouter } from "./routes/dashboard.ts";
import { postsRouter } from "./routes/posts.ts";
import { usersRouter } from "./routes/users.ts";
import { sendSuccess } from "./utils/api-response.ts";
import { initWebsocket } from "./websocket.ts";

const app = express();
const port = Number(process.env.API_PORT ?? 4000);

function normalizeOrigin(value: string) {
  return value.trim().replace(/\/+$/, "");
}

function getAllowedOrigins() {
  const configuredOrigins = process.env.CORS_ORIGINS
    ? process.env.CORS_ORIGINS.split(",")
    : [process.env.WEB_ORIGIN ?? "http://localhost:3000"];

  return configuredOrigins.map(normalizeOrigin).filter(Boolean);
}

const allowedOrigins = getAllowedOrigins();

app.use(
  cors({
    origin(origin, callback) {
      if (!origin) {
        callback(null, true);
        return;
      }

      const normalizedOrigin = normalizeOrigin(origin);
      if (allowedOrigins.includes(normalizedOrigin)) {
        callback(null, true);
        return;
      }

      callback(null, false);
    },
    credentials: true
  })
);
app.use(express.json());
app.use(cookieParser());
app.use(passport.initialize());

app.use("/api/auth", authRouter);
app.use("/api/admin", adminRouter);
app.use("/api/campaigns", campaignsRouter);
app.use("/api/dashboard", dashboardRouter);
app.use("/api/posts", postsRouter);
app.use("/api/users", usersRouter);

app.get("/api/health", async (_request, response) => {
  let campaigns = 0;

  try {
    campaigns = await prisma.campaign.count();
  } catch {
    campaigns = 0;
  }

  const payload: ApiHealthResponse = {
    status: "ok",
    service: "earnify-api",
    timestamp: new Date().toISOString(),
    campaigns
  };

  sendSuccess(response, payload);
});

app.use(notFoundHandler);
app.use(globalErrorHandler);

const server = createServer(app);

initWebsocket(server, allowedOrigins);
startEngagementCron();

server.listen(port, () => {
  console.log(`Earnify API listening on http://localhost:${port}`);
});
