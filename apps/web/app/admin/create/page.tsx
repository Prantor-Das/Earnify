"use client";

import { useState } from "react";
import type { FormEvent } from "react";

import type { ApiResponse } from "@earnify/shared";

import { withAuth } from "../../../components/auth/withAuth";

const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000";

type CreatedCampaignResponse = {
  id: string;
  title: string;
  walletAddress: string;
};

function AdminCreateCampaignPage() {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [productUrl, setProductUrl] = useState("");
  const [totalBudget, setTotalBudget] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createdCampaign, setCreatedCampaign] = useState<CreatedCampaignResponse | null>(null);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);
    setError(null);
    setCreatedCampaign(null);

    try {
      const response = await fetch(`${apiBaseUrl}/api/campaigns`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        credentials: "include",
        body: JSON.stringify({
          title,
          description,
          productUrl,
          totalBudget: Number(totalBudget),
          endsAt: new Date(endsAt).toISOString()
        })
      });

      const payload = (await response.json()) as ApiResponse<CreatedCampaignResponse>;

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
    } catch {
      setError("Failed to create campaign");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen px-4 py-10 sm:px-6 lg:px-10">
      <section
        className="mx-auto w-full max-w-3xl rounded-lg border border-border p-6 sm:p-8"
        style={{
          background: "linear-gradient(140deg, color-mix(in srgb, var(--color-primary) 9%, white), var(--color-surface))",
          boxShadow: "0 24px 65px color-mix(in srgb, var(--color-primary) 12%, transparent)"
        }}
      >
        <header className="space-y-3">
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-accent">Founder Console</p>
          <h1 className="text-2xl font-semibold text-secondary sm:text-3xl">Create a campaign</h1>
          <p className="text-sm leading-7 text-muted">
            A dedicated Stellar testnet wallet is generated and funded on campaign creation.
          </p>
        </header>

        <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
          <div className="space-y-2">
            <label htmlFor="title" className="text-sm font-medium text-secondary">
              Title
            </label>
            <input
              id="title"
              type="text"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              required
              className="w-full rounded-md border border-border px-3 py-2 text-sm text-secondary outline-none focus:border-primary"
              style={{ backgroundColor: "var(--color-background)" }}
            />
          </div>

          <div className="space-y-2">
            <label htmlFor="description" className="text-sm font-medium text-secondary">
              Description
            </label>
            <textarea
              id="description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              required
              rows={4}
              className="w-full rounded-md border border-border px-3 py-2 text-sm text-secondary outline-none focus:border-primary"
              style={{ backgroundColor: "var(--color-background)" }}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <label htmlFor="productUrl" className="text-sm font-medium text-secondary">
                Product URL
              </label>
              <input
                id="productUrl"
                type="url"
                value={productUrl}
                onChange={(event) => setProductUrl(event.target.value)}
                required
                className="w-full rounded-md border border-border px-3 py-2 text-sm text-secondary outline-none focus:border-primary"
                style={{ backgroundColor: "var(--color-background)" }}
              />
            </div>

            <div className="space-y-2">
              <label htmlFor="totalBudget" className="text-sm font-medium text-secondary">
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
                className="w-full rounded-md border border-border px-3 py-2 text-sm text-secondary outline-none focus:border-primary"
                style={{ backgroundColor: "var(--color-background)" }}
              />
            </div>
          </div>

          <div className="space-y-2">
            <label htmlFor="endsAt" className="text-sm font-medium text-secondary">
              Ends At
            </label>
            <input
              id="endsAt"
              type="datetime-local"
              value={endsAt}
              onChange={(event) => setEndsAt(event.target.value)}
              required
              className="w-full rounded-md border border-border px-3 py-2 text-sm text-secondary outline-none focus:border-primary"
              style={{ backgroundColor: "var(--color-background)" }}
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="inline-flex items-center rounded-md border border-border px-5 py-2 text-sm font-semibold text-secondary disabled:cursor-not-allowed disabled:opacity-60"
            style={{
              background: "linear-gradient(120deg, color-mix(in srgb, var(--color-secondary) 20%, white), var(--color-surface))"
            }}
          >
            {loading ? "Creating..." : "Create Campaign"}
          </button>
        </form>

        {error ? <p className="mt-4 text-sm text-danger">{error}</p> : null}

        {createdCampaign ? (
          <div className="mt-5 rounded-md border border-border bg-background p-4">
            <p className="text-sm font-semibold text-secondary">Campaign created: {createdCampaign.title}</p>
            <p className="mt-1 break-all text-sm text-muted">Wallet Address: {createdCampaign.walletAddress}</p>
          </div>
        ) : null}
      </section>
    </main>
  );
}

export default withAuth(AdminCreateCampaignPage, { role: "FOUNDER" });
