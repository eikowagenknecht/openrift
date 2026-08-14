import type {
  CardType,
  DeckDetailResponse,
  DeckExportResponse,
  DeckFormat,
  DeckListItemResponse,
  DeckListResponse,
  DeckShareResponse,
  DeckZone,
  Domain,
  SuperType,
} from "@openrift/shared";
import {
  WellKnown,
  isBaseBanFormat,
  requiredZoneProgress,
  validateDeck,
  ERROR_CODES,
} from "@openrift/shared";
import { decksContract } from "@openrift/shared/contracts/decks";
import type { updateDeckPlanSchema } from "@openrift/shared/contracts/decks";
import { PREFERENCE_DEFAULTS } from "@openrift/shared/types";
import { implement } from "@orpc/server";
import type { z } from "zod";

import type { Repos } from "../../deps.js";
import { AppError } from "../../errors.js";
import { assertDeleted, assertFound } from "../../lib/assertions.js";
import { assertKnownFormat, validateFormatConfig } from "../../lib/deck-format-validation.js";
import { toDeck, toDeckCard, toDeckPlan, toDeckSummary } from "../../lib/deck-presenters.js";
import { withUniqueShareToken } from "../../lib/share-token.js";
import { requireAuthedUser } from "../../orpc/base.js";
import type { ApiContext } from "../../orpc/context.js";
import { buildPatchUpdates } from "../../patch.js";
import type { FieldMapping } from "../../patch.js";
import type { DeckUpdateInput } from "../../repositories/decks.js";
import { encodeDeck } from "../../services/deck-codecs/encode-deck.js";

/**
 * Validates the card references in a deck plan (ADR-029): every referenced
 * card must exist, each matchup must be identifiable (a linked card, a label,
 * or both), and each chosen battlefield must be a Battlefield. The opponent
 * card may be any type (a Legend, Aurora, a domain signpost, …). Swap balance
 * and battlefield-in-deck are checked softly client-side, not here. Also
 * rejects duplicate matchups (same opponent card + label).
 */
async function validateDeckPlan(
  catalog: Repos["catalog"],
  body: z.infer<typeof updateDeckPlanSchema>,
): Promise<void> {
  const seen = new Set<string>();
  for (const matchup of body.matchups) {
    if (matchup.opponentCardId === null && matchup.opponentLabel === "") {
      throw new AppError(
        400,
        ERROR_CODES.BAD_REQUEST,
        "A matchup needs an opponent: link a card or enter a name",
      );
    }
    const key = JSON.stringify([matchup.opponentCardId, matchup.opponentLabel]);
    if (seen.has(key)) {
      throw new AppError(
        400,
        ERROR_CODES.BAD_REQUEST,
        "Duplicate matchup: the same opponent appears twice",
      );
    }
    seen.add(key);
  }

  const opponentIds = body.matchups
    .map((matchup) => matchup.opponentCardId)
    .filter((id): id is string => id !== null);
  const battlefieldIds = [
    body.battlefieldGame1CardId,
    body.battlefieldFirstCardId,
    body.battlefieldSecondCardId,
  ].filter((id): id is string => id !== null);
  const swapIds = body.matchups.flatMap((matchup) => matchup.swaps.map((swap) => swap.cardId));
  const allIds = [...new Set([...opponentIds, ...battlefieldIds, ...swapIds])];
  if (allIds.length === 0) {
    return;
  }

  const rows = await catalog.cardsByIds(allIds);
  const typeById = new Map(rows.map((row) => [row.id, row.type]));
  for (const id of allIds) {
    if (!typeById.has(id)) {
      throw new AppError(400, ERROR_CODES.BAD_REQUEST, `Unknown card: ${id}`);
    }
  }
  // The opponent card may be any type — no Legend constraint. Only battlefields
  // are type-checked, since they must come from the deck's battlefield zone.
  for (const id of new Set(battlefieldIds)) {
    if (typeById.get(id) !== WellKnown.cardType.BATTLEFIELD) {
      throw new AppError(400, ERROR_CODES.BAD_REQUEST, `Card ${id} is not a Battlefield`);
    }
  }
}

// isPublic is deliberately NOT patchable here: a deck's public state is owned
// solely by the /decks/{id}/share sub-resource (POST/DELETE/rotate), so the two
// can never desync. Collections already follow this rule.
const patchFields: FieldMapping<DeckUpdateInput> = {
  name: "name",
  description: "description",
  format: "format",
  formatConfig: "formatConfig",
  oddsConfig: "oddsConfig",
  coverCardId: "coverCardId",
  coverPrintingId: "coverPrintingId",
  coverPosition: "coverPosition",
  links: "links",
  collectionId: "collectionId",
  isDraft: "isDraft",
};

const os = implement(decksContract).$context<ApiContext>().use(requireAuthedUser);

/**
 * The authenticated decks contract, mounted at `/api/v1/decks`. Bad-request and
 * not-found states are thrown as `AppError` and mapped to ORPCErrors by the
 * handler's appErrorInterceptor.
 */
export const decksRouter = {
  // ── LIST ────────────────────────────────────────────────────────────────────
  list: os.list.handler(async ({ input, context }): Promise<DeckListResponse> => {
    const { decks, deckFolders, marketplace, userPreferences, enums, copies, loans, catalog } =
      context.repos;
    const userId = context.userId;

    const [deckRows, allCards, prefs, enumRows, buildableByCard, borrowedByCard] =
      await Promise.all([
        decks.listForUser(userId, {
          includeArchived: input.includeArchived === "true",
        }),
        decks.allCardsForUser(userId),
        userPreferences.getByUserId(userId),
        enums.all(),
        // Buildable + borrowed-in stock, keyed by card, for the per-deck missing
        // count. These mirror the deck editor's `available` + borrowed inputs so
        // both surfaces report the same number.
        copies.buildableCountByCard(userId),
        loans.borrowedCountByCard(userId),
      ]);

    const favMarketplace =
      prefs?.data?.marketplaceOrder?.[0] ?? PREFERENCE_DEFAULTS.marketplaceOrder[0];
    // The tile's value has to use the same basis as the deck page, which
    // prices each card at the cheapest printing in the viewer's languages
    // (`computeDeckOwnership`). Resolve the stored preference the same way the
    // display store does — unset means the default, an explicitly empty list
    // means "any language".
    const preferredLanguages = prefs?.data?.languages ?? PREFERENCE_DEFAULTS.languages;
    // Bans invalidate a deck (CARD_BANNED), so the list's valid/invalid badge
    // needs them. One query covers every card across every deck in the response.
    // The home-collection extras cover every deck's box in one query too: each
    // deck adds only its own box's copies on top of the shared buildable pool.
    const homeCollectionIds = deckRows
      .map((row) => row.collectionId)
      .filter((id): id is string => id !== null);
    const [deckValueMap, banRows, homeExtrasByCollection, folderIdsByDeck] = await Promise.all([
      marketplace.deckValues(userId, favMarketplace, preferredLanguages),
      catalog.cardBansByCardIds([...new Set(allCards.map((card) => card.cardId))]),
      copies.buildableCountByCardForCollections(userId, homeCollectionIds),
      deckFolders.folderIdsByDeckIds(
        deckRows.map((row) => row.id),
        userId,
      ),
    ]);
    const bannedCardIds = new Set(
      banRows.filter((ban) => isBaseBanFormat(ban.formatId)).map((ban) => ban.cardId),
    );

    // Group cards by deck
    const cardsByDeckId = Map.groupBy(allCards, (card) => card.deckId);

    const cardTypeOrder = enumRows.cardTypes.map((row) => row.slug);
    const domainOrder = enumRows.domains.map((row) => row.slug);
    const excludedTypes = new Set<string>([
      WellKnown.cardType.LEGEND,
      WellKnown.cardType.RUNE,
      WellKnown.cardType.BATTLEFIELD,
    ]);
    const countedZones = new Set<string>([WellKnown.deckZone.MAIN, WellKnown.deckZone.CHAMPION]);

    const items: DeckListItemResponse[] = deckRows.map((row) => {
      const cards = cardsByDeckId.get(row.id) ?? [];
      const legend = cards.find((card) => card.zone === WellKnown.deckZone.LEGEND);
      const champion = cards.find((card) => card.zone === WellKnown.deckZone.CHAMPION);

      // Total cards (excluding overflow)
      const totalCards = cards
        .filter((card) => card.zone !== WellKnown.deckZone.OVERFLOW)
        .reduce((sum, card) => sum + card.quantity, 0);

      // Completion across the format's required zones — the "48/56" the deck
      // page's format badge carries. Excludes the sideboard, unlike totalCards.
      const { progress: requiredProgress, total: requiredTotal } = requiredZoneProgress(
        cards.map((card) => ({ zone: card.zone as DeckZone, quantity: card.quantity })),
        row.format as DeckFormat,
      );

      // Missing count: needed minus buildable minus borrowed-in, per card.
      // Sums over every zone the deck editor's ownership panel counts (all but
      // overflow, which is a parking zone — see `computeDeckOwnership`), so the
      // two numbers agree. Buildable and borrowed pools are shared across
      // decks: each deck is measured independently against the full inventory,
      // matching the editor.
      const neededByCard = new Map<string, number>();
      for (const card of cards) {
        if (card.zone === WellKnown.deckZone.OVERFLOW) {
          continue;
        }
        neededByCard.set(card.cardId, (neededByCard.get(card.cardId) ?? 0) + card.quantity);
      }
      // Copies in the deck's home collection count for this deck even when the
      // collection is excluded from deck building — that's the box it lives in.
      const homeExtra =
        row.collectionId === null ? undefined : homeExtrasByCollection.get(row.collectionId);
      let missingCount = 0;
      for (const [cardId, needed] of neededByCard) {
        const have =
          (buildableByCard.get(cardId) ?? 0) +
          (homeExtra?.get(cardId) ?? 0) +
          (borrowedByCard.get(cardId) ?? 0);
        missingCount += Math.max(0, needed - have);
      }

      // Type counts (Unit/Spell/Gear from main+champion zones). Fan out over the
      // full type set (ADR-037) like the domain distribution below, so a
      // multi-type card is counted under each of its (non-excluded) types.
      const typeCountMap = new Map<CardType, number>();
      for (const card of cards) {
        if (!countedZones.has(card.zone)) {
          continue;
        }
        for (const cardType of card.cardTypes as CardType[]) {
          if (excludedTypes.has(cardType)) {
            continue;
          }
          typeCountMap.set(cardType, (typeCountMap.get(cardType) ?? 0) + card.quantity);
        }
      }
      const typeCounts = cardTypeOrder
        .filter((type) => typeCountMap.has(type as CardType))
        .map((type) => ({
          cardType: type as CardType,
          count: typeCountMap.get(type as CardType) ?? 0,
        }));

      // Domain distribution (from main+champion zones)
      const domainCountMap = new Map<Domain, number>();
      for (const card of cards) {
        if (!countedZones.has(card.zone)) {
          continue;
        }
        for (const domain of card.domains as Domain[]) {
          domainCountMap.set(domain, (domainCountMap.get(domain) ?? 0) + card.quantity);
        }
      }
      const domainDistribution = domainOrder
        .filter((domain) => domainCountMap.has(domain as Domain))
        .map((domain) => ({
          domain: domain as Domain,
          count: domainCountMap.get(domain as Domain) ?? 0,
        }));

      // Validation. The list endpoint cares only about pass/fail, not the
      // detailed violations, so we deliberately don't load per-card custom
      // tag assignments here — the tag-membership rule would mis-report when
      // the list query skipped the join. Custom-Region decks therefore show
      // as valid in the list and surface real violations on the deck page.
      const isValid =
        row.format === WellKnown.deckFormat.CONSTRUCTED
          ? validateDeck({
              format: WellKnown.deckFormat.CONSTRUCTED,
              cards: cards.map((card) => ({
                cardId: card.cardId,
                zone: card.zone as DeckZone,
                quantity: card.quantity,
                cardName: card.cardName,
                cardType: card.cardType as CardType,
                cardTypes: card.cardTypes as CardType[],
                superTypes: card.superTypes as SuperType[],
                domains: card.domains as Domain[],
                tags: card.tags,
                customTagSlugs: [],
                keywords: card.keywords,
                maxCopiesOverride: card.maxCopiesOverride,
                banned: bannedCardIds.has(card.cardId),
              })),
            }).length === 0
          : true;

      return {
        deck: toDeckSummary(row),
        legendCardId: legend?.cardId ?? null,
        championCardId: champion?.cardId ?? null,
        totalCards,
        typeCounts,
        domainDistribution,
        isValid,
        requiredProgress,
        requiredTotal,
        totalValueCents: deckValueMap.get(row.id) ?? null,
        missingCount,
        folderIds: folderIdsByDeck.get(row.id) ?? [],
      };
    });

    return { items };
  }),

  // ── CREATE ──────────────────────────────────────────────────────────────────
  create: os.create.handler(async ({ input, context }) => {
    const { decks, deckFormats, customTags } = context.repos;
    const userId = context.userId;
    await assertKnownFormat(deckFormats, input.format);
    const formatConfig = await validateFormatConfig(customTags, input.format, input.formatConfig);
    const row = await decks.create({
      userId,
      name: input.name,
      description: input.description ?? null,
      format: input.format,
      formatConfig,
      isPublic: input.isPublic ?? false,
      links: input.links,
    });
    return toDeck(row);
  }),

  // ── GET ONE ────────────────────────────────────────────────────────────────
  get: os.get.handler(async ({ input, context }): Promise<DeckDetailResponse> => {
    const { decks } = context.repos;
    const userId = context.userId;

    const [deck, cardRows] = await Promise.all([
      decks.getByIdForUser(input.id, userId),
      decks.cardsForDeck(input.id, userId),
    ]);
    assertFound(deck, "Not found");

    return {
      deck: toDeck(deck),
      cards: cardRows.map((r) => toDeckCard(r)),
    };
  }),

  // ── UPDATE ──────────────────────────────────────────────────────────────────
  update: os.update.handler(async ({ input, context }) => {
    const { decks, deckFormats, customTags, collections } = context.repos;
    const userId = context.userId;
    if (input.format !== undefined) {
      await assertKnownFormat(deckFormats, input.format);
    }
    // A home collection has to be one the user can actually reach; null clears
    // it. Anything else would silently exempt a collection they can't see.
    if (input.collectionId !== undefined && input.collectionId !== null) {
      const access = await collections.getAccessForUser(input.collectionId, userId);
      assertFound(access, "Collection not found");
      // A deck box is a box you own. A group binder is communal, and pulling
      // personal copies into one hands them to the group, so it can't be the
      // box a deck is filled from. Decks linked to one before this rule keep
      // working; they just can't be re-pointed at another group binder.
      if (access.collection.groupId !== null) {
        throw new AppError(
          400,
          ERROR_CODES.BAD_REQUEST,
          "A deck box must be one of your own collections",
        );
      }
    }
    // Decide which format the resulting deck will be under, so format_config
    // is validated against the right shape — input.format wins, falling back
    // to the deck's current format when only the config is being patched.
    let effectiveFormat = input.format;
    if (effectiveFormat === undefined && input.formatConfig !== undefined) {
      const current = await decks.getIdAndFormat(input.id, userId);
      assertFound(current, "Not found");
      effectiveFormat = current.format;
    }
    // Resolve formatConfig BEFORE buildPatchUpdates so it counts as a field
    // change. Two paths land here with an implicit config update:
    //   1. body has formatConfig: validate against the resulting format.
    //   2. format is changing but body doesn't specify config: clear the
    //      old config so a Custom-Region deck switched to constructed
    //      doesn't keep a stale tagSlugs, and a deck switched INTO
    //      Custom-Region lands in the "pick a region" banner state.
    const normalized: Record<string, unknown> = { ...input };
    if (input.formatConfig !== undefined && effectiveFormat !== undefined) {
      normalized.formatConfig = await validateFormatConfig(
        customTags,
        effectiveFormat,
        input.formatConfig,
      );
    } else if (input.format !== undefined && input.formatConfig === undefined) {
      normalized.formatConfig = null;
    }
    const updates = buildPatchUpdates<DeckUpdateInput>(normalized, patchFields);
    const row = await decks.update(input.id, userId, updates);
    assertFound(row, "Not found");
    return toDeck(row);
  }),

  // ── DELETE ──────────────────────────────────────────────────────────────────
  remove: os.remove.handler(async ({ input, context }): Promise<void> => {
    const { decks } = context.repos;
    const result = await decks.deleteByIdForUser(input.id, context.userId);
    assertDeleted(result, "Not found");
  }),

  // ── PUT /decks/:id/cards ──────────────────────────────────────────────────
  // Full replace of deck cards
  replaceCards: os.replaceCards.handler(async ({ input, context }) => {
    const { decks } = context.repos;
    const userId = context.userId;

    // Verify deck belongs to user
    const deck = await decks.getIdAndFormat(input.id, userId);
    assertFound(deck, "Not found");

    await decks.replaceCards(
      input.id,
      input.cards.map((card) => ({
        cardId: card.cardId,
        zone: card.zone as DeckZone,
        quantity: card.quantity,
        preferredPrintingId: card.preferredPrintingId ?? null,
      })),
    );

    const cardRows = await decks.cardsForDeck(input.id, userId);
    return { cards: cardRows.map((r) => toDeckCard(r)) };
  }),

  // ── GET /decks/:id/plan ───────────────────────────────────────────────────
  // The deck's plan (ADR-029). Always returns an object; deck-level fields are
  // empty and matchups [] when the deck has no plan yet.
  getPlan: os.getPlan.handler(async ({ input, context }) => {
    const { decks, deckPlans } = context.repos;
    const userId = context.userId;

    const deck = await decks.getIdAndFormat(input.id, userId);
    assertFound(deck, "Not found");

    const data = await deckPlans.getForDeck(input.id);
    return { plan: toDeckPlan(data) };
  }),

  // ── PUT /decks/:id/plan ───────────────────────────────────────────────────
  // Full replace of the deck's plan, saved as a unit by the editor.
  replacePlan: os.replacePlan.handler(async ({ input, context }) => {
    const { decks, deckPlans, catalog } = context.repos;
    const userId = context.userId;

    const deck = await decks.getIdAndFormat(input.id, userId);
    assertFound(deck, "Not found");

    await validateDeckPlan(catalog, input);

    await deckPlans.replaceForDeck(input.id, {
      generalStrategy: input.generalStrategy,
      mulliganSplit: input.mulliganSplit,
      mulliganGeneral: input.mulliganGeneral,
      mulliganFirst: input.mulliganFirst,
      mulliganSecond: input.mulliganSecond,
      battlefieldG1CardId: input.battlefieldGame1CardId,
      battlefieldFirstCardId: input.battlefieldFirstCardId,
      battlefieldSecondCardId: input.battlefieldSecondCardId,
      battlefieldCustom: input.battlefieldCustom,
      battlefieldNote: input.battlefieldNote,
      matchups: input.matchups.map((matchup) => ({
        opponentCardId: matchup.opponentCardId,
        opponentLabel: matchup.opponentLabel,
        notes: matchup.notes,
        swaps: matchup.swaps.map((swap) => ({
          cardId: swap.cardId,
          direction: swap.direction,
          quantity: swap.quantity,
        })),
      })),
    });

    const data = await deckPlans.getForDeck(input.id);
    return { plan: toDeckPlan(data) };
  }),

  // ── POST /decks/:id/clone ─────────────────────────────────────────────────
  clone: os.clone.handler(async ({ input, context }) => {
    const { decks } = context.repos;
    const userId = context.userId;

    const newDeck = await decks.cloneDeck(input.id, userId);
    assertFound(newDeck, "Not found");
    return toDeck(newDeck);
  }),

  // ── POST /decks/:id/variants ──────────────────────────────────────────────
  // Copy a deck into its variant family (ADR-042): a checkpoint slots the copy
  // behind the live deck as its predecessor, a variant becomes an editable
  // sibling. Creates the family (and marks the source primary) on first use.
  createVariant: os.createVariant.handler(async ({ input, context }) => {
    const { decks } = context.repos;
    const newDeck = await decks.createVariantCopy(input.id, context.userId, {
      mode: input.mode,
      name: input.name,
    });
    assertFound(newDeck, "Not found");
    return toDeck(newDeck);
  }),

  // ── POST /decks/:id/link ──────────────────────────────────────────────────
  // Link a deck that already exists into this deck's variant family, merging
  // the two families when both sides already have one.
  linkVariant: os.linkVariant.handler(async ({ input, context }) => {
    const { decks } = context.repos;
    const result = await decks.linkAsVariant(input.id, context.userId, {
      otherDeckId: input.otherDeckId,
      markAsPreviousVersion: input.markAsPreviousVersion,
    });
    if (result === "not-found") {
      throw new AppError(404, ERROR_CODES.NOT_FOUND, "Not found");
    }
    if (result === "invalid") {
      throw new AppError(400, ERROR_CODES.BAD_REQUEST, "Decks cannot be linked");
    }
    return toDeck(result);
  }),

  // ── POST /decks/:id/unlink ────────────────────────────────────────────────
  // Take this deck out of its variant family, repairing what is left behind.
  unlinkVariant: os.unlinkVariant.handler(async ({ input, context }) => {
    const { decks } = context.repos;
    const result = await decks.unlinkVariant(input.id, context.userId);
    if (result === "not-found") {
      throw new AppError(404, ERROR_CODES.NOT_FOUND, "Not found");
    }
    if (result === "no-family") {
      throw new AppError(400, ERROR_CODES.BAD_REQUEST, "Deck has no variants");
    }
    return toDeck(result);
  }),

  // ── POST /decks/:id/promote ───────────────────────────────────────────────
  // Make this variant front its family in the deck list.
  promotePrimary: os.promotePrimary.handler(async ({ input, context }) => {
    const { decks } = context.repos;
    const result = await decks.promoteToPrimary(input.id, context.userId);
    if (result === "not-found") {
      throw new AppError(404, ERROR_CODES.NOT_FOUND, "Not found");
    }
    if (result === "no-family") {
      throw new AppError(400, ERROR_CODES.BAD_REQUEST, "Deck has no variants");
    }
    return toDeck(result);
  }),

  // ── GET /decks/:id/export ────────────────────────────────────────────────
  // Encode a deck as a shareable deck code
  export: os.export.handler(async ({ input, context }): Promise<DeckExportResponse> => {
    const { decks, canonicalPrintings } = context.repos;
    const userId = context.userId;

    const [deck, cardRows] = await Promise.all([
      decks.getByIdForUser(input.id, userId),
      decks.cardsWithDetails(input.id, userId),
    ]);
    assertFound(deck, "Not found");

    // Shared resolve-then-encode path (also used by the public `encode` endpoint
    // for logged-out local decks). cardRows already carry the metadata the
    // codecs need.
    return encodeDeck(canonicalPrintings, cardRows, input.format ?? "piltover");
  }),

  // ── PATCH /decks/:id/pin ──────────────────────────────────────────────────
  setPinned: os.setPinned.handler(async ({ input, context }) => {
    const { decks } = context.repos;
    const userId = context.userId;

    const updated = await decks.setPinned(input.id, userId, input.isPinned);
    assertFound(updated, "Not found");
    return toDeck(updated);
  }),

  // ── PATCH /decks/:id/archive ──────────────────────────────────────────────
  setArchived: os.setArchived.handler(async ({ input, context }) => {
    const { decks } = context.repos;
    const userId = context.userId;

    const updated = await decks.setArchived(input.id, userId, input.archived);
    assertFound(updated, "Not found");
    return toDeck(updated);
  }),

  // ── GET /decks/:id/share ──────────────────────────────────────────────────
  // Reports the deck's current share state. Owner-only. An owned-but-unshared
  // deck returns { shareToken: null, isPublic: false } rather than 404ing;
  // only a missing or foreign deck 404s.
  getShare: os.getShare.handler(async ({ input, context }): Promise<DeckShareResponse> => {
    const { decks } = context.repos;
    const userId = context.userId;

    const state = await decks.getShareState(input.id, userId);
    assertFound(state, "Not found");

    return { shareToken: state.shareToken, isPublic: state.isPublic };
  }),

  // ── POST /decks/:id/share ─────────────────────────────────────────────────
  // Idempotent enable: if the deck already has a token, return the existing
  // share state unchanged; otherwise mint one and flip is_public=true.
  // Rotation lives at POST /decks/:id/share/rotate to avoid surprise churn.
  share: os.share.handler(async ({ input, context }): Promise<DeckShareResponse> => {
    const { decks } = context.repos;
    const userId = context.userId;

    const existing = await decks.getShareState(input.id, userId);
    assertFound(existing, "Not found");
    if (existing.shareToken !== null && existing.isPublic) {
      return { shareToken: existing.shareToken, isPublic: existing.isPublic };
    }

    const token = await withUniqueShareToken(async (candidate) => {
      const updated = await decks.setShareToken(input.id, userId, candidate, true);
      assertFound(updated, "Not found");
      return candidate;
    });

    return { shareToken: token, isPublic: true };
  }),

  // ── POST /decks/:id/share/rotate ──────────────────────────────────────────
  // Overwrites the existing token with a fresh one; the previous URL stops
  // resolving immediately. Owner-only. When the deck isn't shared yet, rotate
  // acts as "share now" (mints a token and flips is_public=true) — chosen over
  // 409 since setShareToken already supports the create-from-unshared path
  // cleanly and it matches the user-share rotate precedent.
  rotateShare: os.rotateShare.handler(async ({ input, context }): Promise<DeckShareResponse> => {
    const { decks, meta } = context.repos;
    const userId = context.userId;

    // An archived deck's token is its public permalink (ADR-014). Owner
    // scoping already makes this unreachable — the archive's synthetic owner
    // has no session — but the invariant is stated here so a future path that
    // rotates on someone's behalf cannot break every archive link.
    if (await meta.isMetaDeck(input.id)) {
      throw new AppError(409, ERROR_CODES.CONFLICT, "This deck's link cannot be rotated");
    }

    const token = await withUniqueShareToken(async (candidate) => {
      const updated = await decks.setShareToken(input.id, userId, candidate, true);
      assertFound(updated, "Not found");
      return candidate;
    });

    return { shareToken: token, isPublic: true };
  }),

  // ── DELETE /decks/:id/share ───────────────────────────────────────────────
  // Nulls the share token and flips is_public=false. Old links 404 forever.
  unshare: os.unshare.handler(async ({ input, context }): Promise<void> => {
    const { decks } = context.repos;
    const userId = context.userId;

    const updated = await decks.setShareToken(input.id, userId, null, false);
    assertFound(updated, "Not found");
  }),

  // ── POST /decks/share/:token/clone ────────────────────────────────────────
  // Any logged-in user can clone a publicly shared deck into their account.
  cloneShared: os.cloneShared.handler(async ({ input, context }) => {
    const { decks } = context.repos;
    const userId = context.userId;

    const newDeck = await decks.cloneFromShareToken(input.token, userId);
    assertFound(newDeck, "Not found");
    return { deckId: newDeck.id };
  }),
};
