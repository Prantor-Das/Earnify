import axios from "axios";
import { CampaignStatus, PostStatus, SocialPlatform, prisma } from "@earnify/db";
import { load } from "cheerio";

import { runAiDetection } from "./aiDetection.ts";
import { calculateScore } from "./scoringEngine.ts";

type ExtractedContent = {
  ogTitle: string;
  ogDescription: string;
  pageTitle: string;
  visibleText: string;
  combinedText: string;
};

const PLATFORM_DOMAINS: Record<SocialPlatform, string[]> = {
  TWITTER: ["twitter.com", "x.com"],
  LINKEDIN: ["linkedin.com"],
  INSTAGRAM: ["instagram.com"]
};

function normalizePostUrl(input: string) {
  const url = new URL(input.trim());
  const normalizedPath = url.pathname.replace(/\/$/, "");

  return `${url.protocol}//${url.hostname.toLowerCase()}${normalizedPath}${url.search}`;
}

function hostnameMatchesPlatform(hostname: string, platform: SocialPlatform) {
  const allowedDomains = PLATFORM_DOMAINS[platform];
  return allowedDomains.some((domain) => hostname === domain || hostname.endsWith(`.${domain}`));
}

async function rejectPost(postId: string, reason: string) {
  await prisma.post.update({
    where: {
      id: postId
    },
    data: {
      status: PostStatus.REJECTED,
      rejectionReason: reason,
      authenticityScore: null
    }
  });
}

function extractContentFromHtml(html: string): ExtractedContent {
  const $ = load(html);
  const ogTitle = $("meta[property='og:title']").attr("content")?.trim() ?? "";
  const ogDescription = $("meta[property='og:description']").attr("content")?.trim() ?? "";
  const pageTitle = $("title").first().text().trim();
  const visibleText =
    $("body")
      .text()
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 6000) ?? "";

  const combinedText = [ogTitle, ogDescription, pageTitle, visibleText].filter(Boolean).join(" ").trim();

  return {
    ogTitle,
    ogDescription,
    pageTitle,
    visibleText,
    combinedText
  };
}

function getCampaignKeywords(title: string, productUrl: string) {
  const titleTokens = title
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length >= 3);

  let productDomainTokens: string[] = [];
  try {
    const hostname = new URL(productUrl).hostname.toLowerCase();
    productDomainTokens = hostname
      .split(".")
      .filter((part) => part.length >= 3 && part !== "www");
  } catch {
    productDomainTokens = [];
  }

  return Array.from(new Set([...titleTokens, ...productDomainTokens]));
}

function countKeywordMatches(content: string, keywords: string[]) {
  const lowerContent = content.toLowerCase();
  return keywords.filter((keyword) => lowerContent.includes(keyword)).length;
}

async function runVerificationPipeline(postId: string): Promise<void> {
  const post = await prisma.post.findUnique({
    where: {
      id: postId
    },
    include: {
      campaign: true
    }
  });

  if (!post) {
    return;
  }

  if (post.status !== PostStatus.PENDING) {
    return;
  }

  if (post.campaign.status !== CampaignStatus.ACTIVE) {
    await rejectPost(post.id, "Campaign is not active");
    return;
  }

  // Step 1: URL validation and duplication checks.
  let normalizedUrl = "";
  let parsedUrl: URL;

  try {
    normalizedUrl = normalizePostUrl(post.postUrl);
    parsedUrl = new URL(normalizedUrl);
  } catch {
    await rejectPost(post.id, "Invalid post URL");
    return;
  }

  if (!hostnameMatchesPlatform(parsedUrl.hostname.toLowerCase(), post.platform)) {
    await rejectPost(post.id, "URL domain does not match selected platform");
    return;
  }

  const duplicatePost = await prisma.post.findFirst({
    where: {
      campaignId: post.campaignId,
      postUrl: normalizedUrl,
      id: {
        not: post.id
      }
    },
    select: {
      id: true
    }
  });

  if (duplicatePost) {
    await rejectPost(post.id, "Duplicate post URL for this campaign");
    return;
  }

  if (post.postUrl !== normalizedUrl) {
    await prisma.post.update({
      where: {
        id: post.id
      },
      data: {
        postUrl: normalizedUrl
      }
    });
  }

  // Step 2: Fetch post HTML and extract metadata/content.
  let extractedContent: ExtractedContent;

  try {
    const fetchResponse = await axios.get(normalizedUrl, {
      timeout: 10000,
      validateStatus: () => true,
      responseType: "text"
    });

    if (fetchResponse.status !== 200 || typeof fetchResponse.data !== "string") {
      await rejectPost(post.id, "Post not accessible");
      return;
    }

    extractedContent = extractContentFromHtml(fetchResponse.data);
  } catch {
    await rejectPost(post.id, "Post not accessible");
    return;
  }

  if (!extractedContent.combinedText) {
    await rejectPost(post.id, "Post not accessible");
    return;
  }

  // Step 3: Content relevance check with soft penalty when no keyword matches.
  const keywords = getCampaignKeywords(post.campaign.title, post.campaign.productUrl ?? "");
  const keywordMatches = countKeywordMatches(extractedContent.combinedText, keywords);
  const relevancePenalty = keywordMatches === 0 ? 0.15 : 0;

  // Step 4: AI authenticity detection.
  let aiResult;
  try {
    aiResult = await runAiDetection(extractedContent.combinedText);
  } catch {
    await rejectPost(post.id, "AI verification failed");
    return;
  }

  if (aiResult.isSpam || aiResult.authenticityScore < 0.4) {
    await rejectPost(post.id, aiResult.reason || "Likely spam or AI-generated content");
    return;
  }

  const penalizedAuthenticityScore = Math.max(0, aiResult.authenticityScore - relevancePenalty);

  await prisma.post.update({
    where: {
      id: post.id
    },
    data: {
      status: PostStatus.VERIFIED,
      authenticityScore: penalizedAuthenticityScore,
      rejectionReason: null
    }
  });

  try {
    await calculateScore(post.id);
  } catch (error) {
    console.error("Score calculation failed", {
      postId: post.id,
      error
    });
  }
}

export { runVerificationPipeline };
