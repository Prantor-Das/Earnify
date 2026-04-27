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
              className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold transition-all duration-300 ${
                isActive
                  ? "bg-[var(--color-primary)] text-white shadow-[0_0_15px_-3px_rgba(99,102,241,0.5)]"
                  : isDone
                  ? "bg-[var(--color-success)]/20 text-[var(--color-success)] border border-[var(--color-success)]/40"
                  : "bg-[var(--color-surface)] border border-[var(--color-border)] text-[var(--color-muted)]"
              }`}
            >
              {isDone ? "✓" : step}
            </div>
            {step < total && (
              <div
                className={`h-0.5 w-8 transition-colors duration-300 ${
                  isDone ? "bg-[var(--color-success)]" : "bg-[var(--color-border)]"
                }`}
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
  return <p className="mt-1.5 text-xs font-medium text-[var(--color-danger)]">{message}</p>;
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
    <div className="space-y-6">
      <div className="space-y-2">
        <label htmlFor="title" className="block text-sm font-semibold tracking-wide text-white">
          Campaign Title <span className="text-[var(--color-danger)]">*</span>
        </label>
        <input
          id="title"
          type="text"
          value={title}
          onChange={(e) => onChange("title", e.target.value)}
          placeholder="e.g. Earnify Launch — Q3 2026"
          className="w-full rounded-xl border border-[var(--color-border)] bg-[#0D0F14] px-4 py-3.5 text-white transition-all focus:border-[var(--color-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]"
        />
        <FieldError message={errors.title} />
      </div>

      <div className="space-y-2">
        <label htmlFor="description" className="block text-sm font-semibold tracking-wide text-white">
          Description <span className="text-[var(--color-danger)]">*</span>
        </label>
        <textarea
          id="description"
          value={description}
          onChange={(e) => onChange("description", e.target.value)}
          placeholder="Describe what creators should post about, the tone, and what makes a great submission."
          rows={6}
          className="w-full resize-none rounded-xl border border-[var(--color-border)] bg-[#0D0F14] px-4 py-3.5 text-white transition-all focus:border-[var(--color-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]"
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
    <div className="space-y-8">
      <div className="space-y-3">
        <p className="block text-sm font-semibold tracking-wide text-white">
          Target Platforms <span className="text-[var(--color-danger)]">*</span>
        </p>
        <div className="flex flex-wrap gap-3">
          {PLATFORMS.map(({ id, label }) => {
            const selected = platforms.includes(id);
            return (
              <button
                key={id}
                type="button"
                onClick={() => onTogglePlatform(id)}
                className={`rounded-xl border px-5 py-3 text-sm font-bold transition-all duration-200 ${
                  selected
                    ? "border-[var(--color-primary)] bg-[var(--color-primary)]/10 text-[var(--color-primary)] shadow-[0_0_15px_-5px_rgba(99,102,241,0.3)]"
                    : "border-[var(--color-border)] bg-[#0D0F14] text-[var(--color-muted)] hover:border-[var(--color-primary)]/50 hover:text-white"
                }`}
              >
                {label}
              </button>
            );
          })}
        </div>
        <FieldError message={errors.platforms} />
      </div>

      <div className="space-y-2">
        <label htmlFor="keywords" className="block text-sm font-semibold tracking-wide text-white">
          Required Keywords <span className="text-[var(--color-danger)]">*</span>
        </label>
        <p className="text-xs text-[var(--color-muted)] pb-1">
          Comma-separated. Posts must include at least one of these keywords to qualify.
        </p>
        <input
          id="keywords"
          type="text"
          value={keywordsInput}
          onChange={(e) => onKeywordsChange(e.target.value)}
          placeholder="e.g. #Earnify, @EarnifyApp, earnify.io"
          className="w-full rounded-xl border border-[var(--color-border)] bg-[#0D0F14] px-4 py-3.5 text-white transition-all focus:border-[var(--color-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]"
        />
        <FieldError message={errors.requiredKeywords} />
        {keywordsInput.trim().length > 0 && (
          <div className="flex flex-wrap gap-2 pt-3">
            {keywordsInput
              .split(",")
              .map((k) => k.trim())
              .filter(Boolean)
              .map((kw) => (
                <span
                  key={kw}
                  className="rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1.5 text-xs font-semibold text-white shadow-sm"
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
    <div className="space-y-8">
      <div className="space-y-2">
        <label htmlFor="budget" className="block text-sm font-semibold tracking-wide text-white">
          Total Budget (XLM) <span className="text-[var(--color-danger)]">*</span>
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
            className="w-full rounded-xl border border-[var(--color-border)] bg-[#0D0F14] px-4 py-3.5 pr-16 text-white transition-all focus:border-[var(--color-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)] text-lg"
          />
          <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-sm font-bold text-[var(--color-muted)]">
            XLM
          </span>
        </div>
        <FieldError message={errors.budget} />
      </div>

      <div className="grid gap-6 sm:grid-cols-2">
        <div className="space-y-2">
          <label htmlFor="startDate" className="block text-sm font-semibold tracking-wide text-white">
            Start Date <span className="text-[var(--color-muted)] text-xs font-normal ml-1">(optional)</span>
          </label>
          <input
            id="startDate"
            type="datetime-local"
            value={startDate}
            onChange={(e) => onChange("startDate", e.target.value)}
            className="w-full rounded-xl border border-[var(--color-border)] bg-[#0D0F14] px-4 py-3.5 text-white transition-all focus:border-[var(--color-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]"
          />
          <FieldError message={errors.startDate} />
        </div>

        <div className="space-y-2">
          <label htmlFor="endDate" className="block text-sm font-semibold tracking-wide text-white">
            End Date <span className="text-[var(--color-danger)]">*</span>
          </label>
          <input
            id="endDate"
            type="datetime-local"
            value={endDate}
            onChange={(e) => onChange("endDate", e.target.value)}
            className="w-full rounded-xl border border-[var(--color-border)] bg-[#0D0F14] px-4 py-3.5 text-white transition-all focus:border-[var(--color-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]"
          />
          <FieldError message={errors.endDate} />
        </div>
      </div>

      <div className="rounded-xl border border-[var(--color-primary)]/20 bg-[var(--color-primary)]/5 p-4 text-sm text-[var(--color-muted)]">
        <strong className="text-white">Note:</strong> The campaign will be saved as a{" "}
        <span className="font-bold text-[var(--color-primary)]">DRAFT</span>. You can fund it via Freighter after creation.
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
    <div className="space-y-8">
      <div className="overflow-hidden rounded-xl border border-[var(--color-border)] bg-[#0D0F14]">
        <table className="w-full text-sm">
          <tbody className="divide-y divide-[var(--color-border)]">
            {rows.map(({ label, value }) => (
              <tr key={label}>
                <td className="w-40 bg-[var(--color-surface)]/30 px-5 py-4 font-semibold text-white">{label}</td>
                <td className="px-5 py-4 text-[var(--color-muted)]">{value}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="space-y-3">
        <p className="font-semibold text-white px-1">Description</p>
        <p className="rounded-xl border border-[var(--color-border)] bg-[#0D0F14] px-5 py-4 text-sm leading-relaxed text-[var(--color-muted)] whitespace-pre-wrap">
          {description}
        </p>
      </div>

      {submitError && (
        <div className="rounded-xl border border-[var(--color-danger)]/30 bg-[var(--color-danger)]/10 px-5 py-4 text-sm font-medium text-[var(--color-danger)] text-center">
          {submitError}
        </div>
      )}

      <form onSubmit={onSubmit} className="pt-4 border-t border-[var(--color-border)]">
        <button
          type="submit"
          disabled={submitting}
          className="flex w-full items-center justify-center gap-2 rounded-full bg-gradient-to-r from-[var(--color-primary)] to-[var(--color-secondary)] px-8 py-4 text-base font-bold text-white shadow-[0_0_20px_-5px_rgba(99,102,241,0.5)] transition-all hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {submitting ? (
            <>
              <span className="inline-block h-5 w-5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
              Saving draft…
            </>
          ) : (
            "Save Draft & Continue to Funding →"
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
    <div className="space-y-6">
      <div className="rounded-2xl border border-[var(--color-success)]/30 bg-[var(--color-success)]/10 p-6 text-center space-y-3 relative overflow-hidden">
        <div className="absolute -top-10 -right-10 h-32 w-32 rounded-full bg-[var(--color-success)]/20 blur-3xl"></div>
        <div className="inline-flex h-16 w-16 items-center justify-center rounded-full bg-[var(--color-success)]/20 text-3xl mb-2">
          🎉
        </div>
        <h3 className="text-xl font-bold text-white">Campaign is Live!</h3>
        <p className="text-[var(--color-muted)]">
          <strong className="text-white">{campaign.title}</strong> is now{" "}
          <span className="font-bold text-[var(--color-success)]">ACTIVE</span> on Stellar testnet.
        </p>
      </div>

      <div className="rounded-xl border border-[var(--color-border)] bg-[#0D0F14] p-5 space-y-4 text-sm">
        <div className="flex flex-col gap-1">
          <span className="font-semibold text-[var(--color-muted)] uppercase tracking-wider text-xs">Contract Address</span>
          <a
            href={`https://stellar.expert/explorer/testnet/search?term=${encodeURIComponent(contractId)}`}
            target="_blank"
            rel="noreferrer"
            className="break-all font-mono text-[var(--color-primary)] hover:underline"
          >
            {contractId}
          </a>
        </div>
        
        <div className="flex flex-col gap-1">
          <span className="font-semibold text-[var(--color-muted)] uppercase tracking-wider text-xs">Funding Transaction</span>
          <a
            href={`https://stellar.expert/explorer/testnet/search?term=${encodeURIComponent(txHash)}`}
            target="_blank"
            rel="noreferrer"
            className="break-all font-mono text-[var(--color-primary)] hover:underline"
          >
            {txHash}
          </a>
        </div>
        
        <div className="flex flex-col gap-1">
          <span className="font-semibold text-[var(--color-muted)] uppercase tracking-wider text-xs">Total Budget</span>
          <span className="font-bold text-white text-lg">
            {campaign.budget} {campaign.budgetToken}
          </span>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-4 pt-4 border-t border-[var(--color-border)]/50">
        <a
          href={`/campaign/${campaign.id}`}
          className="flex-1 inline-flex items-center justify-center rounded-full bg-[var(--color-primary)] px-6 py-3.5 text-sm font-bold text-white hover:bg-opacity-90 transition-all"
        >
          View Live Campaign →
        </a>
        <button
          type="button"
          onClick={onCreateAnother}
          className="flex-1 inline-flex items-center justify-center rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] px-6 py-3.5 text-sm font-bold text-white hover:bg-[#2A2D3A] transition-all"
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
    <main className="min-h-screen bg-[var(--color-background)] text-[#e2e8f0] pb-20 pt-8">
      <section className="mx-auto grid w-full max-w-7xl gap-8 px-4 sm:px-6 lg:px-8 lg:grid-cols-[1fr_350px]">
        {/* ---- Main card ---- */}
        <article className="relative overflow-hidden rounded-3xl border border-[var(--color-border)] bg-[var(--color-surface)]/50 backdrop-blur-xl shadow-2xl">
          <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-[var(--color-primary)] to-[var(--color-secondary)]"></div>
          
          <div className="p-8 sm:p-12">
            <header className="space-y-3 mb-10">
              <p className="text-sm font-semibold uppercase tracking-widest text-[var(--color-primary)]">Founder Console</p>
              <h1 className="text-3xl font-bold text-white sm:text-4xl">Launch a Campaign</h1>
              <p className="text-base text-[var(--color-muted)] max-w-2xl">
                Design your marketing bounty. Campaign launch now requires funding via Freighter in the final step.
              </p>
            </header>

            {/* Step indicator */}
            {!createdCampaign && (
              <div className="mb-12 border-b border-[var(--color-border)]/50 pb-8">
                <StepIndicator current={step} total={TOTAL_STEPS} />
                <p className="mt-4 text-sm font-medium text-[var(--color-muted)] uppercase tracking-wider">
                  Step {step} of {TOTAL_STEPS} — <span className="text-white">{STEP_LABELS[step - 1]}</span>
                </p>
              </div>
            )}

            <div className="mt-2">
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
                  allowSkip={false}
                  onSkip={() => {
                    // Let them view the draft campaign without funding
                    window.location.href = `/campaign/${createdCampaign.id}`;
                  }}
                />
              ) : (
                <>
                  <div className="min-h-[300px]">
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
                  </div>

                  {/* Navigation buttons */}
                  {step < 4 && (
                    <div className="mt-10 flex items-center justify-between border-t border-[var(--color-border)]/50 pt-8">
                      {step > 1 ? (
                        <button
                          type="button"
                          onClick={handleBack}
                          className="rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] px-6 py-3 text-sm font-bold text-white transition-colors hover:bg-[#2A2D3A]"
                        >
                          ← Back
                        </button>
                      ) : (
                        <div></div> // Empty div for spacing
                      )}
                      
                      <button
                        type="button"
                        onClick={handleNext}
                        className="rounded-full bg-[var(--color-primary)] px-8 py-3 text-sm font-bold text-white shadow-lg shadow-[var(--color-primary)]/20 transition-transform hover:-translate-y-0.5 hover:shadow-[var(--color-primary)]/40"
                      >
                        Next Step →
                      </button>
                    </div>
                  )}
                  {step === 4 && (
                    <div className="mt-8">
                      <button
                        type="button"
                        onClick={handleBack}
                        disabled={submitting}
                        className="rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] px-6 py-3 text-sm font-bold text-white transition-colors hover:bg-[#2A2D3A] disabled:opacity-50"
                      >
                        ← Edit Details
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </article>

        {/* ---- Sidebar ---- */}
        <aside className="space-y-6">
          <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)]/30 p-6 backdrop-blur">
            <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-widest text-[var(--color-primary)] mb-6">
              <span className="h-2 w-2 rounded-full bg-[var(--color-primary)]"></span> Launch Checklist
            </h2>
            
            <ul className="space-y-4">
              <li className="relative pl-6 before:absolute before:left-0 before:top-2 before:h-1.5 before:w-1.5 before:rounded-full before:bg-[var(--color-secondary)]">
                <p className="text-sm font-bold text-white mb-1">Step 1 — Basic Info</p>
                <p className="text-xs text-[var(--color-muted)] leading-relaxed">Pick a short, creator-friendly title and describe the campaign clearly.</p>
              </li>
              <li className="relative pl-6 before:absolute before:left-0 before:top-2 before:h-1.5 before:w-1.5 before:rounded-full before:bg-[var(--color-secondary)]">
                <p className="text-sm font-bold text-white mb-1">Step 2 — Targeting</p>
                <p className="text-xs text-[var(--color-muted)] leading-relaxed">Choose where creators should post and what hashtags or mentions to include.</p>
              </li>
              <li className="relative pl-6 before:absolute before:left-0 before:top-2 before:h-1.5 before:w-1.5 before:rounded-full before:bg-[var(--color-secondary)]">
                <p className="text-sm font-bold text-white mb-1">Step 3 — Parameters</p>
                <p className="text-xs text-[var(--color-muted)] leading-relaxed">Set a realistic XLM budget and a clear end date for meaningful payouts.</p>
              </li>
              <li className="relative pl-6 before:absolute before:left-0 before:top-2 before:h-1.5 before:w-1.5 before:rounded-full before:bg-[var(--color-secondary)]">
                <p className="text-sm font-bold text-white mb-1">Step 4 — Finalize</p>
                <p className="text-xs text-[var(--color-muted)] leading-relaxed">Confirm everything looks right, save the draft, and prepare your wallet.</p>
              </li>
            </ul>
          </div>

          <div className="rounded-2xl border border-[#10B981]/20 bg-gradient-to-b from-[var(--color-surface)] to-[#0D0F14] p-6 shadow-[0_0_30px_-10px_rgba(16,185,129,0.1)]">
            <h3 className="flex items-center gap-2 text-sm font-bold text-white mb-3">
              <span className="text-[#10B981]">✦</span> About Freighter funding
            </h3>
            <p className="text-xs text-[var(--color-muted)] leading-relaxed">
              After saving the draft, you'll be prompted to connect your Freighter wallet and sign a transaction that deploys and funds the Soroban contract. <strong className="text-white font-semibold">Your secret key never leaves your browser.</strong>
            </p>
          </div>
        </aside>
      </section>
    </main>
  );
}

export default withAuth(CreateCampaignPage, { role: "FOUNDER" });
