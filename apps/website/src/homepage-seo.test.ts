import { describe, expect, it } from "vitest";
import { FAQ_ITEMS, SITE_DESCRIPTION, SITE_NAME } from "./homepage-copy";
import {
  HOME_CANONICAL,
  HOME_FONTS_STYLESHEET,
  OG_DESCRIPTION,
  OG_IMAGE_URL,
  buildFaqPageJsonLd,
  buildHomeFontHead,
  buildHomepageSeoHead,
  buildSoftwareApplicationJsonLd,
  homeHeadline,
  homeOgTitle,
} from "./homepage-seo";

describe("homepage SEO helpers", () => {
  it("builds an absolute OG title from the shared headline", () => {
    expect(homeHeadline()).toBe("One window — every project, every agent");
    expect(homeOgTitle()).toBe(
      "Silo — One window — every project, every agent",
    );
  });

  it("emits FAQPage JSON-LD covering every FAQ item", () => {
    const ld = buildFaqPageJsonLd();
    expect(ld["@type"]).toBe("FAQPage");
    expect(ld.mainEntity).toHaveLength(FAQ_ITEMS.length);
    expect(ld.mainEntity[0]).toEqual({
      "@type": "Question",
      name: FAQ_ITEMS[0].question,
      acceptedAnswer: {
        "@type": "Answer",
        text: FAQ_ITEMS[0].answer,
      },
    });
  });

  it("emits SoftwareApplication JSON-LD with free offer + absolute image", () => {
    const ld = buildSoftwareApplicationJsonLd();
    expect(ld["@type"]).toBe("SoftwareApplication");
    expect(ld.name).toBe(SITE_NAME);
    expect(ld.description).toBe(SITE_DESCRIPTION);
    expect(ld.url).toBe(HOME_CANONICAL);
    expect(ld.image).toBe(OG_IMAGE_URL);
    expect(ld.offers).toEqual({
      "@type": "Offer",
      price: "0",
      priceCurrency: "USD",
    });
    expect(ld.sameAs).toEqual([
      "https://github.com/silo-code/silo",
      "https://x.com/silo_code",
      "https://extensions.getsilo.dev",
    ]);
  });

  it("buildHomeFontHead returns preconnects + Manrope/DM Mono stylesheet", () => {
    expect(buildHomeFontHead()).toEqual([
      ["link", { rel: "preconnect", href: "https://fonts.googleapis.com" }],
      [
        "link",
        {
          rel: "preconnect",
          href: "https://fonts.gstatic.com",
          crossorigin: "",
        },
      ],
      ["link", { rel: "stylesheet", href: HOME_FONTS_STYLESHEET }],
    ]);
  });

  it("includes canonical, OG/Twitter image tags, and both JSON-LD scripts", () => {
    const head = buildHomepageSeoHead();
    const metas = Object.fromEntries(
      head
        .filter((t) => t[0] === "meta")
        .map((t) => [
          (t[1] as Record<string, string>).property ??
            (t[1] as Record<string, string>).name,
          (t[1] as Record<string, string>).content,
        ]),
    );
    const links = head.filter((t) => t[0] === "link");
    const canonical = links.find(
      (t) => (t[1] as { rel?: string }).rel === "canonical",
    );
    const fontStylesheet = links.find(
      (t) =>
        (t[1] as { rel?: string }).rel === "stylesheet" &&
        (t[1] as { href?: string }).href === HOME_FONTS_STYLESHEET,
    );
    const preconnects = links.filter(
      (t) => (t[1] as { rel?: string }).rel === "preconnect",
    );
    const scripts = head.filter((t) => t[0] === "script");

    expect(canonical?.[1]).toEqual({ rel: "canonical", href: HOME_CANONICAL });
    expect(preconnects.map((t) => (t[1] as { href: string }).href)).toEqual([
      "https://fonts.googleapis.com",
      "https://fonts.gstatic.com",
    ]);
    expect(fontStylesheet).toBeDefined();
    // Fonts precede SEO tags so the browser discovers them first.
    expect(head.indexOf(fontStylesheet!)).toBeLessThan(
      head.indexOf(canonical!),
    );
    expect(metas["og:image"]).toBe(OG_IMAGE_URL);
    expect(metas["og:image"]).toMatch(/^https:\/\//);
    expect(metas["twitter:image"]).toBe(OG_IMAGE_URL);
    expect(metas["twitter:card"]).toBe("summary_large_image");
    expect(metas["og:description"]).toBe(OG_DESCRIPTION);
    expect(metas["og:url"]).toBe(HOME_CANONICAL);
    expect(metas["og:type"]).toBe("website");
    expect(scripts).toHaveLength(2);
    expect(scripts.every((t) => t[1].type === "application/ld+json")).toBe(
      true,
    );
    expect(JSON.parse(scripts[0][2] as string)["@type"]).toBe(
      "SoftwareApplication",
    );
    expect(JSON.parse(scripts[1][2] as string)["@type"]).toBe("FAQPage");
  });

  it("returns empty FAQPage mainEntity for an empty FAQ list", () => {
    expect(buildFaqPageJsonLd([]).mainEntity).toEqual([]);
  });
});
