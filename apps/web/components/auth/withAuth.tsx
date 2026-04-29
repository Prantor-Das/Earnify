"use client";

import { useEffect } from "react";

import type { UserRole } from "@earnify/shared";
import { usePathname, useRouter } from "next/navigation";

import { useAuth } from "./useAuth";

type WithAuthOptions = {
  role?: UserRole;
};

export function withAuth<P extends object>(
  WrappedComponent: React.ComponentType<P>,
  options?: WithAuthOptions,
): React.ComponentType<P> {
  function ProtectedComponent(props: P) {
    const { loading, isAuthenticated, user } = useAuth();
    const router = useRouter();
    const pathname = usePathname();

    useEffect(() => {
      if (loading) {
        return;
      }

      if (!isAuthenticated) {
        const nextPath = pathname
          ? `?next=${encodeURIComponent(pathname)}`
          : "";
        const loginPath = `/login${nextPath}` as Parameters<
          typeof router.replace
        >[0];
        router.replace(loginPath);
        return;
      }

      if (options?.role && user?.role !== options.role) {
        router.replace("/");
      }
    }, [isAuthenticated, loading, pathname, router, user?.role]);

    if (loading) {
      return (
        <main className="min-h-screen grid place-items-center px-6">
          <p className="text-sm text-muted">Checking your session...</p>
        </main>
      );
    }

    if (!isAuthenticated) {
      return null;
    }

    if (options?.role && user?.role !== options.role) {
      return null;
    }

    return <WrappedComponent {...props} />;
  }

  ProtectedComponent.displayName = `withAuth(${WrappedComponent.displayName ?? WrappedComponent.name ?? "Component"})`;

  return ProtectedComponent;
}
