"use client";

import { useState } from "react";
import type { FormEvent } from "react";

import { useRouter } from "next/navigation";

import type { ApiResponse } from "@earnify/shared";
import { withAuth } from "../../../components/auth/withAuth";
import { FundCampaignStep } from "../../../components/campaign/FundCampaignStep";

const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type CampaignDraft = {
  id: string;
  title: string;
  description: string;
  budget: string;
  budgetToken: string;
  platforms: string[];
  requiredKeywords: string[];
  startDate: string | null;
  endDate: string | null;
  status: string;
  contractId: string | null;
};

type FieldErrors = Record<string, string>;

const PLATFORMS = [
  { id: "X", label: "X (Twitter)" },
  { id: "INSTAGRAM", label: "Instagram" },
  { id: "LINKEDIN", label: "LinkedIn" },
] as const;

const TOTAL_STEPS = 5;

// ---------------------------------------------------------------------------
// Step indicators
// ---------------------------------------------------------------------------

function StepIndicator({ current, total }: { current: number; total: number }) {
  return (
    <div className="flex items-center gap-2">
      {Array.from({ length: total }, (_, i) => {
        const step = i + 1;
        const isActive = step === current;
        const isDone = step < current;
        return (
          <div key={step} className="flex items-center gap-2">
            <div
              className={[
                "flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold transition-colors",
                isActive
                  ? "bg-primary text-white"
                  : isDone
                  ? "bg-success/20 text-success border border-success/40"
                  : "border border-border bg-background text-muted"
              ].join(" ")}
              style={isActive ? { backgroundColor: "var(--color-primary)", color: "white" } : undefined}
            >
              {isDone ? "✓" : step}
            </div>
            {step < total && (
              <div
                className="h-px w-6 transition-colors"
                style={{
                  backgroundColor: isDone
                    ? "var(--color-success)"
                    : "var(--color-border)"
                }}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

const STEP_LABELS = ["Basic Info", "Platforms & Keywords", "Budget & Dates", "Review & Save", "Fund on Stellar"];

// ---------------------------------------------------------------------------
// Field error helper
// ---------------------------------------------------------------------------

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="mt-1 text-xs text-danger">{message}</p>;
}

// ---------------------------------------------------------------------------
// Step 1: Basic Info
// ---------------------------------------------------------------------------

type Step1Props = {
  title: string;
  description: string;
  errors: FieldErrors;
  onChange: (field: "title" | "description", value: string) => void;
};

function Step1BasicInfo({ title, description, errors, onChange }: Step1Props) {
  return (
    <div className="space-y-5">
      <div className="space-y-1.5">
        <label htmlFor="title" className="text-sm font-medium text-secondary">
          Campaign Title <span className="text-danger">*</span>
        </label>
        <input
          id="title"
          type="text"
          value={title}
          onChange={(e) => onChange("title", e.target.value)}
          placeholder="e.g. Earnify Launch — Q3 2026"
          className="w-full rounded-md border border-border px-3 py-2 text-sm text-secondary outline-none focus:border-primary"
          style={{ backgroundColor: "var(--color-background)" }}
        />
        <FieldError message={errors.title} />
      </div>

      <div className="space-y-1.5">
        <label htmlFor="description" className="text-sm font-medium text-secondary">
          Description <span className="text-danger">*</span>
        </label>
        <textarea
          id="description"
          value={description}
          onChange={(e) => onChange("description", e.target.value)}
          placeholder="Describe what creators should post about, the tone, and what makes a great submission."
          rows={5}
          className="w-full rounded-md border border-border px-3 py-2 text-sm text-secondary outline-none focus:border-primary resize-none"
          style={{ backgroundColor: "var(--color-background)" }}
        />
        <FieldError message={errors.description} />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 2: Platforms & Keywords
// ---------------------------------------------------------------------------

type Step2Props = {
  platforms: string[];
  keywordsInput: string;
  errors: FieldErrors;
  onTogglePlatform: (id: string) => void;
  onKeywordsChange: (value: string) => void;
};

function Step2PlatformsKeywords({
  platforms,
  keywordsInput,
  errors,
  onTogglePlatform,
  onKeywordsChange
}: Step2Props) {
  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <p className="text-sm font-medium text-secondary">
          Target Platforms <span className="text-danger">*</span>
        </p>
        <div className="flex flex-wrap gap-2">
          {PLATFORMS.map(({ id, label }) => {
            const selected = platforms.includes(id);
            return (
              <button
                key={id}
                type="button"
                onClick={() => onTogglePlatform(id)}
                className={[
                  "rounded-md border px-4 py-2 text-sm font-medium transition-colors",
                  selected
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border bg-background text-muted hover:border-primary/50"
                ].join(" ")}
                style={selected ? { borderColor: "var(--color-primary)", color: "var(--color-primary)", backgroundColor: "color-mix(in srgb, var(--color-primary) 10%, transparent)" } : undefined}
              >
                {label}
              </button>
            );
          })}
        </div>
        <FieldError message={errors.platforms} />
      </div>

      <div className="space-y-1.5">
        <label htmlFor="keywords" className="text-sm font-medium text-secondary">
          Required Keywords <span className="text-danger">*</span>
        </label>
        <p className="text-xs text-muted">
          Comma-separated. Posts must include at least one of these keywords to qualify.
        </p>
        <input
          id="keywords"
          type="text"
          value={keywordsInput}
          onChange={(e) => onKeywordsChange(e.target.value)}
          placeholder="e.g. #Earnify, @EarnifyApp, earnify.io"
          className="w-full rounded-md border border-border px-3 py-2 text-sm text-secondary outline-none focus:border-primary"
          style={{ backgroundColor: "var(--color-background)" }}
        />
        <FieldError message={errors.requiredKeywords} />
        {keywordsInput.trim().length > 0 && (
          <div className="flex flex-wrap gap-1.5 pt-1">
            {keywordsInput
              .split(",")
              .map((k) => k.trim())
              .filter(Boolean)
              .map((kw) => (
                <span
                  key={kw}
                  className="rounded-full border border-border bg-background px-2.5 py-0.5 text-xs text-secondary"
                >
                  {kw}
                </span>
              ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 3: Budget & Dates
// ---------------------------------------------------------------------------

type Step3Props = {
  budget: string;
  startDate: string;
  endDate: string;
  errors: FieldErrors;
  onChange: (field: "budget" | "startDate" | "endDate", value: string) => void;
};

function Step3BudgetDates({ budget, startDate, endDate, errors, onChange }: Step3Props) {
  return (
    <div className="space-y-5">
      <div className="space-y-1.5">
        <label htmlFor="budget" className="text-sm font-medium text-secondary">
          Total Budget (XLM) <span className="text-danger">*</span>
        </label>
        <div className="relative">
          <input
            id="budget"
            type="number"
            min="1"
            step="0.01"
            value={budget}
            onChange={(e) => onChange("budget", e.target.value)}
            placeholder="e.g. 500"
            className="w-full rounded-md border border-border px-3 py-2 pr-14 text-sm text-secondary outline-none focus:border-primary"
            style={{ backgroundColor: "var(--color-background)" }}
          />
          <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-muted">
            XLM
          </span>
        </div>
        <FieldError message={errors.budget} />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <label htmlFor="startDate" className="text-sm font-medium text-secondary">
            Start Date <span className="text-muted text-xs font-normal">(optional)</span>
          </label>
          <input
            id="startDate"
            type="datetime-local"
            value={startDate}
            onChange={(e) => onChange("startDate", e.target.value)}
            className="w-full rounded-md border border-border px-3 py-2 text-sm text-secondary outline-none focus:border-primary"
            style={{ backgroundColor: "var(--color-background)" }}
          />
          <FieldError message={errors.startDate} />
        </div>

        <div className="space-y-1.5">
          <label htmlFor="endDate" className="text-sm font-medium text-secondary">
            End Date <span className="text-danger">*</span>
          </label>
          <input
            id="endDate"
            type="datetime-local"
            value={endDate}
            onChange={(e) => onChange("endDate", e.target.value)}
            className="w-full rounded-md border border-border px-3 py-2 text-sm text-secondary outline-none focus:border-primary"
            style={{ backgroundColor: "var(--color-background)" }}
          />
          <FieldError message={errors.endDate} />
        </div>
      </div>

      <div
        className="rounded-md border border-border p-3 text-xs text-muted"
        style={{ backgroundColor: "color-mix(in srgb, var(--color-primary) 5%, var(--color-background))" }}
      >
        <strong className="text-secondary">Note:</strong> The campaign will be saved as a{" "}
        <span className="font-semibold text-accent">DRAFT</span>. You can fund it via Freighter after creation.
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 4: Review & Deploy
// ---------------------------------------------------------------------------

type Step4Props = {
  title: string;
  description: string;
  platforms: string[];
  keywords: string[];
  budget: string;
  startDate: string;
  endDate: string;
  submitting: boolean;
  submitError: string | null;
  onSubmit: (e: FormEvent) => void;
};

function Step4Review({
  title,
  description,
  platforms,
  keywords,
  budget,
  startDate,
  endDate,
  submitting,
  submitError,
  onSubmit
}: Step4Props) {
  const rows: Array<{ label: string; value: string }> = [
    { label: "Title", value: title },
    { label: "Platforms", value: platforms.join(", ") || "—" },
    { label: "Keywords", value: keywords.join(", ") || "—" },
    { label: "Budget", value: budget ? `${budget} XLM` : "—" },
    { label: "Start Date", value: startDate ? new Date(startDate).toLocaleString() : "Immediately" },
    { label: "End Date", value: endDate ? new Date(endDate).toLocaleString() : "—" },
  ];

  return (
    <div className="space-y-5">
      <div className="rounded-md border border-border overflow-hidden">
        <table className="w-full text-sm">
          <tbody>
            {rows.map(({ label, value }) => (
              <tr key={label} className="border-b border-border last:border-0">
                <td className="px-4 py-2.5 font-medium text-secondary w-36 bg-surface">{label}</td>
                <td className="px-4 py-2.5 text-muted">{value}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="space-y-1.5">
        <p className="text-sm font-medium text-secondary">Description</p>
        <p className="rounded-md border border-border bg-background px-4 py-3 text-sm text-muted leading-6">
          {description}
        </p>
      </div>

      {submitError && (
        <div className="rounded-md border border-danger/30 bg-danger/5 px-4 py-3 text-sm text-danger">
          {submitError}
        </div>
      )}

      <form onSubmit={onSubmit}>
        <button
          type="submit"
          disabled={submitting}
          className="inline-flex items-center gap-2 rounded-md border border-border px-6 py-2.5 text-sm font-semibold text-secondary disabled:cursor-not-allowed disabled:opacity-60 transition-transform hover:-translate-y-0.5"
          style={{
            background: "linear-gradient(120deg, color-mix(in srgb, var(--color-primary) 18%, white), var(--color-surface))"
          }}
        >
          {submitting ? (
            <>
              <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
              Saving draft…
            </>
          ) : (
            "Save Draft & Fund on Stellar →"
          )}
        </button>
      </form>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Final success state (funded + activated)
// ---------------------------------------------------------------------------

function FundedSuccessPanel({
  campaign,
  contractId,
  txHash,
  onCreateAnother
}: {
  campaign: CampaignDraft;
  contractId: string;
  txHash: string;
  onCreateAnother: () => void;
}) {
  return (
    <div className="space-y-5">
      <div
        className="rounded-md border border-success/40 p-5 space-y-2"
        style={{ backgroundColor: "color-mix(in srgb, var(--color-success) 8%, var(--color-background))" }}
      >
        <p className="text-sm font-semibold text-success">🎉 Campaign is live!</p>
        <p className="text-sm text-muted">
          <strong className="text-secondary">{campaign.title}</strong> is now{" "}
          <span className="font-semibold text-success">ACTIVE</span> on Stellar testnet.
        </p>
      </div>

      <div className="rounded-md border border-border bg-background p-4 space-y-2 text-xs text-muted">
        <p>
          <span className="font-semibold text-secondary">Contract: </span>
          <a
            href={`https://testnet.stellar.expert/explorer/testnet/contract/${contractId}`}
            target="_blank"
            rel="noreferrer"
            className="break-all underline text-secondary"
          >
            {contractId}
          </a>
        </p>
        <p>
          <span className="font-semibold text-secondary">Funding tx: </span>
          <a
            href={`https://testnet.stellar.expert/explorer/testnet/tx/${txHash}`}
            target="_blank"
            rel="noreferrer"
            className="break-all underline text-secondary"
          >
            {txHash}
          </a>
        </p>
        <p>
          <span className="font-semibold text-secondary">Budget: </span>
          {campaign.budget} {campaign.budgetToken}
        </p>
      </div>

      <div className="flex flex-wrap gap-3">
        <a
          href={`/campaign/${campaign.id}`}
          className="inline-flex items-center rounded-md border border-border px-4 py-2 text-sm font-semibold text-secondary"
          style={{ background: "var(--color-surface)" }}
        >
          View Campaign →
        </a>
        <button
          type="button"
          onClick={onCreateAnother}
          className="inline-flex items-center rounded-md border border-border px-4 py-2 text-sm font-semibold text-secondary"
          style={{ background: "var(--color-background)" }}
        >
          Create Another
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

function CreateCampaignPage() {
  const router = useRouter();

  // Form state
  const [step, setStep] = useState(1);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [platforms, setPlatforms] = useState<string[]>([]);
  const [keywordsInput, setKeywordsInput] = useState("");
  const [budget, setBudget] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  // UI state
  const [errors, setErrors] = useState<FieldErrors>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [createdCampaign, setCreatedCampaign] = useState<CampaignDraft | null>(null);
  // Funding result — set when step 5 completes successfully
  const [fundingResult, setFundingResult] = useState<{ contractId: string; txHash: string } | null>(null);

  // Derived
  const keywords = keywordsInput
    .split(",")
    .map((k) => k.trim())
    .filter(Boolean);

  // ---- Validation per step ----
  function validateStep(s: number): FieldErrors {
    const errs: FieldErrors = {};

    if (s === 1) {
      if (!title.trim()) errs.title = "Title is required";
      else if (title.trim().length < 3) errs.title = "Title must be at least 3 characters";
      if (!description.trim()) errs.description = "Description is required";
      else if (description.trim().length < 10) errs.description = "Description must be at least 10 characters";
    }

    if (s === 2) {
      if (platforms.length === 0) errs.platforms = "Select at least one platform";
      if (keywords.length === 0) errs.requiredKeywords = "Add at least one keyword";
    }

    if (s === 3) {
      const budgetNum = Number(budget);
      if (!budget || Number.isNaN(budgetNum) || budgetNum <= 0) errs.budget = "Budget must be a positive number";
      if (!endDate) {
        errs.endDate = "End date is required";
      } else {
        const end = new Date(endDate);
        if (Number.isNaN(end.getTime())) {
          errs.endDate = "Invalid end date";
        } else if (end <= new Date()) {
          errs.endDate = "End date must be in the future";
        } else if (startDate) {
          const start = new Date(startDate);
          if (!Number.isNaN(start.getTime()) && end <= start) {
            errs.endDate = "End date must be after start date";
          }
        }
      }
    }

    return errs;
  }

  function handleNext() {
    const errs = validateStep(step);
    if (Object.keys(errs).length > 0) {
      setErrors(errs);
      return;
    }
    setErrors({});
    setStep((s) => Math.min(s + 1, TOTAL_STEPS));
  }

  function handleBack() {
    setErrors({});
    setStep((s) => Math.max(s - 1, 1));
  }

  function handleTogglePlatform(id: string) {
    setPlatforms((prev) =>
      prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]
    );
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setSubmitError(null);

    try {
      const response = await fetch(`${apiBaseUrl}/api/campaigns`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim(),
          budget,
          platforms,
          requiredKeywords: keywords,
          startDate: startDate ? new Date(startDate).toISOString() : undefined,
          endDate: new Date(endDate).toISOString()
        })
      });

      const payload = (await response.json()) as ApiResponse<CampaignDraft> & { errors?: FieldErrors };

      if (!response.ok || !payload.success || !payload.data) {
        // Surface per-field errors if the API returned them
        if (payload.errors && Object.keys(payload.errors).length > 0) {
          setErrors(payload.errors);
          // Jump back to the first step that has an error
          if (payload.errors.title || payload.errors.description) setStep(1);
          else if (payload.errors.platforms || payload.errors.requiredKeywords) setStep(2);
          else if (payload.errors.budget || payload.errors.startDate || payload.errors.endDate) setStep(3);
        } else {
          setSubmitError(payload.error ?? "Failed to create campaign");
        }
        return;
      }

      setCreatedCampaign(payload.data);
      // Advance to step 5 (Fund on Stellar)
      setStep(5);
    } catch {
      setSubmitError("Network error — please try again");
    } finally {
      setSubmitting(false);
    }
  }

  function handleCreateAnother() {
    setCreatedCampaign(null);
    setFundingResult(null);
    setStep(1);
    setTitle("");
    setDescription("");
    setPlatforms([]);
    setKeywordsInput("");
    setBudget("");
    setStartDate("");
    setEndDate("");
    setErrors({});
    setSubmitError(null);
  }

  return (
    <main className="min-h-screen px-4 py-8 sm:px-6 lg:px-10">
      <section className="mx-auto grid w-full max-w-6xl gap-6 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,0.9fr)]">
        {/* ---- Main card ---- */}
        <article
          className="rounded-xl border border-border p-6 sm:p-8"
          style={{
            background:
              "linear-gradient(140deg, color-mix(in srgb, var(--color-primary) 9%, white), var(--color-surface))",
            boxShadow: "0 24px 65px color-mix(in srgb, var(--color-primary) 12%, transparent)"
          }}
        >
          <header className="space-y-3">
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-accent">Founder Console</p>
            <h1 className="text-2xl font-semibold text-secondary sm:text-3xl">Create a Campaign</h1>
            <p className="text-sm leading-6 text-muted">
              Fill in the details below. Your campaign will be saved as a draft — you can fund it via Freighter
              afterwards.
            </p>
          </header>

          {/* Step indicator */}
          {!createdCampaign && (
            <div className="mt-6 space-y-1">
              <StepIndicator current={step} total={TOTAL_STEPS} />
              <p className="text-xs text-muted">
                Step {step} of {TOTAL_STEPS} — {STEP_LABELS[step - 1]}
              </p>
            </div>
          )}

          <div className="mt-6">
            {createdCampaign && fundingResult ? (
              <FundedSuccessPanel
                campaign={createdCampaign}
                contractId={fundingResult.contractId}
                txHash={fundingResult.txHash}
                onCreateAnother={handleCreateAnother}
              />
            ) : createdCampaign && step === 5 ? (
              <FundCampaignStep
                campaign={createdCampaign}
                onSuccess={(result) => {
                  setFundingResult(result);
                }}
                onSkip={() => {
                  // Let them view the draft campaign without funding
                  window.location.href = `/campaign/${createdCampaign.id}`;
                }}
              />
            ) : (
              <>
                {step === 1 && (
                  <Step1BasicInfo
                    title={title}
                    description={description}
                    errors={errors}
                    onChange={(field, value) => {
                      if (field === "title") setTitle(value);
                      else setDescription(value);
                    }}
                  />
                )}
                {step === 2 && (
                  <Step2PlatformsKeywords
                    platforms={platforms}
                    keywordsInput={keywordsInput}
                    errors={errors}
                    onTogglePlatform={handleTogglePlatform}
                    onKeywordsChange={setKeywordsInput}
                  />
                )}
                {step === 3 && (
                  <Step3BudgetDates
                    budget={budget}
                    startDate={startDate}
                    endDate={endDate}
                    errors={errors}
                    onChange={(field, value) => {
                      if (field === "budget") setBudget(value);
                      else if (field === "startDate") setStartDate(value);
                      else setEndDate(value);
                    }}
                  />
                )}
                {step === 4 && (
                  <Step4Review
                    title={title}
                    description={description}
                    platforms={platforms}
                    keywords={keywords}
                    budget={budget}
                    startDate={startDate}
                    endDate={endDate}
                    submitting={submitting}
                    submitError={submitError}
                    onSubmit={handleSubmit}
                  />
                )}

                {/* Navigation buttons */}
                {step < 4 && (
                  <div className="mt-6 flex items-center gap-3">
                    {step > 1 && (
                      <button
                        type="button"
                        onClick={handleBack}
                        className="rounded-md border border-border bg-background px-4 py-2 text-sm font-semibold text-secondary"
                      >
                        Back
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={handleNext}
                      className="rounded-md border border-border px-5 py-2 text-sm font-semibold text-secondary transition-transform hover:-translate-y-0.5"
                      style={{
                        background:
                          "linear-gradient(120deg, color-mix(in srgb, var(--color-primary) 18%, white), var(--color-surface))"
                      }}
                    >
                      Next →
                    </button>
                  </div>
                )}
                {step === 4 && (
                  <div className="mt-4">
                    <button
                      type="button"
                      onClick={handleBack}
                      className="rounded-md border border-border bg-background px-4 py-2 text-sm font-semibold text-secondary"
                    >
                      ← Back
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        </article>

        {/* ---- Sidebar ---- */}
        <aside className="space-y-4">
          <div className="rounded-xl border border-border bg-surface p-6">
            <h2 className="text-sm font-semibold uppercase tracking-[0.16em] text-secondary">Launch Checklist</h2>
            <ul className="mt-3 space-y-3 text-sm text-muted">
              <li className="rounded-md border border-border bg-background p-3">
                <strong className="text-secondary">Step 1 — Basic Info</strong>
                <br />
                Pick a short, creator-friendly title and describe the campaign clearly.
              </li>
              <li className="rounded-md border border-border bg-background p-3">
                <strong className="text-secondary">Step 2 — Platforms & Keywords</strong>
                <br />
                Choose where creators should post and what hashtags or mentions to include.
              </li>
              <li className="rounded-md border border-border bg-background p-3">
                <strong className="text-secondary">Step 3 — Budget & Dates</strong>
                <br />
                Set a realistic XLM budget and a clear end date so rankings translate into meaningful payouts.
              </li>
              <li className="rounded-md border border-border bg-background p-3">
                <strong className="text-secondary">Step 4 — Review & Deploy</strong>
                <br />
                Confirm everything looks right, then save the draft. Fund via Freighter to go live.
              </li>
            </ul>
          </div>

          <div className="rounded-xl border border-border bg-surface p-5 text-xs text-muted space-y-1.5">
            <p className="font-semibold text-secondary text-sm">About Freighter funding</p>
            <p className="leading-5">
              After saving the draft, you&apos;ll be prompted to connect your Freighter wallet and sign a transaction
              that deploys and funds the Soroban contract. Your secret key never leaves your browser.
            </p>
          </div>
        </aside>
      </section>
    </main>
  );
}

export default withAuth(CreateCampaignPage, { role: "FOUNDER" });
