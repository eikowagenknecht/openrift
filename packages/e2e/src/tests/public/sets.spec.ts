import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";

import { API_BASE_URL, WEB_BASE_URL } from "../../helpers/constants.js";

interface SetListEntryFixture {
  id: string;
  slug: string;
  name: string;
  setType: "main" | "supplemental";
  cardCount: number;
  printingCount: number;
  releasedAt: string | null;
  coverImage: { full: string; thumbnail: string } | null;
}

interface SetListResponseFixture {
  sets: SetListEntryFixture[];
}

interface SetDetailResponseFixture {
  set: { id: string; slug: string; name: string; setType: string; releasedAt: string | null };
  cards: Record<string, { id: string; slug: string; name: string }>;
  printings: { id: string; cardId: string; language: string }[];
}

interface CardDetailFixture {
  card: { slug: string; name: string };
  printings: { id: string; setId: string }[];
  sets: { id: string; slug: string; name: string }[];
}

async function fetchSetList(): Promise<SetListResponseFixture> {
  const res = await fetch(`${API_BASE_URL}/api/v1/sets`);
  if (!res.ok) {
    throw new Error(`Sets list fetch failed: ${res.status}`);
  }
  return (await res.json()) as SetListResponseFixture;
}

async function fetchSetDetail(slug: string): Promise<SetDetailResponseFixture> {
  const res = await fetch(`${API_BASE_URL}/api/v1/sets/${encodeURIComponent(slug)}`);
  if (!res.ok) {
    throw new Error(`Set detail ${slug} fetch failed: ${res.status}`);
  }
  return (await res.json()) as SetDetailResponseFixture;
}

async function fetchCardDetail(slug: string): Promise<CardDetailFixture> {
  const res = await fetch(`${API_BASE_URL}/api/v1/cards/${encodeURIComponent(slug)}`);
  if (!res.ok) {
    throw new Error(`Card detail ${slug} fetch failed: ${res.status}`);
  }
  return (await res.json()) as CardDetailFixture;
}

// Identifies a specific server fn out of the bundle of server fns that run
// during a route transition. TanStack Start encodes each server fn's id as
// base64url(JSON) that references the source file + export name.
function matchesServerFn(url: string, fnName: string): boolean {
  const match = url.match(/\/_serverFn\/([^/?#]+)/);
  if (!match) {
    return false;
  }
  try {
    return Buffer.from(match[1], "base64url").toString("utf8").includes(fnName);
  } catch {
    return false;
  }
}

async function readJsonLdScripts(page: Page) {
  const texts = await page.locator('script[type="application/ld+json"]').allInnerTexts();
  // oxlint-disable-next-line typescript-eslint/no-unsafe-return -- JSON-LD payloads are dynamically shaped.
  return texts.map((text) => JSON.parse(text));
}

let listResponse: SetListResponseFixture;
let knownSet: { slug: string; name: string };
let hasSupplementalSets: boolean;
let hasMainSets: boolean;

test.beforeAll(async () => {
  listResponse = await fetchSetList();
  const mainSets = listResponse.sets.filter((entry) => entry.setType === "main");
  const supplementalSets = listResponse.sets.filter((entry) => entry.setType !== "main");
  hasMainSets = mainSets.length > 0;
  hasSupplementalSets = supplementalSets.length > 0;
  // Prefer the first main set; fall back to any supplemental set when the
  // current seed has none so the spec still exercises HeroSetCard rendering.
  const picked = mainSets[0] ?? listResponse.sets[0];
  if (!picked) {
    throw new Error("No sets returned from /api/v1/sets — seed data appears empty");
  }
  knownSet = { slug: picked.slug, name: picked.name };
});

test.describe("sets", () => {
  test.describe("/sets index", () => {
    test("renders the page heading, document title, and description meta", async ({ page }) => {
      await page.goto("/sets");

      await expect(page.getByRole("heading", { level: 1, name: "Card Sets" })).toBeVisible();
      await expect(page).toHaveTitle(/Card Sets — Riftbound/);
      await expect(page.locator('meta[name="description"]')).toHaveAttribute(
        "content",
        "Browse all Riftbound card sets. View cards, printings, and details for each set.",
      );
    });

    test("shows a HeroSetCard link for the known set with its name and href", async ({ page }) => {
      await page.goto("/sets");

      const link = page.getByRole("link", { name: knownSet.name }).first();
      await expect(link).toBeVisible();
      await expect(link).toHaveAttribute("href", `/sets/${knownSet.slug}`);
    });

    test("set card shows a card/printing count line", async ({ page }) => {
      await page.goto("/sets");

      const link = page.getByRole("link", { name: knownSet.name }).first();
      await expect(link).toContainText(/\d+ cards?, \d+ printings?/);
    });

    test("Supplemental Sets section mirrors the API's supplemental set presence", async ({
      page,
    }) => {
      await page.goto("/sets");
      await expect(page.getByRole("heading", { level: 1, name: "Card Sets" })).toBeVisible();

      const heading = page.getByRole("heading", { level: 2, name: "Supplemental Sets" });
      await (hasSupplementalSets ? expect(heading).toBeVisible() : expect(heading).toHaveCount(0));
    });

    test("renders a main sets grid only when the API returns at least one main set", async ({
      page,
    }) => {
      await page.goto("/sets");
      await expect(page.getByRole("heading", { level: 1, name: "Card Sets" })).toBeVisible();

      // A main set card is any HeroSetCard outside the Supplemental Sets
      // section. We don't rely on DOM structure here — existence of at least
      // one non-supplemental set's link is the user-visible signal.
      const mainSetName = listResponse.sets.find((entry) => entry.setType === "main")?.name;
      if (hasMainSets && mainSetName !== undefined) {
        await expect(page.getByRole("link", { name: mainSetName }).first()).toBeVisible();
      }
    });

    test("clicking the known set card navigates to /sets/<slug>", async ({ page }) => {
      await page.goto("/sets");

      await page.getByRole("link", { name: knownSet.name }).first().click();

      await expect(page).toHaveURL(new RegExp(`/sets/${knownSet.slug}$`));
      await expect(page.getByRole("heading", { level: 1, name: knownSet.name })).toBeVisible();
    });

    test("a slow sets list shows the pending skeleton before the heading", async ({ page }) => {
      // Start on the set detail page so we can trigger a client-side
      // navigation back to /sets — the intercept only fires for browser
      // fetches, not for the SSR path of an initial page.goto.
      await page.goto(`/sets/${knownSet.slug}`);
      await expect(page.getByRole("heading", { level: 1, name: knownSet.name })).toBeVisible();

      await page.route("**/_serverFn/**", async (route) => {
        if (matchesServerFn(route.request().url(), "fetchSetList")) {
          await new Promise((resolve) => setTimeout(resolve, 2000));
        }
        await route.continue();
      });

      await page.getByRole("link", { name: /all sets/i }).click();

      await expect(page.locator('[data-slot="skeleton"]').first()).toBeVisible({ timeout: 1500 });
      await expect(page.getByRole("heading", { level: 1, name: "Card Sets" })).toBeVisible({
        timeout: 10_000,
      });
    });

    test("a 500 from the sets list server fn renders the route error fallback", async ({
      page,
    }) => {
      await page.goto(`/sets/${knownSet.slug}`);
      await expect(page.getByRole("heading", { level: 1, name: knownSet.name })).toBeVisible();

      await page.route("**/_serverFn/**", async (route) => {
        if (matchesServerFn(route.request().url(), "fetchSetList")) {
          await route.fulfill({
            status: 500,
            contentType: "application/json",
            body: JSON.stringify({ error: "sets unavailable" }),
          });
          return;
        }
        await route.continue();
      });

      await page.getByRole("link", { name: /all sets/i }).click();

      await expect(page.getByRole("button", { name: "Reshuffle" })).toBeVisible({
        timeout: 10_000,
      });
    });
  });

  test.describe("/sets/:setSlug", () => {
    test("renders the heading, 'All sets' back link, and counts summary", async ({ page }) => {
      await page.goto(`/sets/${knownSet.slug}`);

      await expect(page.getByRole("heading", { level: 1, name: knownSet.name })).toBeVisible();

      const backLink = page.getByRole("link", { name: /all sets/i });
      await expect(backLink).toBeVisible();
      await expect(backLink).toHaveAttribute("href", "/sets");

      await expect(page.getByText(/\d+ cards?, \d+ printings?/).first()).toBeVisible();
    });

    test("title and description meta match the set detail SEO format", async ({ page }) => {
      const detail = await fetchSetDetail(knownSet.slug);
      const uniqueCardCount = new Set(detail.printings.map((printing) => printing.cardId)).size;
      const printingCount = detail.printings.length;

      await page.goto(`/sets/${knownSet.slug}`);

      await expect(page).toHaveTitle(`${knownSet.name} — Riftbound Card Set — OpenRift`);
      await expect(page.locator('meta[name="description"]')).toHaveAttribute(
        "content",
        new RegExp(`${uniqueCardCount} unique cards and ${printingCount} printings`),
      );
    });

    test("BreadcrumbList JSON-LD lists Sets then the set name", async ({ page }) => {
      await page.goto(`/sets/${knownSet.slug}`);

      const scripts = await readJsonLdScripts(page);
      const breadcrumb = scripts.find((script) => script["@type"] === "BreadcrumbList");
      expect(breadcrumb).toBeDefined();
      expect(breadcrumb.itemListElement).toHaveLength(2);
      expect(breadcrumb.itemListElement[0].name).toBe("Sets");
      expect(breadcrumb.itemListElement[0].item).toBe(`${WEB_BASE_URL}/sets`);
      expect(breadcrumb.itemListElement[1].name).toBe(knownSet.name);
      expect(breadcrumb.itemListElement[1].item).toBe(`${WEB_BASE_URL}/sets/${knownSet.slug}`);
    });

    test("grid renders card thumbnails and clicking one navigates to /cards/<slug>", async ({
      page,
    }) => {
      const detail = await fetchSetDetail(knownSet.slug);
      const firstCard = Object.values(detail.cards)[0];
      if (!firstCard) {
        throw new Error(`expected set ${knownSet.slug} to seed at least one card`);
      }

      await page.goto(`/sets/${knownSet.slug}`);

      const thumbnail = page.getByAltText(firstCard.name).first();
      await expect(thumbnail).toBeVisible({ timeout: 10_000 });

      await thumbnail.click();

      await expect(page).toHaveURL(/\/cards\/[^/?#]+$/);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    });

    // The set detail route declares `notFoundComponent` but its loader never
    // throws `notFound()` — a missing slug causes the API to 404, which the
    // queryFn turns into a thrown Error and routes to `errorComponent`. So in
    // practice an invalid slug renders RouteErrorFallback (same "Reshuffle"
    // UI as the 500 case). Mirrors card-detail.spec.ts's behaviour.
    test("an unknown slug renders the route error fallback and keeps the URL", async ({ page }) => {
      await page.goto("/sets/does-not-exist-set", { waitUntil: "domcontentloaded" });

      await expect(page).toHaveURL(/\/sets\/does-not-exist-set$/);
      await expect(page.getByRole("button", { name: "Reshuffle" })).toBeVisible({
        timeout: 10_000,
      });
    });

    test("a 500 from the detail server fn renders the route error fallback", async ({ page }) => {
      await page.goto("/sets");
      await expect(page.getByRole("heading", { level: 1, name: "Card Sets" })).toBeVisible();

      await page.route("**/_serverFn/**", async (route) => {
        if (matchesServerFn(route.request().url(), "fetchSetDetail")) {
          await route.fulfill({
            status: 500,
            contentType: "application/json",
            body: JSON.stringify({ error: "set unavailable" }),
          });
          return;
        }
        await route.continue();
      });

      await page.getByRole("link", { name: knownSet.name }).first().click();

      await expect(page.getByRole("button", { name: "Reshuffle" })).toBeVisible({
        timeout: 10_000,
      });
    });

    test("a slow detail server fn shows the pending skeleton before the heading", async ({
      page,
    }) => {
      await page.goto("/sets");
      await expect(page.getByRole("heading", { level: 1, name: "Card Sets" })).toBeVisible();

      await page.route("**/_serverFn/**", async (route) => {
        if (matchesServerFn(route.request().url(), "fetchSetDetail")) {
          await new Promise((resolve) => setTimeout(resolve, 2000));
        }
        await route.continue();
      });

      await page.getByRole("link", { name: knownSet.name }).first().click();

      await expect(page.locator('[data-slot="skeleton"]').first()).toBeVisible({ timeout: 1500 });
      await expect(page.getByRole("heading", { level: 1, name: knownSet.name })).toBeVisible({
        timeout: 10_000,
      });
    });
  });

  test.describe("link from /cards/:cardSlug back to /sets/:setSlug", () => {
    const SEED_CARD_SLUG = "annie-fiery";

    test("clicking the set-row link on a card detail page navigates to /sets/<slug>", async ({
      page,
    }) => {
      const cardDetail = await fetchCardDetail(SEED_CARD_SLUG);
      const printing = cardDetail.printings[0];
      if (!printing) {
        throw new Error(`seed card ${SEED_CARD_SLUG} has no printings`);
      }
      const printingSet = cardDetail.sets.find((entry) => entry.id === printing.setId);
      if (!printingSet) {
        throw new Error(`set ${printing.setId} missing from card detail response`);
      }

      await page.goto(`/cards/${SEED_CARD_SLUG}`);

      const setLink = page
        .getByRole("link", {
          name: new RegExp(`^${printingSet.slug.toUpperCase()}\\b`, "i"),
        })
        .first();
      await expect(setLink).toBeVisible();
      await expect(setLink).toHaveAttribute("href", `/sets/${printingSet.slug}`);

      await setLink.click();

      await expect(page).toHaveURL(new RegExp(`/sets/${printingSet.slug}$`));
      await expect(page.getByRole("heading", { level: 1, name: printingSet.name })).toBeVisible();
    });
  });
});
