import axios from "axios";

import { prisma, type SocialPlatform } from "@earnify/db";

export interface EngagementData {
  views: number;
  likes: number;
  shares: number;
  comments: number;
}

export type Platform = SocialPlatform;

type FetchOptions = {
  postId?: string;
};

// ---------------------------------------------------------------------------
// URL parsers — extract the platform-native post ID from a URL
// ---------------------------------------------------------------------------

/**
 * Extract the tweet/post ID from a Twitter/X URL.
 * Handles:
 *   https://twitter.com/user/status/1234567890
 *   https://x.com/user/status/1234567890
 */
function extractTwitterId(postUrl: string): string {
  const match = /\/status\/(\d+)/.exec(postUrl);
  if (!match?.[1]) {
    throw new Error(`Cannot extract tweet ID from URL: ${postUrl}`);
  }
  return match[1];
}

/**
 * Extract the Instagram shortcode from a post URL.
 * Handles:
 *   https://www.instagram.com/p/ABC123/
 *   https://www.instagram.com/reel/ABC123/
 */
function extractInstagramShortcode(postUrl: string): string {
  const match = /instagram\.com\/(?:p|reel|tv)\/([A-Za-z0-9_-]+)/.exec(postUrl);
  if (!match?.[1]) {
    throw new Error(`Cannot extract Instagram shortcode from URL: ${postUrl}`);
  }
  return match[1];
}

// ---------------------------------------------------------------------------
// Platform fetchers
// ---------------------------------------------------------------------------

async function fetchTwitterEngagement(postUrl: string, postExternalId?: string | null): Promise<EngagementData> {
  const bearerToken = process.env.TWITTER_BEARER_TOKEN;
  if (!bearerToken) {
    throw new Error("TWITTER_BEARER_TOKEN is not configured. Cannot fetch real Twitter engagement data.");
  }

  const tweetId = postExternalId ?? extractTwitterId(postUrl);

  const response = await axios.get<{
    data: {
      public_metrics: {
        impression_count: number;
        like_count: number;
        retweet_count: number;
        reply_count: number;
        quote_count: number;
      };
    };
  }>(`https://api.twitter.com/2/tweets/${tweetId}`, {
    params: { "tweet.fields": "public_metrics" },
    headers: { Authorization: `Bearer ${bearerToken}` }
  });

  const metrics = response.data.data.public_metrics;
  return {
    views: metrics.impression_count,
    likes: metrics.like_count,
    // shares = retweets + quotes
    shares: metrics.retweet_count + metrics.quote_count,
    comments: metrics.reply_count
  };
}

async function fetchInstagramEngagement(postUrl: string): Promise<EngagementData> {
  // Instagram oEmbed gives us like_count and comments_count for public posts.
  // The Basic Display API / Graph API is needed for full metrics (impressions).
  // We use oEmbed as a baseline; views default to 0 when not available.
  const accessToken = process.env.INSTAGRAM_ACCESS_TOKEN;

  const params: Record<string, string> = { url: postUrl, fields: "like_count,comments_count" };
  if (accessToken) {
    params.access_token = accessToken;
  }

  try {
    const response = await axios.get<{
      like_count?: number;
      comments_count?: number;
    }>("https://graph.facebook.com/v19.0/instagram_oembed", { params });

    return {
      views: 0, // oEmbed does not expose impression counts
      likes: response.data.like_count ?? 0,
      shares: 0, // Instagram does not expose share counts publicly
      comments: response.data.comments_count ?? 0
    };
  } catch (error) {
    // oEmbed may return 400 for private/deleted posts — surface a clear error
    const message = axios.isAxiosError(error)
      ? `Instagram oEmbed request failed (${error.response?.status ?? "network error"}): ${JSON.stringify(error.response?.data)}`
      : String(error);
    throw new Error(`Cannot fetch Instagram engagement for ${postUrl}: ${message}`);
  }
}

async function fetchLinkedInEngagement(postUrl: string): Promise<EngagementData> {
  // LinkedIn's public oEmbed endpoint does not expose engagement metrics.
  // The official Share Statistics API requires OAuth and is only available to
  // LinkedIn Marketing Developer Program partners.
  //
  // We verify the post is reachable via oEmbed (confirming it is public) and
  // return zeros for metrics we cannot access without elevated API access.
  // Callers should treat LinkedIn metrics as unavailable until proper API
  // credentials are provisioned.
  try {
    await axios.get("https://www.linkedin.com/oembed", {
      params: { url: postUrl, format: "json" }
    });
  } catch (error) {
    const message = axios.isAxiosError(error)
      ? `LinkedIn oEmbed request failed (${error.response?.status ?? "network error"})`
      : String(error);
    throw new Error(`Cannot verify LinkedIn post at ${postUrl}: ${message}`);
  }

  // Return zeros — real metrics require LinkedIn Marketing API access
  return { views: 0, likes: 0, shares: 0, comments: 0 };
}

// ---------------------------------------------------------------------------
// Core fetch + persist
// ---------------------------------------------------------------------------

async function resolvePost(postUrl: string, platform: Platform, postId?: string) {
  if (postId) {
    return prisma.post.findUnique({
      where: { id: postId },
      select: { id: true, postUrl: true, platform: true, postExternalId: true }
    });
  }

  return prisma.post.findFirst({
    where: { postUrl, platform },
    select: { id: true, postUrl: true, platform: true, postExternalId: true }
  });
}

async function persistEngagement(postId: string, engagement: EngagementData) {
  await Promise.all([
    prisma.postEngagement.create({
      data: { postId, ...engagement }
    }),
    prisma.post.update({
      where: { id: postId },
      data: { lastFetchedAt: new Date() }
    })
  ]);
}

async function fetchEngagement(postUrl: string, platform: Platform, options: FetchOptions = {}): Promise<EngagementData> {
  const post = await resolvePost(postUrl, platform, options.postId);

  let engagement: EngagementData;

  switch (platform) {
    case "TWITTER":
      engagement = await fetchTwitterEngagement(postUrl, post?.postExternalId);
      break;
    case "INSTAGRAM":
      engagement = await fetchInstagramEngagement(postUrl);
      break;
    case "LINKEDIN":
      engagement = await fetchLinkedInEngagement(postUrl);
      break;
    default:
      throw new Error(`Unsupported platform: ${String(platform)}`);
  }

  if (post?.id) {
    await persistEngagement(post.id, engagement);
  }

  return engagement;
}

export { fetchEngagement, extractTwitterId, extractInstagramShortcode };
