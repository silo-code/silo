/** Homepage SEO helpers — shared by VitePress transformHead and unit tests.
 *  Keep meta copy aligned with homepage-copy.ts / apps/docs/index.md. */

import {
  FAQ_ITEMS,
  HEADLINE_LINE1,
  HEADLINE_LINE2,
  SITE_DESCRIPTION,
  SITE_NAME,
  type FaqItem,
} from "./homepage-copy.ts";

export { SITE_DESCRIPTION, SITE_NAME };

export const SITE_ORIGIN = "https://getsilo.dev";
export const HOME_CANONICAL = `${SITE_ORIGIN}/`;
export const OG_IMAGE_PATH = "/img/home/og.png";
export const OG_IMAGE_URL = `${SITE_ORIGIN}${OG_IMAGE_PATH}`;
export const OG_IMAGE_WIDTH = 1200;
export const OG_IMAGE_HEIGHT = 630;

/** Shorter social blurb — leads with audience, then the product promise. */
export const OG_DESCRIPTION =
  "For developers juggling coding agents. Terminals, agents, and layout stay intact — switch between them instantly. 100% open source, free forever.";

export function homeHeadline(): string {
  return `${HEADLINE_LINE1} ${HEADLINE_LINE2}`;
}

export function homeOgTitle(): string {
  return `${SITE_NAME} — ${homeHeadline()}`;
}

export function buildFaqPageJsonLd(faqs: FaqItem[] = FAQ_ITEMS) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqs.map((item) => ({
      "@type": "Question",
      name: item.question,
      acceptedAnswer: {
        "@type": "Answer",
        text: item.answer,
      },
    })),
  };
}

export function buildSoftwareApplicationJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: SITE_NAME,
    applicationCategory: "DeveloperApplication",
    operatingSystem: "macOS, Windows, Linux",
    offers: {
      "@type": "Offer",
      price: "0",
      priceCurrency: "USD",
    },
    description: SITE_DESCRIPTION,
    url: HOME_CANONICAL,
    downloadUrl: "https://github.com/silo-code/silo/releases/latest",
    license: "https://github.com/silo-code/silo/blob/main/LICENSE",
    image: OG_IMAGE_URL,
    sameAs: [
      "https://github.com/silo-code/silo",
      "https://x.com/silo_code",
      "https://extensions.getsilo.dev",
    ],
  };
}

/** VitePress `HeadConfig` tuples for the marketing homepage only. */
export type SeoHeadTuple =
  | [string, Record<string, string>]
  | [string, Record<string, string>, string];

export function buildHomepageSeoHead(): SeoHeadTuple[] {
  const ogTitle = homeOgTitle();
  return [
    ["link", { rel: "canonical", href: HOME_CANONICAL }],
    ["meta", { property: "og:type", content: "website" }],
    ["meta", { property: "og:site_name", content: SITE_NAME }],
    ["meta", { property: "og:url", content: HOME_CANONICAL }],
    ["meta", { property: "og:title", content: ogTitle }],
    ["meta", { property: "og:description", content: OG_DESCRIPTION }],
    ["meta", { property: "og:image", content: OG_IMAGE_URL }],
    ["meta", { property: "og:image:width", content: String(OG_IMAGE_WIDTH) }],
    ["meta", { property: "og:image:height", content: String(OG_IMAGE_HEIGHT) }],
    ["meta", { property: "og:image:alt", content: ogTitle }],
    ["meta", { name: "twitter:card", content: "summary_large_image" }],
    ["meta", { name: "twitter:title", content: ogTitle }],
    ["meta", { name: "twitter:description", content: OG_DESCRIPTION }],
    ["meta", { name: "twitter:image", content: OG_IMAGE_URL }],
    [
      "script",
      { type: "application/ld+json" },
      JSON.stringify(buildSoftwareApplicationJsonLd()),
    ],
    [
      "script",
      { type: "application/ld+json" },
      JSON.stringify(buildFaqPageJsonLd()),
    ],
  ];
}
