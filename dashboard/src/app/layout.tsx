import type { Metadata } from "next";
import "./globals.css";
import { ClientShell } from "@/components/client-shell";
import { GoogleAnalytics } from "@/components/google-analytics";
import { BOOT_RECOVERY_SCRIPT, BOOT_STYLE } from "@/lib/boot-recovery";

export const metadata: Metadata = {
  // No title here: the shell names each tab after its page (client-shell.tsx).
  description: "Manage your Coderhelm settings and monitor runs",
  icons: { icon: "/favicon.svg" },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <head>
        {/* Inline on purpose: these must work when /_next files fail to load. */}
        <style dangerouslySetInnerHTML={{ __html: BOOT_STYLE }} />
        <script dangerouslySetInnerHTML={{ __html: BOOT_RECOVERY_SCRIPT }} />
        {/* Where the API is, set per deployment (lib/runtime-config.ts). Loaded
            before the app so every call can read it. */}
        {/* eslint-disable-next-line @next/next/no-sync-scripts */}
        <script src="/runtime-config.js" />
      </head>
      <body className="bg-zinc-950 text-zinc-100 min-h-screen antialiased">
        <GoogleAnalytics />
        <ClientShell>{children}</ClientShell>
      </body>
    </html>
  );
}
