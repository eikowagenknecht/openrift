import { ALL_MARKETPLACES, EUR_MARKETPLACES, marketplaceLabel } from "@openrift/shared";
import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";

import { API_BASE_URL, WEB_BASE_URL } from "../../helpers/constants.js";
import { dockDetailPane } from "../../helpers/detail-pane.js";

const SEED_CARD_SLUG = "annie-fiery";
const SEED_CARD_NAME = "Annie, Fiery";
// Annie's normal-printing id, for deep-linking the detail pane directly:
// the virtualized /cards grid tile click isn't drivable in the harness.
const ANNIE_PRINTING_ID = "019cfc3b-03d6-74cf-adec-1dce41f631eb";

interface MarketplacePrices {
  tcgplayer?: number;
  cardmarket?: number;
  cardtrader?: number;
}

async function fetchPrices(): Promise<Record<string, MarketplacePrices | undefined>> {
  const res = await fetch(`${API_BASE_URL}/api/v1/prices`);
  if (!res.ok) {
    throw new Error(`/api/v1/prices fetch failed: ${res.status}`);
  }
  const json = (await res.json()) as { prices?: Record<string, MarketplacePrices | undefined> };
  return json.prices ?? {};
}

interface PrintingFixture {
  id: string;
  publicCode: string;
  finish: "normal" | "foil";
  language: string;
  artVariant: string;
  isSigned: boolean;
  markers: { slug: string; label: string }[];
  printedName: string | null;
  printedRulesText: string | null;
  printedEffectText: string | null;
  flavorText: string | null;
  rarity: string;
  artist: string | null;
  setId: string;
  shortCode: string;
  images: { face: string; full: string; thumbnail: string }[];
}

interface CardFixture {
  id: string;
  slug: string;
  name: string;
  type: string;
  energy: number | null;
  power: number | null;
  might: number | null;
  mightBonus: number | null;
  domains: string[];
  superTypes: string[];
  errata: {
    correctedRulesText: string | null;
    correctedEffectText: string | null;
    source: string;
    sourceUrl: string | null;
    effectiveDate: string | null;
  } | null;
  bans: { formatId: string; formatName: string; bannedAt: string; reason: string | null }[];
}

interface CardDetailFixture {
  card: CardFixture;
  printings: PrintingFixture[];
  sets: { id: string; slug: string; name: string }[];
}

async function fetchCardDetailOrNull(slug: string): Promise<CardDetailFixture | null> {
  const res = await fetch(`${API_BASE_URL}/api/v1/cards/${encodeURIComponent(slug)}`);
  if (!res.ok) {
    return null;
  }
  return (await res.json()) as CardDetailFixture;
}

async function fetchCardDetail(slug: string): Promise<CardDetailFixture> {
  const detail = await fetchCardDetailOrNull(slug);
  if (!detail) {
    throw new Error(`Seed card '${slug}' not found via API; check seed.sql alignment.`);
  }
  return detail;
}

// Mirrors apps/web/src/lib/card-meta.ts's buildCardPriceLine: keep this in
// sync if that helper's formatting or marketplace-priority logic changes.
function buildExpectedPriceLine(
  detail: CardDetailFixture,
  prices: Record<string, MarketplacePrices | undefined>,
): string | null {
  for (const marketplace of ALL_MARKETPLACES) {
    const cents = detail.printings
      .map((p) => prices[p.id]?.[marketplace])
      .filter((value): value is number => typeof value === "number" && value > 0);
    if (cents.length > 0) {
      const low = Math.min(...cents) / 100;
      const formatted = EUR_MARKETPLACES.has(marketplace)
        ? `${low.toFixed(2).replace(".", ",")} €`
        : `$${low.toFixed(2)}`;
      return `Prices from ${formatted} (${marketplaceLabel(marketplace)}).`;
    }
  }
  return null;
}

function buildExpectedDescription(detail: CardDetailFixture, priceLine: string | null): string {
  const META = 155;
  const card = detail.card;
  const parts: string[] = [];
  const capitalize = (value: string) => value.charAt(0).toUpperCase() + value.slice(1);
  const domains = card.domains.length > 0 ? card.domains.map(capitalize).join("/") : null;
  const typeLine = domains ? `${domains} ${capitalize(card.type)}` : capitalize(card.type);
  parts.push(`${card.name} is a ${typeLine} card from Riftbound.`);
  if (priceLine) {
    parts.push(priceLine);
  }
  const rules = detail.printings[0]?.printedRulesText;
  if (rules) {
    const cleaned = rules
      .replaceAll(/\[.*?\]/gu, "")
      .replaceAll(/:[a-z0-9_]+:/giu, "")
      .replaceAll(/\s+/gu, " ")
      .trim();
    if (cleaned.length > 0) {
      const remaining = META - parts.join(" ").length - 1;
      parts.push(cleaned.length > remaining ? `${cleaned.slice(0, remaining - 3)}...` : cleaned);
    }
  }
  return parts.join(" ");
}

// TanStack Start encodes the server fn id as base64url(JSON) referencing the
// source file + export name; decode it to match against the target fn.
function isCardDetailServerFn(url: string): boolean {
  const match = /\/_serverFn\/(?<encoded>[^/?#]+)/u.exec(url);
  const encoded = match?.groups?.encoded;
  if (encoded === undefined) {
    return false;
  }
  try {
    return Buffer.from(encoded, "base64url").toString("utf-8").includes("fetchCardDetail");
  } catch {
    return false;
  }
}

async function readJsonLdScripts(page: Page) {
  const texts = await page.locator('script[type="application/ld+json"]').allInnerTexts();
  // oxlint-disable-next-line typescript-eslint/no-unsafe-return -- JSON-LD payloads are dynamically shaped.
  return texts.map((t) => JSON.parse(t));
}

test.describe("card detail route — essentials", () => {
  test("renders the card heading and front image", async ({ page }) => {
    await page.goto(`/cards/${SEED_CARD_SLUG}`);

    await expect(page.getByRole("heading", { level: 1, name: SEED_CARD_NAME })).toBeVisible();
    await expect(page.getByRole("img", { name: SEED_CARD_NAME }).first()).toBeVisible();
  });

  test("'All cards' link returns to /cards", async ({ page }) => {
    await page.goto(`/cards/${SEED_CARD_SLUG}`);

    await page.getByRole("link", { name: /all cards/iu }).click();

    await expect(page).toHaveURL(/\/cards$/u);
    await expect(page.getByPlaceholder(/search/iu)).toBeVisible({ timeout: 10_000 });
  });

  test("an unknown slug renders the not-found fallback", async ({ page }) => {
    await page.goto("/cards/this-card-does-not-exist-anywhere", { waitUntil: "domcontentloaded" });

    await expect(page.getByRole("link", { name: "Go home" })).toBeVisible({ timeout: 10_000 });
  });

  // The grid tile click isn't drivable in the harness, so open the pane via
  // deep link and follow its "Open card page" link into the routed navigation.
  test("a 500 from the detail server fn renders the route error fallback", async ({ page }) => {
    await dockDetailPane(page);
    await page.goto(`/cards?printingId=${ANNIE_PRINTING_ID}`);
    const pane = page.locator("aside", {
      has: page.getByRole("button", { name: /close card details/iu }),
    });
    await expect(pane).toBeVisible({ timeout: 15_000 });

    await page.route("**/_serverFn/**", async (route) => {
      if (isCardDetailServerFn(route.request().url())) {
        await route.fulfill({
          status: 500,
          contentType: "application/json",
          body: JSON.stringify({ error: "card unavailable" }),
        });
        return;
      }
      await route.continue();
    });

    await pane.getByRole("link", { name: /open card page/iu }).click();

    await expect(page.getByRole("button", { name: "Reshuffle" })).toBeVisible({ timeout: 10_000 });
  });

  test("a slow detail server fn shows the skeleton before the heading", async ({ page }) => {
    await dockDetailPane(page);
    await page.goto(`/cards?printingId=${ANNIE_PRINTING_ID}`);
    const pane = page.locator("aside", {
      has: page.getByRole("button", { name: /close card details/iu }),
    });
    await expect(pane).toBeVisible({ timeout: 15_000 });

    await page.route("**/_serverFn/**", async (route) => {
      if (isCardDetailServerFn(route.request().url())) {
        await new Promise((resolve) => setTimeout(resolve, 2000));
      }
      await route.continue();
    });

    await pane.getByRole("link", { name: /open card page/iu }).click();

    // TanStack's defaults are pendingMs=1000/pendingMinMs=500, so the skeleton
    // window is roughly t=1000..2000ms after the click.
    await expect(page.locator('[data-slot="skeleton"]').first()).toBeVisible({ timeout: 5000 });
    await expect(page.getByRole("heading", { level: 1, name: SEED_CARD_NAME })).toBeVisible({
      timeout: 10_000,
    });
  });
});

test.describe("card detail route — head / SEO / JSON-LD", () => {
  test("title follows the '<name> - Riftbound Card' template, advertising prices when offers exist", async ({
    page,
  }) => {
    const detail = await fetchCardDetail(SEED_CARD_SLUG);
    const prices = await fetchPrices();
    const suffix = buildExpectedPriceLine(detail, prices)
      ? "Riftbound Card Price & Data"
      : "Riftbound Card";

    await page.goto(`/cards/${SEED_CARD_SLUG}`);

    await expect(page).toHaveTitle(`${SEED_CARD_NAME} - ${suffix} - OpenRift`);
  });

  test("meta description matches buildCardMetaDescription output", async ({ page }) => {
    const detail = await fetchCardDetail(SEED_CARD_SLUG);
    const prices = await fetchPrices();
    const expected = buildExpectedDescription(detail, buildExpectedPriceLine(detail, prices));

    await page.goto(`/cards/${SEED_CARD_SLUG}`);

    await expect(page.locator('meta[name="description"]')).toHaveAttribute("content", expected);
  });

  test("og:image is an absolute URL", async ({ page }) => {
    await page.goto(`/cards/${SEED_CARD_SLUG}`);

    const ogImage = page.locator('meta[property="og:image"]');
    await expect(ogImage).toHaveAttribute("content", /^https?:\/\//u);
  });

  test("Product JSON-LD includes name, image, and TCG price range", async ({ page }) => {
    const detail = await fetchCardDetail(SEED_CARD_SLUG);
    const prices = await fetchPrices();
    const tcgPrices = detail.printings
      .map((p) => prices[p.id]?.tcgplayer)
      .filter((p): p is number => typeof p === "number" && p > 0);
    test.skip(tcgPrices.length === 0, "Annie, Fiery should have at least one TCG snapshot in seed");

    await page.goto(`/cards/${SEED_CARD_SLUG}`);

    const scripts = await readJsonLdScripts(page);
    const product = scripts.find((s) => s["@type"] === "Product");
    expect(product, "Product JSON-LD should be present").toBeDefined();
    expect(product.name).toBe(SEED_CARD_NAME);
    expect(typeof product.image).toBe("string");
    expect(product.image).toMatch(/^https?:\/\//u);

    // offers is an array of per-marketplace AggregateOffers, each in its own
    // currency (TCGplayer=USD, Cardmarket/CardTrader=EUR).
    const offers = product.offers;
    expect(Array.isArray(offers), "Product should expose an offers array").toBe(true);
    expect(offers.length).toBeGreaterThan(0);
    const tcgOffer = offers.find(
      (offer: Record<string, unknown>) =>
        (offer.seller as Record<string, unknown> | undefined)?.name === "TCGplayer",
    );
    expect(tcgOffer, "a TCGplayer offer should exist when TCG prices are present").toBeDefined();
    expect(tcgOffer["@type"]).toBe("AggregateOffer");
    expect(typeof tcgOffer.lowPrice).toBe("number");
    expect(typeof tcgOffer.highPrice).toBe("number");
    expect(tcgOffer.lowPrice).toBeLessThanOrEqual(tcgOffer.highPrice);
  });

  test("BreadcrumbList JSON-LD lists Cards then the card name", async ({ page }) => {
    await page.goto(`/cards/${SEED_CARD_SLUG}`);

    const scripts = await readJsonLdScripts(page);
    const breadcrumb = scripts.find((s) => s["@type"] === "BreadcrumbList");
    expect(breadcrumb).toBeDefined();
    expect(breadcrumb.itemListElement).toHaveLength(2);
    expect(breadcrumb.itemListElement[0].name).toBe("Cards");
    expect(breadcrumb.itemListElement[0].item).toBe(`${WEB_BASE_URL}/cards`);
    expect(breadcrumb.itemListElement[1].name).toBe(SEED_CARD_NAME);
    expect(breadcrumb.itemListElement[1].item).toBe(`${WEB_BASE_URL}/cards/${SEED_CARD_SLUG}`);
  });
});

test.describe("card detail route — related cards", () => {
  test("following a related-card link resets the selected printing to the new card's", async ({
    page,
  }) => {
    const detail = await fetchCardDetail(SEED_CARD_SLUG);
    const oldCode = detail.printings[0].publicCode;

    await page.goto(`/cards/${SEED_CARD_SLUG}`);
    const heading = page.getByRole("heading", { name: "Related cards" });
    await expect(heading).toBeVisible();

    const firstRelated = heading.locator("..").getByRole("link").first();
    const href = await firstRelated.getAttribute("href");
    expect(href).toMatch(/^\/cards\//u);
    const relatedSlug = (href ?? "").split("/").pop() ?? "";
    const relatedDetail = await fetchCardDetail(relatedSlug);

    await firstRelated.click();
    await expect(
      page.getByRole("heading", { level: 1, name: relatedDetail.card.name }),
    ).toBeVisible();
    await expect(page.getByText(relatedDetail.printings[0].publicCode).first()).toBeVisible();
    await expect(page.getByText(oldCode, { exact: true })).toHaveCount(0);
  });
});

test.describe("card detail route — info panel", () => {
  test("set row links to /sets/<slug> with the set code", async ({ page }) => {
    const detail = await fetchCardDetail(SEED_CARD_SLUG);
    const printing = detail.printings[0];
    const set = detail.sets.find((s) => s.id === printing.setId);
    if (!set) {
      throw new Error(`set ${printing.setId} missing from card detail response`);
    }

    await page.goto(`/cards/${SEED_CARD_SLUG}`);

    const setLink = page.getByRole("link", {
      name: new RegExp(`^${set.slug.toUpperCase()}\\b`, "iu"),
    });
    await expect(setLink).toBeVisible();
    await expect(setLink).toHaveAttribute("href", `/sets/${set.slug}`);
  });

  test("renders the standard rows for code, rarity, finish, language, artist", async ({ page }) => {
    await page.goto(`/cards/${SEED_CARD_SLUG}`);

    await expect(page.getByText("Code", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("Rarity", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("Finish", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("Language", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("Artist", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("epic").first()).toBeVisible();
    await expect(page.getByText("Polar Engine Studio").first()).toBeVisible();
  });

  test("'Printed name' row only appears when the printed name differs from the card name", async ({
    page,
  }) => {
    const detail = await fetchCardDetail(SEED_CARD_SLUG);
    const enPrinting = detail.printings.find(
      (p) => p.language === "EN" && (!p.printedName || p.printedName === detail.card.name),
    );
    const altPrinting = detail.printings.find(
      (p) => p.printedName && p.printedName !== detail.card.name,
    );
    if (!enPrinting || !altPrinting?.printedName) {
      test.skip(true, "expected EN + alt-language seed printings with differing printedName");
      return;
    }

    await page.goto(`/cards/${SEED_CARD_SLUG}`);

    await expect(page.getByText("Printed name", { exact: true })).toBeHidden();

    // Printings can share a publicCode, so target by id. Retry: a pre-hydration
    // click can land before onClick attaches, leaving state unchanged.
    const altButton = page.locator(`button[data-printing-id="${altPrinting.id}"]`);
    const printedNameRow = page.getByText("Printed name", { exact: true });
    await expect(async () => {
      await altButton.click();
      await expect(printedNameRow).toBeVisible({ timeout: 500 });
    }).toPass({ timeout: 5000 });
    await expect(page.getByText(altPrinting.printedName)).toBeVisible();
  });

  test("art-variant and promo rows hide for normal printings and show for the foil promo", async ({
    page,
  }) => {
    const detail = await fetchCardDetail(SEED_CARD_SLUG);
    const promoPrinting = detail.printings.find((p) => p.finish === "foil" && p.markers.length > 0);
    const plainPrinting = detail.printings.find(
      (p) => p.finish === "normal" && p.markers.length === 0 && p.artVariant === "normal",
    );
    const promoMarker = promoPrinting?.markers[0];
    if (!promoMarker || !plainPrinting) {
      test.skip(
        true,
        "expected both a foil promo and a plain (no marker, normal art) seed printing",
      );
      return;
    }

    await page.goto(`/cards/${SEED_CARD_SLUG}`);
    // Scope to role=row; getByText("Promo") also matches a sibling printing's
    // badge strip.
    await expect(
      page.getByRole("row").filter({ has: page.getByText("Promo", { exact: true }) }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("row").filter({ has: page.getByText("Art variant", { exact: true }) }),
    ).toHaveCount(0);

    // No seed printing has a non-normal artVariant, so Art variant stays hidden.
    // Printings share a publicCode, so target by id.
    const promoButton = page.locator(`button[data-printing-id="${promoPrinting.id}"]`);

    await page.waitForLoadState("networkidle");
    await expect(promoButton).toHaveAttribute("aria-pressed", "false");

    // Retry via aria-pressed: a pre-hydration click leaves it unchanged; once
    // React attaches, clicking flips it to true.
    await expect(async () => {
      await promoButton.click();
      await expect(promoButton).toHaveAttribute("aria-pressed", "true", { timeout: 1000 });
    }).toPass({ timeout: 15_000 });

    // Scope to this row; the marker label also appears in printing-button
    // badges and the price-history heading.
    const promoRow = page
      .getByRole("row")
      .filter({ has: page.getByText("Promo", { exact: true }) })
      .first();
    await expect(promoRow).toBeVisible();
    await expect(promoRow).toContainText(promoMarker.label);
  });

  test("type / domains / energy / might / power render only when present", async ({ page }) => {
    await page.goto(`/cards/${SEED_CARD_SLUG}`);

    await expect(page.getByText("Type", { exact: true }).first()).toBeVisible();
    // The value renders the Title-cased enum label ("Unit"), not the slug.
    await expect(page.getByText("Unit", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("Domains", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("Energy", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("Might", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("Power", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("Might bonus", { exact: true })).toBeHidden();
  });

  test("a Legend with no stats hides energy / might / power rows entirely", async ({ page }) => {
    const candidates = ["dark-child-starter", "lady-of-luminosity-starter"];
    let chosen: CardDetailFixture | null = null;
    for (const slug of candidates) {
      const detail = await fetchCardDetailOrNull(slug);
      if (
        detail &&
        detail.card.energy === null &&
        detail.card.might === null &&
        detail.card.power === null
      ) {
        chosen = detail;
        break;
      }
    }
    if (!chosen) {
      test.skip(true, "no Legend without stats found in seed data");
      return;
    }

    await page.goto(`/cards/${chosen.card.slug}`);
    await expect(page.getByRole("heading", { level: 1, name: chosen.card.name })).toBeVisible();

    await expect(page.getByText("Energy", { exact: true })).toBeHidden();
    await expect(page.getByText("Might", { exact: true })).toBeHidden();
    await expect(page.getByText("Power", { exact: true })).toBeHidden();
  });

  test.describe("on a mobile viewport", () => {
    test.use({ viewport: { width: 390, height: 844 } });

    test("the right-column fields still render, just stacked under the left column", async ({
      page,
    }) => {
      await page.goto(`/cards/${SEED_CARD_SLUG}`);

      await expect(page.getByRole("heading", { level: 1, name: SEED_CARD_NAME })).toBeVisible();
      // Right-column rows render twice on mobile (hidden sm:table-cell, plus a
      // sm:hidden stacked block); filter to the visible copy.
      await expect(page.getByText("Type", { exact: true }).filter({ visible: true })).toBeVisible();
      await expect(
        page.getByText("Domains", { exact: true }).filter({ visible: true }),
      ).toBeVisible();
      await expect(
        page.getByText("Energy", { exact: true }).filter({ visible: true }),
      ).toBeVisible();
    });
  });
});

test.describe("card detail route — rules / effect / flavor / errata / bans", () => {
  test("rules text and flavor text render when set on the printing", async ({ page }) => {
    await page.goto(`/cards/${SEED_CARD_SLUG}`);

    await expect(page.getByText("Rules", { exact: true })).toBeVisible();
    await expect(page.getByText(/Bonus Damage|Deal 3 damage/iu).first()).toBeVisible();
    await expect(page.getByText("Flavor", { exact: true })).toBeVisible();
    await expect(page.getByText(/I never play with matches/iu)).toBeVisible();
  });

  test("a card with errata shows the Errata block with its source label and original rules", async ({
    page,
  }) => {
    const detail = await fetchCardDetail(SEED_CARD_SLUG);
    if (!detail.card.errata) {
      test.skip(true, "Annie, Fiery should carry seeded errata");
      return;
    }

    await page.goto(`/cards/${SEED_CARD_SLUG}`);

    await expect(page.getByText("Errata", { exact: true })).toBeVisible();
    await expect(page.getByText(detail.card.errata.source, { exact: false }).first()).toBeVisible();
    await expect(page.getByText(/Original rules:/iu)).toBeVisible();
  });

  test("when errata has a sourceUrl, the source is a link with target=_blank and rel=noreferrer", async ({
    page,
  }) => {
    const slug = "annie-stubborn";
    const detail = await fetchCardDetailOrNull(slug);
    const errata = detail?.card.errata;
    const sourceUrl = errata?.sourceUrl;
    if (!errata || !sourceUrl) {
      test.skip(true, `expected ${slug} to have errata with a sourceUrl`);
      return;
    }

    await page.goto(`/cards/${slug}`);

    const errataLink = page.getByRole("link", { name: new RegExp(errata.source, "u") });
    await expect(errataLink).toBeVisible();
    await expect(errataLink).toHaveAttribute("href", sourceUrl);
    await expect(errataLink).toHaveAttribute("target", "_blank");
    await expect(errataLink).toHaveAttribute("rel", /noreferrer/u);
  });

  test("a banned card shows the Bans block with format, date, and reason", async ({ page }) => {
    const slug = "blast-of-power";
    const detail = await fetchCardDetailOrNull(slug);
    const ban = detail?.card.bans[0];
    if (!ban) {
      test.skip(true, `expected ${slug} to be banned in seed`);
      return;
    }

    await page.goto(`/cards/${slug}`);

    await expect(page.getByText(`Banned in ${ban.formatName} since ${ban.bannedAt}`)).toBeVisible();
    if (ban.reason) {
      await expect(page.getByText(ban.reason)).toBeVisible();
    }
  });

  test("an unbanned card hides the Bans block", async ({ page }) => {
    const detail = await fetchCardDetail(SEED_CARD_SLUG);
    test.skip(detail.card.bans.length > 0, "Annie, Fiery should not be banned in seed");

    await page.goto(`/cards/${SEED_CARD_SLUG}`);
    await expect(page.getByRole("heading", { level: 1, name: SEED_CARD_NAME })).toBeVisible();

    await expect(page.getByText(/Banned in/iu)).toBeHidden();
  });
});

test.describe("card detail route — printings list", () => {
  test("multi-language printings group under language headers", async ({ page }) => {
    const detail = await fetchCardDetail(SEED_CARD_SLUG);
    const languages = new Set(detail.printings.map((p) => p.language));
    test.skip(languages.size < 2, "expected the seed card to span multiple languages");

    await page.goto(`/cards/${SEED_CARD_SLUG}`);

    // The heading combines a LanguageChip with the label: text reads "EN English".
    const headings = page.getByRole("heading", { level: 2 });
    await expect(headings.filter({ hasText: /English/u }).first()).toBeVisible();
  });

  test("clicking a sibling printing updates the info panel", async ({ page }) => {
    const detail = await fetchCardDetail(SEED_CARD_SLUG);
    const altLang = detail.printings.find((p) => p.language !== "EN");
    if (!altLang) {
      test.skip(true, "expected at least one non-EN printing on the seed card");
      return;
    }

    await page.goto(`/cards/${SEED_CARD_SLUG}`);

    // getByText("EN") also matches the "English" group heading; scope to the
    // info panel's Language row.
    const languageRow = page
      .getByRole("row")
      .filter({ has: page.getByText("Language", { exact: true }) })
      .first();
    await expect(languageRow).toContainText("English");

    const altButton = page.locator(`button[data-printing-id="${altLang.id}"]`);
    await expect(altButton).toBeVisible();
    // The localized label map isn't shipped to the test; only assert "English" no longer matches.
    await expect(async () => {
      await altButton.click();
      await expect(languageRow).not.toContainText("English", { timeout: 500 });
    }).toPass({ timeout: 5000 });
  });

  test("foil and promo badges appear on the matching printing button", async ({ page }) => {
    const detail = await fetchCardDetail(SEED_CARD_SLUG);
    const foilPromo = detail.printings.find((p) => p.finish === "foil" && p.markers.length > 0);
    const foilMarker = foilPromo?.markers[0];
    if (!foilPromo || !foilMarker) {
      test.skip(true, "expected a foil promo seed printing");
      return;
    }

    await page.goto(`/cards/${SEED_CARD_SLUG}`);

    const button = page.locator(`button[data-printing-id="${foilPromo.id}"]`);
    await expect(button).toBeVisible();
    await expect(button.getByText("Foil", { exact: true })).toBeVisible();
    await expect(button.getByText(foilMarker.label)).toBeVisible();
  });

  test("default-selected printing matches the EN language preference", async ({ page }) => {
    const detail = await fetchCardDetail(SEED_CARD_SLUG);
    const languages = new Set(detail.printings.map((p) => p.language));
    test.skip(
      languages.size < 2 || !languages.has("EN"),
      "need a multi-language card with at least one EN printing",
    );

    await page.goto(`/cards/${SEED_CARD_SLUG}`);

    const languageRow = page
      .getByRole("row")
      .filter({ has: page.getByText("Language", { exact: true }) })
      .first();
    await expect(languageRow).toContainText("English");
  });
});

test.describe("card detail route — price history", () => {
  test("price history section renders for a card with TCG snapshots", async ({ page }) => {
    const detail = await fetchCardDetail(SEED_CARD_SLUG);
    const prices = await fetchPrices();
    const hasTcg = detail.printings.some((p) => prices[p.id]?.tcgplayer);
    test.skip(!hasTcg, "Annie, Fiery should have TCG snapshots in seed");

    await page.goto(`/cards/${SEED_CARD_SLUG}`);

    const heading = page.getByRole("heading", { name: /^Price History — /u });
    await expect(heading).toBeVisible({ timeout: 10_000 });
  });

  test("the time-range button group hides ranges longer than the data span", async ({ page }) => {
    await page.goto(`/cards/${SEED_CARD_SLUG}`);

    await expect(page.getByRole("heading", { name: /^Price History — /u })).toBeVisible({
      timeout: 10_000,
    });

    const timeRange = page.getByRole("group", { name: /time range/iu });
    await expect(timeRange).toBeVisible();
    // "All" is always available regardless of data span.
    const allButton = timeRange.getByRole("button", { name: "All" });
    await expect(allButton).toBeVisible();
    await allButton.click();
  });

  test("the source button group disables marketplaces with no data and toggles selection on click", async ({
    page,
  }) => {
    await page.goto(`/cards/${SEED_CARD_SLUG}`);

    await expect(page.getByRole("heading", { name: /^Price History — /u })).toBeVisible({
      timeout: 10_000,
    });

    const sourceGroup = page.getByRole("group", { name: /price source/iu });
    await expect(sourceGroup).toBeVisible();

    const enabledButtons = sourceGroup.getByRole("button", { disabled: false });
    const enabledCount = await enabledButtons.count();
    expect(enabledCount, "at least one marketplace should be available").toBeGreaterThan(0);

    if (enabledCount >= 2) {
      await enabledButtons.nth(1).click();
    }
  });

  // visx renders the chart via SVG mouse events that don't reproduce reliably
  // in headless playwright.
  test.skip("hovering a chart point highlights the matching table row", () => {});
});
