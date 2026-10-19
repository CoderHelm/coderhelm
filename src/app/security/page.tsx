import { pageBySlug } from "@/content/site";
import { pageMetadata } from "@/lib/seo";
import PageView from "@/components/PageView";

const page = pageBySlug("security")!;

export const metadata = pageMetadata(page);

export default function Page() {
  return <PageView page={page} />;
}
