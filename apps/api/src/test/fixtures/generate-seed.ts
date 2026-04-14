/**
 * Generates seed.sql and constants.ts from the local development database.
 *
 * Run manually after schema changes:
 *   bun run apps/api/src/test/fixtures/generate-seed.ts
 *
 * Requires DATABASE_URL to be set (reads from ../../.env automatically).
 */

// oxlint-disable-next-line import/no-nodejs-modules -- CLI script, not a browser module
import { writeFileSync } from "node:fs";
// oxlint-disable-next-line import/no-nodejs-modules -- CLI script, not a browser module
import { resolve } from "node:path";

import postgres from "postgres";

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error(
    "DATABASE_URL is not set. Run with: bun --env-file=../../.env run src/test/fixtures/generate-seed.ts",
  );
  process.exit(1);
}

const sql = postgres(DATABASE_URL);

const SET_SLUG = "OGS"; // Proving Grounds — smallest set, 24 cards

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Format a number with underscore separators for oxlint compliance.
 *
 * @returns The formatted number string
 */
function formatNumericLiteral(n: number): string {
  if (n < 10_000) {
    return String(n);
  }
  return String(n).replaceAll(/\B(?=(\d{3})+(?!\d))/g, "_");
}

function escapeValue(v: unknown): string {
  if (v === null || v === undefined) {
    return "NULL";
  }
  if (typeof v === "boolean") {
    return v ? "TRUE" : "FALSE";
  }
  if (typeof v === "number") {
    return String(v);
  }
  if (v instanceof Date) {
    return `'${v.toISOString()}'`;
  }
  if (Array.isArray(v)) {
    if (v.length === 0) {
      return "'{}'";
    }
    return `'{${v.map((e) => `"${String(e).replaceAll('"', String.raw`\"`)}"`).join(",")}}'`;
  }
  const s = String(v).replaceAll("'", "''");
  return `'${s}'`;
}

function toInsert(table: string, rows: Record<string, unknown>[]): string {
  if (rows.length === 0) {
    return "";
  }
  const cols = Object.keys(rows[0]);
  const header = `INSERT INTO ${table} (${cols.join(", ")}) VALUES`;
  const values = rows.map((r) => `  (${cols.map((c) => escapeValue(r[c])).join(", ")})`);
  return `${header}\n${values.join(",\n")};\n`;
}

/**
 * Generate an INSERT ... ON CONFLICT (pk) DO UPDATE SET ... statement.
 * Used for reference tables that are partially seeded by migrations.
 *
 * @returns The upsert SQL string, or empty string if rows is empty
 */
function toUpsert(table: string, rows: Record<string, unknown>[], pkCols: string[]): string {
  if (rows.length === 0) {
    return "";
  }
  const cols = Object.keys(rows[0]);
  const header = `INSERT INTO ${table} (${cols.join(", ")}) VALUES`;
  const values = rows.map((r) => `  (${cols.map((c) => escapeValue(r[c])).join(", ")})`);
  const updateCols = cols.filter((c) => !pkCols.includes(c));
  const setClauses = updateCols.map((c) => `${c} = EXCLUDED.${c}`).join(", ");
  return `${header}\n${values.join(",\n")}\n  ON CONFLICT (${pkCols.join(", ")}) DO UPDATE SET ${setClauses};\n`;
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

console.log(`Querying ${SET_SLUG} data from local DB...`);

const sets = await sql<Record<string, unknown>[]>`
  SELECT id, slug, name, set_type, printed_total, sort_order, released_at
  FROM sets WHERE slug = ${SET_SLUG}
`;

const cards = await sql<Record<string, unknown>[]>`
  SELECT DISTINCT c.id, c.slug, c.name, c.type,
    c.might, c.energy, c.power, c.might_bonus, c.keywords,
    c.tags, c.norm_name
  FROM cards c
  JOIN printings p ON p.card_id = c.id
  JOIN sets s ON s.id = p.set_id
  WHERE s.slug = ${SET_SLUG}
  ORDER BY c.slug
`;

const cardSuperTypes = await sql<Record<string, unknown>[]>`
  SELECT DISTINCT cst.card_id, cst.super_type_slug
  FROM card_super_types cst
  JOIN cards c ON c.id = cst.card_id
  JOIN printings p ON p.card_id = c.id
  JOIN sets s ON s.id = p.set_id
  WHERE s.slug = ${SET_SLUG}
  ORDER BY cst.card_id, cst.super_type_slug
`;

const cardDomains = await sql<Record<string, unknown>[]>`
  SELECT DISTINCT cd.card_id, cd.domain_slug, cd.ordinal
  FROM card_domains cd
  JOIN cards c ON c.id = cd.card_id
  JOIN printings p ON p.card_id = c.id
  JOIN sets s ON s.id = p.set_id
  WHERE s.slug = ${SET_SLUG}
  ORDER BY cd.card_id, cd.ordinal
`;

const printings = await sql<Record<string, unknown>[]>`
  SELECT p.id, p.card_id, p.set_id, p.short_code, p.rarity,
    p.art_variant, p.is_signed, p.finish, p.artist, p.public_code,
    p.printed_rules_text, p.printed_effect_text, p.flavor_text, p.comment,
    p.promo_type_id, p.language, p.printed_name
  FROM printings p
  JOIN sets s ON s.id = p.set_id
  WHERE s.slug = ${SET_SLUG}
  ORDER BY p.short_code
`;

const marketplaceGroups = await sql<Record<string, unknown>[]>`
  SELECT id, marketplace, group_id, name, abbreviation
  FROM marketplace_groups
  ORDER BY marketplace, group_id
`;

const marketplaceProducts = await sql<Record<string, unknown>[]>`
  SELECT DISTINCT mp.id, mp.marketplace, mp.group_id, mp.external_id, mp.product_name
  FROM marketplace_products mp
  JOIN marketplace_product_variants mpv ON mpv.marketplace_product_id = mp.id
  JOIN printings p ON p.id = mpv.printing_id
  JOIN sets s ON s.id = p.set_id
  WHERE s.slug = ${SET_SLUG}
  ORDER BY mp.marketplace, mp.external_id
`;

const marketplaceProductVariants = await sql<Record<string, unknown>[]>`
  SELECT mpv.id, mpv.marketplace_product_id, mpv.printing_id, mpv.finish, mpv.language
  FROM marketplace_product_variants mpv
  JOIN marketplace_products mp ON mp.id = mpv.marketplace_product_id
  JOIN printings p ON p.id = mpv.printing_id
  JOIN sets s ON s.id = p.set_id
  WHERE s.slug = ${SET_SLUG}
  ORDER BY mp.marketplace, mp.external_id, mpv.finish, mpv.language
`;

const promoTypes = await sql<Record<string, unknown>[]>`
  SELECT DISTINCT pt.id, pt.slug, pt.label
  FROM promo_types pt
  JOIN printings p ON p.promo_type_id = pt.id
  JOIN sets s ON s.id = p.set_id
  WHERE s.slug = ${SET_SLUG}
  ORDER BY pt.slug
`;

const cardNameAliases = await sql<Record<string, unknown>[]>`
  SELECT DISTINCT cna.card_id, cna.norm_name
  FROM card_name_aliases cna
  JOIN cards c ON c.id = cna.card_id
  JOIN printings p ON p.card_id = c.id
  JOIN sets s ON s.id = p.set_id
  WHERE s.slug = ${SET_SLUG}
  ORDER BY cna.card_id
`;

// ---------------------------------------------------------------------------
// Reference / lookup tables (all rows, no set filter)
// ---------------------------------------------------------------------------

console.log("Querying reference tables...");

const domains = await sql<Record<string, unknown>[]>`
  SELECT slug, label, sort_order, is_well_known, color
  FROM domains ORDER BY sort_order
`;

const rarities = await sql<Record<string, unknown>[]>`
  SELECT slug, label, sort_order, is_well_known, color
  FROM rarities ORDER BY sort_order
`;

const cardTypes = await sql<Record<string, unknown>[]>`
  SELECT slug, label, sort_order, is_well_known
  FROM card_types ORDER BY sort_order
`;

const superTypes = await sql<Record<string, unknown>[]>`
  SELECT slug, label, sort_order, is_well_known
  FROM super_types ORDER BY sort_order
`;

const finishes = await sql<Record<string, unknown>[]>`
  SELECT slug, label, sort_order, is_well_known
  FROM finishes ORDER BY sort_order
`;

const artVariants = await sql<Record<string, unknown>[]>`
  SELECT slug, label, sort_order, is_well_known
  FROM art_variants ORDER BY sort_order
`;

const languages = await sql<Record<string, unknown>[]>`
  SELECT code, name, sort_order
  FROM languages ORDER BY sort_order
`;

const formats = await sql<Record<string, unknown>[]>`
  SELECT id, name
  FROM formats ORDER BY id
`;

const deckFormats = await sql<Record<string, unknown>[]>`
  SELECT slug, label, sort_order, is_well_known
  FROM deck_formats ORDER BY sort_order
`;

const deckZones = await sql<Record<string, unknown>[]>`
  SELECT slug, label, sort_order, is_well_known
  FROM deck_zones ORDER BY sort_order
`;

const keywordStyles = await sql<Record<string, unknown>[]>`
  SELECT name, color, dark_text
  FROM keyword_styles ORDER BY name
`;

const keywordTranslations = await sql<Record<string, unknown>[]>`
  SELECT keyword_name, language, label
  FROM keyword_translations ORDER BY keyword_name, language
`;

// ---------------------------------------------------------------------------
// OGS-scoped: images, snapshots, rules
// ---------------------------------------------------------------------------

console.log("Querying images, snapshots, rules...");

const printingImages = await sql<Record<string, unknown>[]>`
  SELECT pi.id, pi.printing_id, pi.image_file_id, pi.face, pi.provider, pi.is_active
  FROM printing_images pi
  JOIN printings p ON p.id = pi.printing_id
  JOIN sets s ON s.id = p.set_id
  WHERE s.slug = ${SET_SLUG}
  ORDER BY pi.printing_id, pi.face
`;

const imageFileIds = printingImages.map((pi) => pi.image_file_id as string);
const imageFiles =
  imageFileIds.length > 0
    ? await sql<Record<string, unknown>[]>`
        SELECT id, original_url, rehosted_url, rotation
        FROM image_files WHERE id = ANY(${imageFileIds})
        ORDER BY id
      `
    : [];

const marketplaceSnapshots = await sql<Record<string, unknown>[]>`
  SELECT id, variant_id, recorded_at,
    market_cents, low_cents, mid_cents, high_cents,
    trend_cents, avg1_cents, avg7_cents, avg30_cents
  FROM (
    SELECT ms.*,
      ROW_NUMBER() OVER (PARTITION BY ms.variant_id ORDER BY ms.recorded_at DESC) AS rn
    FROM marketplace_snapshots ms
    JOIN marketplace_product_variants mpv ON mpv.id = ms.variant_id
    JOIN printings p ON p.id = mpv.printing_id
    JOIN sets s ON s.id = p.set_id
    WHERE s.slug = ${SET_SLUG}
  ) ranked
  WHERE rn <= 5
  ORDER BY variant_id, recorded_at
`;

const ruleVersions = await sql<Record<string, unknown>[]>`
  SELECT version, source_type, source_url, published_at
  FROM rule_versions ORDER BY version
`;

const rules = await sql<Record<string, unknown>[]>`
  SELECT id, version, rule_number, sort_order, depth, rule_type, content, change_type
  FROM rules ORDER BY version, sort_order
`;

await sql.end();

// ---------------------------------------------------------------------------
// Synthetic data: card_errata and card_bans (OGS has none in dev DB)
// ---------------------------------------------------------------------------

console.log("Generating synthetic data...");

// Feature flags: all known flags, enabled so e2e tests cover all UI.
// Keep in sync with KNOWN_FLAGS in apps/web/src/components/admin/feature-flags-page.tsx
const syntheticFeatureFlags: Record<string, unknown>[] = [
  {
    key: "copies-tracked",
    enabled: true,
    description: "Show the total copies tracked counter on the landing page",
  },
  { key: "rules", enabled: true, description: "Show the game rules page and header link" },
  {
    key: "price-history",
    enabled: true,
    description: "Show the Value Over Time chart on the collection stats page",
  },
  {
    key: "stats",
    enabled: true,
    description: "Show the collection statistics page and sidebar link",
  },
];

interface SyntheticCardRow {
  id: string;
  slug: string;
  name: string;
}

const typedCardsForSynthetic = cards as unknown as SyntheticCardRow[];

// Pick the first two cards for errata, first card for a ban
const errataCard1 = typedCardsForSynthetic[0];
const errataCard2 = typedCardsForSynthetic[1];
const bannedCard = typedCardsForSynthetic[2];

interface FormatRow {
  id: string;
}
const typedFormats = formats as unknown as FormatRow[];
const banFormatId = typedFormats[0]?.id ?? "standard";

const syntheticCardErrata: Record<string, unknown>[] = [];
if (errataCard1) {
  syntheticCardErrata.push({
    id: "019713f0-0000-7000-8000-000000000001",
    card_id: errataCard1.id,
    corrected_rules_text: "Deal 3 damage to target unit. (Corrected from 2)",
    corrected_effect_text: null,
    source: "official-errata",
    source_url: null,
    effective_date: "2025-01-15",
  });
}
if (errataCard2) {
  syntheticCardErrata.push({
    id: "019713f0-0000-7000-8000-000000000002",
    card_id: errataCard2.id,
    corrected_rules_text: null,
    corrected_effect_text: "When this unit enters play, draw a card.",
    source: "official-errata",
    source_url: "https://example.com/errata",
    effective_date: "2025-03-01",
  });
}

const syntheticCardBans: Record<string, unknown>[] = [];
if (bannedCard) {
  syntheticCardBans.push({
    id: "019713f0-0000-7000-8000-000000000003",
    card_id: bannedCard.id,
    format_id: banFormatId,
    banned_at: "2025-06-01",
    unbanned_at: null,
    reason: "Dominated the meta with a 65% win rate in competitive play",
  });
}

// ---------------------------------------------------------------------------
// Generate seed.sql
// ---------------------------------------------------------------------------

const seedSql = [
  "-- Auto-generated by generate-seed.ts — do not edit manually.",
  `-- Source: local DB, set ${SET_SLUG} (${sets[0]?.name})`,
  `-- Generated: ${new Date().toISOString()}`,
  "",
  "-- Reference / lookup tables (upsert to merge with migration-seeded rows)",
  toUpsert("domains", domains, ["slug"]),
  toUpsert("rarities", rarities, ["slug"]),
  toUpsert("card_types", cardTypes, ["slug"]),
  toUpsert("super_types", superTypes, ["slug"]),
  toUpsert("finishes", finishes, ["slug"]),
  toUpsert("art_variants", artVariants, ["slug"]),
  toUpsert("languages", languages, ["code"]),
  toUpsert("formats", formats, ["id"]),
  toUpsert("deck_formats", deckFormats, ["slug"]),
  toUpsert("deck_zones", deckZones, ["slug"]),
  toUpsert("keyword_styles", keywordStyles, ["name"]),
  toUpsert("keyword_translations", keywordTranslations, ["keyword_name", "language"]),
  "",
  "-- Sets and cards",
  toInsert("sets", sets),
  toInsert("cards", cards),
  toInsert("card_super_types", cardSuperTypes),
  toInsert("card_domains", cardDomains),
  toInsert("card_name_aliases", cardNameAliases),
  toInsert("card_errata", syntheticCardErrata),
  "",
  "-- Printings and images",
  toInsert("promo_types", promoTypes),
  toInsert("printings", printings),
  toInsert("image_files", imageFiles),
  toInsert("printing_images", printingImages),
  "",
  "-- Card bans",
  toInsert("card_bans", syntheticCardBans),
  "",
  "-- Marketplace",
  toInsert("marketplace_groups", marketplaceGroups),
  toInsert("marketplace_products", marketplaceProducts),
  toInsert("marketplace_product_variants", marketplaceProductVariants),
  toInsert("marketplace_snapshots", marketplaceSnapshots),
  "",
  "-- Feature flags",
  toInsert("feature_flags", syntheticFeatureFlags),
  "",
  "-- Rules",
  toInsert("rule_versions", ruleVersions),
  toInsert("rules", rules),
].join("\n");

// oxlint-disable-next-line typescript/no-non-null-assertion -- dirname is always defined when running as a script
const dir = resolve(import.meta.dirname!);
writeFileSync(resolve(dir, "seed.sql"), seedSql);
console.log(
  [
    `Wrote seed.sql:`,
    `  Reference: ${domains.length} domains, ${rarities.length} rarities, ${cardTypes.length} card types, ${superTypes.length} super types,`,
    `    ${finishes.length} finishes, ${artVariants.length} art variants, ${languages.length} languages, ${formats.length} formats,`,
    `    ${deckFormats.length} deck formats, ${deckZones.length} deck zones, ${keywordStyles.length} keyword styles, ${keywordTranslations.length} keyword translations`,
    `  Catalog: ${sets.length} sets, ${cards.length} cards, ${cardSuperTypes.length} card super types, ${cardDomains.length} card domains,`,
    `    ${cardNameAliases.length} aliases, ${syntheticCardErrata.length} errata (synthetic), ${promoTypes.length} promo types`,
    `  Printings: ${printings.length} printings, ${imageFiles.length} image files, ${printingImages.length} printing images`,
    `  Bans: ${syntheticCardBans.length} card bans (synthetic)`,
    `  Marketplace: ${marketplaceGroups.length} groups, ${marketplaceProducts.length} products, ${marketplaceProductVariants.length} variants, ${marketplaceSnapshots.length} snapshots`,
    `  Feature flags: ${syntheticFeatureFlags.length} (synthetic, all enabled)`,
    `  Rules: ${ruleVersions.length} rule versions, ${rules.length} rules`,
  ].join("\n"),
);

// ---------------------------------------------------------------------------
// Generate constants.ts
// ---------------------------------------------------------------------------

interface PrintingRow {
  id: string;
  card_id: string;
  short_code: string;
  rarity: string;
  finish: string;
  promo_type_id: string | null;
  language: string | null;
}

interface CardRow {
  id: string;
  slug: string;
  name: string;
  type: string;
}

interface CardDomainRow {
  card_id: string;
  domain_slug: string;
  ordinal: number;
}

const typedPrintings = printings as unknown as PrintingRow[];
const typedCards = cards as unknown as CardRow[];
const typedCardDomains = cardDomains as unknown as CardDomainRow[];

/** Build a card_id → domains[] lookup from the junction table. */
const domainsByCardId = Map.groupBy(typedCardDomains, (d) => d.card_id);
function getCardDomains(cardId: string): string[] {
  return (domainsByCardId.get(cardId) ?? [])
    .toSorted((a, b) => a.ordinal - b.ordinal)
    .map((d) => d.domain_slug);
}

const constantsTs = `/**
 * Seed data constants — IDs from the OGS (Proving Grounds) set.
 * Auto-generated by generate-seed.ts — do not edit manually.
 */

// -- Set -----------------------------------------------------------------------

export const OGS_SET = {
  id: ${JSON.stringify(sets[0]?.id)},
  slug: "OGS",
  name: "Proving Grounds",
} as const;

// -- Cards (all 24) -----------------------------------------------------------

export const CARDS = {
${typedCards
  .map(
    (c) =>
      `  ${JSON.stringify(c.slug)}: { id: ${JSON.stringify(c.id)}, slug: ${JSON.stringify(c.slug)}, name: ${JSON.stringify(c.name)}, type: ${JSON.stringify(c.type)}, domains: ${JSON.stringify(getCardDomains(c.id))} },`,
  )
  .join("\n")}
} as const;

// -- Printings (all 24) -------------------------------------------------------

export const PRINTINGS = {
${typedPrintings
  .map((p) => {
    const key = `${p.short_code}:${p.rarity.toLowerCase()}:${p.finish}:${p.promo_type_id ?? ""}:${p.language ?? ""}`;
    return `  ${JSON.stringify(key)}: { id: ${JSON.stringify(p.id)}, cardId: ${JSON.stringify(p.card_id)}, rarity: ${JSON.stringify(p.rarity)}, finish: ${JSON.stringify(p.finish)} },`;
  })
  .join("\n")}
} as const;

// -- Convenience aliases for common test needs --------------------------------
//
// These are keyed by the current kebab-case card slug. Card slugs derive from
// the card name, so they can change if a card is renamed. When that happens,
// update the key on the right-hand side after regenerating.

/** A Unit card in the Fury domain (Epic rarity): Annie, Fiery */
export const CARD_FURY_UNIT = CARDS["annie-fiery"];
/** A Spell card in the Fury domain (Uncommon rarity): Firestorm */
export const CARD_FURY_SPELL = CARDS["firestorm"];
/** A Unit card in the Calm domain (Rare rarity): Master Yi, Meditative */
export const CARD_CALM_UNIT = CARDS["master-yi-meditative"];
/** A Unit card in the Body domain (Rare rarity): Garen, Rugged */
export const CARD_BODY_UNIT = CARDS["garen-rugged"];
/** A Unit card in the Mind domain (Rare rarity): Lux, Illuminated */
export const CARD_MIND_UNIT = CARDS["lux-illuminated"];
/** A Unit card in the Order domain (Epic rarity): Garen, Commander */
export const CARD_ORDER_UNIT = CARDS["garen-commander"];

/** Printing for OGS-001 (Epic, normal finish, EN): Annie, Fiery */
export const PRINTING_1 = PRINTINGS["OGS-001:epic:normal::EN"];
/** Printing for OGS-002 (Uncommon, normal finish, EN): Firestorm */
export const PRINTING_2 = PRINTINGS["OGS-002:uncommon:normal::EN"];
/** Printing for OGS-003 (Common, normal finish, EN): Incinerate */
export const PRINTING_3 = PRINTINGS["OGS-003:common:normal::EN"];
/** Printing for OGS-004 (Rare, normal finish, EN): Master Yi, Meditative */
export const PRINTING_4 = PRINTINGS["OGS-004:rare:normal::EN"];

// -- Marketplace groups -------------------------------------------------------

export const MARKETPLACE_GROUPS = {
${marketplaceGroups
  .map(
    (g: Record<string, unknown>) =>
      `  "${g.marketplace}_${g.group_id}": { id: ${JSON.stringify(g.id)}, marketplace: ${JSON.stringify(g.marketplace)}, groupId: ${formatNumericLiteral(Number(g.group_id))}, name: ${JSON.stringify(g.name)} },`,
  )
  .join("\n")}
} as const;

/** TCGPlayer group for OGS */
export const TCGPLAYER_OGS_GROUP = MARKETPLACE_GROUPS["tcgplayer_24439"];
/** Cardmarket group for OGS */
export const CARDMARKET_OGS_GROUP = MARKETPLACE_GROUPS["cardmarket_6289"];

// -- Synthetic errata and bans ------------------------------------------------

${errataCard1 ? `/** Card with synthetic errata: ${errataCard1.name} */\nexport const ERRATA_CARD = CARDS[${JSON.stringify(errataCard1.slug)}];` : ""}
${bannedCard ? `/** Card with synthetic ban: ${bannedCard.name} */\nexport const BANNED_CARD = CARDS[${JSON.stringify(bannedCard.slug)}];` : ""}
${typedFormats[0] ? `/** Format used for the synthetic ban */\nexport const BAN_FORMAT_ID = ${JSON.stringify(banFormatId)};` : ""}
`;

writeFileSync(resolve(dir, "constants.ts"), constantsTs);
console.log("Wrote constants.ts");

console.log("Done!");
