import { z } from "zod";

/* oxlint-disable no-unused-vars -- imported for JSDoc @link cross-references */
import type {
  CardSourcesTable,
  CardsTable,
  CollectionsTable,
  DeckCardsTable,
  DecksTable,
  MarketplaceSnapshotsTable,
  MarketplaceSourcesTable,
  PrintingImagesTable,
  PrintingSourcesTable,
  PrintingsTable,
  SetsTable,
  WishListItemsTable,
} from "./types.js";
/* oxlint-enable no-unused-vars */

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** DB rejects '{}' and 'null'::jsonb but allows SQL NULL. */
const noEmptyJsonb = z
  .unknown()
  .nullable()
  .refine(
    (v) =>
      v === null ||
      v === undefined ||
      (typeof v === "object" && !Array.isArray(v) && Object.keys(v as object).length > 0),
    "Must be null or a non-empty object",
  );

// ---------------------------------------------------------------------------
// Field rules — mirror DB CHECK constraints, single source of truth
// ---------------------------------------------------------------------------

// ── Card data ─────────────────────────────────────────────────────────────

/** Mirrors DB CHECK constraints on the `sets` table. @see {@link SetsTable} */
export const setFieldRules = {
  slug: z.string().min(1),
  name: z.string().min(1),
  printedTotal: z.number().int().min(0).nullable(),
} satisfies Record<string, z.ZodType>;

/** Mirrors DB CHECK constraints on the `cards` table. @see {@link CardsTable} */
export const cardFieldRules = {
  slug: z.string().min(1),
  name: z.string().min(1),
  type: z.enum(["Legend", "Unit", "Rune", "Spell", "Gear", "Battlefield"]),
  superTypes: z.array(z.enum(["Basic", "Champion", "Signature", "Token"])),
  domains: z.array(z.enum(["Fury", "Calm", "Mind", "Body", "Chaos", "Order", "Colorless"])).min(1),
  might: z.number().min(0).nullable(),
  energy: z.number().min(0).nullable(),
  power: z.number().min(0).nullable(),
  mightBonus: z.number().min(0).nullable(),
  rulesText: z.string().min(1).nullable(),
  effectText: z.string().min(1).nullable(),
  tags: z.array(z.string()),
} satisfies Record<string, z.ZodType>;

/** Mirrors DB CHECK constraints on the `printings` table. @see {@link PrintingsTable} */
export const printingFieldRules = {
  slug: z.string().min(1),
  sourceId: z.string().min(1),
  collectorNumber: z.number().int().positive(),
  rarity: z.enum(["Common", "Uncommon", "Rare", "Epic", "Showcase"]),
  artVariant: z.enum(["normal", "altart", "overnumbered"]),
  finish: z.enum(["normal", "foil"]),
  artist: z.string().min(1),
  publicCode: z.string().min(1),
  printedRulesText: z.string().min(1).nullable(),
  printedEffectText: z.string().min(1).nullable(),
  flavorText: z.string().min(1).nullable(),
  comment: z.string().min(1).nullable(),
} satisfies Record<string, z.ZodType>;

// ── Marketplace ───────────────────────────────────────────────────────────

/** Mirrors DB CHECK constraints on the `marketplace_sources` table. @see {@link MarketplaceSourcesTable} */
export const marketplaceSourceFieldRules = {
  marketplace: z.string().min(1),
  externalId: z.number().int().positive(),
  productName: z.string().min(1),
} satisfies Record<string, z.ZodType>;

/** Mirrors DB CHECK constraints on the `marketplace_snapshots` table. @see {@link MarketplaceSnapshotsTable} */
export const marketplaceSnapshotFieldRules = {
  marketCents: z.number().int().min(0),
  lowCents: z.number().int().min(0).nullable(),
  midCents: z.number().int().min(0).nullable(),
  highCents: z.number().int().min(0).nullable(),
  trendCents: z.number().int().min(0).nullable(),
  avg1Cents: z.number().int().min(0).nullable(),
  avg7Cents: z.number().int().min(0).nullable(),
  avg30Cents: z.number().int().min(0).nullable(),
} satisfies Record<string, z.ZodType>;

// ── Collections ───────────────────────────────────────────────────────────

/** Mirrors DB CHECK constraints on the `collections` table. @see {@link CollectionsTable} */
export const collectionFieldRules = {
  name: z.string().min(1).max(200),
} satisfies Record<string, z.ZodType>;

/** Mirrors DB CHECK constraints on the `decks` table. @see {@link DecksTable} */
export const deckFieldRules = {
  name: z.string().min(1).max(200),
  format: z.enum(["standard", "freeform"]),
} satisfies Record<string, z.ZodType>;

/** Mirrors DB CHECK constraints on the `deck_cards` table. @see {@link DeckCardsTable} */
export const deckCardFieldRules = {
  zone: z.enum(["main", "sideboard"]),
  quantity: z.number().int().positive(),
} satisfies Record<string, z.ZodType>;

/** Mirrors DB CHECK constraints on the `wish_list_items` table. @see {@link WishListItemsTable} */
export const wishListItemFieldRules = {
  quantityDesired: z.number().int().positive(),
} satisfies Record<string, z.ZodType>;

// ── Card sources ──────────────────────────────────────────────────────────

/** Mirrors DB CHECK constraints on the `card_sources` table. @see {@link CardSourcesTable} */
export const cardSourceFieldRules = {
  source: z.string().min(1),
  name: z.string().min(1),
  type: z.string().min(1).nullable(),
  might: z.number().min(0).nullable(),
  energy: z.number().min(0).nullable(),
  power: z.number().min(0).nullable(),
  mightBonus: z.number().min(0).nullable(),
  rulesText: z.string().min(1).nullable(),
  effectText: z.string().min(1).nullable(),
  sourceId: z.string().min(1).nullable(),
  sourceEntityId: z.string().min(1).nullable(),
  extraData: noEmptyJsonb,
} satisfies Record<string, z.ZodType>;

/** Mirrors DB CHECK constraints on the `printing_sources` table. @see {@link PrintingSourcesTable} */
export const printingSourceFieldRules = {
  sourceId: z.string().min(1),
  setId: z.string().min(1).nullable(),
  setName: z.string().min(1).nullable(),
  collectorNumber: z.number().int().positive().nullable(),
  rarity: z.string().min(1).nullable(),
  artVariant: z.string().min(1).nullable(),
  finish: z.string().min(1).nullable(),
  artist: z.string().min(1).nullable(),
  publicCode: z.string().min(1).nullable(),
  printedRulesText: z.string().min(1).nullable(),
  printedEffectText: z.string().min(1).nullable(),
  imageUrl: z.string().min(1).nullable(),
  flavorText: z.string().min(1).nullable(),
  sourceEntityId: z.string().min(1).nullable(),
  extraData: noEmptyJsonb,
} satisfies Record<string, z.ZodType>;

/** Mirrors DB CHECK constraints on the `printing_images` table. @see {@link PrintingImagesTable} */
export const printingImageFieldRules = {
  face: z.enum(["front", "back"]),
  source: z.string().min(1),
  originalUrl: z.string().min(1).nullable(),
  rehostedUrl: z.string().min(1).nullable(),
} satisfies Record<string, z.ZodType>;
