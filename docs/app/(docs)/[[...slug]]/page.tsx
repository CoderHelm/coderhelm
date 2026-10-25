import { source, STATUS_LABEL } from '@/lib/source';
import {
  DocsBody,
  DocsDescription,
  DocsPage,
  DocsTitle,
  EditOnGitHub,
  MarkdownCopyButton,
  ViewOptionsPopover,
} from 'fumadocs-ui/layouts/docs/page';
import { notFound } from 'next/navigation';
import { getMDXComponents } from '@/components/mdx';
import type { Metadata } from 'next';
import { createRelativeLink } from 'fumadocs-ui/mdx';
import { SITE, editUrl, imagePath, markdownPath } from '@/lib/shared';
import { OpenAPIPage } from '@/components/api-page';

/** Where an endpoint page is edited: the gateway code its document comes from. */
const OPENAPI_EDIT_URL = 'https://github.com/CoderHelm/coderhelm-platform/blob/main/services/gateway/src/openapi.rs';

type Props = { params: Promise<{ slug?: string[] }> };

export default async function Page(props: Props) {
  const params = await props.params;
  const page = source.getPage(params.slug);
  if (!page) notFound();
  const md = markdownPath(page.slugs);

  // An endpoint, generated from the OpenAPI document.
  if (page.type === 'openapi') {
    return (
      <DocsPage full toc={page.data.toc}>
        <DocsTitle>{page.data.title}</DocsTitle>
        <div className="flex flex-row flex-wrap items-center gap-2 border-b pb-6">
          <MarkdownCopyButton markdownUrl={md} />
          <ViewOptionsPopover markdownUrl={md} githubUrl={OPENAPI_EDIT_URL} />
        </div>
        <DocsBody>
          <OpenAPIPage {...page.data.getOpenAPIPageProps()} />
        </DocsBody>
        <EditOnGitHub href={OPENAPI_EDIT_URL} />
      </DocsPage>
    );
  }

  const MDX = page.data.body;
  const edit = editUrl(page.path, page.data.editUrl);

  return (
    <DocsPage toc={page.data.toc} full={page.data.full}>
      <DocsTitle>
        {page.data.title}
        {page.data.status ? (
          <span className="ch-badge" data-status={page.data.status}>
            {STATUS_LABEL[page.data.status]}
          </span>
        ) : null}
      </DocsTitle>
      <DocsDescription className="mb-0">{page.data.description}</DocsDescription>
      <div className="flex flex-row flex-wrap items-center gap-2 border-b pb-6">
        <MarkdownCopyButton markdownUrl={md} />
        <ViewOptionsPopover markdownUrl={md} githubUrl={edit} />
      </div>
      <DocsBody>
        <MDX components={getMDXComponents({ a: createRelativeLink(source, page) })} />
      </DocsBody>
      <EditOnGitHub href={edit} />
    </DocsPage>
  );
}

export async function generateStaticParams() {
  return source.generateParams();
}

export async function generateMetadata(props: Props): Promise<Metadata> {
  const params = await props.params;
  const page = source.getPage(params.slug);
  if (!page) notFound();
  const image = imagePath(page.slugs).url;
  return {
    title: page.slugs.length === 0 ? { absolute: SITE.name } : page.data.title,
    description: page.data.description,
    alternates: {
      canonical: page.url,
      types: { 'text/markdown': markdownPath(page.slugs) },
    },
    openGraph: {
      title: page.data.title,
      description: page.data.description,
      url: page.url,
      siteName: SITE.name,
      type: 'article',
      images: image,
    },
    twitter: { card: 'summary_large_image', images: image },
  };
}
