import { Router } from "express";

import { CampaignStatus, PostStatus, prisma } from "@earnify/db";
import type { SocialPlatform } from "@earnify/shared";

import { requireAuth, requireRole } from "../../middleware/auth.ts";
import { runVerificationPipeline } from "../services/verificationEngine.ts";
import { sendError, sendSuccess } from "../utils/api-response.ts";

const postsRouter = Router();

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

postsRouter.post("/", requireAuth, requireRole("USER"), async (request, response) => {
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
    sendError(response, "platform must be TWITTER, LINKEDIN, or INSTAGRAM", 400);
    return;
  }

  const campaign = await prisma.campaign.findUnique({
    where: {
      id: campaignId
    },
    select: {
      id: true,
      status: true
    }
  });

  if (!campaign) {
    sendError(response, "Campaign not found", 404);
    return;
  }

  if (campaign.status !== CampaignStatus.ACTIVE) {
    sendError(response, "Campaign is not active", 400);
    return;
  }

  const post = await prisma.post.create({
    data: {
      campaignId,
      userId: request.user.id,
      postUrl,
      platform: parsedPlatform,
      status: PostStatus.PENDING
    },
    select: {
      id: true,
      status: true,
      createdAt: true
    }
  });

  void runVerificationPipeline(post.id).catch((error: unknown) => {
    console.error("Post verification pipeline failed", {
      postId: post.id,
      error
    });
  });

  sendSuccess(
    response,
    {
      postId: post.id,
      status: post.status,
      createdAt: post.createdAt.toISOString()
    },
    202
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
      id: postId
    },
    select: {
      id: true,
      userId: true,
      status: true,
      rejectionReason: true,
      authenticityScore: true,
      createdAt: true
    }
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
    createdAt: post.createdAt.toISOString()
  });
});

export { postsRouter };
