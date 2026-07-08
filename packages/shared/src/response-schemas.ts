import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import { z } from "zod";

import { ERROR_CODES } from "./error-codes.js";
import type { ErrorCode } from "./error-codes.js";
import { WellKnown } from "./well-known.js";

// Register `.openapi()` on the shared Zod singleton. Idempotent, so it is safe
// alongside `@hono/zod-openapi` (which also extends Zod). Done here rather than
// relying on an import-order side effect so this module is self-sufficient: it
// is now imported via oRPC contracts that never pull in `@hono/zod-openapi`.
extendZodWithOpenApi(z);

// ── Error envelope ───────────────────────────────────────────────────────────
// The single shape every 4xx/5xx returns ({ error, code }). Published here so
// routes can document their error responses and the typed client can codegen
// the error type. `details` (validation issues / dev stack) is deliberately NOT
// in the schema: it is an optional dev/validation extra, not part of the stable
// contract, and a `z.unknown()` field would break createServerFn's return-type
// check on the web side.
const errorCodeValues = Object.values(ERROR_CODES) as [ErrorCode, ...ErrorCode[]];

export const apiErrorResponseSchema = z
  .object({
    error: z.string().openapi({ example: "Not found" }),
    code: z.enum(errorCodeValues).openapi({ example: ERROR_CODES.NOT_FOUND }),
  })
  .openapi("ApiErrorResponse");

// ── Field-diff values ────────────────────────────────────────────────────────
// A diffed field's value: a JSON scalar or an array of scalars. This is the
// heterogeneous-but-not-nested shape that card/printing field values take in a
// change diff (string, number, boolean, null, string[], …).
//
// Deliberately NON-recursive: a fully recursive JSON type breaks both
// @hono/zod-openapi (TS2589 "excessively deep") and hc's response-type inference
// (it leaks the ZodType through). And it must not be `unknown` — TanStack Start's
// createServerFn return-type check rejects `unknown` as non-serializable. This
// bounded union satisfies all three.

const diffScalarSchema = z.union([z.string(), z.number(), z.boolean(), z.null()]);
export type DiffValue = z.infer<typeof diffScalarSchema> | z.infer<typeof diffScalarSchema>[];
export const diffValueSchema = z.union([diffScalarSchema, z.array(diffScalarSchema)]);

// ── Enums ────────────────────────────────────────────────────────────────────

export const cardTypeSchema = z.string().openapi({ example: "Unit" });
export const raritySchema = z.string().openapi({ example: "Epic" });
export const domainSchema = z.string().openapi({ example: "Chaos" });
export const superTypeSchema = z.string().openapi({ example: "Champion" });
export const artVariantSchema = z.string().openapi({ example: "normal" });
export const finishSchema = z.string().openapi({ example: "foil" });
export const cardSizeSchema = z.string().openapi({ example: "standard" });

export const deckFormatSchema = z.string().openapi({ example: "constructed" });

// The closed deck-zone vocabulary, sourced from the WellKnown taxonomy (which is
// checked against the `deck_zones` reference table at API startup) so the schema
// stays in lockstep with the slugs the code branches on.
const DECK_ZONE_VALUES = [
  WellKnown.deckZone.MAIN,
  WellKnown.deckZone.SIDEBOARD,
  WellKnown.deckZone.LEGEND,
  WellKnown.deckZone.CHAMPION,
  WellKnown.deckZone.RUNES,
  WellKnown.deckZone.BATTLEFIELD,
  WellKnown.deckZone.OVERFLOW,
] as const;
export const deckZoneSchema = z.enum(DECK_ZONE_VALUES);
export const cardFaceSchema = z.enum(["front", "back"]);

// ── Health ───────────────────────────────────────────────────────────────────

export const healthResponseSchema = z
  .object({ status: z.string().openapi({ example: "ok" }) })
  .openapi("HealthResponse");

// ── Admin Status ────────────────────────────────────────────────────────────

// ── Feature Flags ────────────────────────────────────────────────────────────

// ── Keywords ─────────────────────────────────────────────────────────────────

// ── Init ─────────────────────────────────────────────────────────────────────

export const distributionChannelSchema = z.object({
  id: z.string().openapi({ example: "019cfc3b-0369-7000-8000-000000000002" }),
  slug: z.string().openapi({ example: "nexus-night" }),
  label: z.string().openapi({ example: "Nexus Night" }),
  description: z.string().nullable().openapi({ example: null }),
  kind: z.enum(["event", "product"]).openapi({ example: "event" }),
  parentId: z.string().nullable().openapi({ example: null }),
  childrenLabel: z.string().nullable().openapi({ example: null }),
});

// ── Prices ───────────────────────────────────────────────────────────────────

// ── Catalog ──────────────────────────────────────────────────────────────────

export const catalogSetResponseSchema = z.object({
  id: z.string().openapi({ example: "019cfc3b-0369-7890-a450-7859471cc3f6" }),
  slug: z.string().openapi({ example: "OGN" }),
  name: z.string().openapi({ example: "Origins" }),
  releasedAt: z.string().nullable().openapi({ example: "2025-10-31" }),
  released: z.boolean().openapi({ example: true }),
  setType: z.enum(["main", "supplemental"]).openapi({ example: "main" }),
});

const markerSchema = z.object({
  id: z.string().openapi({ example: "019cfc3b-0369-7000-8000-000000000001" }),
  slug: z.string().openapi({ example: "promo" }),
  label: z.string().openapi({ example: "Promo" }),
  description: z.string().nullable().openapi({ example: null }),
});

const printingDistributionChannelSchema = z.object({
  channel: distributionChannelSchema,
  distributionNote: z.string().nullable().openapi({ example: null }),
  ancestorLabels: z.array(z.string()).openapi({ example: [] }),
});

export const imageIdSchema = z
  .string()
  .openapi({ example: "019d02f1-d14f-769f-9295-9852db692dbe" });

const printingImageSchema = z.object({
  face: cardFaceSchema,
  imageId: imageIdSchema,
});

const cardBanSchema = z.object({
  formatId: z.string().openapi({ example: "019cfc3b-0369-7000-8000-000000000002" }),
  formatName: z.string().openapi({ example: "Constructed" }),
  bannedAt: z.string().openapi({ example: "2026-01-15" }),
  reason: z.string().nullable().openapi({ example: "Power level" }),
});

export const catalogCardResponseSchema = z.object({
  id: z.string().openapi({ example: "019cfc3b-0389-744b-837c-792fd586300e" }),
  slug: z.string().openapi({ example: "jinx-rebel" }),
  name: z.string().openapi({ example: "Jinx, Rebel" }),
  type: cardTypeSchema,
  types: z
    .array(cardTypeSchema)
    .nonempty()
    .openapi({ example: ["Unit"] }),
  superTypes: z.array(superTypeSchema).openapi({ example: ["Champion"] }),
  domains: z.array(domainSchema).openapi({ example: ["Chaos"] }),
  might: z.number().nullable().openapi({ example: 5 }),
  energy: z.number().nullable().openapi({ example: 5 }),
  power: z.number().nullable().openapi({ example: null }),
  keywords: z.array(z.string()).openapi({ example: [] }),
  tags: z.array(z.string()).openapi({ example: [] }),
  mightBonus: z.number().nullable().openapi({ example: null }),
  errata: z
    .object({
      correctedRulesText: z.string().nullable(),
      correctedEffectText: z.string().nullable(),
      source: z.string(),
      sourceUrl: z.string().nullable(),
      effectiveDate: z.string().nullable(),
    })
    .nullable()
    .openapi({ example: null }),
  bans: z.array(cardBanSchema).openapi({ example: [] }),
});

export const catalogPrintingResponseSchema = z.object({
  id: z.string().openapi({ example: "019cfc3b-03d3-7dac-86c9-27900cd43727" }),
  shortCode: z.string().openapi({ example: "OGN-202" }),
  setId: z.string().openapi({ example: "019cfc3b-0369-7890-a450-7859471cc3f6" }),
  rarity: raritySchema,
  artVariant: artVariantSchema,
  isSigned: z.boolean().openapi({ example: false }),
  markers: z.array(markerSchema).openapi({ example: [] }),
  distributionChannels: z.array(printingDistributionChannelSchema).openapi({ example: [] }),
  finish: finishSchema,
  size: cardSizeSchema,
  images: z.array(printingImageSchema),
  artist: z.string().openapi({ example: "Kudos Productions" }),
  publicCode: z.string().openapi({ example: "OGN-202/298" }),
  printedRulesText: z.string().nullable().openapi({ example: null }),
  printedEffectText: z.string().nullable().openapi({ example: null }),
  flavorText: z.string().nullable().openapi({ example: null }),
  printedName: z.string().nullable().openapi({ example: null }),
  printedYear: z.number().int().nullable().openapi({ example: 2025 }),
  language: z.string().openapi({ example: "EN" }),
  comment: z.string().nullable().openapi({ example: null }),
  // Integer sort key from the `printings_ordered` view. The handler already
  // emits it (via the `...rest` spread) and the web sorts printings by it, but
  // the schema previously omitted it — so the typed client inferred a response
  // missing this required field.
  canonicalRank: z.number().int().openapi({ example: 1 }),
  cardId: z.string().openapi({ example: "019cfc3b-0389-744b-837c-792fd586300e" }),
});

// ── Landing Summary ─────────────────────────────────────────────────────────

// ── Card Detail ─────────────────────────────────────────────────────────────

// ── Sets ────────────────────────────────────────────────────────────────────

// ── Promos page (public — distribution channels of every kind) ─────────────

// ── Sitemap Data ────────────────────────────────────────────────────────────

// ── Collections ──────────────────────────────────────────────────────────────

// ── Copies ───────────────────────────────────────────────────────────────────

export const copyLinkSchema = z
  .object({
    url: z.url({ protocol: /^https?$/u }).max(500),
    label: z.string().min(1).max(100).optional(),
  })
  .openapi("CopyLink");

/**
 * Per-copy metadata (ADR-038), shared by the authenticated copy shape and the
 * public share projection. `notesPrivate` is deliberately not part of this
 * shape: it exists only on the authenticated schema and is stripped from every
 * public surface.
 */
export const copyMetadataResponseShape = {
  /** Ungraded condition slug (`conditions` reference table); null = unrecorded. */
  condition: z.string().nullable(),
  /** Grading company slug (`graders` reference table); set together with `grade`. */
  grader: z.string().nullable(),
  /** 1 to 10 in half steps; non-null exactly when `grader` is non-null. */
  grade: z.number().nullable(),
  notesPublic: z.string().nullable(),
  isAltered: z.boolean(),
  /** Ordered photo/video links. */
  links: z.array(copyLinkSchema),
};

export const copyResponseSchema = z
  .object({
    id: z.string(),
    printingId: z.string(),
    collectionId: z.string(),
    /**
     * Owning group of the copy's collection, or null for personal collections.
     * The client uses it to keep group-owned copies out of personal "owned"
     * totals while still showing them inside the group collection.
     */
    groupId: z.string().nullable(),
    ...copyMetadataResponseShape,
    /**
     * Visible to anyone with access to the copy's collection (group members
     * included). "Private" means stripped from public share surfaces only.
     */
    notesPrivate: z.string().nullable(),
    /** True when the copy is out on a live loan (ADR-039): still owned, physically absent. */
    onLoan: z.boolean(),
  })
  .openapi("CopyResponse");

export const copyListResponseSchema = z
  .object({
    items: z.array(copyResponseSchema),
    nextCursor: z.string().nullable(),
  })
  .openapi("CopyListResponse");

// ── Collection Events ────────────────────────────────────────────────────────

// ── Decks ────────────────────────────────────────────────────────────────────

// Mirrors DeckFormatConfig in shared/types/api/deck.ts. Schema stays a
// concrete object (not z.record) so TanStack's server-fn type inference can
// propagate the response shape through the client hooks.
export const formatConfigResponseSchema = z
  .object({
    tagSlugs: z.array(z.string()).optional(),
  })
  .nullable()
  .openapi({ example: { tagSlugs: ["bilgewater", "neutral"] } });

const deckMatchupSwapResponseSchema = z.object({
  cardId: z.string(),
  direction: z.enum(["in", "out"]),
  quantity: z.number(),
});

const deckMatchupPlanResponseSchema = z.object({
  id: z.string(),
  opponentCardId: z.string().nullable(),
  opponentLabel: z.string(),
  notes: z.string(),
  swaps: z.array(deckMatchupSwapResponseSchema),
});

export const deckPlanResponseSchema = z
  .object({
    generalStrategy: z.string(),
    mulliganSplit: z.boolean(),
    mulliganGeneral: z.string(),
    mulliganFirst: z.string(),
    mulliganSecond: z.string(),
    battlefieldGame1CardId: z.string().nullable(),
    battlefieldFirstCardId: z.string().nullable(),
    battlefieldSecondCardId: z.string().nullable(),
    battlefieldCustom: z.boolean(),
    battlefieldNote: z.string(),
    matchups: z.array(deckMatchupPlanResponseSchema),
  })
  .openapi("DeckPlanResponse");

// ── Preferences ──────────────────────────────────────────────────────────────

// ── Trade preferences (ADR-017) ─────────────────────────────────────────────

export const tradePricePrefResponseSchema = z
  .enum(["cm_lowest", "tcg_lowest", "ct_zero", "absolute"])
  .openapi("TradePricePref");

export const tradeTypeResponseSchema = z.enum(["cards", "money", "both"]).openapi("TradeType");

export const currencyResponseSchema = z.enum(["EUR", "USD"]).openapi("Currency");

export const tradePreferenceSchema = z
  .object({
    pricePref: tradePricePrefResponseSchema.nullable(),
    priceAbsoluteCents: z.number().int().positive().nullable(),
    tradeType: tradeTypeResponseSchema.nullable(),
  })
  .openapi("TradePreference");

// ── Lists (unified wishlist / tradelist / organize) ─────────────────────────

export const listIntentResponseSchema = z.enum(["wish", "trade", "organize"]).openapi("ListIntent");

export const listKindResponseSchema = z.enum(["card", "printing", "copy"]).openapi("ListKind");

export const listEntryBaseShape = {
  id: z.string(),
  listId: z.string(),
  quantity: z.number(),
  tradeOverride: tradePreferenceSchema,
};

const listEntryDetailBaseShape = {
  ...listEntryBaseShape,
  // Rule-only entries (ADR-034) have no `list_entries` row, so id is null and
  // they aren't individually editable — only excludable.
  id: z.string().nullable(),
  source: z.enum(["manual", "rule", "both"]),
  // Rule's contribution to `quantity` (ADR-034 additive model); manual part is
  // `quantity - ruleQuantity`.
  ruleQuantity: z.number(),
  cardName: z.string(),
  cardType: cardTypeSchema,
};

const listEntryDetailPrintingFieldsShape = {
  setId: z.string(),
  rarity: raritySchema,
  finish: finishSchema,
  shortCode: z.string(),
  language: z.string(),
  imageId: imageIdSchema.nullable(),
};

export const listEntryDetailResponseSchema = z
  .discriminatedUnion("kind", [
    z.object({
      ...listEntryDetailBaseShape,
      kind: z.literal("card"),
      cardId: z.string(),
    }),
    z.object({
      ...listEntryDetailBaseShape,
      kind: z.literal("printing"),
      printingId: z.string(),
      ...listEntryDetailPrintingFieldsShape,
    }),
    z.object({
      ...listEntryDetailBaseShape,
      kind: z.literal("copy"),
      copyId: z.string(),
      printingId: z.string(),
      ...listEntryDetailPrintingFieldsShape,
      // True when the copy is pinned to a live in-app trade (ADR-019): it's
      // mid-trade, so the tradelist shows a "Reserved" badge and blocks Sold.
      reserved: z.boolean(),
      // True when the copy is out on a live loan (ADR-039): physically absent,
      // so the tradelist shows an "On loan" badge and it never matches.
      onLoan: z.boolean(),
    }),
  ])
  .openapi("ListEntryDetailResponse");

export const publicListResponseSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    intent: listIntentResponseSchema,
    kind: listKindResponseSchema,
    createdAt: z.string(),
    updatedAt: z.string(),
    tradeDefaults: tradePreferenceSchema,
    currency: currencyResponseSchema.nullable(),
  })
  .openapi("PublicListResponse");

export const publicListDetailResponseSchema = z
  .object({
    list: publicListResponseSchema,
    entries: z.array(listEntryDetailResponseSchema),
    owner: z.object({ displayName: z.string(), gravatarHash: z.string().nullable() }),
  })
  .openapi("PublicListDetailResponse");

// ── User share bundle (ADR-018) ─────────────────────────────────────────────

// ── Rules ───────────────────────────────────────────────────────────────────

// ── Collection Value History ────────────────────────────────────────────────

// ── Friend groups (ADR-013) ─────────────────────────────────────────────────

export const contactMethodSchema = z
  .object({
    id: z.string(),
    type: z.enum([
      "discord",
      "signal",
      "telegram",
      "whatsapp",
      "phone",
      "email",
      "in_person",
      "other",
    ]),
    value: z.string(),
  })
  .openapi("ContactMethod");

// ── Unified marketplace mappings (admin) ─────────────────────────────────────
// Concrete schemas for the two unified-mappings GETs. Authored zod-first; the
// matching TS interfaces in types/api/admin.ts are `z.infer`-ed from these so
// there is a single source of truth, and the route response schemas use these
// directly so hc can infer the web response types. The service builders
// (buildUnifiedMappingsResponse / buildUnifiedMappingsCardResponse) return the
// inferred types, so their handler output satisfies these schemas.

// ─── Card trades (ADR-019) ───────────────────────────────────────────────────

// ── Pod tournaments (ADR-022) ────────────────────────────────────────────────

export const podTournamentStatusSchema = z
  .enum(["setup", "running", "completed"])
  .openapi("PodTournamentStatus");
export const podScoringSchemeSchema = z.enum(["standard", "three_pod_reduced"]);
export const podPlayerStatusSchema = z.enum(["active", "dropped"]);

export const podStandingRowSchema = z
  .object({
    playerId: z.string(),
    displayName: z.string(),
    status: podPlayerStatusSchema,
    droppedAfterRound: z.number().int().nullable(),
    score: z.number(),
    gamePoints: z.number().nonnegative(),
    roundsPlayed: z.number().int().nonnegative(),
    pods3Count: z.number().int().nonnegative(),
    pods4Count: z.number().int().nonnegative(),
    byeCount: z.number().int().nonnegative(),
    podWins: z.number().int().nonnegative(),
    avgOpponentScore: z.number(),
    avgOpponentGamePoints: z.number(),
  })
  .openapi("PodStandingRow");

export const podMemberResponseSchema = z.object({
  playerId: z.string(),
  displayName: z.string(),
  gamePoints: z.number().int().nullable(),
  placement: z.number().int().nullable(),
  points: z.number().nullable(),
});

export const podPenaltyViewSchema = z.object({
  total: z.number(),
  rematchPairs: z.number().int().nonnegative(),
  spread: z.number(),
  scoreSpread: z.number(),
  imbalance: z.number(),
  float: z.number(),
  threePodRepeat: z.number(),
});

export const podResponseSchema = z.object({
  id: z.string(),
  podNumber: z.number().int().positive(),
  size: z.union([z.literal(3), z.literal(4)]),
  resultStatus: z.enum(["pending", "reported"]),
  members: z.array(podMemberResponseSchema),
  penalty: podPenaltyViewSchema.nullable(),
});

export const podByeResponseSchema = z.object({
  playerId: z.string(),
  displayName: z.string(),
});

export const podRoundResponseSchema = z.object({
  id: z.string(),
  roundNumber: z.number().int().positive(),
  status: z.enum(["reporting", "finalized"]),
  pairingStrategy: z.string().nullable(),
  penaltyTotal: z.number().nullable(),
  createdAt: z.string(),
  finalizedAt: z.string().nullable(),
  pods: z.array(podResponseSchema),
  byes: z.array(podByeResponseSchema),
});

export const podReportTokenResponseSchema = z
  .object({ reportToken: z.string().nullable() })
  .openapi("PodReportTokenResponse");

// The pod-engine running payload (standings + rounds + open-round snapshot),
// shared by the unified tournaments run-state and round-running endpoints
// (ADR-033). The pod engine drives a `pod_rounds`-format tournament's pairings
// and standings; these mirror the hand-written types in
// `types/api/pod-tournament.ts`.
export const podTournamentResponseSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    status: podTournamentStatusSchema,
    currentRound: z.number().int().nonnegative(),
    scoringScheme: podScoringSchemeSchema,
    byePoints: z.number().int().nonnegative(),
    reportToken: z.string().nullable(),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .openapi("PodTournamentResponse");

export const podPlayerResponseSchema = z
  .object({
    id: z.string(),
    displayName: z.string(),
    status: podPlayerStatusSchema,
    droppedAfterRound: z.number().int().nullable(),
    createdAt: z.string(),
  })
  .openapi("PodPlayerResponse");

export const podSnapshotPlayerSchema = z.object({
  playerId: z.string(),
  score: z.number(),
  pods3: z.number().int().nonnegative(),
  pods4: z.number().int().nonnegative(),
  byes: z.number().int().nonnegative(),
  opponents: z.record(z.string(), z.number().int().nonnegative()),
});

export const podTournamentDetailResponseSchema = z
  .object({
    tournament: podTournamentResponseSchema,
    players: z.array(podPlayerResponseSchema),
    standings: z.array(podStandingRowSchema),
    rounds: z.array(podRoundResponseSchema),
    openRoundSnapshot: z.array(podSnapshotPlayerSchema).nullable(),
  })
  .openapi("PodTournamentDetailResponse");

// ─── Deck check (ADR-025) ─────────────────────────────────────────────────────

export const deckCheckEntryStateSchema = z.enum([
  "editable",
  "submitted",
  "approved",
  "checked",
  "withdrawn",
]);
export const deckCheckReviewOutcomeSchema = z.enum(["ok", "issue"]);
const deckCheckMatchStatusSchema = z.enum(["matched", "ambiguous", "unmatched"]);

export const deckCheckEntryCardResponseSchema = z.object({
  id: z.string(),
  sortOrder: z.number().int().nonnegative(),
  rawName: z.string(),
  section: z.string(),
  zone: deckZoneSchema,
  quantity: z.number().int().positive(),
  matchStatus: deckCheckMatchStatusSchema,
  foundCopies: z.array(z.boolean()),
  resolvedCardId: z.string().nullable(),
  resolvedPrintingId: z.string().nullable(),
});

export const deckViolationSchema = z.object({
  // Every deck zone, plus "deck" for whole-deck-scope violations (not a zone).
  zone: z.enum([...DECK_ZONE_VALUES, "deck"]),
  code: z.string(),
  message: z.string(),
  cardId: z.string().optional(),
});

// ─── Deck check player self-service (ADR-026) ────────────────────────────────
