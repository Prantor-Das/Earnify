import cron from "node-cron";

import { CampaignStatus, prisma } from "@earnify/db";

import { getLeaderboard, refreshLeaderboard } from "../services/leaderboard.ts";
import { emitLeaderboardUpdate } from "../websocket.ts";

type EngagementRefreshSummary = {
  skipped: boolean;
  processedCampaigns: number;
  failedCampaigns: number;
  totalCampaigns: number;
  startedAt: string;
  finishedAt: string;
};

let refreshInProgress = false;
let engagementCronTaskStarted = false;

async function runEngagementRefreshCycle(): Promise<EngagementRefreshSummary> {
  if (refreshInProgress) {
    const now = new Date().toISOString();
    return {
      skipped: true,
      processedCampaigns: 0,
      failedCampaigns: 0,
      totalCampaigns: 0,
      startedAt: now,
      finishedAt: now
    };
  }

  refreshInProgress = true;
  const startedAt = new Date();

  try {
    const activeCampaigns = await prisma.campaign.findMany({
      where: { status: CampaignStatus.ACTIVE },
      select: { id: true }
    });

    let processedCampaigns = 0;
    let failedCampaigns = 0;

    for (const campaign of activeCampaigns) {
      try {
        await refreshLeaderboard(campaign.id);

        // Emit updated leaderboard over WebSocket
        const leaderboard = await getLeaderboard(campaign.id, 50);
        emitLeaderboardUpdate(campaign.id, leaderboard);

        processedCampaigns += 1;
      } catch (error) {
        failedCampaigns += 1;
        console.error("Engagement refresh failed for campaign", {
          campaignId: campaign.id,
          error
        });
      }
    }

    return {
      skipped: false,
      processedCampaigns,
      failedCampaigns,
      totalCampaigns: activeCampaigns.length,
      startedAt: startedAt.toISOString(),
      finishedAt: new Date().toISOString()
    };
  } finally {
    refreshInProgress = false;
  }
}

function startEngagementCron() {
  if (engagementCronTaskStarted) {
    return;
  }

  engagementCronTaskStarted = true;

  // Run every 30 minutes
  cron.schedule("*/30 * * * *", () => {
    void runEngagementRefreshCycle().catch((error: unknown) => {
      console.error("Scheduled engagement refresh failed", error);
    });
  });
}

export { runEngagementRefreshCycle, startEngagementCron };
