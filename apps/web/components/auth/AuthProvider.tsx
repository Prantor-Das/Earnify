"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

import type { ApiResponse, AuthUser } from "@earnify/shared";

type AuthContextValue = {
  user: AuthUser | null;
  loading: boolean;
  isAuthenticated: boolean;
  refreshAuth: () => Promise<void>;
  loginWithGoogle: () => void;
  logout: () => Promise<void>;
};

const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000";

const AuthContext = createContext<AuthContextValue | null>(null);

async function parseJson<T>(response: Response) {
  const payload = (await response.json()) as ApiResponse<T>;
  return payload;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshAuth = useCallback(async () => {
    setLoading(true);

    try {
      const response = await fetch(`${apiBaseUrl}/api/auth/me`, {
        method: "GET",
        credentials: "include"
      });

      const payload = await parseJson<{ user: AuthUser }>(response);

      if (!response.ok || !payload.success || !payload.data?.user) {
        setUser(null);
        return;
      }

      setUser(payload.data.user);
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  const loginWithGoogle = useCallback(() => {
    const form = document.createElement("form");
    form.method = "POST";
    form.action = `${apiBaseUrl}/api/auth/google`;
    form.style.display = "none";

    document.body.appendChild(form);
    form.submit();
    document.body.removeChild(form);
  }, []);

  const logout = useCallback(async () => {
    try {
      await fetch(`${apiBaseUrl}/api/auth/logout`, {
        method: "POST",
        credentials: "include"
      });
    } finally {
      setUser(null);
    }
  }, []);

  useEffect(() => {
    void refreshAuth();
  }, [refreshAuth]);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      loading,
      isAuthenticated: Boolean(user),
      refreshAuth,
      loginWithGoogle,
      logout
    }),
    [loading, loginWithGoogle, logout, refreshAuth, user]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error("useAuth must be used inside AuthProvider");
  }

  return context;
}
