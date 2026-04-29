"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMemo, useState } from "react";
import type { Route } from "next";

import { useAuth } from "./auth/useAuth";
import { ConnectWalletButton } from "./wallet/ConnectWalletButton";

type NavItem = {
  href: string;
  label: string;
  requiresAuth?: boolean;
};

const navItems: NavItem[] = [
  { href: "/", label: "Home" },
  { href: "/dashboard", label: "Dashboard", requiresAuth: true },
];

function isActivePath(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  return pathname.startsWith(href);
}

export function Navbar() {
  const { user, isAuthenticated, logout } = useAuth();
  const pathname = usePathname();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const visibleNav = useMemo(
    () => navItems.filter((item) => !item.requiresAuth || isAuthenticated),
    [isAuthenticated],
  );

  return (
    <header className="sticky top-0 z-50 border-b border-[var(--color-border)] bg-black/85 backdrop-blur-xl">
      <div className="mx-auto flex w-full max-w-7xl items-center justify-between gap-4 px-4 py-3 sm:px-6 lg:px-8">
        <Link
          href="/"
          className="inline-flex items-center gap-2"
          onClick={() => setMobileMenuOpen(false)}
        >
          <span className="inline-flex h-8 w-8 items-center justify-center border border-zinc-700 bg-zinc-900 text-xs font-bold text-[var(--color-primary)]">
            EF
          </span>
          <span className="text-lg font-semibold tracking-[0.08em] text-zinc-100">
            EARNIFY
          </span>
        </Link>

        <nav className="hidden items-center gap-1 lg:flex">
          {visibleNav.map((item) => {
            const active = isActivePath(pathname, item.href);
            return (
              <Link
                key={item.href}
                href={item.href as Route}
                className={`px-3 py-2 text-xs font-semibold uppercase tracking-[0.09em] transition-colors ${
                  active
                    ? "bg-zinc-900 text-[var(--color-primary)]"
                    : "text-zinc-300 hover:bg-zinc-900 hover:text-zinc-100"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="hidden items-center gap-2 lg:flex">
          {isAuthenticated && user?.role === "FOUNDER" ? (
            <Link
              href="/campaign/create"
              className="inline-flex items-center justify-center border border-[var(--color-primary)] bg-[var(--color-primary)] px-3 py-2 text-xs font-bold uppercase tracking-[0.09em] text-black hover:bg-[var(--color-accent)]"
            >
              New Campaign
            </Link>
          ) : null}

          {isAuthenticated ? <ConnectWalletButton /> : null}

          {!isAuthenticated ? (
            <Link
              href="/login"
              className="inline-flex items-center justify-center border border-zinc-700 px-3 py-2 text-xs font-bold uppercase tracking-[0.09em] text-zinc-200 hover:border-zinc-500 hover:text-white"
            >
              Login
            </Link>
          ) : (
            <button
              type="button"
              onClick={() => void logout()}
              className="inline-flex items-center justify-center border border-zinc-700 px-3 py-2 text-xs font-bold uppercase tracking-[0.09em] text-zinc-200 hover:border-zinc-500 hover:text-white"
            >
              Logout
            </button>
          )}
        </div>

        <button
          type="button"
          className="inline-flex h-10 w-10 items-center justify-center border border-zinc-700 bg-zinc-900 text-zinc-200 lg:hidden"
          onClick={() => setMobileMenuOpen((prev) => !prev)}
          aria-expanded={mobileMenuOpen}
          aria-label="Toggle menu"
        >
          {mobileMenuOpen ? "×" : "☰"}
        </button>
      </div>

      {mobileMenuOpen ? (
        <div className="border-t border-[var(--color-border)] bg-[#0a0a0a] px-4 py-4 lg:hidden">
          <nav className="space-y-2">
            {visibleNav.map((item) => {
              const active = isActivePath(pathname, item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href as Route}
                  onClick={() => setMobileMenuOpen(false)}
                  className={`block border px-3 py-2 text-xs font-semibold uppercase tracking-[0.09em] ${
                    active
                      ? "border-[var(--color-primary)] bg-[var(--color-primary)]/15 text-[var(--color-primary)]"
                      : "border-zinc-800 text-zinc-300"
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}

            {isAuthenticated && user?.role === "FOUNDER" ? (
              <Link
                href="/campaign/create"
                onClick={() => setMobileMenuOpen(false)}
                className="block border border-[var(--color-primary)] bg-[var(--color-primary)] px-3 py-2 text-xs font-bold uppercase tracking-[0.09em] text-black"
              >
                New Campaign
              </Link>
            ) : null}

            {!isAuthenticated ? (
              <Link
                href="/login"
                onClick={() => setMobileMenuOpen(false)}
                className="block border border-zinc-700 px-3 py-2 text-xs font-bold uppercase tracking-[0.09em] text-zinc-200"
              >
                Login
              </Link>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setMobileMenuOpen(false);
                  void logout();
                }}
                className="w-full border border-zinc-700 px-3 py-2 text-left text-xs font-bold uppercase tracking-[0.09em] text-zinc-200"
              >
                Logout
              </button>
            )}

            {isAuthenticated ? <ConnectWalletButton /> : null}
          </nav>
        </div>
      ) : null}
    </header>
  );
}
