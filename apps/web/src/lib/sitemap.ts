import type { SitemapDataResponse } from "@openrift/shared";

import { helpArticleList } from "@/components/help/articles";
import type { MetaEra } from "@/lib/meta-scope";
import { VALID_RULE_KINDS } from "@/lib/rules-kinds";

/**
 * Well under the protocol's 50,000 URLs per file, so a section can grow for a
 * while before it splits again.
 */
export const SITEMAP_FILE_LIMIT = 40_000;

/** The sitemap index sits at this path; every section file is named from it. */
export const SITEMAP_INDEX_PATH = "/sitemap.xml";

const SECTION_PATH = /^\/sitemap-(?<section>[a-z-]+?)(?:-(?<index>\d+))?\.xml$/u;

interface StaticPage {
  path: string;
  priority: string;
  changefreq: string;
  // Only listed while this feature flag is enabled — the route redirects away
  // when the flag is off, and crawlers shouldn't see URLs that depend on flag
  // state (same rationale as the help articles below).
  featureFlag?: string;
}

const STATIC_PAGES: StaticPage[] = [
  { path: "/", priority: "1.0", changefreq: "weekly" },
  { path: "/cards", priority: "0.8", changefreq: "weekly" },
  { path: "/sets", priority: "0.7", changefreq: "weekly" },
  { path: "/products", priority: "0.7", changefreq: "weekly" },
  // /promos always 302s to the EN page, so list the redirect target — sitemaps
  // should carry the final canonical URL (same rationale as the rules kinds).
  { path: "/promos/EN", priority: "0.6", changefreq: "weekly" },
  { path: "/meta", priority: "0.6", changefreq: "weekly", featureFlag: "meta" },
  { path: "/meta/events", priority: "0.6", changefreq: "weekly", featureFlag: "meta" },
  { path: "/meta/decks", priority: "0.5", changefreq: "weekly", featureFlag: "meta" },
  { path: "/meta/legends", priority: "0.5", changefreq: "weekly", featureFlag: "meta" },
  { path: "/rules", priority: "0.5", changefreq: "monthly" },
  { path: "/help", priority: "0.4", changefreq: "monthly" },
  { path: "/roadmap", priority: "0.3", changefreq: "monthly" },
  { path: "/changelog", priority: "0.3", changefreq: "weekly" },
  { path: "/developers", priority: "0.3", changefreq: "monthly", featureFlag: "developers" },
  { path: "/legal-notice", priority: "0.1", changefreq: "yearly" },
  { path: "/privacy-policy", priority: "0.1", changefreq: "yearly" },
];

export interface SitemapUrl {
  path: string;
  /** Date-only. */
  lastmod: string;
  changefreq: string;
  priority: string;
}

export interface SitemapInput {
  siteUrl: string;
  /** Date-only; the lastmod of everything shipped with the bundle. */
  deployDate: string;
  data: SitemapDataResponse;
  flags: Record<string, boolean>;
  /** Newest first, as `deriveSetEras` returns them. */
  eras: readonly MetaEra[];
}

const SECTIONS = ["site", "meta-events", "meta-decks", "meta-legends", "meta-players"] as const;

export type SitemapSection = (typeof SECTIONS)[number];

function isSection(value: string): value is SitemapSection {
  return (SECTIONS as readonly string[]).includes(value);
}

function siteUrls({ deployDate, data, flags }: SitemapInput): SitemapUrl[] {
  const urls: SitemapUrl[] = [];
  for (const page of STATIC_PAGES) {
    if (page.featureFlag !== undefined && flags[page.featureFlag] !== true) {
      continue;
    }
    urls.push({ ...page, lastmod: deployDate });
  }
  // Help articles are static content shipped with the bundle, so the deploy
  // date is the closest "lastmod" we have. Skip feature-flagged articles —
  // crawlers shouldn't see URLs that may 404 depending on flag state.
  for (const article of helpArticleList) {
    if (article.featureFlag) {
      continue;
    }
    urls.push({
      path: `/help/${article.slug}`,
      lastmod: deployDate,
      changefreq: "monthly",
      priority: "0.3",
    });
  }
  // Per-kind rules pages (core, tournament). Each 302s to its latest version,
  // but the kind URL is the stable, version-independent entry worth indexing.
  for (const kind of VALID_RULE_KINDS) {
    urls.push({
      path: `/rules/${kind}`,
      lastmod: deployDate,
      changefreq: "monthly",
      priority: "0.5",
    });
  }
  for (const entry of data.cards) {
    urls.push({
      path: `/cards/${entry.slug}`,
      lastmod: entry.updatedAt.slice(0, 10),
      changefreq: "monthly",
      priority: "0.7",
    });
  }
  for (const entry of data.sets) {
    urls.push({
      path: `/sets/${entry.slug}`,
      lastmod: entry.updatedAt.slice(0, 10),
      changefreq: "monthly",
      priority: "0.6",
    });
  }
  for (const entry of data.products) {
    urls.push({
      path: `/products/${entry.slug}`,
      lastmod: entry.updatedAt.slice(0, 10),
      changefreq: "monthly",
      priority: "0.6",
    });
  }
  return urls;
}

// The meta archive ships behind its flag (ADR-014), so its URLs stay out of
// the sitemap until it is on — same reason flagged static pages and help
// articles are skipped above.
function metaEventUrls({ data, flags, eras, deployDate }: SitemapInput): SitemapUrl[] {
  if (flags.meta !== true) {
    return [];
  }
  // The index opens on the current era; the older eras are only reachable by
  // their own URLs, so those are listed alongside the events themselves.
  const eraIndexes: SitemapUrl[] = eras.slice(1).map((era) => ({
    path: `/meta/events?era=${era.id}`,
    lastmod: deployDate,
    changefreq: "monthly",
    priority: "0.4",
  }));
  return [
    ...eraIndexes,
    ...data.metaEvents.map((entry) => ({
      path: `/meta/${entry.slug}`,
      lastmod: entry.updatedAt.slice(0, 10),
      changefreq: "monthly",
      priority: "0.6",
    })),
  ];
}

function metaLegendUrls({ data, flags }: SitemapInput): SitemapUrl[] {
  if (flags.meta !== true) {
    return [];
  }
  return data.metaLegends.map((entry) => ({
    path: `/meta/legends/${entry.slug}`,
    lastmod: entry.updatedAt.slice(0, 10),
    changefreq: "weekly",
    priority: "0.5",
  }));
}

function metaPlayerUrls({ data, flags }: SitemapInput): SitemapUrl[] {
  if (flags.meta !== true) {
    return [];
  }
  return data.metaPlayers.map((entry) => ({
    path: `/meta/players/${entry.slug}`,
    lastmod: entry.updatedAt.slice(0, 10),
    changefreq: "monthly",
    priority: "0.4",
  }));
}

function metaDeckUrls({ data, flags }: SitemapInput): SitemapUrl[] {
  if (flags.meta !== true) {
    return [];
  }
  return data.metaDecks.map((entry) => ({
    path: `/meta/decks/${entry.slug}`,
    lastmod: entry.updatedAt.slice(0, 10),
    changefreq: "monthly",
    priority: "0.5",
  }));
}

const SECTION_URLS: Record<SitemapSection, (input: SitemapInput) => SitemapUrl[]> = {
  site: siteUrls,
  "meta-events": metaEventUrls,
  "meta-decks": metaDeckUrls,
  "meta-legends": metaLegendUrls,
  "meta-players": metaPlayerUrls,
};

/** The section's URLs split into files of at most {@link SITEMAP_FILE_LIMIT}. */
export function sitemapSectionFiles(section: SitemapSection, input: SitemapInput): SitemapUrl[][] {
  const urls = SECTION_URLS[section](input);
  const files: SitemapUrl[][] = [];
  for (let start = 0; start < urls.length; start += SITEMAP_FILE_LIMIT) {
    files.push(urls.slice(start, start + SITEMAP_FILE_LIMIT));
  }
  return files;
}

/**
 * The path of one section file. A section that fits one file keeps a bare
 * name, so the common case never changes address when a split arrives.
 */
export function sitemapFilePath(section: SitemapSection, index: number, count: number): string {
  return count > 1 ? `/sitemap-${section}-${index + 1}.xml` : `/sitemap-${section}.xml`;
}

/**
 * Which section file a request is for.
 *
 * @returns The section and zero-based file index, or null for any other path.
 */
export function parseSitemapPath(
  pathname: string,
): { section: SitemapSection; index: number } | null {
  const match = SECTION_PATH.exec(pathname);
  const section = match?.groups?.section;
  if (match === null || section === undefined || !isSection(section)) {
    return null;
  }
  const number = match.groups?.index === undefined ? 1 : Number(match.groups.index);
  if (number < 1) {
    return null;
  }
  return { section, index: number - 1 };
}

/** The index every crawler starts from: one entry per section file that holds anything. */
export function renderSitemapIndex(input: SitemapInput): string {
  const entries: string[] = [];
  for (const section of SECTIONS) {
    const files = sitemapSectionFiles(section, input);
    files.forEach((urls, index) => {
      const lastmod = urls.reduce(
        (latest, url) => (url.lastmod > latest ? url.lastmod : latest),
        "",
      );
      entries.push(
        `  <sitemap><loc>${input.siteUrl}${sitemapFilePath(section, index, files.length)}</loc><lastmod>${lastmod}</lastmod></sitemap>`,
      );
    });
  }
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...entries,
    "</sitemapindex>",
  ].join("\n");
}

/**
 * One section file.
 *
 * @returns The urlset, or null when the section has no file at that index.
 */
export function renderSitemapFile(
  section: SitemapSection,
  index: number,
  input: SitemapInput,
): string | null {
  const urls = sitemapSectionFiles(section, input)[index];
  if (urls === undefined) {
    return null;
  }
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...urls.map(
      (url) =>
        `  <url><loc>${input.siteUrl}${url.path}</loc><lastmod>${url.lastmod}</lastmod><changefreq>${url.changefreq}</changefreq><priority>${url.priority}</priority></url>`,
    ),
    "</urlset>",
  ].join("\n");
}
