import type { MetadataRoute } from "next";
import { SITE } from "@/content/site";

export const dynamic = "force-static";

// Policy: this is a public marketing site, and we want people to find
// CoderHelm through search engines and AI assistants alike. Every crawler is
// allowed, AI search, answer and training crawlers included. They are named
// explicitly so the choice is on the record and easy to change per bot.
const AI_CRAWLERS = [
  "OAI-SearchBot", // ChatGPT search
  "ChatGPT-User", // ChatGPT fetching a page a person asked about
  "GPTBot", // OpenAI training
  "Claude-SearchBot", // Claude search
  "Claude-User", // Claude fetching a page a person asked about
  "ClaudeBot", // Anthropic training
  "PerplexityBot", // Perplexity search
  "Perplexity-User", // Perplexity fetching a page a person asked about
  "Google-Extended", // Gemini grounding and training
  "Applebot-Extended", // Apple Intelligence
  "Amazonbot",
  "meta-externalagent",
  "CCBot", // Common Crawl
];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      { userAgent: "*", allow: "/" },
      { userAgent: AI_CRAWLERS, allow: "/" },
    ],
    sitemap: `${SITE.url}/sitemap.xml`,
    host: SITE.url,
  };
}
