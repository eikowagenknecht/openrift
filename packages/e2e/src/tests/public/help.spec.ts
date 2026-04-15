import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";

import { WEB_BASE_URL } from "../../helpers/constants.js";

// Kept in sync with apps/web/src/components/help/articles.ts — the e2e
// package's tsconfig has no `@/*` alias into the web app, and the articles
// module pulls in lucide + lazy imports that don't load under node, so the
// slug/title/description triples are re-declared here.
const ARTICLES: { slug: string; title: string; description: string }[] = [
  {
    slug: "why-openrift",
    title: "Why OpenRift?",
    description:
      "A transparent comparison with other Riftbound card browsers: what we do well and where we're still catching up.",
  },
  {
    slug: "cards-printings-copies",
    title: "Cards, Printings & Copies",
    description: "What a card, a printing, and a copy are, and how the three levels connect.",
  },
  {
    slug: "collections",
    title: "Managing Your Collection",
    description:
      "Organize cards by where they physically are — deck boxes, binders, or lent to friends — and control which are available for deck building.",
  },
  {
    slug: "import-export",
    title: "Importing & Exporting",
    description:
      "Bring cards in from other tools via CSV and download your collection as a CSV export.",
  },
  {
    slug: "deck-building",
    title: "Building Decks",
    description:
      "Plan your deck by picking cards, filling zones, and validating against Constructed format rules.",
  },
  {
    slug: "proxy-printing",
    title: "Printing Proxies",
    description:
      "Print proxy PDFs from your decks for playtesting, with card images or text placeholders.",
  },
];

const INDEX_DESCRIPTION =
  "Guides and frequently asked questions for OpenRift, including collection management, deck building, and import/export.";

// Matches every heading in NOT_FOUND_HEADINGS in apps/web/src/components/error-message.tsx.
// The pick() helper hashes the pathname to choose one, so this test asserts
// that any of the known not-found headings rendered.
const NOT_FOUND_HEADING_REGEX =
  /Nothing here but dust|This card was never printed|Lost in the Rift|Page not found|You've wandered off the map|This page doesn't exist|No card at this address|The Rift has no record of this/;

async function readJsonLdScripts(page: Page): Promise<unknown[]> {
  const texts = await page.locator('script[type="application/ld+json"]').allInnerTexts();
  return texts.map((text) => JSON.parse(text) as unknown);
}

test.describe("help", () => {
  test.describe("index", () => {
    test("renders the help center with heading, title, and description meta", async ({ page }) => {
      await page.goto("/help");

      await expect(page.getByRole("heading", { level: 1, name: "Help Center" })).toBeVisible();
      await expect(page).toHaveTitle("Help — OpenRift");
      await expect(page.locator('meta[name="description"]')).toHaveAttribute(
        "content",
        INDEX_DESCRIPTION,
      );
    });

    test("each article renders as a link with its title", async ({ page }) => {
      await page.goto("/help");

      for (const article of ARTICLES) {
        const link = page.getByRole("link", { name: article.title });
        await expect(link).toBeVisible();
        await expect(link).toHaveAttribute("href", `/help/${article.slug}`);
      }
    });

    test("clicking a card navigates to the article", async ({ page }) => {
      await page.goto("/help");

      await page.getByRole("link", { name: "Cards, Printings & Copies" }).click();

      await expect(page).toHaveURL(/\/help\/cards-printings-copies$/);
      await expect(
        page.getByRole("heading", { level: 1, name: "Cards, Printings & Copies" }),
      ).toBeVisible();
    });

    test("FAQPage JSON-LD lists every non-flagged article as a question", async ({ page }) => {
      await page.goto("/help");

      const scripts = (await readJsonLdScripts(page)) as {
        "@type"?: string;
        mainEntity?: {
          "@type": string;
          name: string;
          acceptedAnswer: { "@type": string; text: string };
        }[];
      }[];
      const faq = scripts.find((script) => script["@type"] === "FAQPage");
      expect(faq, "FAQPage JSON-LD should be present").toBeDefined();
      expect(faq?.mainEntity).toHaveLength(ARTICLES.length);

      const entriesByName = new Map<string, string>();
      for (const entry of faq?.mainEntity ?? []) {
        expect(entry["@type"]).toBe("Question");
        expect(entry.acceptedAnswer["@type"]).toBe("Answer");
        entriesByName.set(entry.name, entry.acceptedAnswer.text);
      }
      for (const article of ARTICLES) {
        expect(entriesByName.get(article.title)).toBe(article.description);
      }
    });

    test("no robots meta is set (indexable)", async ({ page }) => {
      await page.goto("/help");
      await expect(page.locator('meta[name="robots"]')).toHaveCount(0);
    });
  });

  test.describe("article detail — valid slug", () => {
    for (const article of ARTICLES) {
      test(`/help/${article.slug} renders with correct head and breadcrumb JSON-LD`, async ({
        page,
      }) => {
        await page.goto(`/help/${article.slug}`);

        await expect(page.getByRole("heading", { level: 1, name: article.title })).toBeVisible();
        await expect(page).toHaveTitle(`${article.title} — Help — OpenRift`);
        await expect(page.locator('meta[name="description"]')).toHaveAttribute(
          "content",
          article.description,
        );

        const scripts = (await readJsonLdScripts(page)) as {
          "@type"?: string;
          itemListElement?: { name: string; item: string }[];
        }[];
        const breadcrumb = scripts.find((script) => script["@type"] === "BreadcrumbList");
        expect(breadcrumb, "BreadcrumbList JSON-LD should be present").toBeDefined();
        expect(breadcrumb?.itemListElement).toHaveLength(2);
        expect(breadcrumb?.itemListElement?.[0].name).toBe("Help");
        expect(breadcrumb?.itemListElement?.[0].item).toBe(`${WEB_BASE_URL}/help`);
        expect(breadcrumb?.itemListElement?.[1].name).toBe(article.title);
        expect(breadcrumb?.itemListElement?.[1].item).toBe(`${WEB_BASE_URL}/help/${article.slug}`);
      });
    }

    test("cards-printings-copies renders the article body", async ({ page }) => {
      await page.goto("/help/cards-printings-copies");

      await expect(page.getByText(/OpenRift organizes the Riftbound catalog/i)).toBeVisible({
        timeout: 15_000,
      });
    });

    test("breadcrumb Help link returns to /help", async ({ page }) => {
      await page.goto("/help/collections");

      await page.getByRole("link", { name: "Help" }).click();

      await expect(page).toHaveURL(/\/help$/);
      await expect(page.getByRole("heading", { level: 1, name: "Help Center" })).toBeVisible();
    });

    test("no robots meta is set on article pages (indexable)", async ({ page }) => {
      await page.goto("/help/collections");
      await expect(page.locator('meta[name="robots"]')).toHaveCount(0);
    });
  });

  test.describe("article detail — invalid slug", () => {
    test("unknown slug renders the RouteNotFoundFallback and keeps the URL", async ({ page }) => {
      await page.goto("/help/does-not-exist", { waitUntil: "domcontentloaded" });

      await expect(page.getByRole("heading", { level: 1 })).toHaveText(NOT_FOUND_HEADING_REGEX, {
        timeout: 10_000,
      });
      await expect(page.getByRole("link", { name: "Go home" })).toBeVisible();
      await expect(page).toHaveURL(/\/help\/does-not-exist$/);
    });
  });

  test.describe("feature-flag gating", () => {
    // No help article currently sets `featureFlag` in apps/web/src/components/help/articles.ts,
    // so the flag-gated loader branch has no coverage to exercise. When a flagged
    // article is added, extend this block with on/off cases following the pattern
    // in packages/e2e/src/tests/authenticated/collections-stats.spec.ts.
    test.skip("no feature-flagged help articles currently — add one to cover this branch", () => {});
  });
});
