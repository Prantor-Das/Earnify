import cron from "node-cron";

import { CampaignStatus, PostStatus, prisma } from "@earnify/db";

import { fetchEngagement } from "../services/engagementFetcher";
import { calculateScore } from "../services/scoringEngine";

type EngagementRefreshSummary = {
  skipped: boolean;
  processedPosts: number;
  failedPosts: number;
  totalPosts: number;
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
      processedPosts: 0,
      failedPosts: 0,
      totalPosts: 0,
      startedAt: now,
      finishedAt: now
    };
  }

  refreshInProgress = true;
  const startedAt = new Date();

  try {
    const posts = await prisma.post.findMany({
      where: {
        status: PostStatus.VERIFIED,
        campaign: {
          status: CampaignStatus.ACTIVE
        }
      },
      select: {
        id: true,
        postUrl: true,
        platform: true
      },
      orderBy: {
        createdAt: "asc"
      }
    });

    let processedPosts = 0;
    let failedPosts = 0;

    for (const post of posts) {
      try {
        await fetchEngagement(post.postUrl, post.platform, { postId: post.id });
        await calculateScore(post.id);
        processedPosts += 1;
      } catch (error) {
        failedPosts += 1;
        console.error("Engagement refresh failed", {
          postId: post.id,
          error
        });
      }
    }

    return {
      skipped: false,
      processedPosts,
      failedPosts,
      totalPosts: posts.length,
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

  cron.schedule("*/15 * * * *", () => {
    void runEngagementRefreshCycle().catch((error: unknown) => {
      console.error("Scheduled engagement refresh failed", error);
    });
  });
}

export { runEngagementRefreshCycle, startEngagementCron };