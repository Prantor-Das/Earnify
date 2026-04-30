import Groq from "groq-sdk";

import { PostStatus, prisma } from "@virlo/db";
import type { Campaign, User } from "@virlo/db";

type MatchBreakdown = {
  platformFit: number;
  engagementQuality: number;
  trackRecord: number;
  aiCheckRate: number;
  postVolume: number;
};

type CreatorMatchScore = {
  score: number;
  breakdown: MatchBreakdown;
};

const groqApiKey = process.env.GROQ_API_KEY;
const groqModel = process.env.GROQ_MODEL ?? "llama-3.3-70b-versatile";
const groq = groqApiKey ? new Groq({ apiKey: groqApiKey }) : null;

function clampScore(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value)));
}

function normalizePlatform(platform: string) {
  const key = platform.toUpperCase();
  return key === "X" ? "TWITTER" : key;
}

function buildFallbackBrief(campaign: Campaign) {
  const platforms = campaign.platforms.length
    ? campaign.platforms.join(", ")
    : "social channels";
  const guidelines = campaign.requiredKeywords.length
    ? `Creators should naturally include ${campaign.requiredKeywords.join(", ")}.`
    : "Creators should keep the message clear, authentic, and easy to understand.";

  return [
    `${campaign.title} is a creator-led campaign designed to turn product interest into credible social proof. The campaign should introduce the offer clearly, explain why it matters now, and invite audiences to take a closer look through practical, creator-native storytelling.`,
    `Content should be tailored for ${platforms}, with a strong opening hook, a specific user benefit, and a concise call to action. ${guidelines} The tone should feel polished but personal, avoiding generic claims in favor of concrete examples and audience-relevant context.`,
    `The available budget is ${campaign.budget} ${campaign.budgetToken}, so creators should focus on posts that can earn attention and engagement efficiently. Strong submissions will connect the campaign message to a real creator perspective while staying aligned with the brand's guidelines and timeline.`,
  ].join("\n\n");
}

async function generateCampaignBrief(campaign: Campaign): Promise<string> {
  if (!groq) {
    return buildFallbackBrief(campaign);
  }

  const response = await groq.chat.completions.create({
    model: groqModel,
    messages: [
      {
        role: "system",
        content:
          "You write concise marketing campaign briefs for creator campaigns. Return exactly three polished paragraphs, no title, no bullets, no markdown.",
      },
      {
        role: "user",
        content: JSON.stringify({
          title: campaign.title,
          description: campaign.description,
          platforms: campaign.platforms,
          guidelines: campaign.requiredKeywords,
          budget: `${campaign.budget} ${campaign.budgetToken}`,
        }),
      },
    ],
    temperature: 0.45,
  });

  const brief = response.choices[0]?.message?.content?.trim();
  if (!brief) {
    throw new Error("Empty campaign brief response");
  }

  return brief;
}

async function scoreCreatorMatch(
  creator: User,
  campaign: Campaign,
): Promise<CreatorMatchScore> {
  const posts = await prisma.post.findMany({
    where: { userId: creator.id },
    include: {
      scores: { select: { totalScore: true } },
    },
  });

  const verifiedPosts = posts.filter((post) => post.status === PostStatus.VERIFIED);
  const creatorPlatforms = new Set(
    verifiedPosts.map((post) => normalizePlatform(post.platform)),
  );
  const campaignPlatforms = campaign.platforms.map(normalizePlatform);
  const matchedPlatforms = campaignPlatforms.filter((platform) =>
    creatorPlatforms.has(platform),
  );

  const platformFit =
    campaignPlatforms.length === 0
      ? 0
      : clampScore((matchedPlatforms.length / campaignPlatforms.length) * 100);

  const scoreValues = verifiedPosts.flatMap((post) =>
    post.scores.map((score) => score.totalScore),
  );
  const averageEngagement =
    scoreValues.length > 0
      ? scoreValues.reduce((sum, score) => sum + score, 0) / scoreValues.length
      : 0;
  const engagementQuality = clampScore(averageEngagement);

  const scoredAuthenticityPosts = verifiedPosts.filter(
    (post) => post.authenticityScore !== null,
  );
  const passedAiChecks = scoredAuthenticityPosts.filter(
    (post) => (post.authenticityScore ?? 0) >= 0.5,
  ).length;
  const aiCheckRate =
    scoredAuthenticityPosts.length > 0
      ? clampScore((passedAiChecks / scoredAuthenticityPosts.length) * 100)
      : verifiedPosts.length > 0
        ? 100
        : 0;

  const postVolume = clampScore(Math.min(posts.length, 20) * 5);
  const trackRecord = clampScore(aiCheckRate * 0.6 + postVolume * 0.4);

  const score = clampScore(
    platformFit * 0.35 +
      engagementQuality * 0.35 +
      aiCheckRate * 0.15 +
      postVolume * 0.15,
  );

  return {
    score,
    breakdown: {
      platformFit,
      engagementQuality,
      trackRecord,
      aiCheckRate,
      postVolume,
    },
  };
}

export type { CreatorMatchScore, MatchBreakdown };
export { generateCampaignBrief, scoreCreatorMatch };
