"use client";

import { Suspense, useEffect, useState } from "react";

import { useRouter, useSearchParams } from "next/navigation";

import { useAuth } from "../../components/auth/useAuth";

function LoginPageContent() {
  const { isAuthenticated, loading, loginWithGoogle } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [submitting, setSubmitting] = useState(false);

  const authError =
    searchParams.get("error") ||
    searchParams.get("auth_error") ||
    searchParams.get("message");

  useEffect(() => {
    if (!loading && isAuthenticated) {
      router.replace("/dashboard");
    }
  }, [isAuthenticated, loading, router]);

  return (
    <main className="grid min-h-[calc(100vh-4rem)] place-items-center bg-[#0A0A0A] px-5 py-16 text-[#FAFAFA]">
      <section className="w-full max-w-md border border-[#525252] bg-[#111111] p-8 [border-radius:8px]">
        <div className="mb-8 flex flex-col items-center text-center">
          <span className="grid h-12 w-12 place-items-center border border-[#F59E0B] text-xl font-medium text-[#F59E0B]">
            V
          </span>
          <h1 className="mt-5 text-3xl font-medium">Sign in to Virlo</h1>
          <p className="mt-3 text-sm leading-6 text-[#A3A3A3]">
            Continue with Google to manage campaigns, posts, earnings, and
            payouts.
          </p>
        </div>

        {authError ? (
          <div className="mb-4 border border-[#525252] bg-[#1A1A1A] px-4 py-3 text-sm text-[#FAFAFA] [border-radius:6px]">
            Authentication failed. Please try again.
          </div>
        ) : null}

        <button
          type="button"
          disabled={loading || submitting}
          onClick={() => {
            setSubmitting(true);
            loginWithGoogle();
          }}
          className="inline-flex h-12 w-full items-center justify-center gap-3 border border-[#F59E0B] bg-[#F59E0B] px-5 text-sm font-medium text-[#0A0A0A] transition-colors hover:border-[#D97706] hover:bg-[#D97706] disabled:cursor-not-allowed disabled:opacity-70 [border-radius:6px]"
        >
          {submitting ? (
            <span
              aria-hidden
              className="h-4 w-4 animate-spin border-2 border-[#0A0A0A]/30 border-t-[#0A0A0A] rounded-[50%]"
            />
          ) : (
            <span className="font-medium">G</span>
          )}
          {submitting ? "Redirecting..." : "Sign in with Google"}
        </button>
      </section>
    </main>
  );
}

function LoginFallback() {
  return (
    <main className="grid min-h-[calc(100vh-4rem)] place-items-center bg-[#0A0A0A] px-5 py-16 text-[#FAFAFA]">
      <section className="w-full max-w-md border border-[#525252] bg-[#111111] p-8 [border-radius:8px]">
        <div className="mx-auto h-12 w-12 animate-pulse bg-[#525252]" />
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
