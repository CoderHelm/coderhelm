import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";


const inter = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL("https://coderhelm.com"),
  title: {
    default: "Coderhelm — Autonomous AI Coding Agent | Ship Code, Not Tickets",
    template: "%s | Coderhelm",
  },
  description:
    "Coderhelm is an autonomous AI coding agent. Assign a GitHub issue or Jira ticket and get a production-ready PR with self-healing CI and multi-pass code generation.",
  keywords: [
    "AI coding agent",
    "autonomous coding",
    "GitHub automation",
    "Jira automation",
    "AI code review",
    "AI pull request",
    "developer tools",
    "AI software engineer",
    "self-healing CI",
    "AI plans",
    "MCP servers",
    "code generation",
    "autonomous PR",
    "GitHub issue to PR",
    "Jira ticket to PR",
    "AI code generation",
    "AWS log analyzer",
    "code guardrails",
    "AI developer assistant",
    "multi-pass pipeline",
    "Coderhelm",
  ],
  authors: [{ name: "Coderhelm" }],
  creator: "Coderhelm",
  publisher: "Coderhelm",
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
  openGraph: {
    title: "Coderhelm — Ship code, not tickets",
    description:
      "Autonomous AI coding agent. Assign a GitHub issue or Jira ticket — get a production-ready PR with self-healing CI, AI plans, and MCP tool integrations.",
    url: "https://coderhelm.com",
    siteName: "Coderhelm",
    type: "website",
    locale: "en_US",
    images: [
      {
        url: "https://coderhelm.com/og-image.png",
        width: 1200,
        height: 630,
        alt: "Coderhelm — Ship code, not tickets",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Coderhelm — Ship code, not tickets",
    description:
      "Autonomous AI coding agent. Assign a GitHub issue or Jira ticket — get a production-ready PR with self-healing CI, AI plans, and MCP tool integrations.",
    creator: "@coderhelm",
    images: ["https://coderhelm.com/og-image.png"],
  },
  alternates: {
    canonical: "https://coderhelm.com",
  },
  icons: {
    icon: [
      { url: "/favicon.svg", type: "image/svg+xml" },
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180" }],
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
        <script async src="https://www.googletagmanager.com/gtag/js?id=G-N333B1RWMB" />
        <script dangerouslySetInnerHTML={{ __html: `
          window.dataLayer = window.dataLayer || [];
          function gtag(){dataLayer.push(arguments);}
          gtag('js', new Date());
          gtag('config', 'G-N333B1RWMB');
        `}} />
      </head>
      <body className={`${inter.className} bg-surface text-text-primary antialiased`}>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@graph": [
                {
                  "@type": "Organization",
                  name: "Coderhelm",
                  url: "https://coderhelm.com",
                  logo: "https://coderhelm.com/icon-512.png",
                  sameAs: [],
                  description:
                    "Coderhelm builds autonomous AI coding agents that turn GitHub issues and Jira tickets into production-ready pull requests.",
                },
                {
                  "@type": "SoftwareApplication",
                  name: "Coderhelm",
                  applicationCategory: "DeveloperApplication",
                  operatingSystem: "Web",
                  url: "https://coderhelm.com",
                  description:
                    "Autonomous AI coding agent. Assign a GitHub issue or Jira ticket — get a production-ready PR with self-healing CI, AI plans, MCP tool integrations, and AWS log analysis.",
                  featureList: [
                    "GitHub issue to pull request automation",
                    "Jira ticket to pull request automation",
                    "Multi-pass code generation pipeline",
                    "Self-healing CI — automatic test fix iterations",
                    "AI Plans — describe features in plain English",
                    "28+ MCP server integrations (Figma, Sentry, Linear, Notion, Slack, Datadog)",
                    "AWS CloudWatch log analyzer",
                    "Custom code guardrails and team voice",
                    "Openspec architecture documents",
                    "Works with any stack — React, Python, Go, Rust, and more",
                  ],
                  offers: [
                    {
                      "@type": "Offer",
                      name: "Free",
                      price: "0",
                      priceCurrency: "USD",
                      description:
                        "500K tokens/month, public and private repos, all passes, CI self-healing",
                    },
                    {
                      "@type": "Offer",
                      name: "Pro",
                      price: "199",
                      priceCurrency: "USD",
                      billingIncrement: "P1M",
                      description:
                        "5M tokens/month, AI plans, priority queue, custom instructions, email support",
                    },
                  ],
                },
                {
                  "@type": "FAQPage",
                  mainEntity: [
                    {
                      "@type": "Question",
                      name: "What is Coderhelm?",
                      acceptedAnswer: {
                        "@type": "Answer",
                        text: "Coderhelm is an autonomous AI coding agent. You assign a GitHub issue or Jira ticket, and Coderhelm reads your codebase, plans changes, implements them, runs CI, and opens a production-ready pull request.",
                      },
                    },
                    {
                      "@type": "Question",
                      name: "How does Coderhelm work?",
                      acceptedAnswer: {
                        "@type": "Answer",
                        text: "Three steps: 1) Connect your GitHub or Jira account, 2) Create an issue and assign it to Coderhelm or add the coderhelm label, 3) Review the PR that Coderhelm opens. It uses a multi-pass pipeline with context analysis, code generation, safety review, and self-healing CI.",
                      },
                    },
                    {
                      "@type": "Question",
                      name: "What languages and frameworks does Coderhelm support?",
                      acceptedAnswer: {
                        "@type": "Answer",
                        text: "Coderhelm works with any stack including React, Next.js, Python, Go, Rust, TypeScript, Java, and more. It reads your codebase to understand your patterns and conventions.",
                      },
                    },
                    {
                      "@type": "Question",
                      name: "Is Coderhelm free?",
                      acceptedAnswer: {
                        "@type": "Answer",
                        text: "Yes, Coderhelm has a free tier with 500K tokens per month, supporting both public and private repos. The Pro plan at $199/month includes 5M tokens, AI plans, and priority queue.",
                      },
                    },
                    {
                      "@type": "Question",
                      name: "Is my code secure with Coderhelm?",
                      acceptedAnswer: {
                        "@type": "Answer",
                        text: "Yes. Coderhelm uses isolated execution environments, does not store your code, enforces team isolation, verifies webhooks, and is rate-limited and audited. Enterprise-grade security is built in.",
                      },
                    },
                  ],
                },
                {
                  "@type": "WebSite",
                  name: "Coderhelm",
                  url: "https://coderhelm.com",
                },
              ],
            }),
          }}
        />
        {children}
      </body>
    </html>
  );
}
