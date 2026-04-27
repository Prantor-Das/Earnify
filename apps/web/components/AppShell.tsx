"use client";

import { AuthProvider } from "./auth/AuthProvider";
import { Navbar } from "./Navbar";
import { ToastProvider } from "./toast/ToastProvider";
import { WalletProvider } from "./wallet/WalletProvider";

function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <WalletProvider>
        <ToastProvider>
          <Navbar />
          {children}
        </ToastProvider>
      </WalletProvider>
    </AuthProvider>
  );
}

export { AppShell };
