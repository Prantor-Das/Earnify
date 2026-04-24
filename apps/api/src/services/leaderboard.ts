import { prisma } from "@earnify/db";
import type { LeaderboardEntry, SocialPlatform } from "@earnify/shared";
import { Redis } from "@upstash/redis";

import { fetchEngagement } from "./engagementFetcher.ts";
import { computePostScore } from "./scoringEngine.ts";

const redis = Redis.fromEnv();

// ---------------------------------------------------------------------------
// Redis key helpers (kept for backward-compat rank-change tracking)
// ---------------------------------------------------------------------------

function getLeaderboardKey(campaignId: string) {
  return `leaderboard:campaign:${campaignId}`;
}

function getPreviousRankKey(campaignId: string) {
  return `leaderboard:campaign:${campaignId}:prev-rank`;
}

function resolveRankChange(previousRank: string | null, currentRank: number): LeaderboardEntry["change"] {
  if (!previousRank) return "same";
  const parsed = Number(previousRank);
  if (Number.isNaN(parsed) || parsed === currentRank) return "same";
  return parsed > currentRank ? "up" : "down";
}

// ---------------------------------------------------------------------------
// getLeaderboard — read from CampaignParticipant (DB source of truth)
// ---------------------------------------------------------------------------

async function getLeaderboard(campaignId: string, limit = 50): Promise<LeaderboardEntry[]> {
  const participants = await prisma.campaignParticipant.findMany({
    where: { campaignId },
    orderBy: { totalScore: "desc" },
    take: limit,
    include: {
      user: {
        select: { id: true, name: true, avatar: true }
      }
    }
  });

  if (participants.length === 0) return [];

  const userIds = participants.map((p) => p.userId);

  // Fetch post counts and platform breakdown per user
  const postGroups = await prisma.post.groupBy({
    by: ["userId", "platform"],
    where: { campaignId, userId: { in: userIds }, status: "VERIFIED" },
    _count: { _all: true }
  });

  // Build platform map: userId → Set<SocialPlatform>
  const platformsByUserId = new Map<string, Set<SocialPlatform>>();
  const postCountByUserId = new Map<string, number>();

  for (const group of postGroups) {
    if (!platformsByUserId.has(group.userId)) {
      platformsByUserId.set(group.userId, new Set());
    }
    platformsByUserId.get(group.userId)!.add(group.platform as SocialPlatform);

    const current = postCountByUserId.get(group.userId) ?? 0;
    postCountByUserId.set(group.userId, current + group._count._all);
  }

  // Fetch previous ranks for change indicators
  const previousRanks = await redis.hmget<Record<string, string | null>>(
    getPreviousRankKey(campaignId),
    ...userIds
  );

  const leaderboard: LeaderboardEntry[] = participants.map((participant, index) => {
    const rank = index + 1;
    return {
      rank,
      userId: participant.userId,
      userName: participant.user.name,
      userAvatar: participant.user.avatar,
      score: participant.totalScore,
      postCount: postCountByUserId.get(participant.userId) ?? 0,
      estimatedEarnings: participant.estimatedEarnings,
      platforms: Array.from(platformsByUserId.get(participant.userId) ?? []),
      lastUpdatedAt: participant.updatedAt.toISOString(),
      change: resolveRankChange(previousRanks?.[participant.userId] ?? null, rank)
    };
  });

  // Persist current ranks for next comparison
  if (leaderboard.length > 0) {
    const pipeline = redis.pipeline();
    for (const entry of leaderboard) {
      pipeline.hset(getPreviousRankKey(campaignId), { [entry.userId]: entry.rank.toString() });
    }
    pipeline.expire(getPreviousRankKey(campaignId), 60 * 60 * 24);
    await pipeline.exec();
  }

  return leaderboard;
}

// ---------------------------------------------------------------------------
// refreshLeaderboard — re-fetch all posts, recalculate scores, update ranks
// ---------------------------------------------------------------------------

async function refreshLeaderboard(campaignId: string): Promise<void> {
  const campaign = await prisma.campaign.findUnique({
    where: { id: campaignId },
    select: { id: true, totalBudget: true }
  });

  if (!campaign) throw new Error(`Campaign not found: ${campaignId}`);

  const campaignBudget = Number(campaign.totalBudget);

  // Fetch all verified posts for this campaign
  const posts = await prisma.post.findMany({
    where: { campaignId, status: "VERIFIED" },
    select: { id: true, userId: true, postUrl: true, platform: true, authenticityScore: true }
  });

  // Re-fetch engagement and compute per-post scores
  const userScores = new Map<string, number>();

  for (const post of posts) {
    try {
      await fetchEngagement(post.postUrl, post.platform, { postId: post.id });

      const engagement = await prisma.postEngagement.findFirst({
        where: { postId: post.id },
        orderBy: { fetchedAt: "desc" },
        select: { views: true, likes: true, shares: true, comments: true }
      });

      const postScore = computePostScore({
        views: engagement?.views ?? 0,
        likes: engagement?.likes ?? 0,
        shares: engagement?.shares ?? 0,
        comments: engagement?.comments ?? 0
      });

      await prisma.score.upsert({
        where: {
          postId_userId_campaignId: {
            postId: post.id,
            userId: post.userId,
            campaignId
          }
        },
        update: { totalScore: postScore },
        create: {
          postId: post.id,
          userId: post.userId,
          campaignId,
          totalScore: postScore
        }
      });

      const current = userScores.get(post.userId) ?? 0;
      userScores.set(post.userId, current + postScore);
    } catch (error) {
      console.error("refreshLeaderboard: failed to process post", { postId: post.id, error });
    }
  }

  if (userScores.size === 0) return;

  // Normalise scores and compute estimated earnings
  const totalScore = Array.from(userScores.values()).reduce((sum, s) => sum + s, 0);

  // Sort users by score descending to assign ranks
  const ranked = Array.from(userScores.entries()).sort(([, a], [, b]) => b - a);

  // Upsert CampaignParticipant for each user
  await Promise.all(
    ranked.map(([userId, score], index) => {
      const rank = index + 1;
      const normalizedScore = totalScore > 0 ? (score / totalScore) * 100 : 0;
      const estimatedEarnings = totalScore > 0 ? (score / totalScore) * campaignBudget : 0;

      return prisma.campaignParticipant.upsert({
        where: { campaignId_userId: { campaignId, userId } },
        update: { totalScore: score, estimatedEarnings, rank },
        create: { campaignId, userId, totalScore: score, estimatedEarnings, rank }
      });
    })
  );

  // Also sync Redis sorted set for any legacy callers
  const pipeline = redis.pipeline();
  for (const [userId, score] of userScores) {
    pipeline.zadd(getLeaderboardKey(campaignId), { score, member: userId });
  }
  await pipeline.exec();
}

// ---------------------------------------------------------------------------
// Legacy helpers (kept for backward-compat with existing callers)
// ---------------------------------------------------------------------------

async function updateScore(campaignId: string, userId: string, score: number) {
  await redis.zadd(getLeaderboardKey(campaignId), { score, member: userId });
}

async function getTopN(campaignId: string, n = 10): Promise<LeaderboardEntry[]> {
  return getLeaderboard(campaignId, n);
}

async function getUserRank(campaignId: string, userId: string) {
  return redis.zrevrank(getLeaderboardKey(campaignId), userId);
}

async function getUserScore(campaignId: string, userId: string) {
  const score = await redis.zscore(getLeaderboardKey(campaignId), userId);
  if (score === null || score === undefined) return null;
  return Number(score);
}

export { getLeaderboard, getTopN, getUserRank, getUserScore, refreshLeaderboard, updateScore };
