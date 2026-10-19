import { pageBySlug } from "@/content/site";
import { Shell } from "@/components/PageView";
import { MarkdownDoc } from "@/components/Md";

export default function LegalPage({ slug }: { slug: string }) {
  const page = pageBySlug(slug)!;
  return (
    <Shell page={page}>
      <article className="mx-auto max-w-3xl px-4 pb-24 pt-14 text-[15px] sm:px-6 sm:pt-20">
        <MarkdownDoc source={page.body!} />
      </article>
    </Shell>
  );
}
