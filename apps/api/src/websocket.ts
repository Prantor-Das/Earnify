import type { Server as HttpServer } from "node:http";

import type { LeaderboardEntry } from "@earnify/shared";
import { Server } from "socket.io";

let io: Server | null = null;

function getCampaignRoomKey(campaignId: string) {
  return `campaign:${campaignId}`;
}

function initWebsocket(server: HttpServer, webOrigins: string[]) {
  io = new Server(server, {
    cors: {
      origin: webOrigins,
      credentials: true,
    },
  });

  io.on("connection", (socket) => {
    socket.on(
      "join-campaign",
      (payload: { campaignId?: string } | undefined) => {
        if (!payload?.campaignId || typeof payload.campaignId !== "string") {
          return;
        }

        socket.join(getCampaignRoomKey(payload.campaignId));
      },
    );
  });

  return io;
}

function emitLeaderboardUpdate(
  campaignId: string,
  leaderboard: LeaderboardEntry[],
) {
  if (!io) {
    return;
  }

  io.to(getCampaignRoomKey(campaignId)).emit("leaderboard-update", {
    campaignId,
    leaderboard,
  });
}

function emitPayoutUpdate(
  campaignId: string,
  payout: {
    userId: string;
    userName: string;
    amount: number;
    status: "PENDING" | "COMPLETED" | "FAILED";
    stellarTxHash?: string | null;
  },
) {
  if (!io) {
    return;
  }

  io.to(getCampaignRoomKey(campaignId)).emit("payout-update", {
    campaignId,
    payout,
  });
}

export { emitLeaderboardUpdate, emitPayoutUpdate, initWebsocket };
