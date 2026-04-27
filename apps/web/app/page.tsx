"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";

import type { ApiResponse, CampaignStatus } from "@earnify/shared";

import { CampaignCard } from "../components/CampaignCard";
import { EmptyState } from "../components/EmptyState";
import { Skeleton } from "../components/Skeleton";

const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000";

const shellClass = "mx-auto w-full max-w-7xl px-6 lg:px-8";
const surfaceClass = "border border-[var(--color-border)] bg-black/65";
const sectionCardClass = `${surfaceClass} rounded-sm p-6 sm:p-8`;
const overlineClass = "text-[11px] font-semibold uppercase tracking-[0.12em] text-zinc-500";
const sectionTitleClass = "mt-2 text-2xl font-semibold tracking-tight text-zinc-100 sm:text-3xl";
const sectionBodyClass = "mt-3 text-sm leading-7 text-zinc-400";
const h3Class = "text-xl font-semibold tracking-tight text-zinc-100 sm:text-2xl";
const primaryBtnClass =
  "inline-flex items-center justify-center border border-[var(--color-primary)] bg-[var(--color-primary)] px-6 py-3 text-xs font-bold uppercase tracking-[0.1em] text-black transition-colors hover:bg-[var(--color-accent)]";
const secondaryBtnClass =
  "inline-flex items-center justify-center border border-zinc-700 px-6 py-3 text-xs font-bold uppercase tracking-[0.1em] text-zinc-200 transition-colors hover:border-zinc-500 hover:text-white";

type LandingCampaign = {
  id: string;
  title: string;
  description: string;
  totalBudget: number;
  remainingBudget: number;
  status: CampaignStatus;
  postCount: number;
  platforms: string[];
  startDate?: string | null;
  endDate?: string | null;
  createdAt?: string;
  founder?: {
    id: string;
    name: string;
    avatar?: string | null;
  };
};

type ProductTabId = "founders" | "creators" | "settlement";
type CampaignTabId = "live" | "upcoming" | "ended";

function classifyCampaigns(campaigns: LandingCampaign[]) {
  const now = Date.now();

  const isEndedByDate = (campaign: LandingCampaign) => {
    if (!campaign.endDate) return false;
    const end = new Date(campaign.endDate);
    return !Number.isNaN(end.getTime()) && end.getTime() <= now;
  };

  const live = campaigns.filter((campaign) => campaign.status === "ACTIVE" && !isEndedByDate(campaign));

  const ended = campaigns.filter(
    (campaign) => campaign.status === "ENDED" || campaign.status === "COMPLETED" || isEndedByDate(campaign)
  );

  const upcoming = campaigns.filter(
    (campaign) => !live.some((entry) => entry.id === campaign.id) && !ended.some((entry) => entry.id === campaign.id)
  );

  return { live, upcoming, ended };
}

const productTabs: Array<{
  id: ProductTabId;
  label: string;
  title: string;
  description: string;
  bullets: string[];
}> = [
  {
    id: "founders",
    label: "For Founders",
    title: "Launch campaigns with controlled budgets and transparent distribution.",
    description:
      "Build, fund, and end campaigns from one place while keeping every payout auditable against on-chain records.",
    bullets: [
      "Draft-to-live campaign pipeline",
      "Wallet-linked campaign funding",
      "Founder payout console with transaction tracking"
    ]
  },
  {
    id: "creators",
    label: "For Creators",
    title: "Submit once, track performance, and earn from verified engagement.",
    description:
      "Creators get real-time ranking visibility, campaign-specific earnings, and direct payout tracking from dashboard to transaction hash.",
    bullets: [
      "Post verification + status lifecycle",
      "Leaderboard with live rank movement",
      "Connected wallet payout claims"
    ]
  },
  {
    id: "settlement",
    label: "Settlement",
    title: "Close campaigns cleanly with deterministic settlement rules.",
    description:
      "Campaign end triggers a controlled payout stream, with status updates and explorer links for every transfer and refund event.",
    bullets: [
      "On-chain end-campaign flow",
      "Automatic distribution events",
      "Residual pool refund handling"
    ]
  }
];

const faqItems = [
  {
    question: "How are creator posts validated?",
    answer:
      "Posts go through platform and authenticity checks, then verified submissions contribute to leaderboard scoring and payout eligibility."
  },
  {
    question: "When does the leaderboard update?",
    answer:
      "Leaderboard data refreshes from engagement fetch cycles and campaign scoring updates, with live WebSocket delivery on campaign pages."
  },
  {
    question: "How does payout settlement work?",
    answer:
      "Founders trigger campaign end, settlement executes distribution rules, and each transfer status is tracked with transaction explorer links."
  },
  {
    question: "Can we run campaigns for multiple platforms?",
    answer:
      "Yes. Campaigns can include platform requirements and metrics are aggregated per participant for ranking and payout calculations."
  }
] as const;

function FeaturedSkeletonGrid() {
  return (
    <motion.div
      className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3"
      initial="hidden"
      animate="show"
      variants={{
        hidden: {},
        show: {
          transition: {
            staggerChildren: 0.08
          }
        }
      }}
    >
      {Array.from({ length: 6 }).map((_, index) => (
        <motion.div
          key={`home-campaign-skeleton-${index}`}
          variants={{
            hidden: { opacity: 0, y: 14 },
            show: { opacity: 1, y: 0 }
          }}
          transition={{ duration: 0.35, ease: "easeOut" }}
          className={`${surfaceClass} rounded-sm p-6`}
        >
          <motion.div
            animate={{ opacity: [0.7, 1, 0.7] }}
            transition={{ duration: 1.35, repeat: Infinity, delay: index * 0.04 }}
          >
            <Skeleton className="h-5 w-20" />
            <Skeleton className="mt-4 h-6 w-11/12" />
            <Skeleton className="mt-3 h-4 w-full" />
            <Skeleton className="mt-7 h-10 w-full" />
            <Skeleton className="mt-6 h-9 w-full" />
          </motion.div>
        </motion.div>
      ))}
    </motion.div>
  );
}

function SecurityVisual() {
  return (
    <div className="relative h-64 overflow-hidden border-b border-[var(--color-border)] bg-black">
      <div
        className="absolute inset-0 opacity-40"
        style={{
          backgroundImage:
            "linear-gradient(to right, rgba(255,255,255,0.05) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,0.05) 1px, transparent 1px)",
          backgroundSize: "46px 46px"
        }}
      />
      <svg className="absolute inset-0 h-full w-full" viewBox="0 0 600 320" aria-hidden>
        <defs>
          <radialGradient id="shieldGlow" cx="50%" cy="50%" r="45%">
            <stop offset="0%" stopColor="rgba(245,158,11,0.16)" />
            <stop offset="100%" stopColor="rgba(245,158,11,0)" />
          </radialGradient>
        </defs>
        <rect x="0" y="0" width="600" height="320" fill="url(#shieldGlow)" />
        <path
          d="M300 44 L408 96 L392 216 L300 276 L208 216 L192 96 Z"
          fill="none"
          stroke="rgba(245,158,11,0.45)"
          strokeWidth="1.3"
          strokeDasharray="1 7"
        />
        <path
          d="M300 76 L378 116 L366 206 L300 252 L234 206 L222 116 Z"
          fill="none"
          stroke="rgba(245,245,245,0.12)"
          strokeWidth="1"
        />
      </svg>
      <motion.div
        className="absolute left-1/2 top-1/2 h-20 w-20 -translate-x-1/2 -translate-y-1/2 rounded-sm border border-[var(--color-primary)]/45 bg-[var(--color-primary)]/15"
        animate={{ scale: [1, 1.04, 1], opacity: [0.8, 1, 0.8] }}
        transition={{ duration: 2.8, repeat: Infinity, ease: "easeInOut" }}
      />
    </div>
  );
}

function ScaleVisual() {
  return (
    <div className="relative h-64 overflow-hidden border-b border-[var(--color-border)] bg-black">
      <svg className="absolute inset-0 h-full w-full" viewBox="0 0 600 320" aria-hidden>
        <defs>
          <radialGradient id="globeGlow" cx="52%" cy="60%" r="46%">
            <stop offset="0%" stopColor="rgba(245,158,11,0.15)" />
            <stop offset="100%" stopColor="rgba(245,158,11,0)" />
          </radialGradient>
        </defs>
        <rect x="0" y="0" width="600" height="320" fill="url(#globeGlow)" />
        <ellipse cx="332" cy="240" rx="188" ry="124" fill="none" stroke="rgba(245,245,245,0.13)" strokeWidth="1.1" />
        <ellipse cx="332" cy="240" rx="136" ry="90" fill="none" stroke="rgba(148,163,184,0.11)" strokeWidth="1" />
        <ellipse cx="332" cy="240" rx="90" ry="58" fill="none" stroke="rgba(148,163,184,0.09)" strokeWidth="1" />
        <circle cx="430" cy="194" r="6" fill="rgba(245,158,11,0.7)" />
      </svg>
      <motion.div
        className="absolute left-[69%] top-[44%] h-2.5 w-2.5 rounded-full bg-[var(--color-primary)]"
        animate={{ opacity: [0.35, 0.9, 0.35], scale: [1, 1.2, 1] }}
        transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
      />
    </div>
  );
}

function SyncHubVisual() {
  return (
    <div className="relative h-[320px] overflow-hidden border border-[var(--color-border)] bg-black p-6">
      <div
        className="pointer-events-none absolute inset-0 opacity-30"
        style={{
          backgroundImage:
            "linear-gradient(to right, rgba(255,255,255,0.04) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,0.04) 1px, transparent 1px)",
          backgroundSize: "42px 42px"
        }}
      />

      <div className="absolute left-1/2 top-1/2 h-[1px] w-[70%] -translate-x-1/2 bg-gradient-to-r from-transparent via-zinc-600/70 to-transparent" />

      <div className="absolute left-8 top-1/2 -translate-y-1/2 text-center">
        <div className="mx-auto flex h-16 w-16 items-center justify-center border border-zinc-600 bg-zinc-900/85 text-lg font-bold text-zinc-200">
          X
        </div>
        <p className="mt-2 text-xs text-zinc-500">Creator</p>
      </div>

      <motion.div
        className="absolute left-1/2 top-1/2 flex h-20 w-20 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-[var(--color-primary)]/45 bg-[var(--color-primary)] text-base font-bold text-black"
        animate={{ boxShadow: ["0 0 0 0 rgba(245,158,11,0.25)", "0 0 0 14px rgba(245,158,11,0)"] }}
        transition={{ duration: 2.6, repeat: Infinity, ease: "easeOut" }}
      >
        EF
      </motion.div>

      <div className="absolute right-8 top-1/2 -translate-y-1/2 text-center">
        <div className="mx-auto flex h-16 w-16 items-center justify-center border border-zinc-600 bg-zinc-900/85 text-[10px] font-bold tracking-[0.08em] text-zinc-200">
          FOUNDER
        </div>
        <p className="mt-2 text-xs text-zinc-500">Console</p>
      </div>

      <motion.div
        className="absolute left-[31%] top-1/2 h-2 w-2 -translate-y-1/2 rounded-full bg-[var(--color-primary)]"
        animate={{ x: [0, 84, 0], opacity: [0.3, 0.9, 0.3] }}
        transition={{ duration: 2.8, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div
        className="absolute right-[31%] top-1/2 h-2 w-2 -translate-y-1/2 rounded-full bg-zinc-300"
        animate={{ x: [0, -84, 0], opacity: [0.3, 0.9, 0.3] }}
        transition={{ duration: 2.8, repeat: Infinity, ease: "easeInOut", delay: 0.35 }}
      />
    </div>
  );
}

export default function HomePage() {
  const [campaigns, setCampaigns] = useState<LandingCampaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeProductTab, setActiveProductTab] = useState<ProductTabId>("founders");
  const [activeCampaignTab, setActiveCampaignTab] = useState<CampaignTabId>("live");
  const [activeFaq, setActiveFaq] = useState<number | null>(0);

  useEffect(() => {
    const fetchCampaigns = async () => {
      setLoading(true);
      setError(null);

      try {
        const response = await fetch(`${apiBaseUrl}/api/campaigns`, {
          method: "GET",
          credentials: "include"
        });

        const payload = (await response.json()) as ApiResponse<LandingCampaign[]>;

        if (!response.ok || !payload.success || !payload.data) {
          setError(payload.error ?? "Unable to load campaigns");
          return;
        }

        setCampaigns(payload.data);
      } catch {
        setError("Unable to load campaigns");
      } finally {
        setLoading(false);
      }
    };

    void fetchCampaigns();
  }, []);

  const segmented = useMemo(() => classifyCampaigns(campaigns), [campaigns]);

  const liveBudget = useMemo(
    () => segmented.live.reduce((sum, campaign) => sum + campaign.totalBudget, 0),
    [segmented.live]
  );

  const activeParticipants = useMemo(
    () => segmented.live.reduce((sum, campaign) => sum + campaign.postCount, 0),
    [segmented.live]
  );

  const platformSpread = useMemo(() => {
    const counts = new Map<string, number>();

    for (const campaign of campaigns) {
      for (const platform of campaign.platforms) {
        const key = platform.toUpperCase();
        counts.set(key, (counts.get(key) ?? 0) + 1);
      }
    }

    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 4);
  }, [campaigns]);

  const selectedProduct = useMemo(
    () => productTabs.find((tab) => tab.id === activeProductTab) ?? productTabs[0],
    [activeProductTab]
  );

  const selectedCampaigns =
    activeCampaignTab === "live"
      ? segmented.live
      : activeCampaignTab === "upcoming"
        ? segmented.upcoming
        : segmented.ended;

  return (
    <main className="min-h-screen bg-gradient-to-b from-zinc-950 via-black to-black pb-24 text-zinc-100">
      <section className={`${shellClass} motion-rise pb-16 pt-20 lg:pt-24`}>
        <div className="grid gap-6 lg:grid-cols-[1.35fr_0.65fr]">
          <article className={`${sectionCardClass} p-7 sm:p-10`}>
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--color-primary)]">Earnify Platform</p>
            <h1 className="mt-4 max-w-3xl text-balance text-4xl font-semibold tracking-tight text-white sm:text-5xl lg:text-6xl">
              Run creator campaigns with product-grade control.
            </h1>
            <p className="mt-5 max-w-2xl text-base leading-7 text-zinc-400">
              Earnify combines campaign orchestration, creator verification, leaderboard scoring, and on-chain settlement in one modern workflow.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link href="/dashboard" className={primaryBtnClass}>
                Open Product
              </Link>
              <Link href="/campaign/create" className={secondaryBtnClass}>
                Launch Campaign
              </Link>
            </div>
          </article>

          <aside className={sectionCardClass}>
            <p className={overlineClass}>Live Snapshot</p>
            <div className="mt-5 space-y-5">
              <div>
                <p className={overlineClass}>Live Campaigns</p>
                <p className="mt-1 text-3xl font-semibold tracking-tight text-zinc-100">{segmented.live.length}</p>
              </div>
              <div>
                <p className={overlineClass}>Active Budget</p>
                <p className="mt-1 text-3xl font-semibold tracking-tight text-[var(--color-primary)]">{liveBudget.toFixed(0)} XLM</p>
              </div>
              <div>
                <p className={overlineClass}>Participants</p>
                <p className="mt-1 text-3xl font-semibold tracking-tight text-zinc-100">{activeParticipants}</p>
              </div>
            </div>
          </aside>
        </div>
      </section>

      <section className={`${shellClass} space-y-12`}>
        <section className={sectionCardClass}>
          <p className={overlineClass}>Core Product</p>
          <h2 className={sectionTitleClass}>Everything from campaign launch to creator payout.</h2>
          <div className="mt-6 flex flex-wrap gap-2">
            {productTabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveProductTab(tab.id)}
                className={`border px-4 py-2 text-xs font-bold uppercase tracking-[0.09em] transition-colors ${
                  activeProductTab === tab.id
                    ? "border-[var(--color-primary)] bg-[var(--color-primary)] text-black"
                    : "border-zinc-700 text-zinc-300 hover:border-zinc-500"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_0.9fr]">
            <div>
              <h3 className={h3Class}>{selectedProduct.title}</h3>
              <p className={sectionBodyClass}>{selectedProduct.description}</p>
            </div>
            <div className="space-y-2.5">
              {selectedProduct.bullets.map((item) => (
                <div key={item} className="border border-zinc-800 bg-black/45 px-4 py-3 text-sm leading-6 text-zinc-300">
                  {item}
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="grid gap-4 lg:grid-cols-2">
          <article className={`overflow-hidden rounded-sm ${surfaceClass}`}>
            <SecurityVisual />
            <div className="p-6 sm:p-8">
              <p className={overlineClass}>Reliability</p>
              <h3 className={sectionTitleClass}>Security and Privacy</h3>
              <p className={sectionBodyClass}>
                Earnify secures campaign operations with wallet-authenticated flows, contract-bound settlement, and explicit status transitions.
              </p>
            </div>
          </article>

          <article className={`overflow-hidden rounded-sm ${surfaceClass}`}>
            <ScaleVisual />
            <div className="p-6 sm:p-8">
              <p className={overlineClass}>Scale</p>
              <h3 className={sectionTitleClass}>Scalable for Any Team</h3>
              <p className={sectionBodyClass}>
                Run concurrent campaigns, sync leaderboard updates, and settle creator pools with dependable state handling.
              </p>
            </div>
          </article>
        </section>

        <section className={`${sectionCardClass} overflow-hidden`}>
          <div className="grid gap-8 lg:grid-cols-[0.95fr_1.05fr]">
            <SyncHubVisual />
            <div className="space-y-4">
              {[
                {
                  title: "Campaign Sync",
                  desc: "Founder actions, creator submissions, and campaign states stay synchronized across dashboard and campaign pages."
                },
                {
                  title: "Leaderboard Continuity",
                  desc: "Verified performance data flows into participant rankings and remains consistent through refresh cycles and live updates."
                },
                {
                  title: "Settlement Sync",
                  desc: "End-campaign execution, payout stream events, and explorer links remain aligned in one deterministic pipeline."
                }
              ].map((item) => (
                <motion.article
                  key={item.title}
                  className="border border-zinc-800 bg-black/55 p-5"
                  initial={{ opacity: 0, x: 14 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ once: true, amount: 0.25 }}
                  transition={{ duration: 0.34, ease: "easeOut" }}
                >
                  <h4 className="text-lg font-semibold tracking-tight text-zinc-100">{item.title}</h4>
                  <p className="mt-2 text-sm leading-7 text-zinc-400">{item.desc}</p>
                </motion.article>
              ))}
            </div>
          </div>
        </section>

        <section className={sectionCardClass}>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className={overlineClass}>Live Data</p>
              <h2 className="mt-2 text-2xl font-semibold tracking-tight text-zinc-100 sm:text-3xl">Campaign Discovery</h2>
              <p className="mt-2 text-sm leading-6 text-zinc-500">Explore campaign inventory by status with real backend data.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              {(["live", "upcoming", "ended"] as CampaignTabId[]).map((tab) => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setActiveCampaignTab(tab)}
                  className={`border px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.08em] transition-colors ${
                    activeCampaignTab === tab
                      ? "border-[var(--color-primary)] bg-[var(--color-primary)] text-black"
                      : "border-zinc-700 text-zinc-300"
                  }`}
                >
                  {tab} ({tab === "live" ? segmented.live.length : tab === "upcoming" ? segmented.upcoming.length : segmented.ended.length})
                </button>
              ))}
            </div>
          </div>

          <div className="mt-6">
            <AnimatePresence mode="wait">
              {loading ? (
                <motion.div
                  key="featured-loading"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.25 }}
                >
                  <FeaturedSkeletonGrid />
                </motion.div>
              ) : null}

              {!loading && error ? (
                <motion.p
                  key="featured-error"
                  className="text-sm text-[var(--color-danger)]"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.22 }}
                >
                  {error}
                </motion.p>
              ) : null}

              {!loading && !error && selectedCampaigns.length > 0 ? (
                <motion.div
                  key={`featured-${activeCampaignTab}`}
                  className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.25 }}
                >
                  {selectedCampaigns.slice(0, 6).map((campaign, index) => (
                    <motion.div
                      key={campaign.id}
                      initial={{ opacity: 0, y: 12 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.28, delay: index * 0.04 }}
                    >
                      <CampaignCard
                        campaign={{
                          id: campaign.id,
                          title: campaign.title,
                          description: campaign.description,
                          founder: campaign.founder,
                          platforms: campaign.platforms,
                          budgetTotal: campaign.totalBudget,
                          budgetRemaining: campaign.remainingBudget,
                          participants: campaign.postCount,
                          status: campaign.status,
                          endDate: campaign.endDate,
                          startDate: campaign.startDate,
                          createdAt: campaign.createdAt
                        }}
                      />
                    </motion.div>
                  ))}
                </motion.div>
              ) : null}

              {!loading && !error && selectedCampaigns.length === 0 ? (
                <motion.div
                  key={`featured-empty-${activeCampaignTab}`}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.22 }}
                >
                  <EmptyState
                    variant="campaigns"
                    title={`No ${activeCampaignTab} campaigns`}
                    description="Campaigns will appear here as they move through lifecycle states."
                  />
                </motion.div>
              ) : null}
            </AnimatePresence>
          </div>
        </section>

        <section className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
          <article className={sectionCardClass}>
            <p className={overlineClass}>Distribution</p>
            <h3 className="mt-2 text-2xl font-semibold tracking-tight text-zinc-100">Platform Coverage</h3>
            <p className="mt-2 text-sm leading-6 text-zinc-400">Live distribution of campaign platform requirements.</p>
            <div className="mt-5 space-y-2.5">
              {platformSpread.length === 0 ? (
                <p className="text-sm text-zinc-500">No platform data available yet.</p>
              ) : (
                platformSpread.map(([platform, count]) => (
                  <div key={platform} className="flex items-center justify-between border border-zinc-800 bg-black/45 px-3.5 py-2.5">
                    <span className="text-sm font-medium text-zinc-200">{platform}</span>
                    <span className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--color-primary)]">
                      {count} campaigns
                    </span>
                  </div>
                ))
              )}
            </div>
          </article>

          <article className={sectionCardClass}>
            <p className={overlineClass}>Ready to Launch</p>
            <h3 className="mt-2 text-2xl font-semibold tracking-tight text-zinc-100">Build your next campaign with structured payout execution.</h3>
            <p className="mt-3 text-sm leading-7 text-zinc-400">
              Move from brief to funded campaign in minutes, then monitor participant quality and settlement from one dashboard.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link href="/campaign/create" className={primaryBtnClass}>
                Create Campaign
              </Link>
              <Link href="/dashboard" className={secondaryBtnClass}>
                View Dashboard
              </Link>
            </div>
          </article>
        </section>

        <section className={sectionCardClass}>
          <div className="max-w-3xl">
            <p className={overlineClass}>FAQ</p>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight text-zinc-100 sm:text-3xl">Frequently Asked Questions</h2>
            <p className="mt-2 text-sm leading-6 text-zinc-400">Everything teams usually ask before moving campaign operations onto Earnify.</p>
          </div>

          <div className="mt-6 divide-y divide-[var(--color-border)] border border-[var(--color-border)] bg-black/30">
            {faqItems.map((item, index) => {
              const isOpen = activeFaq === index;
              return (
                <div key={item.question}>
                  <button
                    type="button"
                    onClick={() => setActiveFaq((prev) => (prev === index ? null : index))}
                    className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left"
                  >
                    <span className="text-base font-semibold text-zinc-100">{item.question}</span>
                    <span className="text-[var(--color-primary)]">{isOpen ? "-" : "+"}</span>
                  </button>
                  <AnimatePresence>
                    {isOpen ? (
                      <motion.p
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        exit={{ opacity: 0, height: 0 }}
                        transition={{ duration: 0.22 }}
                        className="overflow-hidden px-5 pb-4 text-sm leading-7 text-zinc-400"
                      >
                        {item.answer}
                      </motion.p>
                    ) : null}
                  </AnimatePresence>
                </div>
              );
            })}
          </div>
        </section>

        <section className="overflow-hidden rounded-sm border border-[var(--color-primary)]/35 bg-gradient-to-r from-[var(--color-primary)]/15 via-[var(--color-primary)]/6 to-transparent p-6 sm:p-8">
          <div className="grid gap-6 lg:grid-cols-[1.25fr_0.75fr] lg:items-end">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-[var(--color-primary)]">Ship Faster</p>
              <h2 className="mt-2 text-3xl font-semibold tracking-tight text-zinc-100 sm:text-4xl">Launch your next performance campaign on Earnify.</h2>
              <p className="mt-3 text-sm leading-7 text-zinc-300 sm:text-base">
                Build, verify, rank, and settle in one product flow with audit-ready payout visibility.
              </p>
            </div>
            <div className="flex flex-wrap gap-3 lg:justify-end">
              <Link href="/campaign/create" className={primaryBtnClass}>
                Start Campaign
              </Link>
              <Link href="/dashboard" className={secondaryBtnClass}>
                Product Demo
              </Link>
            </div>
          </div>
        </section>

        <footer className="border-t border-[var(--color-border)] pt-8">
          <div className="grid gap-6 md:grid-cols-[1.4fr_0.6fr]">
            <div>
              <p className="text-lg font-semibold tracking-[0.08em] text-zinc-100">EARNIFY</p>
              <p className="mt-2 max-w-xl text-sm leading-6 text-zinc-500">
                Campaign performance infrastructure for founders and creators. Built for transparent outcomes and reliable settlement.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <Link href="/dashboard" className="text-zinc-400 transition-colors hover:text-zinc-200">
                Dashboard
              </Link>
              <Link href="/campaign/create" className="text-zinc-400 transition-colors hover:text-zinc-200">
                Create
              </Link>
              <Link href="/login" className="text-zinc-400 transition-colors hover:text-zinc-200">
                Login
              </Link>
              <Link href="/" className="text-zinc-400 transition-colors hover:text-zinc-200">
                Home
              </Link>
            </div>
          </div>
          <p className="mt-6 border-t border-[var(--color-border)] py-4 text-xs text-zinc-600">
            © {new Date().getFullYear()} Earnify. All rights reserved.
          </p>
        </footer>
      </section>
    </main>
  );
}
