import type { Metadata, Viewport } from "next";
import "./globals.css";
import { ClientShell } from "@/components/client-shell";
import { RouteHead } from "@/components/route-head";
import { THEME_COLOR } from "@/lib/link-preview";
import { GoogleAnalytics } from "@/components/google-analytics";
import { BOOT_RECOVERY_SCRIPT, BOOT_STYLE } from "@/lib/boot-recovery";

export const metadata: Metadata = {
  // No title or description here: the shell names each tab after its page
  // (client-shell.tsx), and RouteHead writes each page's description and link
  // preview from lib/routes.ts.
  applicationName: "Coderhelm",
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "32x32" },
      { url: "/favicon.svg", type: "image/svg+xml" },
      { url: "/icon-192.png", type: "image/png", sizes: "192x192" },
      { url: "/icon-512.png", type: "image/png", sizes: "512x512" },
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180" }],
  },
};

export const viewport: Viewport = {
  themeColor: THEME_COLOR,
  colorScheme: "dark",
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
        <RouteHead />
        <GoogleAnalytics />
        <ClientShell>{children}</ClientShell>
      </body>
    </html>
  );
}
