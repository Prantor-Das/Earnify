"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState
} from "react";

// ---------------------------------------------------------------------------
// Freighter API — imported lazily so SSR never touches the browser extension
// ---------------------------------------------------------------------------

type FreighterApi = {
  isConnected: () => Promise<{ isConnected: boolean }>;
  isAllowed: () => Promise<{ isAllowed: boolean }>;
  requestAccess: () => Promise<{ address: string; error?: string }>;
  getAddress: () => Promise<{ address: string; error?: string }>;
};

async function getFreighter(): Promise<FreighterApi | null> {
  if (typeof window === "undefined") return null;
  try {
    const mod = await import("@stellar/freighter-api");
    // v3 exports named functions at the top level
    const api = (mod as unknown as { freighterApi?: FreighterApi }) .freighterApi ?? (mod as unknown as FreighterApi);
    if (typeof api?.isConnected === "function") return api;
    return null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Context shape
// ---------------------------------------------------------------------------

export type WalletContextValue = {
  walletAddress: string | null;
  isConnected: boolean;
  isFreighterInstalled: boolean;
  isConnecting: boolean;
  connectError: string | null;
  connectWallet: () => Promise<void>;
  disconnectWallet: () => void;
};

const WalletContext = createContext<WalletContextValue | null>(null);

const STORAGE_KEY = "earnify_wallet";
const DISCONNECTED_KEY = "earnify_wallet_disconnected";
const apiBaseUrl =
  typeof process !== "undefined"
    ? (process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000")
    : "http://localhost:4000";

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export function WalletProvider({ children }: { children: React.ReactNode }) {
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [isFreighterInstalled, setIsFreighterInstalled] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [connectError, setConnectError] = useState<string | null>(null);
  // Track whether we've finished the initial hydration check
  const [hydrated, setHydrated] = useState(false);

  // ---- Persist wallet address to the API ----
  const persistWalletToApi = useCallback(async (address: string) => {
    try {
      await fetch(`${apiBaseUrl}/api/users/me/wallet`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ walletAddress: address })
      });
    } catch {
      // Non-fatal — wallet is still stored locally
    }
  }, []);

  // ---- On mount: check Freighter installation + rehydrate from localStorage ----
  useEffect(() => {
    let cancelled = false;

    const init = async () => {
      const freighter = await getFreighter();

      if (cancelled) return;

      if (!freighter) {
        setHydrated(true);
        return;
      }

      setIsFreighterInstalled(true);
      const manuallyDisconnected = localStorage.getItem(DISCONNECTED_KEY) === "1";

      if (manuallyDisconnected) {
        localStorage.removeItem(STORAGE_KEY);
        if (!cancelled) setHydrated(true);
        return;
      }

      // Check if Freighter is still connected/allowed
      try {
        const [connectedResult, allowedResult] = await Promise.all([
          freighter.isConnected(),
          freighter.isAllowed()
        ]);

        if (cancelled) return;

        const stillActive = connectedResult.isConnected && allowedResult.isAllowed;

        if (stillActive) {
          // Try to get the current address
          const addressResult = await freighter.getAddress();
          if (!cancelled && addressResult.address && !addressResult.error) {
            setWalletAddress(addressResult.address);
            localStorage.setItem(STORAGE_KEY, addressResult.address);
          } else {
            // Freighter is installed but address not available — try localStorage
            const stored = localStorage.getItem(STORAGE_KEY);
            if (!cancelled && stored) setWalletAddress(stored);
          }
        } else {
          // Not connected — clear any stale localStorage entry
          localStorage.removeItem(STORAGE_KEY);
        }
      } catch {
        // Freighter installed but not responding — try localStorage as fallback
        const stored = localStorage.getItem(STORAGE_KEY);
        if (!cancelled && stored) setWalletAddress(stored);
      }

      if (!cancelled) setHydrated(true);
    };

    void init();
    return () => { cancelled = true; };
  }, []);

  // ---- connectWallet ----
  const connectWallet = useCallback(async () => {
    setConnectError(null);
    setIsConnecting(true);

    try {
      const freighter = await getFreighter();

      if (!freighter) {
        setConnectError("Freighter extension is not installed");
        return;
      }

      const result = await freighter.requestAccess();

      if (result.error) {
        setConnectError(result.error);
        return;
      }

      if (!result.address) {
        setConnectError("No address returned from Freighter");
        return;
      }

      setWalletAddress(result.address);
      localStorage.setItem(STORAGE_KEY, result.address);
      localStorage.removeItem(DISCONNECTED_KEY);
      void persistWalletToApi(result.address);
    } catch (err) {
      setConnectError(err instanceof Error ? err.message : "Failed to connect wallet");
    } finally {
      setIsConnecting(false);
    }
  }, [persistWalletToApi]);

  // ---- disconnectWallet ----
  const disconnectWallet = useCallback(() => {
    setWalletAddress(null);
    localStorage.removeItem(STORAGE_KEY);
    localStorage.setItem(DISCONNECTED_KEY, "1");
    setConnectError(null);
  }, []);

  const value = useMemo<WalletContextValue>(
    () => ({
      walletAddress,
      isConnected: Boolean(walletAddress),
      isFreighterInstalled,
      isConnecting,
      connectError,
      connectWallet,
      disconnectWallet
    }),
    [walletAddress, isFreighterInstalled, isConnecting, connectError, connectWallet, disconnectWallet]
  );

  // Avoid hydration mismatch — render children immediately but wallet state
  // settles after the async init. Components should handle walletAddress === null.
  void hydrated; // used to suppress lint; state is set but drives no conditional render here

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useWallet(): WalletContextValue {
  const ctx = useContext(WalletContext);
  if (!ctx) throw new Error("useWallet must be used inside WalletProvider");
  return ctx;
}
