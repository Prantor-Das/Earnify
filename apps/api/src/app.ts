import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import passport from "passport";

import { prisma } from "@earnify/db";
import type { ApiHealthResponse } from "@earnify/shared";

import { authRouter } from "./auth/routes.ts";
import "./auth/passport.ts";
import { runEngagementRefreshCycle } from "./jobs/engagementCron.ts";
import { globalErrorHandler, notFoundHandler } from "./middleware/error-handler.ts";
import { adminRouter } from "./routes/admin.ts";
import { campaignsRouter } from "./routes/campaigns.ts";
import { dashboardRouter } from "./routes/dashboard.ts";
import { postsRouter } from "./routes/posts.ts";
import { usersRouter } from "./routes/users.ts";
import { sendError, sendSuccess } from "./utils/api-response.ts";

function normalizeOrigin(value: string) {
  return value.trim().replace(/\/+$/, "");
}

function getAllowedOrigins() {
  const configuredOrigins = process.env.CORS_ORIGINS
    ? process.env.CORS_ORIGINS.split(",")
    : [process.env.WEB_ORIGIN ?? "http://localhost:3000"];

  return configuredOrigins.map(normalizeOrigin).filter(Boolean);
}

function hasValidCronSecret(request: express.Request) {
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret) {
    return process.env.NODE_ENV !== "production";
  }

  const authorizationHeader = request.header("authorization");
  return authorizationHeader === `Bearer ${cronSecret}`;
}

function createApp() {
  const app = express();
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

  app.all("/api/internal/cron/engagement-refresh", async (request, response) => {
    if (!hasValidCronSecret(request)) {
      sendError(response, "Unauthorized cron request", 401, "UNAUTHORIZED_CRON");
      return;
    }

    try {
      const summary = await runEngagementRefreshCycle();
      sendSuccess(response, summary);
    } catch (error) {
      console.error("Manual engagement refresh failed", error);
      sendError(response, "Failed to refresh engagement metrics", 500, "ENGAGEMENT_REFRESH_FAILED");
    }
  });

  app.use(notFoundHandler);
  app.use(globalErrorHandler);

  return { app, allowedOrigins };
}

export { createApp };
