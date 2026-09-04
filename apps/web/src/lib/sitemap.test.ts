import type { SitemapDataResponse } from "@openrift/shared";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/components/help/articles", () => ({
  helpArticleList: [
    { slug: "getting-started" },
    { slug: "flagged-article", featureFlag: "someFlag" },
  ],
}));

// oxlint-disable-next-line import/first -- must import after vi.mock
import type { SitemapInput } from "./sitemap";
// oxlint-disable-next-line import/first -- must import after vi.mock
import {
  parseSitemapPath,
  renderSitemapFile,
  renderSitemapIndex,
  SITEMAP_FILE_LIMIT,
  sitemapFilePath,
  sitemapSectionFiles,
} from "./sitemap";

function entries(prefix: string, count: number): SitemapDataResponse["cards"] {
  return Array.from({ length: count }, (_, index) => ({
    slug: `${prefix}-${index}`,
    updatedAt: "2026-08-01T12:00:00.000Z",
  }));
}

function input(overrides: Partial<SitemapInput> = {}): SitemapInput {
  return {
    siteUrl: "https://example.test",
    deployDate: "2026-09-04",
    flags: { meta: true },
    eras: [
      { id: "vendetta", label: "Vendetta", from: "2026-08-01", to: null },
      { id: "origins", label: "Origins", from: "2026-01-01", to: "2026-07-31" },
    ],
    data: {
      cards: entries("card", 2),
      sets: entries("set", 1),
      products: [],
      metaEvents: [{ slug: "rq-barcelona", updatedAt: "2026-08-26T10:00:00.000Z" }],
      metaDecks: [{ slug: "aB3dE5gH7jK9", updatedAt: "2026-08-27T10:00:00.000Z" }],
      metaLegends: [{ slug: "kennen-heart-of-the-tempest", updatedAt: "2026-08-28T10:00:00.000Z" }],
      metaPlayers: [{ slug: "u364017", updatedAt: "2026-08-29T10:00:00.000Z" }],
    },
    ...overrides,
  };
}

const locs = (xml: string) =>
  [...xml.matchAll(/<loc>(?<url>[^<]+)<\/loc>/gu)].map((match) => match.groups?.url);

describe("renderSitemapIndex", () => {
  it("points at one file per section that holds anything", () => {
    const xml = renderSitemapIndex(input());
    expect(xml).toContain("<sitemapindex");
    expect(locs(xml)).toEqual([
      "https://example.test/sitemap-site.xml",
      "https://example.test/sitemap-meta-events.xml",
      "https://example.test/sitemap-meta-decks.xml",
      "https://example.test/sitemap-meta-legends.xml",
      "https://example.test/sitemap-meta-players.xml",
    ]);
  });

  it("dates each file by its newest entry", () => {
    const xml = renderSitemapIndex(input());
    expect(xml).toContain("sitemap-meta-decks.xml</loc><lastmod>2026-08-27</lastmod>");
  });

  it("leaves the archive out while its flag is off", () => {
    const xml = renderSitemapIndex(input({ flags: {} }));
    expect(locs(xml)).toEqual(["https://example.test/sitemap-site.xml"]);
  });

  it("numbers the files of a section that outgrows one", () => {
    const xml = renderSitemapIndex(
      input({ data: { ...input().data, metaDecks: entries("deck", SITEMAP_FILE_LIMIT + 1) } }),
    );
    expect(locs(xml)).toContain("https://example.test/sitemap-meta-decks-1.xml");
    expect(locs(xml)).toContain("https://example.test/sitemap-meta-decks-2.xml");
    expect(locs(xml)).not.toContain("https://example.test/sitemap-meta-decks.xml");
  });
});

describe("sitemapSectionFiles", () => {
  it("fills a file to the limit before opening the next", () => {
    const files = sitemapSectionFiles(
      "meta-decks",
      input({ data: { ...input().data, metaDecks: entries("deck", SITEMAP_FILE_LIMIT + 1) } }),
    );
    expect(files.map((file) => file.length)).toEqual([SITEMAP_FILE_LIMIT, 1]);
  });

  it("holds the static pages, help, rules, cards, sets and products in the site file", () => {
    const [file] = sitemapSectionFiles("site", input());
    const paths = file.map((url) => url.path);
    expect(paths).toContain("/");
    expect(paths).toContain("/meta/decks");
    expect(paths).toContain("/help/getting-started");
    expect(paths).not.toContain("/help/flagged-article");
    expect(paths).toContain("/rules/core");
    expect(paths).toContain("/cards/card-0");
    expect(paths).toContain("/sets/set-0");
  });

  it("drops flag-gated static pages while their flag is off", () => {
    const [file] = sitemapSectionFiles("site", input({ flags: {} }));
    const paths = file.map((url) => url.path);
    expect(paths).not.toContain("/meta");
    expect(paths).not.toContain("/developers");
  });
});

describe("renderSitemapFile", () => {
  it("renders a section's urls with date-only lastmods", () => {
    const xml = renderSitemapFile("meta-events", 0, input());
    expect(xml).toContain(
      "<url><loc>https://example.test/meta/rq-barcelona</loc><lastmod>2026-08-26</lastmod>",
    );
  });

  it("lists the older eras' index views beside the events", () => {
    const xml = renderSitemapFile("meta-events", 0, input());
    expect(locs(xml ?? "")).toEqual([
      "https://example.test/meta/events?era=origins",
      "https://example.test/meta/rq-barcelona",
    ]);
  });

  it("lists legend and player pages", () => {
    expect(locs(renderSitemapFile("meta-legends", 0, input()) ?? "")).toEqual([
      "https://example.test/meta/legends/kennen-heart-of-the-tempest",
    ]);
    expect(locs(renderSitemapFile("meta-players", 0, input()) ?? "")).toEqual([
      "https://example.test/meta/players/u364017",
    ]);
  });

  it("answers null for a file the section does not have", () => {
    expect(renderSitemapFile("meta-events", 1, input())).toBeNull();
    expect(renderSitemapFile("meta-events", 0, input({ flags: {} }))).toBeNull();
  });
});

describe("parseSitemapPath", () => {
  it("reads a bare section file as its first file", () => {
    expect(parseSitemapPath("/sitemap-meta-decks.xml")).toEqual({
      section: "meta-decks",
      index: 0,
    });
  });

  it("reads a numbered file", () => {
    expect(parseSitemapPath("/sitemap-meta-decks-2.xml")).toEqual({
      section: "meta-decks",
      index: 1,
    });
  });

  it("rejects anything that is not a section file", () => {
    expect(parseSitemapPath("/sitemap.xml")).toBeNull();
    expect(parseSitemapPath("/sitemap-unknown.xml")).toBeNull();
    expect(parseSitemapPath("/sitemap-site-0.xml")).toBeNull();
  });
});

describe("sitemapFilePath", () => {
  it("keeps a bare name until a section splits", () => {
    expect(sitemapFilePath("site", 0, 1)).toBe("/sitemap-site.xml");
    expect(sitemapFilePath("meta-decks", 1, 3)).toBe("/sitemap-meta-decks-2.xml");
  });
});
