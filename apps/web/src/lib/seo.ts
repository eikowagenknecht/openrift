// SEO utilities for generating Open Graph, Twitter Card, and canonical meta tags.

import { getSiteUrl } from "./site-config";

const SITE_NAME = "OpenRift";
const DEFAULT_DESCRIPTION =
  "Browse, collect, and build decks for the Riftbound trading card game. Search cards, track your collection, compare prices, and share decks.";
const TWITTER_SITE = "@eikowagenknecht";

// Some unfurl crawlers reject relative og:image / twitter:image URLs.
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
  siteUrl: string;
  title: string;
  description?: string;
  path?: string;
  ogImage?: string;
  ogType?: string;
  oembed?: boolean;
  noIndex?: boolean;
  unlisted?: boolean;
}

export function seoHead(options: SeoOptions) {
  const { siteUrl, title, path, ogType = "website", noIndex, unlisted } = options;
  const ogImage = options.ogImage ?? `${siteUrl}/og-image.png`;
  const description = options.description ?? DEFAULT_DESCRIPTION;
  // Plain hyphen: Google rewrites the suffix to its own "- Site" separator anyway.
  const siteSuffix = ` - ${SITE_NAME}`;
  const alreadyBranded =
    title === SITE_NAME || title.startsWith(`${SITE_NAME} `) || title.endsWith(siteSuffix);
  const fullTitle = alreadyBranded ? title : `${title}${siteSuffix}`;
  const canonicalUrl = path ? `${siteUrl}${path}` : undefined;

  const meta: Record<string, string>[] = [
    { title: fullTitle },
    { name: "description", content: description },
  ];

  if (noIndex || unlisted) {
    meta.push({ name: "robots", content: "noindex, nofollow" });
  }

  if (!noIndex) {
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
  if (options.oembed && canonicalUrl) {
    links.push({
      rel: "alternate",
      type: "application/json+oembed",
      href: `${siteUrl}/api/v1/oembed?url=${encodeURIComponent(canonicalUrl)}&format=json`,
      title: fullTitle,
    });
  }

  return { meta, links };
}

export function adminSeoHead(title: string) {
  return seoHead({
    siteUrl: getSiteUrl(),
    title: `Admin · ${title}`,
    noIndex: true,
  });
}

// Enables the sitelinks search box in Google search results.
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
  seller: string;
  currency: string;
  priceLow: number;
  priceHigh: number;
  offerCount?: number;
}

interface ProductJsonLdOptions {
  siteUrl: string;
  name: string;
  description: string;
  image?: string;
  url: string;
  marketplaceOffers?: MarketplaceOffer[];
}

// Availability is omitted: a bare Product (no offers/review/rating) is
// flagged invalid in Search Console.
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
          ...(entry.offerCount === undefined ? {} : { offerCount: entry.offerCount }),
          seller: sellerNode,
        };
  });

  if (offers.length === 0) {
    return null;
  }

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
      offers,
    }),
  };
}

interface FaqEntry {
  question: string;
  answer: string;
}

// Can trigger FAQ rich results in Google.
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
  logo?: string;
  sameAs?: readonly string[];
}

// Helps Google build a knowledge panel linking the site to its social profiles.
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
  url: string;
  image?: string;
}

interface CollectionPageJsonLdOptions {
  siteUrl: string;
  name: string;
  description: string;
  path: string;
  items?: readonly CollectionItem[];
}

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
  headline: string;
  description: string;
  path: string;
  datePublished?: string;
  dateModified?: string;
  author?: string;
  image?: string;
}

// Used for help articles and the changelog to render as article rich results.
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
