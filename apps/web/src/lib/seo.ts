/**
 * SEO utilities for generating Open Graph, Twitter Card, and canonical meta tags.
 *
 * @returns Head meta/link arrays compatible with TanStack Start's `head()` function.
 */

import { getSiteUrl } from "./site-config";

const SITE_NAME = "OpenRift";
const DEFAULT_DESCRIPTION =
  "Browse, collect, and build decks for the Riftbound trading card game. Search cards, track your collection, compare prices, and share decks.";
const TWITTER_SITE = "@eikowagenknecht";

/**
 * Resolves an image URL against `siteUrl` so og:image / twitter:image always
 * carry an absolute URL (some unfurl crawlers reject relative ones).
 *
 * @returns The absolute URL, or `undefined` when no input was given.
 */
export function toAbsoluteUrl(siteUrl: string, imageUrl: string | undefined): string | undefined {
  if (!imageUrl) {
    return undefined;
  }
  if (imageUrl.startsWith("http://") || imageUrl.startsWith("https://")) {
    return imageUrl;
  }
  return `${siteUrl}${imageUrl.startsWith("/") ? "" : "/"}${imageUrl}`;
}

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
 * Head meta for admin pages. Prefixes the tab title with "Admin · " and
 * marks the page noindex so admin URLs never show up in search results.
 *
 * @returns Head meta/link arrays compatible with TanStack Start's `head()` function.
 */
export function adminSeoHead(title: string) {
  return seoHead({
    siteUrl: getSiteUrl(),
    title: `Admin · ${title}`,
    noIndex: true,
  });
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

interface MarketplaceOffer {
  /** Display name of the third-party seller (e.g. "TCGplayer"). */
  seller: string;
  /** ISO 4217 currency code matching the marketplace's prices. */
  currency: string;
  /** Lowest market price across all printings on this marketplace. */
  priceLow: number;
  /** Highest market price across all printings on this marketplace. */
  priceHigh: number;
}

interface ProductJsonLdOptions {
  siteUrl: string;
  name: string;
  description: string;
  image?: string;
  url: string;
  /** Per-marketplace price ranges. Each becomes an Offer or AggregateOffer attributed to its seller. */
  marketplaceOffers?: MarketplaceOffer[];
}

/**
 * Schema.org Product JSON-LD for card detail pages. Enables price rich results
 * in Google search. Each marketplace becomes a separately-attributed Offer so
 * the markup correctly identifies third-party sellers (OpenRift is not the
 * point of sale). Availability is intentionally omitted — we don't verify
 * real-time inventory on the affiliate target.
 *
 * @returns A script descriptor for TanStack Start's `head.scripts`.
 */
export function productJsonLd(options: ProductJsonLdOptions) {
  const offers = (options.marketplaceOffers ?? []).map((entry) => {
    const sellerNode = { "@type": "Organization", name: entry.seller };
    return entry.priceLow === entry.priceHigh
      ? {
          "@type": "Offer",
          priceCurrency: entry.currency,
          price: entry.priceLow,
          seller: sellerNode,
        }
      : {
          "@type": "AggregateOffer",
          priceCurrency: entry.currency,
          lowPrice: entry.priceLow,
          highPrice: entry.priceHigh,
          seller: sellerNode,
        };
  });

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
      ...(offers.length > 0 ? { offers } : {}),
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

interface OrganizationJsonLdOptions {
  /** Logo URL — absolute, served from `siteUrl`. */
  logo?: string;
  /** Profile URLs (GitHub, Discord, etc.) for `sameAs`. */
  sameAs?: readonly string[];
}

/**
 * Schema.org Organization JSON-LD. Site-wide; helps Google build a knowledge
 * panel and connect the site to its social profiles.
 *
 * @returns A script descriptor for TanStack Start's `head.scripts`.
 */
export function organizationJsonLd(siteUrl: string, options: OrganizationJsonLdOptions = {}) {
  return {
    type: "application/ld+json",
    children: JSON.stringify({
      "@context": "https://schema.org",
      "@type": "Organization",
      name: SITE_NAME,
      url: siteUrl,
      logo: options.logo ?? `${siteUrl}/logo.webp`,
      ...(options.sameAs && options.sameAs.length > 0 ? { sameAs: options.sameAs } : {}),
    }),
  };
}

interface CollectionItem {
  name: string;
  /** Path on this site (e.g. `/cards/lux`) or absolute URL. */
  url: string;
  image?: string;
}

interface CollectionPageJsonLdOptions {
  siteUrl: string;
  name: string;
  description: string;
  /** Path of the collection page itself (e.g. `/sets`). */
  path: string;
  /** Items in the list, in the order they should appear to crawlers. */
  items?: readonly CollectionItem[];
}

/**
 * Schema.org CollectionPage with an embedded ItemList. Used for index pages
 * (sets list, cards in a set, promos by channel) so crawlers see the page is
 * a structured listing rather than free prose.
 *
 * @returns A script descriptor for TanStack Start's `head.scripts`.
 */
export function collectionPageJsonLd(options: CollectionPageJsonLdOptions) {
  const { siteUrl, items = [] } = options;

  const itemList = {
    "@type": "ItemList",
    numberOfItems: items.length,
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      url: toAbsoluteUrl(siteUrl, item.url),
      name: item.name,
      ...(item.image ? { image: toAbsoluteUrl(siteUrl, item.image) } : {}),
    })),
  };

  return {
    type: "application/ld+json",
    children: JSON.stringify({
      "@context": "https://schema.org",
      "@type": "CollectionPage",
      name: options.name,
      description: options.description,
      url: `${siteUrl}${options.path}`,
      ...(items.length > 0 ? { mainEntity: itemList } : {}),
    }),
  };
}

interface ArticleJsonLdOptions {
  siteUrl: string;
  /** Article headline (typically the page title). */
  headline: string;
  description: string;
  /** Path of the article (e.g. `/help/import-export`). */
  path: string;
  /** ISO-8601 date the article was first published. */
  datePublished?: string;
  /** ISO-8601 date the article was last modified. */
  dateModified?: string;
  /** Author name. Defaults to the site name. */
  author?: string;
  /** Article image URL. */
  image?: string;
}

/**
 * Schema.org Article JSON-LD. Used for help articles and the changelog so
 * crawlers can present them as article rich results.
 *
 * @returns A script descriptor for TanStack Start's `head.scripts`.
 */
export function articleJsonLd(options: ArticleJsonLdOptions) {
  const url = `${options.siteUrl}${options.path}`;
  return {
    type: "application/ld+json",
    children: JSON.stringify({
      "@context": "https://schema.org",
      "@type": "Article",
      headline: options.headline,
      mainEntityOfPage: { "@type": "WebPage", "@id": url },
      url,
      inLanguage: "en",
      author: { "@type": "Organization", name: options.author ?? SITE_NAME },
      publisher: {
        "@type": "Organization",
        name: SITE_NAME,
        logo: { "@type": "ImageObject", url: `${options.siteUrl}/logo.webp` },
      },
      ...(options.description ? { description: options.description } : {}),
      ...(options.datePublished ? { datePublished: options.datePublished } : {}),
      ...(options.dateModified ? { dateModified: options.dateModified } : {}),
      ...(options.image ? { image: options.image } : {}),
    }),
  };
}
