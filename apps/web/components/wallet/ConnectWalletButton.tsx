"use client";

import { useState } from "react";

import { useWallet } from "./WalletProvider";

// Truncate a Stellar public key: first 4 chars + "..." + last 4 chars
function truncate(address: string) {
  return `${address.slice(0, 4)}...${address.slice(-4)}`;
}

export function ConnectWalletButton() {
  const {
    walletAddress,
    isConnected,
    isFreighterInstalled,
    isConnecting,
    connectError,
    connectWallet,
    disconnectWallet,
  } = useWallet();

  const [showDisconnect, setShowDisconnect] = useState(false);

  // ---- Freighter not installed ----
  if (!isFreighterInstalled) {
    return (
      <a
        href="https://freighter.app"
        target="_blank"
        rel="noreferrer"
        className="inline-flex items-center gap-2 rounded-full border border-[var(--color-border)]/30 bg-[var(--color-surface)]/50 px-4 py-2 text-xs font-bold text-white backdrop-blur-sm transition-transform hover:-translate-y-0.5 shadow-sm"
        title="Install the Freighter browser extension to connect your Stellar wallet"
      >
        <span
          aria-hidden
          className="inline-block h-2 w-2 rounded-full bg-[var(--color-muted)]"
        />
        Install Freighter
      </a>
    );
  }

  // ---- Connected ----
  if (isConnected && walletAddress) {
    return (
      <div className="relative">
        <button
          type="button"
          onClick={() => setShowDisconnect((v) => !v)}
          className="inline-flex items-center gap-2 rounded-full border border-[var(--color-success)]/30 bg-[var(--color-success)]/10 px-4 py-2 text-xs font-bold text-[var(--color-success)] backdrop-blur-sm transition-transform hover:-translate-y-0.5 shadow-[0_0_10px_-3px_rgba(16,185,129,0.2)]"
          title={walletAddress}
          aria-expanded={showDisconnect}
          aria-haspopup="true"
        >
          <span
            aria-hidden
            className="inline-block h-2 w-2 rounded-full bg-[var(--color-success)] animate-pulse"
          />
          {truncate(walletAddress)}
        </button>

        {showDisconnect && (
          <>
            {/* Backdrop to close on outside click */}
            <div
              className="fixed inset-0 z-40"
              aria-hidden
              onClick={() => setShowDisconnect(false)}
            />
            <div
              className="absolute right-0 top-full z-50 mt-2 min-w-[180px] overflow-hidden rounded-xl border border-[var(--color-border)]/50 bg-[#0D0F14]/90 p-1.5 shadow-2xl backdrop-blur-xl"
              role="menu"
            >
              <p className="px-3 py-2 text-[11px] text-[var(--color-muted)] break-all font-mono">
                {walletAddress}
              </p>
              <div className="my-1 h-px w-full bg-[var(--color-border)]/30" />
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  disconnectWallet();
                  setShowDisconnect(false);
                }}
                className="w-full rounded-lg px-3 py-2 text-left text-xs font-bold text-[var(--color-danger)] transition-colors hover:bg-[var(--color-danger)]/10"
              >
                Disconnect Wallet
              </button>
            </div>
          </>
        )}
      </div>
    );
  }

  // ---- Not connected ----
  return (
    <div className="flex flex-col items-end gap-1.5">
      <button
        type="button"
        onClick={() => {
          void connectWallet();
        }}
        disabled={isConnecting}
        className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-[var(--color-primary)] to-[var(--color-secondary)] px-5 py-2 text-xs font-bold text-white shadow-[0_0_15px_-3px_rgba(99,102,241,0.4)] backdrop-blur-sm transition-all hover:-translate-y-0.5 hover:shadow-[0_0_20px_-3px_rgba(99,102,241,0.6)] disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0"
      >
        {isConnecting ? (
          <>
            <span
              aria-hidden
              className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/30 border-t-white"
            />
            Connecting…
          </>
        ) : (
          <>
            <span
              aria-hidden
              className="inline-block h-2 w-2 rounded-full bg-white/80"
            />
            Connect Wallet
          </>
        )}
      </button>
      {connectError && (
        <p className="text-[11px] font-medium text-[var(--color-danger)]">
          {connectError}
        </p>
      )}
    </div>
  );
}
