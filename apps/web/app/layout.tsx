import type { Metadata } from "next";

import { AppShell } from "../components/AppShell";
import "../styles/globals.css";

export const metadata: Metadata = {
  title: "Virlo | Get paid for real influence",
  description:
    "Performance campaigns for founders and creators, verified through social engagement and paid on Stellar.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
