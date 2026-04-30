"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import type { Route } from "next";

import { useAuth } from "./auth/useAuth";
import { useWallet } from "./wallet/WalletProvider";

type NavItem = {
  href: string;
  label: string;
};

const navItems: NavItem[] = [
  { href: "/campaign", label: "Campaigns" },
  { href: "/#leaderboard", label: "Leaderboard" },
  { href: "/#how-it-works", label: "How It Works" },
];

function isActivePath(pathname: string, href: string) {
  if (href.startsWith("/#")) return false;
  return pathname === href || pathname.startsWith(`${href}/`);
}

function truncateAddress(address: string) {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

export function Navbar() {
  const { isAuthenticated, logout } = useAuth();
  const { walletAddress, isConnected } = useWallet();
  const pathname = usePathname();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const updateScrolled = () => setScrolled(window.scrollY > 8);
    updateScrolled();
    window.addEventListener("scroll", updateScrolled, { passive: true });
    return () => window.removeEventListener("scroll", updateScrolled);
  }, []);

  const walletChip =
    isConnected && walletAddress ? (
      <span
        className="inline-flex h-9 items-center border border-[#525252] bg-[#0A0A0A] px-3 font-mono text-xs text-[#FAFAFA]"
        title={walletAddress}
      >
        {truncateAddress(walletAddress)}
      </span>
    ) : null;

  const authAction = !isAuthenticated ? (
    <Link
      href="/login"
      className="inline-flex h-9 items-center justify-center border border-[#F59E0B] px-4 text-xs font-medium uppercase text-[#F59E0B] transition-colors hover:border-[#D97706] hover:bg-[#D97706] hover:text-[#0A0A0A]"
      onClick={() => setMobileMenuOpen(false)}
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
      className="inline-flex h-9 items-center justify-center border border-[#F59E0B] px-4 text-xs font-medium uppercase text-[#F59E0B] transition-colors hover:border-[#D97706] hover:bg-[#D97706] hover:text-[#0A0A0A]"
    >
      Logout
    </button>
  );

  return (
    <header
      className={`sticky top-0 z-50 border-b transition-colors ${
        scrolled
          ? "border-[#E5E5E5]/80 bg-[#FAFAFA]/82 backdrop-blur-xl"
          : "border-transparent bg-[#FAFAFA]/70 backdrop-blur-md"
      }`}
    >
      <div className="mx-auto grid h-16 w-full max-w-7xl grid-cols-[1fr_auto_1fr] items-center gap-4 px-4 sm:px-6 lg:px-8">
        <Link
          href="/"
          className="inline-flex items-center gap-2 justify-self-start"
          onClick={() => setMobileMenuOpen(false)}
        >
          <span className="inline-flex h-8 w-8 items-center justify-center border border-[#0A0A0A] bg-[#0A0A0A] text-sm font-medium text-[#F59E0B]">
            V
          </span>
          <span className="text-lg font-medium text-[#0A0A0A]">Virlo</span>
        </Link>

        <nav className="hidden items-center gap-1 lg:flex">
          {navItems.map((item) => {
            const active = isActivePath(pathname, item.href);
            return (
              <Link
                key={item.href}
                href={item.href as Route}
                className={`px-3 py-2 text-sm font-medium transition-colors ${
                  active
                    ? "text-[#0A0A0A]"
                    : "text-[#525252] hover:text-[#0A0A0A]"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="hidden items-center justify-end gap-2 lg:flex">
          {walletChip}
          {authAction}
        </div>

        <button
          type="button"
          className="inline-flex h-10 w-10 items-center justify-center justify-self-end border border-[#E5E5E5] bg-[#FAFAFA] text-[#0A0A0A] lg:hidden"
          onClick={() => setMobileMenuOpen((prev) => !prev)}
          aria-expanded={mobileMenuOpen}
          aria-label="Toggle menu"
        >
          <span className="relative h-4 w-5">
            <span
              className={`absolute left-0 top-0 h-px w-5 bg-current transition-transform ${
                mobileMenuOpen ? "translate-y-2 rotate-45" : ""
              }`}
            />
            <span
              className={`absolute left-0 top-2 h-px w-5 bg-current transition-opacity ${
                mobileMenuOpen ? "opacity-0" : "opacity-100"
              }`}
            />
            <span
              className={`absolute left-0 top-4 h-px w-5 bg-current transition-transform ${
                mobileMenuOpen ? "-translate-y-2 -rotate-45" : ""
              }`}
            />
          </span>
        </button>
      </div>

      <div
        className={`fixed inset-y-0 right-0 z-50 w-80 max-w-[86vw] border-l border-[#E5E5E5] bg-[#FAFAFA] px-5 py-5 shadow-2xl transition-transform duration-300 lg:hidden ${
          mobileMenuOpen ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <div className="mb-8 flex items-center justify-between">
          <span className="text-base font-medium text-[#0A0A0A]">Virlo</span>
          <button
            type="button"
            className="h-9 w-9 border border-[#E5E5E5] text-[#0A0A0A]"
            onClick={() => setMobileMenuOpen(false)}
            aria-label="Close menu"
          >
            x
          </button>
        </div>

        <nav className="flex flex-col gap-2">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href as Route}
              onClick={() => setMobileMenuOpen(false)}
              className="border border-[#E5E5E5] px-3 py-3 text-sm font-medium text-[#0A0A0A]"
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="mt-5 flex flex-col items-stretch gap-2">
          {walletChip}
          {authAction}
        </div>
      </div>

      {mobileMenuOpen ? (
        <button
          type="button"
          className="fixed inset-0 z-40 bg-[#0A0A0A]/40 lg:hidden"
          aria-label="Close menu overlay"
          onClick={() => setMobileMenuOpen(false)}
        />
      ) : null}
    </header>
  );
}
