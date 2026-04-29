"use client";

import { useState } from "react";
import type { FormEvent } from "react";

import type { ApiResponse } from "@earnify/shared";

import { withAuth } from "../../../components/auth/withAuth";

const apiBaseUrl =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000";

type CreatedCampaignResponse = {
  id: string;
  title: string;
  walletAddress: string;
  contractId?: string | null;
  fundingTxHash?: string | null;
};

function AdminCreateCampaignPage() {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [productUrl, setProductUrl] = useState("");
  const [totalBudget, setTotalBudget] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [founderSecret, setFounderSecret] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createdCampaign, setCreatedCampaign] =
    useState<CreatedCampaignResponse | null>(null);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);
    setError(null);
    setCreatedCampaign(null);

    try {
      const response = await fetch(`${apiBaseUrl}/api/campaigns`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify({
          title,
          description,
          productUrl,
          totalBudget: Number(totalBudget),
          endsAt: new Date(endsAt).toISOString(),
          founderSecret: founderSecret.trim(),
        }),
      });

      const payload =
        (await response.json()) as ApiResponse<CreatedCampaignResponse>;

      if (!response.ok || !payload.success || !payload.data) {
        setError(payload.error ?? "Failed to create campaign");
        return;
      }

      setCreatedCampaign(payload.data);

      setTitle("");
      setDescription("");
      setProductUrl("");
      setTotalBudget("");
      setEndsAt("");
      setFounderSecret("");
    } catch {
      setError("Failed to create campaign");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-[calc(100vh-4rem)] px-4 py-8 sm:px-6 md:py-12 lg:px-10 bg-[var(--color-background)]">
      <section className="mx-auto grid w-full max-w-6xl gap-8 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,0.9fr)]">
        <article className="rounded-3xl border border-[var(--color-border)]/50 bg-[#0D0F14]/50 p-8 sm:p-10 backdrop-blur-xl shadow-2xl">
          <header className="space-y-4">
            <p className="text-sm font-bold uppercase tracking-widest text-[var(--color-primary)]">
              Founder Console
            </p>
            <h1 className="text-3xl font-bold text-white sm:text-4xl">
              Create a campaign
            </h1>
            <p className="text-base leading-relaxed text-[var(--color-muted)]">
              Campaign creation deploys a dedicated Soroban contract on Stellar
              testnet.
            </p>
          </header>

          <form className="mt-8 space-y-5" onSubmit={handleSubmit}>
            <div className="space-y-2">
              <label htmlFor="title" className="text-sm font-bold text-white">
                Title
              </label>
              <input
                id="title"
                type="text"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                required
                className="w-full rounded-xl border border-[var(--color-border)]/50 bg-[var(--color-background)] px-4 py-3 text-sm text-white outline-none focus:border-[var(--color-primary)] focus:ring-1 focus:ring-[var(--color-primary)] transition-all"
              />
            </div>

            <div className="space-y-2">
              <label
                htmlFor="description"
                className="text-sm font-bold text-white"
              >
                Description
              </label>
              <textarea
                id="description"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                required
                rows={4}
                className="w-full rounded-xl border border-[var(--color-border)]/50 bg-[var(--color-background)] px-4 py-3 text-sm text-white outline-none focus:border-[var(--color-primary)] focus:ring-1 focus:ring-[var(--color-primary)] transition-all"
              />
            </div>

            <div className="grid gap-5 sm:grid-cols-2">
              <div className="space-y-2">
                <label
                  htmlFor="productUrl"
                  className="text-sm font-bold text-white"
                >
                  Product URL
                </label>
                <input
                  id="productUrl"
                  type="url"
                  value={productUrl}
                  onChange={(event) => setProductUrl(event.target.value)}
                  required
                  className="w-full rounded-xl border border-[var(--color-border)]/50 bg-[var(--color-background)] px-4 py-3 text-sm text-white outline-none focus:border-[var(--color-primary)] focus:ring-1 focus:ring-[var(--color-primary)] transition-all"
                />
              </div>

              <div className="space-y-2">
                <label
                  htmlFor="totalBudget"
                  className="text-sm font-bold text-white"
                >
                  Total Budget (XLM)
                </label>
                <input
                  id="totalBudget"
                  type="number"
                  min="0"
                  step="0.01"
                  value={totalBudget}
                  onChange={(event) => setTotalBudget(event.target.value)}
                  required
                  className="w-full rounded-xl border border-[var(--color-border)]/50 bg-[var(--color-background)] px-4 py-3 text-sm text-white outline-none focus:border-[var(--color-primary)] focus:ring-1 focus:ring-[var(--color-primary)] transition-all"
                />
              </div>
            </div>

            <div className="space-y-2">
              <label htmlFor="endsAt" className="text-sm font-bold text-white">
                Ends At
              </label>
              <input
                id="endsAt"
                type="datetime-local"
                value={endsAt}
                onChange={(event) => setEndsAt(event.target.value)}
                required
                className="w-full rounded-xl border border-[var(--color-border)]/50 bg-[var(--color-background)] px-4 py-3 text-sm text-white outline-none focus:border-[var(--color-primary)] focus:ring-1 focus:ring-[var(--color-primary)] transition-all"
              />
            </div>

            <div className="space-y-2">
              <label
                htmlFor="founderSecret"
                className="text-sm font-bold text-white"
              >
                Founder Secret Key (S...)
              </label>
              <input
                id="founderSecret"
                type="password"
                value={founderSecret}
                onChange={(event) => setFounderSecret(event.target.value)}
                required
                className="w-full rounded-xl border border-[var(--color-border)]/50 bg-[var(--color-background)] px-4 py-3 text-sm text-white outline-none focus:border-[var(--color-primary)] focus:ring-1 focus:ring-[var(--color-primary)] transition-all"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-full bg-gradient-to-r from-[var(--color-primary)] to-[var(--color-secondary)] px-6 py-4 text-sm font-bold text-white shadow-[0_0_20px_-5px_rgba(99,102,241,0.5)] transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[0_0_25px_-5px_rgba(99,102,241,0.7)] disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0 sm:w-auto"
            >
              {loading ? "Creating..." : "Create Campaign"}
            </button>
          </form>

          {error ? (
            <p className="mt-5 text-sm font-medium text-[var(--color-danger)]">
              {error}
            </p>
          ) : null}

          {createdCampaign ? (
            <div className="mt-6 rounded-2xl border border-[var(--color-success)]/30 bg-[var(--color-success)]/10 p-5 backdrop-blur-sm">
              <p className="text-sm font-bold text-[var(--color-success)]">
                Campaign created: {createdCampaign.title}
              </p>
              <p className="mt-2 break-all text-xs font-mono text-[var(--color-muted)]">
                Wallet Address: {createdCampaign.walletAddress}
              </p>
              {createdCampaign.contractId ? (
                <p className="mt-1 break-all text-xs font-mono text-[var(--color-muted)]">
                  Contract ID: {createdCampaign.contractId}
                </p>
              ) : null}
            </div>
          ) : null}
        </article>

        <aside className="rounded-3xl border border-[var(--color-border)]/50 bg-[#0D0F14]/30 p-8 backdrop-blur-md self-start">
          <h2 className="text-sm font-bold uppercase tracking-widest text-white">
            Launch Checklist
          </h2>
          <ul className="mt-5 space-y-4 text-sm text-[var(--color-muted)]">
            <li className="rounded-2xl border border-[var(--color-border)]/30 bg-[var(--color-surface)]/50 p-4">
              Pick a short, creator-friendly title and highlight expected tone.
            </li>
            <li className="rounded-2xl border border-[var(--color-border)]/30 bg-[var(--color-surface)]/50 p-4">
              Set a realistic budget so rankings translate into meaningful
              payouts.
            </li>
            <li className="rounded-2xl border border-[var(--color-border)]/30 bg-[var(--color-surface)]/50 p-4">
              Choose an end date with enough time for verification and
              leaderboard growth.
            </li>
          </ul>
          <p className="mt-6 text-xs text-[var(--color-muted)]/70">
            Layout tuned for 375px, 768px, and 1280px screens using responsive
            grid breakpoints.
          </p>
        </aside>
      </section>
    </main>
  );
}

export default withAuth(AdminCreateCampaignPage, { role: "FOUNDER" });
