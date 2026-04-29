"use client";

import { Suspense, useEffect } from "react";

import { useRouter, useSearchParams } from "next/navigation";

import { useAuth } from "../../components/auth/useAuth";

function LoginPageContent() {
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
    <main className="relative min-h-[calc(100vh-4rem)] overflow-hidden px-6 py-14">
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(48rem 24rem at 8% 12%, rgba(245,158,11,0.14), transparent), radial-gradient(46rem 20rem at 88% 84%, rgba(255,255,255,0.08), transparent)",
        }}
      />

      <section className="mx-auto grid w-full max-w-5xl items-stretch gap-8 lg:grid-cols-[1.1fr_0.9fr]">
        <article className="surface-card motion-rise rounded-sm p-8 sm:p-10 lg:p-12">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--color-primary)]">
            Secure Access
          </p>
          <h1 className="mt-4 text-3xl font-semibold text-zinc-100 sm:text-4xl">
            Sign in to manage campaigns and payouts
          </h1>
          <p className="mt-4 max-w-xl text-sm leading-7 text-zinc-400">
            Continue with Google to access your dashboard. Session
            authentication is handled by secure cookies, and wallet actions
            remain under your control.
          </p>

          <div className="mt-10 space-y-3">
            <button
              type="button"
              onClick={loginWithGoogle}
              className="inline-flex w-full items-center justify-center gap-3 border border-[var(--color-primary)] bg-[var(--color-primary)] px-6 py-4 text-sm font-bold uppercase tracking-[0.08em] text-black transition-colors hover:bg-[var(--color-accent)]"
            >
              <span
                aria-hidden
                className="inline-block h-2.5 w-2.5 animate-pulse bg-black"
              />
              Continue with Google
            </button>
            <p className="text-xs text-zinc-500">
              By continuing, you agree to the platform terms and policy.
            </p>
          </div>
        </article>

        <aside className="surface-card rounded-sm p-8">
          <h2 className="text-sm font-semibold uppercase tracking-[0.12em] text-zinc-300">
            Why Earnify
          </h2>
          <ul className="mt-5 space-y-3 text-sm text-zinc-400">
            <li className="border border-zinc-800 bg-black/30 p-3">
              Live campaign states with transparent status tracking.
            </li>
            <li className="border border-zinc-800 bg-black/30 p-3">
              Real-time leaderboard updates and performance insights.
            </li>
            <li className="border border-zinc-800 bg-black/30 p-3">
              On-chain payout visibility through Stellar transaction links.
            </li>
          </ul>
        </aside>
      </section>
    </main>
  );
}

function LoginFallback() {
  return (
    <main className="relative min-h-[calc(100vh-4rem)] overflow-hidden px-6 py-14">
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(48rem 24rem at 8% 12%, rgba(245,158,11,0.14), transparent), radial-gradient(46rem 20rem at 88% 84%, rgba(255,255,255,0.08), transparent)",
        }}
      />

      <section className="mx-auto grid w-full max-w-5xl items-stretch gap-8 lg:grid-cols-[1.1fr_0.9fr]">
        <article className="surface-card motion-rise rounded-sm p-8 sm:p-10 lg:p-12">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--color-primary)]">
            Secure Access
          </p>
          <h1 className="mt-4 text-3xl font-semibold text-zinc-100 sm:text-4xl">
            Sign in to manage campaigns and payouts
          </h1>
        </article>
      </section>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<LoginFallback />}>
      <LoginPageContent />
    </Suspense>
  );
}
