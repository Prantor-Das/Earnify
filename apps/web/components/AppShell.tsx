"use client";

import { useEffect, useState } from "react";

import { AuthProvider } from "./auth/AuthProvider";
import { Navbar } from "./Navbar";
import { ToastProvider } from "./toast/ToastProvider";
import { WalletProvider } from "./wallet/WalletProvider";

function AppShell({ children }: { children: React.ReactNode }) {
  const [isDarkMode, setIsDarkMode] = useState(false);

  useEffect(() => {
    const persistedTheme = window.localStorage.getItem("earnify-theme");
    const shouldEnableDark = persistedTheme === "dark";
    setIsDarkMode(shouldEnableDark);
    document.documentElement.classList.toggle("dark", shouldEnableDark);
  }, []);

  const toggleTheme = () => {
    setIsDarkMode((previous) => {
      const next = !previous;
      document.documentElement.classList.toggle("dark", next);
      window.localStorage.setItem("earnify-theme", next ? "dark" : "light");
      return next;
    });
  };

  return (
    <AuthProvider>
      <WalletProvider>
        <ToastProvider>
          <Navbar onToggleTheme={toggleTheme} isDarkMode={isDarkMode} />
          {children}
        </ToastProvider>
      </WalletProvider>
    </AuthProvider>
  );
}

export { AppShell };
