/**
 * SEO utilities for generating Open Graph, Twitter Card, and canonical meta tags.
 *
 * @returns Head meta/link arrays compatible with TanStack Start's `head()` function.
 */

const SITE_NAME = "OpenRift";
const SITE_URL = "https://openrift.app";
const DEFAULT_OG_IMAGE = `${SITE_URL}/og-image.png`;
const DEFAULT_DESCRIPTION =
  "Browse, collect, and build decks for the Riftbound trading card game. Search cards, track your collection, compare prices, and share decks.";

interface SeoOptions {
  /** Page title (without site suffix). */
  title: string;
  /** Meta description for the page. */
  description?: string;
  /** Canonical URL path (e.g. "/cards"). Omit for no canonical tag. */
  path?: string;
  /** Open Graph image URL. Defaults to the static branded image. */
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
  const { title, path, ogImage = DEFAULT_OG_IMAGE, ogType = "website", noIndex } = options;
  const description = options.description ?? DEFAULT_DESCRIPTION;
  const fullTitle = title.includes(SITE_NAME) ? title : `${title} — ${SITE_NAME}`;
  const canonicalUrl = path ? `${SITE_URL}${path}` : undefined;

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
export function websiteJsonLd() {
  return {
    type: "application/ld+json",
    children: JSON.stringify({
      "@context": "https://schema.org",
      "@type": "WebSite",
      name: SITE_NAME,
      url: SITE_URL,
      description: DEFAULT_DESCRIPTION,
      potentialAction: {
        "@type": "SearchAction",
        target: {
          "@type": "EntryPoint",
          urlTemplate: `${SITE_URL}/cards?q={search_term_string}`,
        },
        "query-input": "required name=search_term_string",
      },
    }),
  };
}
