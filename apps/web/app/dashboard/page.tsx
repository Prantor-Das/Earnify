"use client";

import { useEffect } from "react";

import { useRouter } from "next/navigation";

import { useAuth } from "../../components/auth/useAuth";
import { withAuth } from "../../components/auth/withAuth";

function DashboardEntryPage() {
  const { loading, user } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading || !user) {
      return;
    }

    const target = user.role === "FOUNDER" ? "/dashboard/founder" : "/dashboard/user";
    router.replace(target as Parameters<typeof router.replace>[0]);
  }, [loading, router, user]);

  return (
    <main className="min-h-screen grid place-items-center px-6">
      <p className="text-sm text-[var(--color-muted)]">Loading your dashboard...</p>
    </main>
  );
}

export default withAuth(DashboardEntryPage);
