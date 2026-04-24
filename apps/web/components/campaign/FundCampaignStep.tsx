"use client";

import { useCallback, useEffect, useState } from "react";

import type { ApiResponse } from "@earnify/shared";

import { useWallet } from "../wallet/WalletProvider";

export type CampaignDraft = {
  id: string;
  title: string;
  budget: string;
  budgetToken: string;
  founderWalletAddress?: string | null;
};

type FundingPhase =
  | "idle"           // waiting for user to click
  | "deploying"      // stellar CLI deploying contract (server-side)
  | "building"       // building the Soroban tx client-side
  | "signing"        // waiting for Freighter to sign
  | "submitting"     // submitting signed tx to Horizon
  | "confirming"     // polling for tx confirmation
  | "activating"     // calling PATCH /api/campaigns/:id
  | "done"           // success
  | "error";         // terminal error

type DeployResponse = {
  contractId: string;
  xdr: string;           // unsigned transaction XDR for the founder to sign
  networkPassphrase: string;
};

type ActivateResponse = {
  id: string;
  status: string;
  contractId: string | null;
  fundingTxHash: string | null;
};

const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000";
const HORIZON_URL = process.env.NEXT_PUBLIC_STELLAR_HORIZON_URL ?? "https://horizon-testnet.stellar.org";
const NETWORK_PASSPHRASE =
  process.env.NEXT_PUBLIC_STELLAR_NETWORK_PASSPHRASE ?? "Test SDF Network ; September 2015";

// ---------------------------------------------------------------------------
// Stellar SDK — loaded lazily (browser only, large bundle)
// ---------------------------------------------------------------------------

type StellarSdkModule = {
  TransactionBuilder: {
    fromXDR: (xdr: string, networkPassphrase: string) => {
      toXDR: () => string;
      toEnvelope: () => { toXDR: (format: "base64") => string };
    };
  };
  Horizon: {
    Server: new (url: string) => {
      submitTransaction: (tx: unknown) => Promise<{ hash: string }>;
    };
  };
};

async function getStellarSdk(): Promise<StellarSdkModule> {
  const mod = await import("@stellar/stellar-sdk");
  return mod as unknown as StellarSdkModule;
}

// ---------------------------------------------------------------------------
// Freighter signTransaction — loaded lazily
// ---------------------------------------------------------------------------

type FreighterSignFn = (
  xdr: string,
  opts: { networkPassphrase: string }
) => Promise<{ signedTxXdr: string; error?: string }>;

async function getFreighterSign(): Promise<FreighterSignFn | null> {
  try {
    const mod = await import("@stellar/freighter-api");
    const api = (mod as unknown as { freighterApi?: { signTransaction: FreighterSignFn } }).freighterApi
      ?? (mod as unknown as { signTransaction: FreighterSignFn });
    if (typeof api?.signTransaction === "function") return api.signTransaction.bind(api);
    return null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Phase label helper
// ---------------------------------------------------------------------------

function phaseLabel(phase: FundingPhase): string {
  switch (phase) {
    case "deploying":   return "Deploying Soroban contract…";
    case "building":    return "Building transaction…";
    case "signing":     return "Waiting for Freighter signature…";
    case "submitting":  return "Submitting to Stellar testnet…";
    case "confirming":  return "Confirming on-chain…";
    case "activating":  return "Activating campaign…";
    default:            return "";
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

type Props = {
  campaign: CampaignDraft;
  onSuccess: (result: { contractId: string; txHash: string }) => void;
  onSkip: () => void;
};

export function FundCampaignStep({ campaign, onSuccess, onSkip }: Props) {
  const { walletAddress, isConnected, isFreighterInstalled, connectWallet } = useWallet();

  const [phase, setPhase] = useState<FundingPhase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);
  const [contractId, setContractId] = useState<string | null>(null);

  const budgetXlm = Number(campaign.budget);

  // ---- Guard: wallet must be connected ----
  const walletReady = isConnected && Boolean(walletAddress);

  // ---- Main funding flow ----
  const handleFund = useCallback(async () => {
    if (!walletAddress) {
      setError("Connect your Freighter wallet first.");
      return;
    }

    setError(null);
    setPhase("deploying");

    try {
      // Step 1 — Ask the API to deploy the contract and return an unsigned XDR
      // for the founder to sign. The API deploys via stellar CLI (admin pays
      // deployment fees) then builds an initialize() invocation for the founder.
      const deployRes = await fetch(`${apiBaseUrl}/api/campaigns/${campaign.id}/deploy-contract`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ founderPublicKey: walletAddress })
      });

      const deployPayload = (await deployRes.json()) as ApiResponse<DeployResponse>;

      if (!deployRes.ok || !deployPayload.success || !deployPayload.data) {
        throw new Error(deployPayload.error ?? "Contract deployment failed");
      }

      const { contractId: deployedContractId, xdr, networkPassphrase } = deployPayload.data;
      setContractId(deployedContractId);

      // Step 2 — Sign the XDR with Freighter (founder's key, never leaves browser)
      setPhase("signing");

      const freighterSign = await getFreighterSign();
      if (!freighterSign) {
        throw new Error("Freighter extension is not available. Please install it and try again.");
      }

      const signResult = await freighterSign(xdr, { networkPassphrase });

      if (signResult.error) {
        throw new Error(`Freighter signing failed: ${signResult.error}`);
      }

      const signedXdr = signResult.signedTxXdr;

      // Step 3 — Submit the signed transaction to Horizon
      setPhase("submitting");

      const sdk = await getStellarSdk();
      const horizon = new sdk.Horizon.Server(HORIZON_URL);
      const tx = sdk.TransactionBuilder.fromXDR(signedXdr, networkPassphrase ?? NETWORK_PASSPHRASE);
      const submitResult = await horizon.submitTransaction(tx);
      const hash = submitResult.hash;
      setTxHash(hash);

      // Step 4 — Activate the campaign in the DB
      setPhase("activating");

      const activateRes = await fetch(`${apiBaseUrl}/api/campaigns/${campaign.id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: "ACTIVE",
          contractId: deployedContractId,
          stellarTxHash: hash
        })
      });

      const activatePayload = (await activateRes.json()) as ApiResponse<ActivateResponse>;

      if (!activateRes.ok || !activatePayload.success) {
        // Campaign is funded on-chain but DB update failed — surface the hash
        // so the founder can retry manually.
        throw new Error(
          activatePayload.error ??
            `Campaign funded (tx: ${hash}) but activation failed. Contact support with your campaign ID.`
        );
      }

      setPhase("done");
      onSuccess({ contractId: deployedContractId, txHash: hash });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Funding failed. Please try again.");
      setPhase("error");
    }
  }, [campaign.id, walletAddress, onSuccess]);

  const isLoading = phase !== "idle" && phase !== "done" && phase !== "error";

  return (
    <div className="space-y-5">
      {/* Header */}
      <div>
        <p className="text-sm font-semibold uppercase tracking-[0.16em] text-accent">Fund Campaign</p>
        <h2 className="mt-1 text-lg font-semibold text-secondary">
          Deploy &amp; fund on Stellar testnet
        </h2>
        <p className="mt-1 text-sm text-muted leading-6">
          This will deploy a Soroban escrow contract and transfer{" "}
          <strong className="text-secondary">{budgetXlm} XLM</strong> from your Freighter wallet.
          Your private key never leaves your browser.
        </p>
      </div>

      {/* Wallet status */}
      {!isFreighterInstalled ? (
        <div className="rounded-md border border-border bg-background p-4 text-sm">
          <p className="font-medium text-secondary">Freighter not detected</p>
          <p className="mt-1 text-muted">
            Install the{" "}
            <a
              href="https://freighter.app"
              target="_blank"
              rel="noreferrer"
              className="font-semibold text-secondary underline"
            >
              Freighter browser extension
            </a>{" "}
            to sign transactions without exposing your secret key.
          </p>
        </div>
      ) : !walletReady ? (
        <div className="rounded-md border border-border bg-background p-4">
          <p className="text-sm text-muted">Connect your Freighter wallet to continue.</p>
          <button
            type="button"
            onClick={() => { void connectWallet(); }}
            className="mt-3 inline-flex items-center gap-1.5 rounded-md border border-border px-4 py-2 text-sm font-semibold text-secondary"
            style={{
              background: "linear-gradient(120deg, color-mix(in srgb, var(--color-primary) 16%, white), var(--color-surface))"
            }}
          >
            Connect Wallet
          </button>
        </div>
      ) : (
        <div className="flex items-center gap-2 rounded-md border border-success/40 bg-success/5 px-3 py-2 text-xs font-semibold text-success">
          <span aria-hidden className="inline-block h-2 w-2 rounded-full bg-success" />
          {walletAddress!.slice(0, 6)}…{walletAddress!.slice(-6)}
        </div>
      )}

      {/* Summary row */}
      <div className="rounded-md border border-border overflow-hidden text-sm">
        <table className="w-full">
          <tbody>
            <tr className="border-b border-border">
              <td className="px-4 py-2.5 font-medium text-secondary bg-surface w-36">Campaign</td>
              <td className="px-4 py-2.5 text-muted">{campaign.title}</td>
            </tr>
            <tr className="border-b border-border">
              <td className="px-4 py-2.5 font-medium text-secondary bg-surface">Budget</td>
              <td className="px-4 py-2.5 text-muted font-semibold text-secondary">{budgetXlm} XLM</td>
            </tr>
            <tr>
              <td className="px-4 py-2.5 font-medium text-secondary bg-surface">Network</td>
              <td className="px-4 py-2.5 text-muted">Stellar Testnet</td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Progress indicator */}
      {isLoading && (
        <div className="flex items-center gap-3 rounded-md border border-border bg-background px-4 py-3">
          <span
            aria-hidden
            className="inline-block h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-current border-t-transparent text-accent"
          />
          <p className="text-sm text-secondary">{phaseLabel(phase)}</p>
        </div>
      )}

      {/* Error */}
      {phase === "error" && error && (
        <div className="rounded-md border border-danger/30 bg-danger/5 px-4 py-3 text-sm text-danger">
          {error}
          {txHash && (
            <p className="mt-1 break-all text-xs text-muted">
              Tx hash (funded on-chain):{" "}
              <a
                href={`https://testnet.stellar.expert/explorer/testnet/tx/${txHash}`}
                target="_blank"
                rel="noreferrer"
                className="underline"
              >
                {txHash}
              </a>
            </p>
          )}
        </div>
      )}

      {/* Success */}
      {phase === "done" && contractId && txHash && (
        <div
          className="rounded-md border border-success/40 p-4 space-y-2"
          style={{ backgroundColor: "color-mix(in srgb, var(--color-success) 8%, var(--color-background))" }}
        >
          <p className="text-sm font-semibold text-success">Campaign funded and activated!</p>
          <p className="text-xs text-muted break-all">
            Contract:{" "}
            <a
              href={`https://testnet.stellar.expert/explorer/testnet/contract/${contractId}`}
              target="_blank"
              rel="noreferrer"
              className="font-semibold text-secondary underline"
            >
              {contractId}
            </a>
          </p>
          <p className="text-xs text-muted break-all">
            Tx:{" "}
            <a
              href={`https://testnet.stellar.expert/explorer/testnet/tx/${txHash}`}
              target="_blank"
              rel="noreferrer"
              className="font-semibold text-secondary underline"
            >
              {txHash}
            </a>
          </p>
        </div>
      )}

      {/* Actions */}
      {phase !== "done" && (
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => { void handleFund(); }}
            disabled={isLoading || !walletReady || !isFreighterInstalled}
            className="inline-flex items-center gap-2 rounded-md border border-border px-5 py-2.5 text-sm font-semibold text-secondary disabled:cursor-not-allowed disabled:opacity-60 transition-transform hover:-translate-y-0.5"
            style={{
              background:
                "linear-gradient(120deg, color-mix(in srgb, var(--color-primary) 18%, white), var(--color-surface))"
            }}
          >
            {isLoading ? (
              <>
                <span aria-hidden className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
                Working…
              </>
            ) : phase === "error" ? (
              "Retry"
            ) : (
              `Fund ${budgetXlm} XLM`
            )}
          </button>

          {!isLoading && (
            <button
              type="button"
              onClick={onSkip}
              className="rounded-md border border-border bg-background px-4 py-2.5 text-sm font-semibold text-muted hover:text-secondary"
            >
              Skip for now
            </button>
          )}
        </div>
      )}
    </div>
  );
}
