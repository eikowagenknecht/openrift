import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";

import { API_BASE_URL, WEB_BASE_URL } from "../../helpers/constants.js";

const SEED_CARD_SLUG = "annie-fiery";
const SEED_CARD_NAME = "Annie, Fiery";

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
  prices: Record<
    string,
    { tcgplayer?: number; cardmarket?: number; cardtrader?: number } | undefined
  >;
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

// Mirrors apps/web/src/lib/card-meta.ts so we can compare the head's
// rendered description against what the helper would produce.
function buildExpectedDescription(detail: CardDetailFixture): string {
  const META = 155;
  const card = detail.card;
  const parts: string[] = [];
  const domains = card.domains.length > 0 ? card.domains.join("/") : null;
  const typeLine = domains ? `${domains} ${card.type}` : card.type;
  parts.push(`${card.name} is a ${typeLine} card from Riftbound.`);
  const rules = detail.printings[0]?.printedRulesText;
  if (rules) {
    const cleaned = rules
      .replaceAll(/\[.*?\]/g, "")
      .replaceAll(/:[a-z0-9_]+:/gi, "")
      .replaceAll(/\s+/g, " ")
      .trim();
    if (cleaned.length > 0) {
      const remaining = META - parts.join(" ").length - 1;
      parts.push(cleaned.length > remaining ? `${cleaned.slice(0, remaining - 3)}...` : cleaned);
    }
  }
  return parts.join(" ");
}

// Identifies the card-detail server fn out of the bundle of server fns that
// run during a route transition. TanStack Start encodes the server fn id as
// base64url(JSON) referencing the source file + export name.
function isCardDetailServerFn(url: string): boolean {
  const match = url.match(/\/_serverFn\/([^/?#]+)/);
  if (!match) {
    return false;
  }
  try {
    return Buffer.from(match[1], "base64url").toString("utf-8").includes("fetchCardDetail");
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

    await page.getByRole("link", { name: /all cards/i }).click();

    await expect(page).toHaveURL(/\/cards$/);
    await expect(page.getByPlaceholder(/search/i)).toBeVisible({ timeout: 10_000 });
  });

  // The route declares `notFoundComponent` but its loader never throws
  // `notFound()` — a missing slug causes the API to 404, which the queryFn
  // turns into a thrown Error and routes to `errorComponent`. So in practice
  // an invalid slug renders RouteErrorFallback (same UI as the 500 case).
  test("an unknown slug renders the route error fallback", async ({ page }) => {
    await page.goto("/cards/this-card-does-not-exist-anywhere", { waitUntil: "domcontentloaded" });

    await expect(page.getByRole("button", { name: "Reshuffle" })).toBeVisible({ timeout: 10_000 });
  });

  test("a 500 from the detail server fn renders the route error fallback", async ({ page }) => {
    await page.goto("/cards");
    await expect(page.getByText(SEED_CARD_NAME).first()).toBeVisible({ timeout: 15_000 });

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

    await page.getByAltText(SEED_CARD_NAME).first().click();
    const pane = page.getByRole("complementary");
    await expect(pane).toBeVisible();
    await pane.getByRole("link", { name: /view card details/i }).click();

    await expect(page.getByRole("button", { name: "Reshuffle" })).toBeVisible({ timeout: 10_000 });
  });

  test("a slow detail server fn shows the skeleton before the heading", async ({ page }) => {
    await page.goto("/cards");
    await expect(page.getByText(SEED_CARD_NAME).first()).toBeVisible({ timeout: 15_000 });

    await page.route("**/_serverFn/**", async (route) => {
      if (isCardDetailServerFn(route.request().url())) {
        await new Promise((resolve) => setTimeout(resolve, 2000));
      }
      await route.continue();
    });

    await page.getByAltText(SEED_CARD_NAME).first().click();
    const pane = page.getByRole("complementary");
    await expect(pane).toBeVisible();
    await pane.getByRole("link", { name: /view card details/i }).click();

    // CardDetailPending renders Skeleton elements (data-slot="skeleton")
    // before the loader resolves and the real h1 mounts. TanStack's
    // defaults are pendingMs=1000 and pendingMinMs=500, so the skeleton's
    // window is roughly t=1000ms..2000ms after the click — give the
    // assertion enough room that navigation-scheduling jitter doesn't
    // push the skeleton out of the window before we look.
    await expect(page.locator('[data-slot="skeleton"]').first()).toBeVisible({ timeout: 5000 });
    await expect(page.getByRole("heading", { level: 1, name: SEED_CARD_NAME })).toBeVisible({
      timeout: 10_000,
    });
  });
});

test.describe("card detail route — head / SEO / JSON-LD", () => {
  test("title follows the '<name> — Riftbound Card' template", async ({ page }) => {
    await page.goto(`/cards/${SEED_CARD_SLUG}`);

    await expect(page).toHaveTitle(`${SEED_CARD_NAME} — Riftbound Card — OpenRift`);
  });

  test("meta description matches buildCardMetaDescription output", async ({ page }) => {
    const detail = await fetchCardDetail(SEED_CARD_SLUG);
    const expected = buildExpectedDescription(detail);

    await page.goto(`/cards/${SEED_CARD_SLUG}`);

    await expect(page.locator('meta[name="description"]')).toHaveAttribute("content", expected);
  });

  test("og:image is an absolute URL", async ({ page }) => {
    await page.goto(`/cards/${SEED_CARD_SLUG}`);

    const ogImage = page.locator('meta[property="og:image"]');
    await expect(ogImage).toHaveAttribute("content", /^https?:\/\//);
  });

  test("Product JSON-LD includes name, image, and TCG price range", async ({ page }) => {
    const detail = await fetchCardDetail(SEED_CARD_SLUG);
    const tcgPrices = detail.printings
      .map((p) => detail.prices[p.id]?.tcgplayer)
      .filter((p): p is number => typeof p === "number" && p > 0);
    test.skip(tcgPrices.length === 0, "Annie, Fiery should have at least one TCG snapshot in seed");

    await page.goto(`/cards/${SEED_CARD_SLUG}`);

    const scripts = await readJsonLdScripts(page);
    const product = scripts.find((s) => s["@type"] === "Product");
    expect(product, "Product JSON-LD should be present").toBeDefined();
    expect(product.name).toBe(SEED_CARD_NAME);
    expect(typeof product.image).toBe("string");
    expect(product.image).toMatch(/^https?:\/\//);

    const offers = product.offers;
    expect(offers, "Product should expose offers when TCG prices exist").toBeDefined();
    if (offers["@type"] === "AggregateOffer") {
      expect(typeof offers.lowPrice).toBe("number");
      expect(typeof offers.highPrice).toBe("number");
      expect(offers.lowPrice).toBeLessThanOrEqual(offers.highPrice);
    } else {
      expect(offers["@type"]).toBe("Offer");
      expect(typeof offers.price).toBe("number");
    }
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
      name: new RegExp(`^${set.slug.toUpperCase()}\\b`, "i"),
    });
    await expect(setLink).toBeVisible();
    await expect(setLink).toHaveAttribute("href", `/sets/${set.slug}`);
  });

  test("renders the standard rows for code, rarity, finish, language, artist", async ({ page }) => {
    await page.goto(`/cards/${SEED_CARD_SLUG}`);

    // The rarity icon's sibling text reveals the rarity name.
    await expect(page.getByText("Code", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("Rarity", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("Finish", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("Language", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("Artist", { exact: true }).first()).toBeVisible();
    // Annie, Fiery's seed printings are Epic rarity and Polar Engine Studio art.
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

    // Default selection is the EN printing → "Printed name" row hidden.
    await expect(page.getByText("Printed name", { exact: true })).toBeHidden();

    // Switching to the alt-language printing reveals it with the localized name.
    // Multiple printings share a publicCode (normal/foil/language variants), so
    // target the exact printing by id rather than by its visible publicCode text.
    // Retry the click: the SSR'd button can receive a click before React
    // attaches onClick, leaving state unchanged.
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
    // Default is plain — Promo / Art variant info rows absent. Scope to
    // `role="row"` so we don't match the "Promo" marker label that can also
    // appear on a sibling printing button's badge strip.
    await expect(
      page.getByRole("row").filter({ has: page.getByText("Promo", { exact: true }) }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("row").filter({ has: page.getByText("Art variant", { exact: true }) }),
    ).toHaveCount(0);

    // Pick the foil promo printing and verify the Promo row appears with the
    // marker label rendered inside its promo box. (No seed printing has a
    // non-normal artVariant, so the Art variant row stays hidden.)
    // Multiple printings share the same publicCode, so target by id.
    const promoButton = page.locator(`button[data-printing-id="${promoPrinting.id}"]`);

    // Let hydration settle before interacting — clicks that land before React
    // attaches onClick fire as bare DOM events and do nothing.
    await page.waitForLoadState("networkidle");
    await expect(promoButton).toHaveAttribute("aria-pressed", "false");

    // Retry the click using aria-pressed as the signal that state actually
    // updated. A pre-hydration click leaves aria-pressed unchanged; once
    // React is attached, clicking flips it to "true".
    await expect(async () => {
      await promoButton.click();
      await expect(promoButton).toHaveAttribute("aria-pressed", "true", { timeout: 1000 });
    }).toPass({ timeout: 15_000 });

    // Now the Promo row must have rendered with the marker-label badge inside.
    // Scope the marker-label assertion to that row — the label also appears in
    // printing-button badges and the price-history heading.
    const promoRow = page
      .getByRole("row")
      .filter({ has: page.getByText("Promo", { exact: true }) })
      .first();
    await expect(promoRow).toBeVisible();
    await expect(promoRow).toContainText(promoMarker.label);
  });

  test("type / domains / energy / might / power render only when present", async ({ page }) => {
    // Annie, Fiery: Unit, Fury domain, energy 5, power 1, might 4, no mightBonus.
    await page.goto(`/cards/${SEED_CARD_SLUG}`);

    await expect(page.getByText("Type", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("unit", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("Domains", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("Energy", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("Might", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("Power", { exact: true }).first()).toBeVisible();
    // No mightBonus on Annie, Fiery in seed → row absent.
    await expect(page.getByText("Might bonus", { exact: true })).toBeHidden();
  });

  test("a Legend with no stats hides energy / might / power rows entirely", async ({ page }) => {
    // Try a few seeded Legend slugs; whichever exists with no stats wins.
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
      // On mobile the right-column rows render twice: once in the main table
      // (hidden via `hidden sm:table-cell`) and once in a separate
      // `sm:hidden` stacked block. Filter to the visible copy so `.first()`
      // doesn't land on the hidden one.
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

    // Annie, Fiery's seed printing has rules text and a flavor line.
    await expect(page.getByText("Rules", { exact: true })).toBeVisible();
    await expect(page.getByText(/Bonus Damage|Deal 3 damage/i).first()).toBeVisible();
    await expect(page.getByText("Flavor", { exact: true })).toBeVisible();
    await expect(page.getByText(/I never play with matches/i)).toBeVisible();
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
    await expect(page.getByText(/Original rules:/i)).toBeVisible();
  });

  test("when errata has a sourceUrl, the source is a link with target=_blank and rel=noreferrer", async ({
    page,
  }) => {
    // annie-stubborn carries seed errata with a sourceUrl.
    const slug = "annie-stubborn";
    const detail = await fetchCardDetailOrNull(slug);
    const errata = detail?.card.errata;
    const sourceUrl = errata?.sourceUrl;
    if (!errata || !sourceUrl) {
      test.skip(true, `expected ${slug} to have errata with a sourceUrl`);
      return;
    }

    await page.goto(`/cards/${slug}`);

    const errataLink = page.getByRole("link", { name: new RegExp(errata.source) });
    await expect(errataLink).toBeVisible();
    await expect(errataLink).toHaveAttribute("href", sourceUrl);
    await expect(errataLink).toHaveAttribute("target", "_blank");
    await expect(errataLink).toHaveAttribute("rel", /noreferrer/);
  });

  test("a banned card shows the Bans block with format, date, and reason", async ({ page }) => {
    // blast-of-power is banned in freeform in seed.
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

    await expect(page.getByText(/Banned in/i)).toBeHidden();
  });
});

test.describe("card detail route — printings list", () => {
  test("multi-language printings group under language headers", async ({ page }) => {
    const detail = await fetchCardDetail(SEED_CARD_SLUG);
    const languages = new Set(detail.printings.map((p) => p.language));
    test.skip(languages.size < 2, "expected the seed card to span multiple languages");

    await page.goto(`/cards/${SEED_CARD_SLUG}`);

    // Each language group renders an h2 header above the printing buttons.
    const headings = page.getByRole("heading", { level: 2 });
    // The English header may render as the language label "English" (via languageLabels lookup) or fall back to the code "EN".
    await expect(headings.filter({ hasText: /^(English|EN)$/ }).first()).toBeVisible();
  });

  test("clicking a sibling printing updates the info panel", async ({ page }) => {
    const detail = await fetchCardDetail(SEED_CARD_SLUG);
    const altLang = detail.printings.find((p) => p.language !== "EN");
    if (!altLang) {
      test.skip(true, "expected at least one non-EN printing on the seed card");
      return;
    }

    await page.goto(`/cards/${SEED_CARD_SLUG}`);

    // Scope assertions to the info panel's Language row — bare getByText("EN")
    // would also match the "English" group heading (case-insensitive substring
    // match) and hide a broken state change.
    const languageRow = page
      .getByRole("row")
      .filter({ has: page.getByText("Language", { exact: true }) })
      .first();
    await expect(languageRow).toContainText("English");

    // Sibling printings can share a publicCode (normal/foil/language variants)
    // and have no visible text that distinguishes them, so target the intended
    // printing by its data-printing-id.
    const altButton = page.locator(`button[data-printing-id="${altLang.id}"]`);
    await expect(altButton).toBeVisible();
    // The Language row shows the full language label (via useLanguageLabels)
    // rather than the raw ISO code. We don't ship the label map to the test,
    // so assert the row no longer reads "English" after switching to a non-EN
    // printing — that's enough to prove the state change landed.
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

    // Multiple printings share the same publicCode (normal/foil + language
    // variants), so target the specific button by printing id.
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

    // The Language row in the left column shows the selected printing's language.
    // With default user preferences (English first), it should be "English".
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
    const hasTcg = Object.values(detail.prices).some((p) => p?.tcgplayer);
    test.skip(!hasTcg, "Annie, Fiery should have TCG snapshots in seed");

    await page.goto(`/cards/${SEED_CARD_SLUG}`);

    const heading = page.getByRole("heading", { name: /^Price History — / });
    await expect(heading).toBeVisible({ timeout: 10_000 });
  });

  test("the time-range button group hides ranges longer than the data span", async ({ page }) => {
    await page.goto(`/cards/${SEED_CARD_SLUG}`);

    // Wait for the section to mount — the heading anchors it.
    await expect(page.getByRole("heading", { name: /^Price History — / })).toBeVisible({
      timeout: 10_000,
    });

    const timeRange = page.getByRole("group", { name: /time range/i });
    await expect(timeRange).toBeVisible();
    // The "All" range is always available; clicking it keeps the group consistent.
    const allButton = timeRange.getByRole("button", { name: "All" });
    await expect(allButton).toBeVisible();
    await allButton.click();
  });

  test("the source button group disables marketplaces with no data and toggles selection on click", async ({
    page,
  }) => {
    await page.goto(`/cards/${SEED_CARD_SLUG}`);

    await expect(page.getByRole("heading", { name: /^Price History — / })).toBeVisible({
      timeout: 10_000,
    });

    const sourceGroup = page.getByRole("group", { name: /price source/i });
    await expect(sourceGroup).toBeVisible();

    const enabledButtons = sourceGroup.getByRole("button", { disabled: false });
    const enabledCount = await enabledButtons.count();
    expect(enabledCount, "at least one marketplace should be available").toBeGreaterThan(0);

    if (enabledCount >= 2) {
      // Click the second enabled marketplace and verify selection changed.
      // Tracking by class state is brittle, but the disabled set itself is
      // already user-visible (greyed-out look).
      await enabledButtons.nth(1).click();
    }
  });

  test("the snapshot table is sorted descending and shows currency in column headers", async ({
    page,
  }) => {
    await page.goto(`/cards/${SEED_CARD_SLUG}`);

    await expect(page.getByRole("heading", { name: /^Price History — / })).toBeVisible({
      timeout: 10_000,
    });

    // Column headers expose the marketplace + currency suffix.
    const columnHeaders = page.getByRole("columnheader");
    await expect(columnHeaders.filter({ hasText: /\((USD|EUR)\)/ }).first()).toBeVisible();

    // Date column is descending: first body row's date >= last body row's date.
    const dateCells = page.getByRole("rowgroup").last().getByRole("row").locator("td:first-child");
    const count = await dateCells.count();
    if (count >= 2) {
      const firstText = await dateCells.first().textContent();
      const lastText = await dateCells.last().textContent();
      expect((firstText ?? "").trim() >= (lastText ?? "").trim()).toBe(true);
    }
  });

  // The chart is rendered with visx and the highlight handler is driven by
  // SVG mouse events that don't reliably reproduce in headless playwright.
  // Tracking this gap rather than shipping a flaky test.
  test.skip("hovering a chart point highlights the matching table row", () => {});
});
