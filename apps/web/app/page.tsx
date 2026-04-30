"use client";

import Link from "next/link";
import type { Route } from "next";
import { useEffect, useRef, useState } from "react";

import type { ApiResponse } from "@virlo/shared";

const apiBaseUrl =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000";

type DashboardStats = {
  totalXlmPaidOut: number;
  activeCampaigns: number;
  registeredCreators: number;
};

type Step = {
  label: string;
  body: string;
  target: number;
};

const steps: Step[] = [
  {
    label: "Founder deposits",
    body: "Campaign budgets move into Stellar-backed escrow before creators begin posting.",
    target: 1,
  },
  {
    label: "Creator posts",
    body: "Verified social content earns from real engagement across X, LinkedIn, and Instagram.",
    target: 2,
  },
  {
    label: "Smart contract pays",
    body: "Payouts settle to connected wallets with transparent on-chain records.",
    target: 3,
  },
];

const fallbackStats: DashboardStats = {
  totalXlmPaidOut: 0,
  activeCampaigns: 0,
  registeredCreators: 0,
};

function formatNumber(value: number) {
  return new Intl.NumberFormat("en", {
    maximumFractionDigits: value >= 100 ? 0 : 2,
  }).format(value);
}

function useVisibleCounter(target: number, active: boolean) {
  const [value, setValue] = useState(0);

  useEffect(() => {
    if (!active) return;

    let frame = 0;
    const totalFrames = 34;
    const tick = () => {
      frame += 1;
      const progress = Math.min(frame / totalFrames, 1);
      setValue(Math.round(target * (1 - Math.pow(1 - progress, 3))));

      if (progress < 1) {
        requestAnimationFrame(tick);
      }
    };

    requestAnimationFrame(tick);
  }, [active, target]);

  return value;
}

function StepCard({ step, active }: { step: Step; active: boolean }) {
  const count = useVisibleCounter(step.target, active);

  return (
    <article className="border border-[#E5E5E5] bg-[#FAFAFA] p-6 [border-radius:6px]">
      <div className="mb-8 text-5xl font-medium text-[#F59E0B] tabular-nums">
        {String(count).padStart(2, "0")}
      </div>
      <h3 className="text-xl font-medium text-[#0A0A0A]">{step.label}</h3>
      <p className="mt-4 text-sm leading-6 text-[#525252]">{step.body}</p>
    </article>
  );
}

function PlatformLogo({ name }: { name: "X" | "LinkedIn" | "Instagram" }) {
  if (name === "X") {
    return <span className="text-3xl font-medium">X</span>;
  }

  if (name === "LinkedIn") {
    return (
      <span className="grid h-12 w-12 place-items-center bg-[#0A0A0A] text-xl font-medium text-[#FAFAFA] [border-radius:6px]">
        in
      </span>
    );
  }

  return (
    <span className="grid h-12 w-12 place-items-center border-2 border-[#0A0A0A] text-xl font-medium [border-radius:8px]">
      ◎
    </span>
  );
}

export default function HomePage() {
  const [stats, setStats] = useState<DashboardStats>(fallbackStats);
  const [stepsVisible, setStepsVisible] = useState(false);
  const stepsRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadStats() {
      try {
        const response = await fetch(`${apiBaseUrl}/api/dashboard`, {
          cache: "no-store",
        });
        const payload = (await response.json()) as ApiResponse<DashboardStats>;

        if (!cancelled && payload.success && payload.data) {
          setStats(payload.data);
        }
      } catch {
        if (!cancelled) {
          setStats(fallbackStats);
        }
      }
    }

    void loadStats();

    const interval = window.setInterval(() => {
      void loadStats();
    }, 30000);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    const node = stepsRef.current;
    if (!node) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setStepsVisible(true);
          observer.disconnect();
        }
      },
      { threshold: 0.35 },
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return (
    <main className="bg-[#FAFAFA] text-[#0A0A0A]">
      <section className="relative flex min-h-screen items-center overflow-hidden bg-[#0A0A0A] px-5 py-24 text-[#FAFAFA]">
        <div className="mx-auto w-full max-w-7xl">
          <div className="max-w-4xl animate-[virlo-fade-up_720ms_ease-out_both]">
            <p className="mb-5 text-sm font-medium uppercase text-[#F59E0B]">
              Virlo
            </p>
            <h1 className="max-w-5xl text-6xl font-medium leading-[0.95] sm:text-7xl lg:text-8xl">
              Get paid for real influence
            </h1>
            <p className="mt-8 max-w-2xl text-lg leading-8 text-[#A3A3A3]">
              Virlo connects founders and creators through performance campaigns
              that verify engagement and settle payouts on Stellar.
            </p>
            <div className="mt-10 flex flex-col gap-3 sm:flex-row">
              <Link
                href={"/campaign" as Route}
                className="inline-flex items-center justify-center border border-[#F59E0B] bg-[#F59E0B] px-6 py-3 text-sm font-medium text-[#0A0A0A] transition-colors hover:border-[#D97706] hover:bg-[#D97706]"
              >
                Explore Campaigns
              </Link>
              <Link
                href="/login"
                className="inline-flex items-center justify-center border border-[#F59E0B] px-6 py-3 text-sm font-medium text-[#F59E0B] transition-colors hover:border-[#D97706] hover:bg-[#D97706] hover:text-[#0A0A0A]"
              >
                Start Earning
              </Link>
            </div>
          </div>
        </div>
      </section>

      <section
        id="how-it-works"
        ref={stepsRef}
        className="mx-auto w-full max-w-7xl px-5 py-24"
      >
        <div className="mb-10 flex flex-col justify-between gap-4 border-b border-[#E5E5E5] pb-6 md:flex-row md:items-end">
          <div>
            <p className="text-sm font-medium uppercase text-[#525252]">
              How It Works
            </p>
            <h2 className="mt-3 text-4xl font-medium text-[#0A0A0A]">
              Three moves from budget to payout
            </h2>
          </div>
          <p className="max-w-xl text-sm leading-6 text-[#525252]">
            The campaign flow is intentionally simple: fund the opportunity,
            prove real distribution, and let the contract settle the outcome.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          {steps.map((step) => (
            <StepCard key={step.label} step={step} active={stepsVisible} />
          ))}
        </div>
      </section>

      <section className="border-y border-[#E5E5E5] bg-[#F5F5F5] py-8">
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-4 overflow-hidden px-5 lg:flex-row lg:items-center">
          <p className="shrink-0 text-sm font-medium uppercase text-[#525252]">
            Live Stats
          </p>
          <div className="flex min-w-full animate-[virlo-ticker_24s_linear_infinite] gap-4 lg:min-w-0">
            {[
              `${formatNumber(stats.totalXlmPaidOut)} XLM paid out`,
              `${formatNumber(stats.activeCampaigns)} active campaigns`,
              `${formatNumber(stats.registeredCreators)} registered creators`,
              `${formatNumber(stats.totalXlmPaidOut)} XLM paid out`,
              `${formatNumber(stats.activeCampaigns)} active campaigns`,
              `${formatNumber(stats.registeredCreators)} registered creators`,
            ].map((item, index) => (
              <span
                key={`${item}-${index}`}
                className="shrink-0 border border-[#E5E5E5] bg-[#FAFAFA] px-5 py-3 text-sm font-medium text-[#0A0A0A] [border-radius:6px]"
              >
                {item}
              </span>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto w-full max-w-7xl px-5 py-24">
        <div className="grid gap-8 lg:grid-cols-[0.8fr_1.2fr] lg:items-center">
          <div>
            <p className="text-sm font-medium uppercase text-[#525252]">
              Platforms
            </p>
            <h2 className="mt-3 text-4xl font-medium text-[#0A0A0A]">
              Built for the places influence already happens
            </h2>
          </div>
          <div className="grid grid-cols-3 gap-4">
            {(["X", "LinkedIn", "Instagram"] as const).map((platform) => (
              <div
                key={platform}
                className="flex min-h-36 animate-[virlo-logo-float_3.8s_ease-in-out_infinite] flex-col items-center justify-center gap-4 border border-[#E5E5E5] bg-[#FAFAFA] p-5 text-center [border-radius:6px]"
              >
                <PlatformLogo name={platform} />
                <span className="text-sm font-medium text-[#525252]">
                  {platform}
                </span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section
        id="leaderboard"
        className="border-y border-[#E5E5E5] bg-[#F5F5F5] px-5 py-20"
      >
        <div className="mx-auto grid max-w-7xl gap-8 lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
          <div>
            <p className="text-sm font-medium uppercase text-[#525252]">
              Leaderboard
            </p>
            <h2 className="mt-3 text-4xl font-medium text-[#0A0A0A]">
              Real creators rise by verified performance
            </h2>
          </div>
          <div className="grid gap-3">
            {[
              "Verified reach",
              "Authentic engagement",
              "Wallet-ready payout",
            ].map((item, index) => (
              <div
                key={item}
                className="flex items-center justify-between border border-[#E5E5E5] bg-[#FAFAFA] p-4 [border-radius:6px]"
              >
                <span className="font-medium text-[#0A0A0A]">{item}</span>
                <span className="text-sm text-[#F59E0B]">0{index + 1}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <footer className="bg-[#0A0A0A] px-5 py-12 text-[#FAFAFA]">
        <div className="mx-auto flex max-w-7xl flex-col gap-8 md:flex-row md:items-center md:justify-between">
          <Link href="/" className="inline-flex items-center gap-3">
            <span className="inline-flex h-9 w-9 items-center justify-center border border-[#F59E0B] text-sm font-medium text-[#F59E0B]">
              V
            </span>
            <span className="text-xl font-medium">Virlo</span>
          </Link>

          <nav className="flex flex-wrap gap-5 text-sm text-[#A3A3A3]">
            <Link href={"/campaign" as Route} className="hover:text-[#FAFAFA]">
              Campaigns
            </Link>
            <Link href="/#leaderboard" className="hover:text-[#FAFAFA]">
              Leaderboard
            </Link>
            <Link href="/#how-it-works" className="hover:text-[#FAFAFA]">
              How It Works
            </Link>
            <Link href="/login" className="hover:text-[#FAFAFA]">
              Login
            </Link>
          </nav>

          <span className="inline-flex w-fit items-center border border-[#525252] px-3 py-2 text-xs font-medium uppercase text-[#F59E0B] [border-radius:6px]">
            Powered by Stellar
          </span>
        </div>
      </footer>
    </main>
  );
}
