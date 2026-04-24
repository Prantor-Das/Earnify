"use client";

import Link from "next/link";

import { useAuth } from "./auth/useAuth";
import { ConnectWalletButton } from "./wallet/ConnectWalletButton";

type NavbarProps = {
  onToggleTheme: () => void;
  isDarkMode: boolean;
};

function Navbar({ onToggleTheme, isDarkMode }: NavbarProps) {
  const { user, isAuthenticated, logout } = useAuth();

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-surface/85 backdrop-blur">
      <div className="mx-auto grid w-full max-w-7xl gap-3 px-4 py-3 sm:grid-cols-[1fr_auto] sm:items-center sm:px-6 lg:px-10">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <Link href={{ pathname: "/dashboard" }} className="text-lg font-semibold text-secondary">
              Earnify
            </Link>
            <span className="rounded-full border border-border bg-background px-2 py-0.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-accent">
              Theme-driven UI
            </span>
          </div>
          <p className="mt-1 text-xs text-muted">
            To reskin the entire app, edit styles/theme.ts and rebuild the theme CSS tokens.
          </p>
        </div>

        <div className="flex flex-wrap items-center justify-start gap-2 sm:justify-end">
          <button
            type="button"
            onClick={onToggleTheme}
            className="rounded-md border border-border bg-background px-3 py-1.5 text-xs font-semibold text-secondary"
          >
            {isDarkMode ? "Light mode" : "Dark mode"}
          </button>

          {isAuthenticated && user?.role === "FOUNDER" ? (
            <Link
              href={{ pathname: "/campaign/create" }}
              className="rounded-md border border-border px-3 py-1.5 text-xs font-semibold text-secondary transition-transform hover:-translate-y-0.5"
              style={{
                background:
                  "linear-gradient(120deg, color-mix(in srgb, var(--color-primary) 18%, white), var(--color-surface))"
              }}
            >
              + Create Campaign
            </Link>
          ) : null}

          {/* Freighter wallet connection — visible to all authenticated users */}
          {isAuthenticated ? <ConnectWalletButton /> : null}

          {isAuthenticated ? (
            <>
              <span className="rounded-md border border-border bg-background px-3 py-1.5 text-xs text-muted">
                {user?.name ?? "User"}
              </span>
              <button
                type="button"
                onClick={() => {
                  void logout();
                }}
                className="rounded-md border border-border bg-background px-3 py-1.5 text-xs font-semibold text-secondary"
              >
                Logout
              </button>
            </>
          ) : null}
        </div>
      </div>
    </header>
  );
}

export { Navbar };
