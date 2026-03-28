import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
});

export const metadata: Metadata = {
  title: "d3ftly — Your code, d3ftly handled",
  description:
    "Autonomous AI coding agent. Assign a GitHub issue, get a production-ready PR.",
  openGraph: {
    title: "d3ftly — Your code, d3ftly handled",
    description:
      "Autonomous AI coding agent. Assign a GitHub issue, get a production-ready PR.",
    url: "https://d3ftly.com",
    siteName: "d3ftly",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "d3ftly",
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
        {children}
      </body>
    </html>
  );
}
