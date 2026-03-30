import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { GoogleAnalytics } from "@/components/GoogleAnalytics";

const inter = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
});

export const metadata: Metadata = {
  title: "Coderhelm — Ship code, not tickets",
  description:
    "Autonomous AI coding agent. Assign a GitHub issue, get a production-ready PR.",
  openGraph: {
    title: "Coderhelm — Ship code, not tickets",
    description:
      "Autonomous AI coding agent. Assign a GitHub issue, get a production-ready PR.",
    url: "https://coderhelm.com",
    siteName: "Coderhelm",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Coderhelm",
    description:
      "Autonomous AI coding agent. Assign a GitHub issue, get a production-ready PR.",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <head>
        <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
      </head>
      <body className={`${inter.className} bg-surface text-text-primary antialiased`}>
        <GoogleAnalytics />
        {children}
      </body>
    </html>
  );
}
