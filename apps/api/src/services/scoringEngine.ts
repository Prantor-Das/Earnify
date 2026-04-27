import { prisma } from "@earnify/db";

import { updateCreatorScore } from "./sorobanClient.ts";

// ---------------------------------------------------------------------------
// Weighted scoring formula
// Score = (views × 1) + (likes × 3) + (comments × 5) + (shares × 7)
// ---------------------------------------------------------------------------

function computePostScore(input: {
  views: number;
  likes: number;
  shares: number;
  comments: number;
  authenticityScore?: number | null;
}): number {
  const engagementScore = input.views * 1 + input.likes * 3 + input.comments * 5 + input.shares * 7;
  const authenticity = Math.max(0, input.authenticityScore ?? 0);

  // Ensure verified posts still receive score credit even when platform APIs
  // cannot provide engagement metrics in real time.
  const authenticityBonus = Math.round(authenticity * 120);
  const minimumVerifiedScore = Math.round(authenticity * 60);

  return Math.max(engagementScore + authenticityBonus, minimumVerifiedScore);
}

// ---------------------------------------------------------------------------
// calculateScore — score a single post and update CampaignParticipant
// ---------------------------------------------------------------------------

async function calculateScore(postId: string): Promise<number> {
  const [post, engagement] = await Promise.all([
    prisma.post.findUnique({
      where: { id: postId },
      select: {
        id: true,
        userId: true,
        campaignId: true,
        authenticityScore: true
      }
    }),
    prisma.postEngagement.findFirst({
      where: { postId },
      orderBy: { fetchedAt: "desc" },
      select: { views: true, likes: true, shares: true, comments: true }
    })
  ]);

  if (!post) {
    throw new Error(`Post not found: ${postId}`);
  }

  const postScore = computePostScore({
    views: engagement?.views ?? 0,
    likes: engagement?.likes ?? 0,
    shares: engagement?.shares ?? 0,
    comments: engagement?.comments ?? 0,
    authenticityScore: post.authenticityScore
  });

  // Persist per-post score
  const savedScore = await prisma.score.upsert({
    where: {
      postId_userId_campaignId: {
        postId,
        userId: post.userId,
        campaignId: post.campaignId
      }
    },
    update: { totalScore: postScore },
    create: {
      postId,
      userId: post.userId,
      campaignId: post.campaignId,
      totalScore: postScore
    },
    select: { id: true }
  });

  // Best-effort: push score to Soroban contract
  try {
    const [campaign, user] = await Promise.all([
      prisma.campaign.findUnique({
        where: { id: post.campaignId },
        select: { stellarContractId: true }
      }),
      prisma.user.findUnique({
        where: { id: post.userId },
        select: { walletAddress: true }
      })
    ]);

    if (campaign?.stellarContractId && user?.walletAddress) {
      const scoreResult = await updateCreatorScore(campaign.stellarContractId, user.walletAddress, postScore);
      await prisma.score.update({
        where: { id: savedScore.id },
        data: { scoreTxHash: scoreResult.txHash }
      });
    }
  } catch (error) {
    console.error("Failed to update score on Soroban", {
      postId,
      campaignId: post.campaignId,
      userId: post.userId,
      error
    });
  }

  // Aggregate this user's total score across all posts in the campaign
  const scoreAggregate = await prisma.score.aggregate({
    where: { campaignId: post.campaignId, userId: post.userId },
    _sum: { totalScore: true }
  });

  const userCampaignScore = scoreAggregate._sum.totalScore ?? 0;

  // Upsert CampaignParticipant with the raw score (rank + earnings normalised in refreshLeaderboard)
  await prisma.campaignParticipant.upsert({
    where: {
      campaignId_userId: {
        campaignId: post.campaignId,
        userId: post.userId
      }
    },
    update: { totalScore: userCampaignScore },
    create: {
      campaignId: post.campaignId,
      userId: post.userId,
      totalScore: userCampaignScore,
      estimatedEarnings: 0,
      rank: 0
    }
  });

  return postScore;
}

export { calculateScore, computePostScore };
