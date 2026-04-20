import { beforeEach, describe, expect, it, vi } from "vitest";

import { runVerificationPipeline } from "./verificationEngine";

const mocks = vi.hoisted(() => ({
  mockFindUnique: vi.fn(),
  mockFindFirst: vi.fn(),
  mockUpdate: vi.fn(),
  mockAiDetection: vi.fn(),
  mockAxiosGet: vi.fn()
}));

vi.mock("@earnify/db", () => ({
  CampaignStatus: {
    ACTIVE: "ACTIVE",
    PAUSED: "PAUSED",
    ENDED: "ENDED"
  },
  PostStatus: {
    PENDING: "PENDING",
    VERIFIED: "VERIFIED",
    REJECTED: "REJECTED"
  },
  SocialPlatform: {
    TWITTER: "TWITTER",
    LINKEDIN: "LINKEDIN",
    INSTAGRAM: "INSTAGRAM"
  },
  prisma: {
    post: {
      findUnique: mocks.mockFindUnique,
      findFirst: mocks.mockFindFirst,
      update: mocks.mockUpdate
    }
  }
}));

vi.mock("./aiDetection", () => ({
  runAiDetection: mocks.mockAiDetection
}));

vi.mock("axios", () => ({
  default: {
    get: mocks.mockAxiosGet
  }
}));

type MockPost = {
  id: string;
  campaignId: string;
  postUrl: string;
  platform: "TWITTER" | "LINKEDIN" | "INSTAGRAM";
  status: "PENDING" | "VERIFIED" | "REJECTED";
  campaign: {
    status: "ACTIVE" | "PAUSED" | "ENDED";
    title: string;
    productUrl: string;
  };
};

function makePendingPost(overrides: Partial<MockPost> = {}): MockPost {
  return {
    id: "post_1",
    campaignId: "campaign_1",
    postUrl: "https://twitter.com/acme/status/123",
    platform: "TWITTER",
    status: "PENDING",
    campaign: {
      status: "ACTIVE",
      title: "Acme Rocket",
      productUrl: "https://acme.com"
    },
    ...overrides
  };
}

describe("runVerificationPipeline", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.mockFindFirst.mockResolvedValue(null);
    mocks.mockUpdate.mockResolvedValue(undefined);
    mocks.mockAiDetection.mockResolvedValue({
      authenticityScore: 0.9,
      isSpam: false,
      reason: "Looks authentic"
    });
    mocks.mockAxiosGet.mockResolvedValue({
      status: 200,
      data: "<html><head><title>Acme Rocket launch</title></head><body>Acme rocket review</body></html>"
    });
  });

  it("rejects invalid URL", async () => {
    mocks.mockFindUnique.mockResolvedValueOnce(
      makePendingPost({
        postUrl: "this-is-not-a-url"
      })
    );

    await runVerificationPipeline("post_1");

    expect(mocks.mockUpdate).toHaveBeenCalledWith({
      where: { id: "post_1" },
      data: {
        status: "REJECTED",
        rejectionReason: "Invalid post URL",
        authenticityScore: null
      }
    });
    expect(mocks.mockAxiosGet).not.toHaveBeenCalled();
    expect(mocks.mockAiDetection).not.toHaveBeenCalled();
  });

  it("rejects when URL domain does not match selected platform", async () => {
    mocks.mockFindUnique.mockResolvedValueOnce(
      makePendingPost({
        platform: "TWITTER",
        postUrl: "https://linkedin.com/posts/abc"
      })
    );

    await runVerificationPipeline("post_1");

    expect(mocks.mockUpdate).toHaveBeenCalledWith({
      where: { id: "post_1" },
      data: {
        status: "REJECTED",
        rejectionReason: "URL domain does not match selected platform",
        authenticityScore: null
      }
    });
  });

  it("rejects duplicate URL submissions for the same campaign", async () => {
    mocks.mockFindUnique.mockResolvedValueOnce(makePendingPost());
    mocks.mockFindFirst.mockResolvedValueOnce({ id: "existing_post" });

    await runVerificationPipeline("post_1");

    expect(mocks.mockUpdate).toHaveBeenCalledWith({
      where: { id: "post_1" },
      data: {
        status: "REJECTED",
        rejectionReason: "Duplicate post URL for this campaign",
        authenticityScore: null
      }
    });
    expect(mocks.mockAxiosGet).not.toHaveBeenCalled();
  });

  it("rejects inaccessible posts when fetch is non-200", async () => {
    mocks.mockFindUnique.mockResolvedValueOnce(makePendingPost());
    mocks.mockAxiosGet.mockResolvedValueOnce({ status: 404, data: "Not found" });

    await runVerificationPipeline("post_1");

    expect(mocks.mockUpdate).toHaveBeenCalledWith({
      where: { id: "post_1" },
      data: {
        status: "REJECTED",
        rejectionReason: "Post not accessible",
        authenticityScore: null
      }
    });
  });

  it("rejects when AI detection fails", async () => {
    mocks.mockFindUnique.mockResolvedValueOnce(makePendingPost());
    mocks.mockAiDetection.mockRejectedValueOnce(new Error("AI service unavailable"));

    await runVerificationPipeline("post_1");

    expect(mocks.mockUpdate).toHaveBeenCalledWith({
      where: { id: "post_1" },
      data: {
        status: "REJECTED",
        rejectionReason: "AI verification failed",
        authenticityScore: null
      }
    });
  });

  it("rejects spam posts using AI reason", async () => {
    mocks.mockFindUnique.mockResolvedValueOnce(makePendingPost());
    mocks.mockAiDetection.mockResolvedValueOnce({
      authenticityScore: 0.85,
      isSpam: true,
      reason: "Looks spammy"
    });

    await runVerificationPipeline("post_1");

    expect(mocks.mockUpdate).toHaveBeenCalledWith({
      where: { id: "post_1" },
      data: {
        status: "REJECTED",
        rejectionReason: "Looks spammy",
        authenticityScore: null
      }
    });
  });

  it("applies relevance penalty when no campaign keywords are found", async () => {
    mocks.mockFindUnique.mockResolvedValueOnce(
      makePendingPost({
        postUrl: "https://twitter.com/acme/status/123/",
        campaign: {
          status: "ACTIVE",
          title: "Quasarnovaprime",
          productUrl: "https://xy.io"
        }
      })
    );
    mocks.mockAxiosGet.mockResolvedValueOnce({
      status: 200,
      data: "<html><head><title>Plain text only</title></head><body>No keyword overlap present</body></html>"
    });
    mocks.mockAiDetection.mockResolvedValueOnce({
      authenticityScore: 0.8,
      isSpam: false,
      reason: "Legit"
    });

    await runVerificationPipeline("post_1");

    expect(mocks.mockUpdate).toHaveBeenCalledWith({
      where: { id: "post_1" },
      data: {
        postUrl: "https://twitter.com/acme/status/123"
      }
    });
    expect(mocks.mockUpdate).toHaveBeenCalledWith({
      where: { id: "post_1" },
      data: {
        status: "VERIFIED",
        authenticityScore: 0.65,
        rejectionReason: null
      }
    });
  });
});