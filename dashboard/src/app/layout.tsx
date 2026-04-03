import type { Metadata } from "next";
import "./globals.css";
import { ClientShell } from "@/components/client-shell";
import { GoogleAnalytics } from "@/components/google-analytics";

export const metadata: Metadata = {
  title: "Coderhelm — Dashboard",
  description: "Manage your Coderhelm settings and monitor runs",
  icons: { icon: "/favicon.svg" },
  other: { "color-scheme": "dark" },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className="bg-zinc-950 text-zinc-100 min-h-screen antialiased">
        <GoogleAnalytics />
        <ClientShell>{children}</ClientShell>
      </body>
    </html>
  );
}
