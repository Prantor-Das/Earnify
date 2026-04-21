import { prisma, type SocialPlatform } from "@earnify/db";

export interface EngagementData {
  views: number;
  likes: number;
  shares: number;
  comments: number;
}

export type Platform = SocialPlatform;

type EngagementMetric = keyof EngagementData;

type FetchOptions = {
  postId?: string;
};

const snapshotCache = new Map<string, EngagementData>();

/*
Real provider swap points:
- Instagram: use Playwright to inspect the public post page, or the official Graph API when the account permissions allow it.
- LinkedIn: use the official analytics API where available, otherwise fall back to Playwright scraping of the public post metrics.
- Twitter/X: use the official v2 metrics API for authenticated access, with a Playwright fallback for demo or sandbox data.
*/

function buildCacheKey(postIdOrUrl: string, platform: Platform) {
  return `${platform}:${postIdOrUrl}`;
}

function clampMetric(value: number) {
  return Math.max(0, Math.round(value));
}

function randomBetween(minimum: number, maximum: number) {
  return minimum + Math.random() * (maximum - minimum);
}

function randomInteger(minimum: number, maximum: number) {
  return Math.floor(randomBetween(minimum, maximum + 1));
}

function createInitialEngagement(platform: Platform): EngagementData {
  switch (platform) {
    case "INSTAGRAM":
      return {
        views: randomInteger(1200, 5200),
        likes: randomInteger(140, 620),
        shares: randomInteger(10, 85),
        comments: randomInteger(18, 120)
      };
    case "LINKEDIN":
      return {
        views: randomInteger(800, 3800),
        likes: randomInteger(55, 240),
        shares: randomInteger(45, 180),
        comments: randomInteger(20, 110)
      };
    case "TWITTER":
    default:
      return {
        views: randomInteger(900, 4200),
        likes: randomInteger(40, 260),
        shares: randomInteger(25, 150),
        comments: randomInteger(12, 95)
      };
  }
}

function growEngagement(previous: EngagementData): EngagementData {
  const next: EngagementData = {
    views: clampMetric(previous.views * (1 + randomBetween(0, 0.15))),
    likes: clampMetric(previous.likes * (1 + randomBetween(0, 0.15))),
    shares: clampMetric(previous.shares * (1 + randomBetween(0, 0.15))),
    comments: clampMetric(previous.comments * (1 + randomBetween(0, 0.15)))
  };

  return next;
}

function applyViralSpike(engagement: EngagementData): EngagementData {
  if (Math.random() >= 0.1) {
    return engagement;
  }

  const metrics: EngagementMetric[] = ["views", "likes", "shares", "comments"];
  const metric = metrics[randomInteger(0, metrics.length - 1)];
  const spikeMultiplier = randomBetween(3, 10);

  return {
    ...engagement,
    [metric]: clampMetric(engagement[metric] * spikeMultiplier)
  };
}

async function resolvePost(postUrl: string, platform: Platform, postId?: string) {
  if (postId) {
    return prisma.post.findUnique({
      where: {
        id: postId
      },
      select: {
        id: true,
        postUrl: true,
        platform: true
      }
    });
  }

  return prisma.post.findFirst({
    where: {
      postUrl,
      platform
    },
    select: {
      id: true,
      postUrl: true,
      platform: true
    }
  });
}

async function loadLatestEngagement(postId: string) {
  return prisma.postEngagement.findFirst({
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
  });
}

async function persistEngagement(postId: string, engagement: EngagementData) {
  await prisma.postEngagement.create({
    data: {
      postId,
      ...engagement
    }
  });
}

async function fetchEngagement(postUrl: string, platform: Platform, options: FetchOptions = {}): Promise<EngagementData> {
  const post = await resolvePost(postUrl, platform, options.postId);
  const cacheKey = buildCacheKey(post?.id ?? postUrl, platform);

  const cachedEngagement = snapshotCache.get(cacheKey);
  const previousEngagement = cachedEngagement ?? (post?.id ? await loadLatestEngagement(post.id) : null);
  const nextEngagement = applyViralSpike(previousEngagement ? growEngagement(previousEngagement) : createInitialEngagement(platform));

  snapshotCache.set(cacheKey, nextEngagement);

  if (post?.id) {
    await persistEngagement(post.id, nextEngagement);
  }

  return nextEngagement;
}

export { fetchEngagement };