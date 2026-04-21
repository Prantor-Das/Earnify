import "dotenv/config";

import { createServer } from "node:http";

import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import passport from "passport";

import { prisma } from "@earnify/db";
import type { ApiHealthResponse } from "@earnify/shared";

import { authRouter } from "./auth/routes";
import "./auth/passport";
import { campaignsRouter } from "./routes/campaigns";
import { postsRouter } from "./routes/posts";
import { sendSuccess } from "./utils/api-response";
import { initWebsocket } from "./websocket";

const app = express();
const port = Number(process.env.API_PORT ?? 4000);
const webOrigin = process.env.WEB_ORIGIN ?? "http://localhost:3000";

app.use(
  cors({
    origin: webOrigin,
    credentials: true
  })
);
app.use(express.json());
app.use(cookieParser());
app.use(passport.initialize());

app.use("/api/auth", authRouter);
app.use("/api/campaigns", campaignsRouter);
app.use("/api/posts", postsRouter);

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

const server = createServer(app);

initWebsocket(server, webOrigin);

server.listen(port, () => {
  console.log(`Earnify API listening on http://localhost:${port}`);
});

