"use client";

import { useEffect } from "react";

import { useRouter, useSearchParams } from "next/navigation";

import { useAuth } from "../../components/auth/useAuth";

export default function LoginPage() {
  const { isAuthenticated, loading, loginWithGoogle } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    if (loading || !isAuthenticated) {
      return;
    }

    const nextPath = searchParams.get("next") || "/";
    router.replace(nextPath as Parameters<typeof router.replace>[0]);
  }, [isAuthenticated, loading, router, searchParams]);

  return (
    <main className="relative min-h-screen overflow-hidden px-6 py-14">
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(40rem 24rem at 8% 10%, color-mix(in srgb, var(--color-secondary) 24%, transparent), transparent), radial-gradient(34rem 20rem at 92% 80%, color-mix(in srgb, var(--color-accent) 35%, transparent), transparent)"
        }}
      />

      <section
        className="relative mx-auto flex w-full max-w-md flex-col gap-6 rounded-xl border border-border p-8"
        style={{
          backgroundColor: "color-mix(in srgb, var(--color-surface) 92%, white)",
          boxShadow: "0 28px 80px color-mix(in srgb, var(--color-secondary) 14%, transparent)"
        }}
      >
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-accent">Earnify Access</p>
        <h1 className="text-3xl font-semibold leading-tight text-secondary">Sign in to launch and track campaigns</h1>
        <p className="text-sm leading-6 text-muted">
          Use your Google account to continue. Earnify will issue a secure session token in an httpOnly cookie.
        </p>

        <button
          type="button"
          onClick={loginWithGoogle}
          className="group inline-flex items-center justify-center gap-3 rounded-md border border-border px-5 py-3 text-sm font-semibold transition-transform duration-150 ease-out hover:-translate-y-0.5"
          style={{
            background: "linear-gradient(135deg, color-mix(in srgb, var(--color-primary) 16%, white), var(--color-surface))",
            color: "var(--color-secondary)"
          }}
        >
          <span
            aria-hidden
            className="inline-block h-2.5 w-2.5 rounded-full"
            style={{ backgroundColor: "var(--color-accent)", boxShadow: "0 0 0 6px color-mix(in srgb, var(--color-accent) 25%, transparent)" }}
          />
          Continue with Google
        </button>
      </section>
    </main>
  );
}
