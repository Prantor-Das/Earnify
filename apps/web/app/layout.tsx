import type { Metadata } from "next";

import { AuthProvider } from "../components/auth/AuthProvider";
import "../styles/globals.css";

export const metadata: Metadata = {
  title: "Earnify",
  description: "Social media marketing platform monorepo starter"
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}

