import { pageBySlug } from "@/content/site";
import { pageToMarkdown, markdownResponse } from "@/lib/markdown";

export const dynamic = "force-static";

export function GET() {
  return markdownResponse(pageToMarkdown(pageBySlug("reviewer")!));
}
