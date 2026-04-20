"use client";

import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";

import type { ApiResponse, CampaignStatus, PostStatus, SocialPlatform } from "@earnify/shared";
import { useParams } from "next/navigation";

import { BudgetBar } from "../../../components/BudgetBar";
import { withAuth } from "../../../components/auth/withAuth";
import { PlatformIcon } from "../../../components/PlatformIcon";
import { StatusBadge } from "../../../components/StatusBadge";

const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000";

type CampaignDetails = {
  id: string;
  title: string;
  description: string;
  totalBudget: number;
  remainingBudget: number;
  status: CampaignStatus;
  stats: {
    postCount: number;
    remainingBudget: number;
    topScorer: {
      userId: string;
      name: string;
      avatar?: string | null;
      score: number;
    } | null;
  };
};

type LeaderboardItem = {
  rank: number;
  score: number;
  user: {
    id: string;
    name: string;
    avatar?: string | null;
  };
  post: {
    id: string;
    postUrl: string;
    platform: SocialPlatform;
    status: PostStatus;
    createdAt: string;
  };
};

type ActiveTab = "leaderboard" | "submit";

type PostSubmissionResponse = {
  postId: string;
  status: PostStatus;
};

type PostStatusResponse = {
  postId: string;
  status: PostStatus;
  rejectionReason?: string | null;
  authenticityScore?: number | null;
};

type SubmissionPhase = "idle" | "submitting" | "pending" | "verified" | "rejected" | "error";

function CampaignDetailsPage() {
  const params = useParams<{ id: string }>();
  const campaignId = params.id;

  const [campaign, setCampaign] = useState<CampaignDetails | null>(null);
  const [leaderboard, setLeaderboard] = useState<LeaderboardItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<ActiveTab>("leaderboard");

  const [postUrl, setPostUrl] = useState("");
  const [platform, setPlatform] = useState<SocialPlatform>("TWITTER");
  const [submissionPhase, setSubmissionPhase] = useState<SubmissionPhase>("idle");
  const [submittedPostId, setSubmittedPostId] = useState<string | null>(null);
  const [submissionMessage, setSubmissionMessage] = useState<string | null>(null);
  const [rejectionReason, setRejectionReason] = useState<string | null>(null);

  useEffect(() => {
    if (!campaignId) {
      return;
    }

    const fetchCampaign = async () => {
      setLoading(true);

      try {
        const [campaignResponse, leaderboardResponse] = await Promise.all([
          fetch(`${apiBaseUrl}/api/campaigns/${campaignId}`, {
            method: "GET",
            credentials: "include"
          }),
          fetch(`${apiBaseUrl}/api/campaigns/${campaignId}/leaderboard`, {
            method: "GET",
            credentials: "include"
          })
        ]);

        const campaignPayload = (await campaignResponse.json()) as ApiResponse<CampaignDetails>;
        const leaderboardPayload = (await leaderboardResponse.json()) as ApiResponse<LeaderboardItem[]>;

        if (!campaignResponse.ok || !campaignPayload.success || !campaignPayload.data) {
          setError(campaignPayload.error ?? "Unable to load campaign");
          return;
        }

        setCampaign(campaignPayload.data);

        if (leaderboardResponse.ok && leaderboardPayload.success && leaderboardPayload.data) {
          setLeaderboard(leaderboardPayload.data);
        }
      } catch {
        setError("Unable to load campaign");
      } finally {
        setLoading(false);
      }
    };

    void fetchCampaign();
  }, [campaignId]);

  const topScorerText = useMemo(() => {
    if (!campaign?.stats.topScorer) {
      return "No scores submitted yet";
    }

    return `${campaign.stats.topScorer.name} (${campaign.stats.topScorer.score.toFixed(2)} pts)`;
  }, [campaign?.stats.topScorer]);

  const handleSubmitPost = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const submitPost = async () => {
      if (!campaignId) {
        return;
      }

      setSubmissionPhase("submitting");
      setSubmissionMessage(null);
      setRejectionReason(null);
      setSubmittedPostId(null);

      try {
        const response = await fetch(`${apiBaseUrl}/api/posts`, {
          method: "POST",
          credentials: "include",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            campaignId,
            postUrl,
            platform
          })
        });

        const payload = (await response.json()) as ApiResponse<PostSubmissionResponse>;

        if (!response.ok || !payload.success || !payload.data?.postId) {
          setSubmissionPhase("error");
          setSubmissionMessage(payload.error ?? "Failed to submit post");
          return;
        }

        setSubmittedPostId(payload.data.postId);
        setSubmissionPhase("pending");
        setSubmissionMessage("Verifying your post...");
      } catch {
        setSubmissionPhase("error");
        setSubmissionMessage("Failed to submit post");
      }
    };

    void submitPost();
  };

  useEffect(() => {
    if (!submittedPostId || submissionPhase !== "pending") {
      return;
    }

    let isCancelled = false;
    let attempts = 0;
    const maxAttempts = 40;

    const pollStatus = async () => {
      if (isCancelled) {
        return;
      }

      attempts += 1;

      try {
        const response = await fetch(`${apiBaseUrl}/api/posts/${submittedPostId}/status`, {
          method: "GET",
          credentials: "include"
        });

        const payload = (await response.json()) as ApiResponse<PostStatusResponse>;

        if (!response.ok || !payload.success || !payload.data) {
          if (!isCancelled) {
            setSubmissionPhase("error");
            setSubmissionMessage(payload.error ?? "Unable to check verification status");
          }
          return;
        }

        if (payload.data.status === "VERIFIED") {
          if (!isCancelled) {
            setSubmissionPhase("verified");
            setSubmissionMessage("Post verified! You're on the leaderboard.");
            setPostUrl("");
          }
          return;
        }

        if (payload.data.status === "REJECTED") {
          if (!isCancelled) {
            setSubmissionPhase("rejected");
            setRejectionReason(payload.data.rejectionReason ?? "Post verification failed");
          }
          return;
        }

        if (attempts < maxAttempts) {
          setTimeout(() => {
            void pollStatus();
          }, 2500);
          return;
        }

        if (!isCancelled) {
          setSubmissionPhase("error");
          setSubmissionMessage("Verification timed out. Please try polling again.");
        }
      } catch {
        if (!isCancelled) {
          setSubmissionPhase("error");
          setSubmissionMessage("Unable to check verification status");
        }
      }
    };

    void pollStatus();

    return () => {
      isCancelled = true;
    };
  }, [submissionPhase, submittedPostId]);

  if (loading) {
    return (
      <main className="min-h-screen px-4 py-10 sm:px-6 lg:px-10">
        <p className="text-sm text-muted">Loading campaign...</p>
      </main>
    );
  }

  if (error || !campaign) {
    return (
      <main className="min-h-screen px-4 py-10 sm:px-6 lg:px-10">
        <p className="text-sm text-danger">{error ?? "Campaign not found"}</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen px-4 py-10 sm:px-6 lg:px-10">
      <section className="mx-auto w-full max-w-5xl space-y-8">
        <header
          className="space-y-5 rounded-lg border border-border p-6"
          style={{
            background: "linear-gradient(130deg, color-mix(in srgb, var(--color-secondary) 10%, white), var(--color-surface))"
          }}
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h1 className="text-2xl font-semibold text-secondary sm:text-3xl">{campaign.title}</h1>
            <StatusBadge status={campaign.status} />
          </div>

          <p className="text-sm leading-7 text-muted">{campaign.description}</p>

          <BudgetBar totalBudget={campaign.totalBudget} remainingBudget={campaign.remainingBudget} />

          <div className="flex flex-wrap gap-5 text-sm text-muted">
            <p>
              Posts tracked: <span className="font-semibold text-secondary">{campaign.stats.postCount}</span>
            </p>
            <p>
              Top scorer: <span className="font-semibold text-secondary">{topScorerText}</span>
            </p>
          </div>
        </header>

        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => setActiveTab("leaderboard")}
            className="rounded-md border border-border px-4 py-2 text-sm font-semibold"
            style={{
              color: activeTab === "leaderboard" ? "var(--color-secondary)" : "var(--color-muted)",
              backgroundColor:
                activeTab === "leaderboard"
                  ? "color-mix(in srgb, var(--color-secondary) 14%, var(--color-surface))"
                  : "var(--color-surface)"
            }}
          >
            Leaderboard
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("submit")}
            className="rounded-md border border-border px-4 py-2 text-sm font-semibold"
            style={{
              color: activeTab === "submit" ? "var(--color-secondary)" : "var(--color-muted)",
              backgroundColor:
                activeTab === "submit"
                  ? "color-mix(in srgb, var(--color-secondary) 14%, var(--color-surface))"
                  : "var(--color-surface)"
            }}
          >
            Submit Post
          </button>
        </div>

        {activeTab === "leaderboard" ? (
          <section className="space-y-4 rounded-lg border border-border bg-surface p-5">
            <p className="text-sm text-muted">Real-time leaderboard stream will be connected via WebSocket in Commit 5.</p>

            {leaderboard.length > 0 ? (
              <ul className="space-y-3">
                {leaderboard.map((entry) => (
                  <li
                    key={entry.post.id}
                    className="flex flex-col gap-3 rounded-md border border-border p-4 sm:flex-row sm:items-center sm:justify-between"
                    style={{ backgroundColor: "color-mix(in srgb, var(--color-background) 55%, var(--color-surface))" }}
                  >
                    <div className="space-y-2">
                      <p className="text-sm font-semibold text-secondary">
                        #{entry.rank} {entry.user.name}
                      </p>
                      <PlatformIcon platform={entry.post.platform} />
                      <a className="block text-sm text-primary hover:underline" href={entry.post.postUrl} target="_blank" rel="noreferrer">
                        {entry.post.postUrl}
                      </a>
                    </div>
                    <p className="text-sm font-semibold text-secondary">{entry.score.toFixed(2)} pts</p>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted">No leaderboard entries yet.</p>
            )}
          </section>
        ) : (
          <section className="rounded-lg border border-border bg-surface p-5">
            <form className="space-y-4" onSubmit={handleSubmitPost}>
              <div className="space-y-2">
                <label htmlFor="post-url" className="text-sm font-medium text-secondary">
                  Post URL
                </label>
                <input
                  id="post-url"
                  type="url"
                  value={postUrl}
                  onChange={(event) => setPostUrl(event.target.value)}
                  required
                  placeholder="https://"
                  className="w-full rounded-md border border-border px-3 py-2 text-sm text-secondary outline-none focus:border-primary"
                  style={{ backgroundColor: "var(--color-background)" }}
                />
              </div>

              <div className="space-y-2">
                <label htmlFor="platform" className="text-sm font-medium text-secondary">
                  Platform
                </label>
                <select
                  id="platform"
                  value={platform}
                  onChange={(event) => setPlatform(event.target.value as SocialPlatform)}
                  className="w-full rounded-md border border-border px-3 py-2 text-sm text-secondary outline-none focus:border-primary"
                  style={{ backgroundColor: "var(--color-background)" }}
                >
                  <option value="TWITTER">Twitter / X</option>
                  <option value="LINKEDIN">LinkedIn</option>
                  <option value="INSTAGRAM">Instagram</option>
                </select>
              </div>

              <button
                type="submit"
                disabled={submissionPhase === "submitting" || submissionPhase === "pending"}
                className="inline-flex items-center rounded-md border border-border px-4 py-2 text-sm font-semibold text-secondary"
                style={{
                  background: "linear-gradient(120deg, color-mix(in srgb, var(--color-primary) 20%, white), var(--color-surface))"
                }}
              >
                {submissionPhase === "submitting" ? "Submitting..." : "Submit for Review"}
              </button>
            </form>

            {submissionPhase === "pending" ? (
              <p className="mt-4 inline-flex items-center gap-2 text-sm text-muted">
                <span
                  aria-hidden
                  className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-solid border-muted border-t-primary"
                />
                Verifying your post...
              </p>
            ) : null}

            {submissionPhase === "verified" ? (
              <p className="mt-4 text-sm text-success">Post verified! You&apos;re on the leaderboard.</p>
            ) : null}

            {submissionPhase === "rejected" ? (
              <p className="mt-4 text-sm text-danger">Post rejected: {rejectionReason ?? "Verification failed"}</p>
            ) : null}

            {submissionPhase === "error" && submissionMessage ? (
              <p className="mt-4 text-sm text-danger">{submissionMessage}</p>
            ) : null}
          </section>
        )}
      </section>
    </main>
  );
}

export default withAuth(CampaignDetailsPage);
