import type { Metadata } from "next";
import type { Page } from "@/content/types";
import { SITE, mdPath } from "@/content/site";

const OG_IMAGE = { url: `${SITE.url}/og-image.png`, width: 1200, height: 630, alt: `${SITE.name}: ${SITE.tagline}` };

export function pageMetadata(page: Page): Metadata {
  const url = `${SITE.url}${page.path}`;
  const title = page.slug === "" ? { absolute: page.title } : page.title;
  const fullTitle = page.slug === "" ? page.title : `${page.title} | ${SITE.name}`;
  return {
    title,
    description: page.description,
    alternates: {
      canonical: url,
      types: { "text/markdown": `${SITE.url}${mdPath(page)}` },
    },
    openGraph: {
      type: "website",
      siteName: SITE.name,
      locale: "en_US",
      url,
      title: fullTitle,
      description: page.description,
      images: [OG_IMAGE],
    },
    twitter: {
      card: "summary_large_image",
      title: fullTitle,
      description: page.description,
      images: [OG_IMAGE.url],
    },
  };
}

const ORG_ID = `${SITE.url}/#organization`;
const SITE_ID = `${SITE.url}/#website`;
const APP_ID = `${SITE.url}/#software`;

export function pageJsonLd(page: Page): object {
  const url = `${SITE.url}${page.path}`;
  const graph: object[] = [
    {
      "@type": "Organization",
      "@id": ORG_ID,
      name: SITE.name,
      alternateName: SITE.alternateNames,
      url: SITE.url,
      logo: `${SITE.url}/icon-512.png`,
      email: SITE.email,
      description: SITE.entity,
      sameAs: SITE.sameAs,
    },
    {
      "@type": "WebSite",
      "@id": SITE_ID,
      name: SITE.name,
      url: SITE.url,
      publisher: { "@id": ORG_ID },
      inLanguage: "en",
    },
    {
      "@type": "SoftwareApplication",
      "@id": APP_ID,
      name: SITE.name,
      applicationCategory: "DeveloperApplication",
      operatingSystem: "Web",
      url: SITE.url,
      description: SITE.entity,
      featureList: SITE.featureList,
      publisher: { "@id": ORG_ID },
    },
    {
      "@type": "WebPage",
      "@id": `${url}#webpage`,
      url,
      name: page.slug === "" ? page.title : `${page.title} | ${SITE.name}`,
      description: page.description,
      isPartOf: { "@id": SITE_ID },
      about: { "@id": APP_ID },
      dateModified: SITE.updated,
      inLanguage: "en",
      breadcrumb: { "@id": `${url}#breadcrumb` },
    },
    {
      "@type": "BreadcrumbList",
      "@id": `${url}#breadcrumb`,
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Home", item: `${SITE.url}/` },
        ...(page.slug === "" ? [] : [{ "@type": "ListItem", position: 2, name: page.navLabel, item: url }]),
      ],
    },
  ];
  // FAQ markup mirrors the visible FAQ on the page, word for word.
  const faqs = page.sections.flatMap((s) => s.blocks.filter((b) => b.type === "faq").flatMap((b) => (b.type === "faq" ? b.items : [])));
  if (faqs.length) {
    graph.push({
      "@type": "FAQPage",
      "@id": `${url}#faq`,
      isPartOf: { "@id": `${url}#webpage` },
      mainEntity: faqs.map((f) => ({
        "@type": "Question",
        name: f.q,
        acceptedAnswer: { "@type": "Answer", text: f.a.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1").replace(/`/g, "") },
      })),
    });
  }
  return { "@context": "https://schema.org", "@graph": graph };
}

// JSON inside <script> must not be able to close the tag.
export function jsonLdString(data: object): string {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}
