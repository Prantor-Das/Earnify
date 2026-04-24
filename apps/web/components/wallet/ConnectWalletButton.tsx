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
    disconnectWallet
  } = useWallet();

  const [showDisconnect, setShowDisconnect] = useState(false);

  // ---- Freighter not installed ----
  if (!isFreighterInstalled) {
    return (
      <a
        href="https://freighter.app"
        target="_blank"
        rel="noreferrer"
        className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-3 py-1.5 text-xs font-semibold text-secondary transition-transform hover:-translate-y-0.5"
        title="Install the Freighter browser extension to connect your Stellar wallet"
      >
        <span
          aria-hidden
          className="inline-block h-2 w-2 rounded-full"
          style={{ backgroundColor: "var(--color-muted)" }}
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
          className="inline-flex items-center gap-1.5 rounded-md border border-success/40 px-3 py-1.5 text-xs font-semibold text-success transition-transform hover:-translate-y-0.5"
          style={{
            backgroundColor: "color-mix(in srgb, var(--color-success) 10%, var(--color-background))"
          }}
          title={walletAddress}
          aria-expanded={showDisconnect}
          aria-haspopup="true"
        >
          <span
            aria-hidden
            className="inline-block h-2 w-2 rounded-full"
            style={{ backgroundColor: "var(--color-success)" }}
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
              className="absolute right-0 top-full z-50 mt-1.5 min-w-[160px] rounded-md border border-border bg-surface p-1 shadow-lg"
              role="menu"
            >
              <p className="px-3 py-1.5 text-[11px] text-muted break-all">{walletAddress}</p>
              <hr className="my-1 border-border" />
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  disconnectWallet();
                  setShowDisconnect(false);
                }}
                className="w-full rounded px-3 py-1.5 text-left text-xs font-semibold text-danger hover:bg-danger/10"
              >
                Disconnect
              </button>
            </div>
          </>
        )}
      </div>
    );
  }

  // ---- Not connected ----
  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={() => { void connectWallet(); }}
        disabled={isConnecting}
        className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs font-semibold text-secondary disabled:cursor-not-allowed disabled:opacity-60 transition-transform hover:-translate-y-0.5"
        style={{
          background:
            "linear-gradient(120deg, color-mix(in srgb, var(--color-primary) 16%, white), var(--color-surface))"
        }}
      >
        {isConnecting ? (
          <>
            <span
              aria-hidden
              className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent"
            />
            Connecting…
          </>
        ) : (
          <>
            <span
              aria-hidden
              className="inline-block h-2 w-2 rounded-full"
              style={{ backgroundColor: "var(--color-accent)" }}
            />
            Connect Wallet
          </>
        )}
      </button>
      {connectError && (
        <p className="text-[11px] text-danger">{connectError}</p>
      )}
    </div>
  );
}
