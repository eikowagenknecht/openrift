/**
 * SEO utilities for generating Open Graph, Twitter Card, and canonical meta tags.
 *
 * @returns Head meta/link arrays compatible with TanStack Start's `head()` function.
 */

const SITE_NAME = "OpenRift";
const DEFAULT_DESCRIPTION =
  "Browse, collect, and build decks for the Riftbound trading card game. Search cards, track your collection, compare prices, and share decks.";
const TWITTER_SITE = "@eikowagenknecht";

interface SeoOptions {
  /** Canonical origin for this deployment (from runtime env, not build time). */
  siteUrl: string;
  /** Page title (without site suffix). */
  title: string;
  /** Meta description for the page. */
  description?: string;
  /** Canonical URL path (e.g. "/cards"). Omit for no canonical tag. */
  path?: string;
  /** Open Graph image URL. Defaults to the static branded image on `siteUrl`. */
  ogImage?: string;
  /** Open Graph type. Defaults to "website". */
  ogType?: string;
  /** Whether to suppress OG/Twitter tags (e.g. for auth pages). */
  noIndex?: boolean;
}

/**
 * Generates meta and link arrays for a route's `head()` function.
 *
 * @returns An object with `meta` and `links` arrays.
 */
export function seoHead(options: SeoOptions) {
  const { siteUrl, title, path, ogType = "website", noIndex } = options;
  const ogImage = options.ogImage ?? `${siteUrl}/og-image.png`;
  const description = options.description ?? DEFAULT_DESCRIPTION;
  const siteSuffix = ` — ${SITE_NAME}`;
  const alreadyBranded =
    title === SITE_NAME || title.startsWith(`${SITE_NAME} `) || title.endsWith(siteSuffix);
  const fullTitle = alreadyBranded ? title : `${title}${siteSuffix}`;
  const canonicalUrl = path ? `${siteUrl}${path}` : undefined;

  const meta: Record<string, string>[] = [
    { title: fullTitle },
    { name: "description", content: description },
  ];

  if (noIndex) {
    meta.push({ name: "robots", content: "noindex, nofollow" });
  }

  if (!noIndex) {
    // Open Graph
    meta.push(
      { property: "og:title", content: fullTitle },
      { property: "og:description", content: description },
      { property: "og:type", content: ogType },
      { property: "og:image", content: ogImage },
      { property: "og:site_name", content: SITE_NAME },
    );
    if (canonicalUrl) {
      meta.push({ property: "og:url", content: canonicalUrl });
    }

    // Twitter Card
    meta.push(
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:site", content: TWITTER_SITE },
      { name: "twitter:title", content: fullTitle },
      { name: "twitter:description", content: description },
      { name: "twitter:image", content: ogImage },
    );
  }

  const links: Record<string, string>[] = [];
  if (canonicalUrl) {
    links.push({ rel: "canonical", href: canonicalUrl });
  }

  return { meta, links };
}

/**
 * Schema.org WebSite JSON-LD for the homepage. Enables the sitelinks search box
 * in Google search results.
 *
 * @returns A script descriptor for TanStack Start's `head.scripts`.
 */
export function websiteJsonLd(siteUrl: string) {
  return {
    type: "application/ld+json",
    children: JSON.stringify({
      "@context": "https://schema.org",
      "@type": "WebSite",
      name: SITE_NAME,
      url: siteUrl,
      description: DEFAULT_DESCRIPTION,
      potentialAction: {
        "@type": "SearchAction",
        target: {
          "@type": "EntryPoint",
          urlTemplate: `${siteUrl}/cards?q={search_term_string}`,
        },
        "query-input": "required name=search_term_string",
      },
    }),
  };
}

interface BreadcrumbItem {
  name: string;
  path: string;
}

/**
 * Schema.org BreadcrumbList JSON-LD for hierarchical pages.
 *
 * @returns A script descriptor for TanStack Start's `head.scripts`.
 */
export function breadcrumbJsonLd(siteUrl: string, items: BreadcrumbItem[]) {
  return {
    type: "application/ld+json",
    children: JSON.stringify({
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: items.map((item, index) => ({
        "@type": "ListItem",
        position: index + 1,
        name: item.name,
        item: `${siteUrl}${item.path}`,
      })),
    }),
  };
}

interface ProductJsonLdOptions {
  siteUrl: string;
  name: string;
  description: string;
  image?: string;
  url: string;
  /** Lowest market price in USD across all printings. */
  priceLow?: number;
  /** Highest market price in USD across all printings. */
  priceHigh?: number;
}

/**
 * Schema.org Product JSON-LD for card detail pages. Enables price/availability
 * rich results in Google.
 *
 * @returns A script descriptor for TanStack Start's `head.scripts`.
 */
export function productJsonLd(options: ProductJsonLdOptions) {
  const offer =
    options.priceLow === undefined
      ? undefined
      : options.priceLow === options.priceHigh || options.priceHigh === undefined
        ? {
            "@type": "Offer",
            priceCurrency: "USD",
            price: options.priceLow,
            availability: "https://schema.org/InStock",
          }
        : {
            "@type": "AggregateOffer",
            priceCurrency: "USD",
            lowPrice: options.priceLow,
            highPrice: options.priceHigh,
            availability: "https://schema.org/InStock",
          };

  return {
    type: "application/ld+json",
    children: JSON.stringify({
      "@context": "https://schema.org",
      "@type": "Product",
      name: options.name,
      description: options.description,
      image: options.image,
      url: `${options.siteUrl}${options.url}`,
      brand: { "@type": "Brand", name: "Riftbound" },
      ...(offer ? { offers: offer } : {}),
    }),
  };
}

interface FaqEntry {
  question: string;
  answer: string;
}

/**
 * Schema.org FAQPage JSON-LD. Can trigger FAQ rich results in Google.
 *
 * @returns A script descriptor for TanStack Start's `head.scripts`.
 */
export function faqPageJsonLd(entries: FaqEntry[]) {
  return {
    type: "application/ld+json",
    children: JSON.stringify({
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: entries.map((entry) => ({
        "@type": "Question",
        name: entry.question,
        acceptedAnswer: {
          "@type": "Answer",
          text: entry.answer,
        },
      })),
    }),
  };
}
