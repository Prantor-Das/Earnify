import { prisma } from "@earnify/db";
import type { LeaderboardEntry } from "@earnify/shared";
import Redis from "ioredis";

const redisUrl = process.env.REDIS_URL ?? "redis://localhost:6379";
const redis = new Redis(redisUrl);

function getLeaderboardKey(campaignId: string) {
  return `leaderboard:campaign:${campaignId}`;
}

function getPreviousRankKey(campaignId: string) {
  return `leaderboard:campaign:${campaignId}:prev-rank`;
}

function resolveRankChange(previousRank: string | null, currentRank: number): LeaderboardEntry["change"] {
  if (!previousRank) {
    return "same";
  }

  const parsedPreviousRank = Number(previousRank);

  if (Number.isNaN(parsedPreviousRank) || parsedPreviousRank === currentRank) {
    return "same";
  }

  return parsedPreviousRank > currentRank ? "up" : "down";
}

async function updateScore(campaignId: string, userId: string, score: number) {
  await redis.zadd(getLeaderboardKey(campaignId), score, userId);
}

async function getTopN(campaignId: string, n = 10): Promise<LeaderboardEntry[]> {
  const limit = Math.max(1, n);
  const serializedLeaderboard = await redis.zrevrange(getLeaderboardKey(campaignId), 0, limit - 1, "WITHSCORES");

  if (serializedLeaderboard.length === 0) {
    return [];
  }

  const userIds: string[] = [];
  const scoreByUserId = new Map<string, number>();

  for (let index = 0; index < serializedLeaderboard.length; index += 2) {
    const userId = serializedLeaderboard[index];
    const score = Number(serializedLeaderboard[index + 1] ?? 0);

    userIds.push(userId);
    scoreByUserId.set(userId, score);
  }

  const previousRanks = await redis.hmget(getPreviousRankKey(campaignId), ...userIds);

  const [users, postCounts] = await Promise.all([
    prisma.user.findMany({
      where: {
        id: {
          in: userIds
        }
      },
      select: {
        id: true,
        name: true,
        avatar: true
      }
    }),
    prisma.post.groupBy({
      by: ["userId"],
      where: {
        campaignId,
        userId: {
          in: userIds
        }
      },
      _count: {
        _all: true
      }
    })
  ]);

  const userById = new Map(users.map((user) => [user.id, user]));
  const postCountByUserId = new Map(postCounts.map((entry) => [entry.userId, entry._count._all]));

  const leaderboard: LeaderboardEntry[] = [];

  for (const [index, userId] of userIds.entries()) {
    const user = userById.get(userId);

    if (!user) {
      continue;
    }

    const rank = index + 1;

    leaderboard.push({
      rank,
      userId,
      userName: user.name,
      userAvatar: user.avatar,
      score: scoreByUserId.get(userId) ?? 0,
      postCount: postCountByUserId.get(userId) ?? 0,
      change: resolveRankChange(previousRanks[index] ?? null, rank)
    });
  }

  if (leaderboard.length > 0) {
    const pipeline = redis.multi();

    for (const entry of leaderboard) {
      pipeline.hset(getPreviousRankKey(campaignId), entry.userId, entry.rank.toString());
    }

    pipeline.expire(getPreviousRankKey(campaignId), 60 * 60 * 24);
    await pipeline.exec();
  }

  return leaderboard;
}

async function getUserRank(campaignId: string, userId: string) {
  return redis.zrevrank(getLeaderboardKey(campaignId), userId);
}

async function getUserScore(campaignId: string, userId: string) {
  const score = await redis.zscore(getLeaderboardKey(campaignId), userId);

  if (!score) {
    return null;
  }

  return Number(score);
}

export { getTopN, getUserRank, getUserScore, updateScore };