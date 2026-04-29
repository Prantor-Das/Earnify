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
  | "idle" // waiting for user to click
  | "deploying" // stellar CLI deploying contract (server-side)
  | "building" // building the Soroban tx client-side
  | "signing" // waiting for Freighter to sign
  | "submitting" // submitting signed tx to Horizon
  | "confirming" // polling for tx confirmation
  | "activating" // calling PATCH /api/campaigns/:id
  | "done" // success
  | "error"; // terminal error

type DeployResponse = {
  contractId: string;
  xdr: string; // unsigned transaction XDR for the founder to sign
  networkPassphrase: string;
  campaignWalletAddress: string;
};

type ActivateResponse = {
  id: string;
  status: string;
  contractId: string | null;
  fundingTxHash: string | null;
};

const apiBaseUrl =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000";
const HORIZON_URL =
  process.env.NEXT_PUBLIC_STELLAR_HORIZON_URL ??
  "https://horizon-testnet.stellar.org";
const NETWORK_PASSPHRASE =
  process.env.NEXT_PUBLIC_STELLAR_NETWORK_PASSPHRASE ??
  "Test SDF Network ; September 2015";
const FOUNDER_FEE_BUFFER_XLM = 10;

// ---------------------------------------------------------------------------
// Stellar SDK — loaded lazily (browser only, large bundle)
// ---------------------------------------------------------------------------

type StellarSdkModule = {
  Asset: {
    native: () => unknown;
  };
  Operation: {
    payment: (input: {
      destination: string;
      asset: unknown;
      amount: string;
    }) => unknown;
    createAccount: (input: {
      destination: string;
      startingBalance: string;
    }) => unknown;
  };
  TransactionBuilder: any;
  Horizon: {
    Server: new (url: string) => {
      fetchBaseFee: () => Promise<number>;
      loadAccount: (address: string) => Promise<unknown>;
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
  opts: { networkPassphrase: string },
) => Promise<{ signedTxXdr: string; error?: string }>;

async function getFreighterSign(): Promise<FreighterSignFn | null> {
  try {
    const mod = await import("@stellar/freighter-api");
    const api =
      (
        mod as unknown as {
          freighterApi?: { signTransaction: FreighterSignFn };
        }
      ).freighterApi ??
      (mod as unknown as { signTransaction: FreighterSignFn });
    if (typeof api?.signTransaction === "function")
      return api.signTransaction.bind(api);
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
    case "deploying":
      return "Deploying Soroban contract…";
    case "building":
      return "Building transaction…";
    case "signing":
      return "Waiting for Freighter signature…";
    case "submitting":
      return "Submitting to Stellar testnet…";
    case "confirming":
      return "Confirming on-chain…";
    case "activating":
      return "Activating campaign…";
    default:
      return "";
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

type Props = {
  campaign: CampaignDraft;
  onSuccess: (result: { contractId: string; txHash: string }) => void;
  onSkip: () => void;
  allowSkip?: boolean;
};

export function FundCampaignStep({
  campaign,
  onSuccess,
  onSkip,
  allowSkip = true,
}: Props) {
  const { walletAddress, isConnected, isFreighterInstalled, connectWallet } =
    useWallet();

  const [phase, setPhase] = useState<FundingPhase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);
  const [contractId, setContractId] = useState<string | null>(null);

  const budgetXlm = Number(campaign.budget);
  const feeBufferXlm = FOUNDER_FEE_BUFFER_XLM;
  const depositAmountXlm = budgetXlm + feeBufferXlm;

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
      const deployRes = await fetch(
        `${apiBaseUrl}/api/campaigns/${campaign.id}/deploy-contract`,
        {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ founderPublicKey: walletAddress }),
        },
      );

      const deployPayload =
        (await deployRes.json()) as ApiResponse<DeployResponse>;

      if (!deployRes.ok || !deployPayload.success || !deployPayload.data) {
        throw new Error(deployPayload.error ?? "Contract deployment failed");
      }

      const {
        contractId: deployedContractId,
        xdr,
        networkPassphrase,
        campaignWalletAddress,
      } = deployPayload.data;
      setContractId(deployedContractId);

      // Step 2 — Sign the XDR with Freighter (founder's key, never leaves browser)
      setPhase("signing");

      const freighterSign = await getFreighterSign();
      if (!freighterSign) {
        throw new Error(
          "Freighter extension is not available. Please install it and try again.",
        );
      }

      const signResult = await freighterSign(xdr, { networkPassphrase });

      if (signResult.error) {
        throw new Error(`Freighter signing failed: ${signResult.error}`);
      }

      const signedXdr = signResult.signedTxXdr;

      // Step 3 — Submit initialize() transaction to Horizon
      setPhase("submitting");

      const sdk = await getStellarSdk();
      const horizon = new sdk.Horizon.Server(HORIZON_URL);
      const initializeTx = sdk.TransactionBuilder.fromXDR(
        signedXdr,
        networkPassphrase ?? NETWORK_PASSPHRASE,
      );
      await horizon.submitTransaction(initializeTx);

      // Step 4 — Build founder -> campaign-wallet funding transaction.
      // If campaign wallet account is missing, create it with starting balance.
      let campaignWalletExists = true;
      try {
        await horizon.loadAccount(campaignWalletAddress);
      } catch {
        campaignWalletExists = false;
      }

      const founderAccount = await horizon.loadAccount(walletAddress);
      const fee = String(await horizon.fetchBaseFee());
      const amount = depositAmountXlm.toFixed(7);

      const fundingBuilder = new sdk.TransactionBuilder(founderAccount, {
        fee,
        networkPassphrase: networkPassphrase ?? NETWORK_PASSPHRASE,
      });

      if (campaignWalletExists) {
        fundingBuilder.addOperation(
          sdk.Operation.payment({
            destination: campaignWalletAddress,
            asset: sdk.Asset.native(),
            amount,
          }),
        );
      } else {
        fundingBuilder.addOperation(
          sdk.Operation.createAccount({
            destination: campaignWalletAddress,
            startingBalance: amount,
          }),
        );
      }

      const fundingTxUnsigned = fundingBuilder.setTimeout(60).build();
      const fundingXdr = fundingTxUnsigned.toEnvelope().toXDR("base64");

      setPhase("signing");
      const fundingSignResult = await freighterSign(fundingXdr, {
        networkPassphrase,
      });
      if (fundingSignResult.error) {
        throw new Error(
          `Freighter signing failed for funding tx: ${fundingSignResult.error}`,
        );
      }

      setPhase("submitting");
      const fundingTx = sdk.TransactionBuilder.fromXDR(
        fundingSignResult.signedTxXdr,
        networkPassphrase ?? NETWORK_PASSPHRASE,
      );
      const fundingSubmitResult = await horizon.submitTransaction(fundingTx);
      const hash = fundingSubmitResult.hash;
      setTxHash(hash);

      // Step 5 — Activate the campaign in the DB
      setPhase("activating");

      const activateRes = await fetch(
        `${apiBaseUrl}/api/campaigns/${campaign.id}`,
        {
          method: "PATCH",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            status: "ACTIVE",
            contractId: deployedContractId,
            stellarTxHash: hash,
          }),
        },
      );

      const activatePayload =
        (await activateRes.json()) as ApiResponse<ActivateResponse>;

      if (!activateRes.ok || !activatePayload.success) {
        // Campaign is funded on-chain but DB update failed — surface the hash
        // so the founder can retry manually.
        throw new Error(
          activatePayload.error ??
            `Campaign funded (tx: ${hash}) but activation failed. Contact support with your campaign ID.`,
        );
      }

      setPhase("done");
      onSuccess({ contractId: deployedContractId, txHash: hash });
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Funding failed. Please try again.",
      );
      setPhase("error");
    }
  }, [campaign.id, walletAddress, onSuccess]);

  const isLoading = phase !== "idle" && phase !== "done" && phase !== "error";

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <p className="text-sm font-bold uppercase tracking-widest text-[var(--color-primary)]">
          Fund Campaign
        </p>
        <h2 className="mt-2 text-2xl font-bold text-white">
          Deploy &amp; fund on Stellar testnet
        </h2>
        <p className="mt-2 text-sm text-[var(--color-muted)] leading-relaxed max-w-xl">
          This will deploy a Soroban escrow contract and transfer{" "}
          <strong className="font-semibold text-white">
            {depositAmountXlm} XLM
          </strong>{" "}
          from your Freighter wallet (
          <strong className="font-semibold text-white">{budgetXlm} XLM</strong>{" "}
          campaign pool +{" "}
          <strong className="font-semibold text-white">
            {feeBufferXlm} XLM
          </strong>{" "}
          tx-fee buffer). Your private key never leaves your browser.
        </p>
      </div>

      {/* Wallet status */}
      {!isFreighterInstalled ? (
        <div className="rounded-2xl border border-[var(--color-border)] bg-[#0D0F14] p-5 text-sm">
          <p className="font-semibold text-white">Freighter not detected</p>
          <p className="mt-1 text-[var(--color-muted)]">
            Install the{" "}
            <a
              href="https://freighter.app"
              target="_blank"
              rel="noreferrer"
              className="font-bold text-[var(--color-primary)] hover:underline"
            >
              Freighter browser extension
            </a>{" "}
            to sign transactions without exposing your secret key.
          </p>
        </div>
      ) : !walletReady ? (
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 rounded-2xl border border-[var(--color-border)] bg-[#0D0F14] p-6">
          <p className="text-sm font-medium text-[var(--color-muted)]">
            Connect your Freighter wallet to continue.
          </p>
          <button
            type="button"
            onClick={() => {
              void connectWallet();
            }}
            className="shrink-0 rounded-full bg-[var(--color-surface)] px-6 py-2.5 text-sm font-bold text-white transition-colors hover:bg-[#2A2D3A]"
          >
            Connect Wallet
          </button>
        </div>
      ) : (
        <div className="inline-flex items-center gap-2 rounded-full border border-[var(--color-success)]/30 bg-[var(--color-success)]/10 px-4 py-2 text-xs font-bold text-[var(--color-success)] backdrop-blur-sm">
          <span
            aria-hidden
            className="inline-block h-2 w-2 animate-pulse rounded-full bg-[var(--color-success)]"
          />
          Wallet Connected: {walletAddress!.slice(0, 6)}…
          {walletAddress!.slice(-6)}
        </div>
      )}

      {/* Summary row */}
      <div className="overflow-hidden rounded-xl border border-[var(--color-border)] bg-[#0D0F14] text-sm">
        <table className="w-full">
          <tbody className="divide-y divide-[var(--color-border)]">
            <tr>
              <td className="w-36 bg-[var(--color-surface)]/30 px-5 py-3.5 text-xs font-semibold uppercase tracking-wider text-[var(--color-muted)]">
                Campaign
              </td>
              <td className="px-5 py-3.5 font-medium text-white">
                {campaign.title}
              </td>
            </tr>
            <tr>
              <td className="w-36 bg-[var(--color-surface)]/30 px-5 py-3.5 text-xs font-semibold uppercase tracking-wider text-[var(--color-muted)]">
                Budget
              </td>
              <td className="px-5 py-3.5 text-base font-bold text-[var(--color-primary)]">
                {budgetXlm} XLM
              </td>
            </tr>
            <tr>
              <td className="w-36 bg-[var(--color-surface)]/30 px-5 py-3.5 text-xs font-semibold uppercase tracking-wider text-[var(--color-muted)]">
                Network
              </td>
              <td className="px-5 py-3.5 text-white">Stellar Testnet</td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Progress indicator */}
      {isLoading && (
        <div className="flex items-center gap-3 rounded-2xl border border-[var(--color-primary)]/30 bg-[var(--color-primary)]/10 px-5 py-4 backdrop-blur-sm">
          <span
            aria-hidden
            className="inline-block h-5 w-5 shrink-0 animate-spin rounded-full border-2 border-[var(--color-primary)]/30 border-t-[var(--color-primary)]"
          />
          <p className="text-sm font-semibold text-[var(--color-primary)]">
            {phaseLabel(phase)}
          </p>
        </div>
      )}

      {/* Error */}
      {phase === "error" && error && (
        <div className="rounded-2xl border border-[var(--color-danger)]/30 bg-[var(--color-danger)]/10 px-5 py-4 text-sm text-[var(--color-danger)]">
          <p className="font-semibold">{error}</p>
          {txHash && (
            <p className="mt-2 break-all text-xs opacity-80">
              Tx hash (funded on-chain):{" "}
              <a
                href={`https://stellar.expert/explorer/testnet/search?term=${encodeURIComponent(txHash)}`}
                target="_blank"
                rel="noreferrer"
                className="font-bold underline hover:opacity-80"
              >
                {txHash}
              </a>
            </p>
          )}
        </div>
      )}

      {/* Success */}
      {phase === "done" && contractId && txHash && (
        <div className="space-y-3 rounded-2xl border border-[var(--color-success)]/40 bg-[var(--color-success)]/10 p-6 backdrop-blur-sm">
          <p className="text-base font-bold text-[var(--color-success)]">
            Campaign funded and activated!
          </p>
          <div className="space-y-1">
            <p className="break-all text-xs text-[var(--color-muted)]">
              <span className="font-semibold uppercase tracking-wider">
                Contract:
              </span>{" "}
              <a
                href={`https://stellar.expert/explorer/testnet/search?term=${encodeURIComponent(contractId)}`}
                target="_blank"
                rel="noreferrer"
                className="font-mono text-[var(--color-primary)] hover:underline"
              >
                {contractId}
              </a>
            </p>
            <p className="break-all text-xs text-[var(--color-muted)]">
              <span className="font-semibold uppercase tracking-wider">
                Tx:
              </span>{" "}
              <a
                href={`https://stellar.expert/explorer/testnet/search?term=${encodeURIComponent(txHash)}`}
                target="_blank"
                rel="noreferrer"
                className="font-mono text-[var(--color-primary)] hover:underline"
              >
                {txHash}
              </a>
            </p>
          </div>
        </div>
      )}

      {/* Actions */}
      {phase !== "done" && (
        <div className="flex flex-wrap items-center gap-4 pt-2">
          <button
            type="button"
            onClick={() => {
              void handleFund();
            }}
            disabled={isLoading || !walletReady || !isFreighterInstalled}
            className="inline-flex min-w-[160px] items-center justify-center gap-2 rounded-full bg-gradient-to-r from-[var(--color-primary)] to-[var(--color-secondary)] px-8 py-3.5 text-sm font-bold text-white shadow-[0_0_20px_-5px_rgba(99,102,241,0.4)] transition-all hover:-translate-y-0.5 hover:shadow-[0_0_25px_-5px_rgba(99,102,241,0.6)] disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0"
          >
            {isLoading ? (
              <>
                <span
                  aria-hidden
                  className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white"
                />
                Working…
              </>
            ) : phase === "error" ? (
              "Retry Funding"
            ) : (
              `Fund ${depositAmountXlm} XLM`
            )}
          </button>

          {!isLoading && allowSkip ? (
            <button
              type="button"
              onClick={onSkip}
              className="rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] px-6 py-3.5 text-sm font-bold text-white transition-colors hover:bg-[#2A2D3A]"
            >
              Skip for now
            </button>
          ) : null}
        </div>
      )}
    </div>
  );
}
