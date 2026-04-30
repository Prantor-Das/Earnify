import { Router } from "express";

import { CampaignStatus, PostStatus, prisma } from "@virlo/db";
import type { SocialPlatform } from "@virlo/shared";

import { requireAuth } from "../../middleware/auth.ts";
import { calculateScore } from "../services/scoringEngine.ts";
import { runVerificationPipeline } from "../services/verificationEngine.ts";
import { sendError, sendSuccess } from "../utils/api-response.ts";

const postsRouter = Router();
const simulatePostChecking =
  (process.env.SIMULATE_POST_CHECKING ?? "true") !== "false";

function parseSocialPlatform(value: unknown): SocialPlatform | null {
  if (value === "TWITTER" || value === "LINKEDIN" || value === "INSTAGRAM") {
    return value;
  }

  return null;
}

function parseIdParam(value: string | string[] | undefined): string | null {
  if (typeof value === "string" && value.length > 0) {
    return value;
  }

  return null;
}

function toNumber(value: unknown) {
  if (typeof value === "number") {
    return value;
  }

  return Number(value ?? 0);
}

function randomInRange(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

async function runSimulatedPostCheck(postId: string) {
  await new Promise((resolve) =>
    setTimeout(resolve, randomInRange(1200, 3200)),
  );

  const post = await prisma.post.findUnique({
    where: { id: postId },
    select: {
      id: true,
      status: true,
      platform: true,
      campaign: {
        select: {
          status: true,
        },
      },
    },
  });

  if (!post || post.status !== PostStatus.PENDING) {
    return;
  }

  if (post.campaign.status !== CampaignStatus.ACTIVE) {
    await prisma.post.update({
      where: { id: post.id },
      data: {
        status: PostStatus.REJECTED,
        rejectionReason: "Campaign is not active",
        authenticityScore: null,
      },
    });
    return;
  }

  const platformRanges: Record<
    SocialPlatform,
    {
      views: [number, number];
      likes: [number, number];
      comments: [number, number];
      shares: [number, number];
    }
  > = {
    TWITTER: {
      views: [200, 4200],
      likes: [10, 230],
      comments: [2, 48],
      shares: [1, 38],
    },
    LINKEDIN: {
      views: [150, 2600],
      likes: [8, 180],
      comments: [1, 36],
      shares: [1, 28],
    },
    INSTAGRAM: {
      views: [280, 5200],
      likes: [18, 360],
      comments: [3, 60],
      shares: [1, 26],
    },
  };

  const range = platformRanges[post.platform];
  const authenticityScore = Number((Math.random() * 0.28 + 0.68).toFixed(2));

  await prisma.post.update({
    where: { id: post.id },
    data: {
      status: PostStatus.VERIFIED,
      authenticityScore,
      rejectionReason: null,
    },
  });

  await prisma.postEngagement.create({
    data: {
      postId: post.id,
      views: randomInRange(range.views[0], range.views[1]),
      likes: randomInRange(range.likes[0], range.likes[1]),
      comments: randomInRange(range.comments[0], range.comments[1]),
      shares: randomInRange(range.shares[0], range.shares[1]),
    },
  });

  await calculateScore(post.id);
}

postsRouter.post("/", requireAuth, async (request, response) => {
  const { campaignId, postUrl, platform } = request.body as {
    campaignId?: string;
    postUrl?: string;
    platform?: string;
  };

  if (!request.user) {
    sendError(response, "Unauthorized", 401);
    return;
  }

  if (!campaignId || !postUrl || !platform) {
    sendError(response, "campaignId, postUrl, and platform are required", 400);
    return;
  }

  const parsedPlatform = parseSocialPlatform(platform);
  if (!parsedPlatform) {
    sendError(
      response,
      "platform must be TWITTER, LINKEDIN, or INSTAGRAM",
      400,
    );
    return;
  }

  const campaign = await prisma.campaign.findUnique({
    where: {
      id: campaignId,
    },
    select: {
      id: true,
      status: true,
      founderId: true,
    },
  });

  if (!campaign) {
    sendError(response, "Campaign not found", 404);
    return;
  }

  if (campaign.status !== CampaignStatus.ACTIVE) {
    sendError(response, "Campaign is not active", 400);
    return;
  }

  if (campaign.founderId === request.user.id) {
    sendError(
      response,
      "Founders cannot participate in their own campaigns",
      403,
    );
    return;
  }

  const post = await prisma.post.create({
    data: {
      campaignId,
      userId: request.user.id,
      postUrl,
      platform: parsedPlatform,
      status: PostStatus.PENDING,
    },
    select: {
      id: true,
      status: true,
      createdAt: true,
    },
  });

  const checkTask = simulatePostChecking
    ? runSimulatedPostCheck(post.id)
    : runVerificationPipeline(post.id);

  void checkTask.catch((error: unknown) => {
    console.error("Post verification pipeline failed", {
      postId: post.id,
      error,
    });
  });

  sendSuccess(
    response,
    {
      postId: post.id,
      status: post.status,
      createdAt: post.createdAt.toISOString(),
    },
    202,
  );
});

postsRouter.get("/", requireAuth, async (request, response) => {
  if (!request.user) {
    sendError(response, "Unauthorized", 401);
    return;
  }

  const userId = request.query.userId === "me" ? request.user.id : null;
  const payoutStatus =
    typeof request.query.payoutStatus === "string"
      ? request.query.payoutStatus.toUpperCase()
      : null;
  const validPayoutStatus =
    payoutStatus === "COMPLETED" ||
    payoutStatus === "PENDING" ||
    payoutStatus === "FAILED"
      ? payoutStatus
      : null;

  if (request.query.userId && !userId) {
    sendError(response, "Only userId=me is supported", 400);
    return;
  }

  if (payoutStatus && payoutStatus !== "ALL" && !validPayoutStatus) {
    sendError(
      response,
      "payoutStatus must be PENDING, COMPLETED, FAILED, or ALL",
      400,
    );
    return;
  }

  const posts = await prisma.post.findMany({
    where: {
      userId: userId ?? request.user.id,
      ...(validPayoutStatus
        ? {
            campaign: {
              payouts: {
                some: {
                  userId: request.user.id,
                  status: validPayoutStatus,
                },
              },
            },
          }
        : {}),
    },
    include: {
      campaign: {
        select: {
          id: true,
          title: true,
          totalBudget: true,
          payouts: {
            where: {
              userId: request.user.id,
            },
            orderBy: {
              createdAt: "desc",
            },
            select: {
              id: true,
              amount: true,
              status: true,
              stellarTxHash: true,
              createdAt: true,
            },
          },
        },
      },
      engagements: {
        orderBy: {
          fetchedAt: "desc",
        },
        take: 1,
      },
      scores: {
        where: {
          userId: request.user.id,
        },
        select: {
          totalScore: true,
        },
      },
    },
    orderBy: {
      createdAt: "desc",
    },
  });

  sendSuccess(
    response,
    posts.map((post) => {
      const payout = post.campaign.payouts[0] ?? null;
      const score = post.scores[0]?.totalScore ?? 0;

      return {
        id: post.id,
        postUrl: post.postUrl,
        platform: post.platform,
        status: post.status,
        authenticityScore: post.authenticityScore,
        createdAt: post.createdAt.toISOString(),
        campaign: {
          id: post.campaign.id,
          title: post.campaign.title,
        },
        engagement: post.engagements[0]
          ? {
              views: post.engagements[0].views,
              likes: post.engagements[0].likes,
              shares: post.engagements[0].shares,
              comments: post.engagements[0].comments,
            }
          : null,
        engagementScore: score,
        earnings: payout ? toNumber(payout.amount) : 0,
        payout: payout
          ? {
              id: payout.id,
              amount: toNumber(payout.amount),
              status: payout.status,
              stellarTxHash: payout.stellarTxHash,
              stellarTxUrl: payout.stellarTxHash
                ? `https://stellar.expert/explorer/testnet/search?term=${encodeURIComponent(payout.stellarTxHash)}`
                : null,
              createdAt: payout.createdAt.toISOString(),
            }
          : null,
      };
    }),
  );
});

postsRouter.get("/:id/status", requireAuth, async (request, response) => {
  const postId = parseIdParam(request.params.id);

  if (!postId) {
    sendError(response, "Post id is required", 400);
    return;
  }

  if (!request.user) {
    sendError(response, "Unauthorized", 401);
    return;
  }

  const post = await prisma.post.findUnique({
    where: {
      id: postId,
    },
    select: {
      id: true,
      userId: true,
      status: true,
      rejectionReason: true,
      authenticityScore: true,
      createdAt: true,
    },
  });

  if (!post) {
    sendError(response, "Post not found", 404);
    return;
  }

  if (post.userId !== request.user.id) {
    sendError(response, "Forbidden", 403);
    return;
  }

  sendSuccess(response, {
    postId: post.id,
    status: post.status,
    rejectionReason: post.rejectionReason,
    authenticityScore: post.authenticityScore,
    createdAt: post.createdAt.toISOString(),
  });
});

export { postsRouter };
