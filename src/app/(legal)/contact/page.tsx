import { pageBySlug } from "@/content/site";
import { pageMetadata } from "@/lib/seo";
import LegalPage from "../LegalPage";

export const metadata = pageMetadata(pageBySlug("contact")!);

export default function Page() {
  return <LegalPage slug="contact" />;
}
