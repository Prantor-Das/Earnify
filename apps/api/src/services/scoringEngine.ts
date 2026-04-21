import { prisma } from "@earnify/db";

import { emitLeaderboardUpdate } from "../websocket";
import { getTopN, updateScore } from "./leaderboard";

function computePostScore(input: {
  views: number;
  likes: number;
  shares: number;
  comments: number;
  authenticityScore: number;
}) {
  return (
    input.views * 0.1 +
    input.likes * 1.0 +
    input.shares * 2.0 +
    input.comments * 1.5 +
    input.authenticityScore * 50
  );
}

async function calculateScore(postId: string): Promise<number> {
  const [post, engagement] = await Promise.all([
    prisma.post.findUnique({
      where: {
        id: postId
      },
      select: {
        id: true,
        userId: true,
        campaignId: true,
        authenticityScore: true
      }
    }),
    prisma.postEngagement.findFirst({
      where: {
        postId
      },
      orderBy: {
        fetchedAt: "desc"
      },
      select: {
        views: true,
        likes: true,
        shares: true,
        comments: true
      }
    })
  ]);

  if (!post) {
    throw new Error("Post not found");
  }

  const postScore = computePostScore({
    views: engagement?.views ?? 0,
    likes: engagement?.likes ?? 0,
    shares: engagement?.shares ?? 0,
    comments: engagement?.comments ?? 0,
    authenticityScore: post.authenticityScore ?? 0
  });

  await prisma.score.upsert({
    where: {
      postId_userId_campaignId: {
        postId,
        userId: post.userId,
        campaignId: post.campaignId
      }
    },
    update: {
      totalScore: postScore
    },
    create: {
      postId,
      userId: post.userId,
      campaignId: post.campaignId,
      totalScore: postScore
    }
  });

  const scoreAggregate = await prisma.score.aggregate({
    where: {
      campaignId: post.campaignId,
      userId: post.userId
    },
    _sum: {
      totalScore: true
    }
  });

  const userCampaignScore = scoreAggregate._sum.totalScore ?? 0;

  await updateScore(post.campaignId, post.userId, userCampaignScore);

  const leaderboard = await getTopN(post.campaignId, 10);
  emitLeaderboardUpdate(post.campaignId, leaderboard);

  return postScore;
}

export { calculateScore };