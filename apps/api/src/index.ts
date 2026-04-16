import "dotenv/config";

import cors from "cors";
import express from "express";

import { prisma } from "@earnify/db";
import type { ApiHealthResponse } from "@earnify/shared";

const app = express();
const port = Number(process.env.API_PORT ?? 4000);

app.use(cors());
app.use(express.json());

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

  response.json(payload);
});

app.get("/api/campaigns", async (_request, response) => {
  const campaigns = await prisma.campaign.findMany({
    include: {
      founder: true
    },
    orderBy: {
      createdAt: "desc"
    }
  });

  response.json(campaigns);
});

app.listen(port, () => {
  console.log(`Earnify API listening on http://localhost:${port}`);
});

