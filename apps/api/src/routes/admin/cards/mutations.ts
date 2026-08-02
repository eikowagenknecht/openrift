import { appendSetTotal, fixTypography, ERROR_CODES } from "@openrift/shared";
import type { CardType, Domain, SuperType } from "@openrift/shared";
import { adminCardMutationsContract } from "@openrift/shared/contracts/admin/card-mutations";
import { cardFieldRules, printingFieldRules } from "@openrift/shared/db-field-rules";
import { extractKeywords } from "@openrift/shared/keywords";
import { normalizeNameForMatching } from "@openrift/shared/utils";
import { implement } from "@orpc/server";
import type { Updateable } from "kysely";

import type { CandidatePrintingsTable } from "../../../db/index.js";
import { AppError } from "../../../errors.js";
import { assertDeleted, assertFound, assertUpdated } from "../../../lib/assertions.js";
import { requireAuthedUser } from "../../../orpc/base.js";
import type { ApiContext } from "../../../orpc/context.js";
import { acceptFavoritePrintingsForCard } from "../../../services/accept-favorite-printings.js";
import { acceptFavoriteNewCard } from "../../../services/accept-gallery.js";
import { deleteCard } from "../../../services/card-admin.js";
import {
  assertCandidatePrintingsInScope,
  assertSomeProviderInScope,
  reviewableProviderScope,
} from "../../../services/card-review-scope.js";
import {
  acceptPrinting,
  deletePrinting,
  updatePrintingDistributionChannels,
  updatePrintingMarkers,
} from "../../../services/printing-admin.js";
import { recordAdminEvent } from "../../../services/record-admin-event.js";
import { relinkCandidatePrintings } from "../../../services/relink-candidates.js";

const os = implement(adminCardMutationsContract).$context<ApiContext>().use(requireAuthedUser);

/**
 * Bespoke admin card mutations: the candidate check/uncheck verbs and the
 * candidate-printing operations. Not-found / bad-request states are thrown as
 * `AppError` (via the `assert*` helpers or directly) and mapped by the
 * handler's appErrorInterceptor.
 */
export const adminCardMutationsRouter = {
  checkCandidateCard: os.checkCandidateCard.handler(async ({ input, context }): Promise<void> => {
    const { candidateCards } = context.repos;
    const result = await candidateCards.checkCandidateCard(input.candidateCardId);
    assertUpdated(result, "Candidate card not found");
  }),

  uncheckCandidateCard: os.uncheckCandidateCard.handler(
    async ({ input, context }): Promise<void> => {
      const { candidateCards } = context.repos;
      const result = await candidateCards.uncheckCandidateCard(input.candidateCardId);
      assertUpdated(result, "Candidate card not found");
    },
  ),

  checkAllCandidatePrintings: os.checkAllCandidatePrintings.handler(async ({ input, context }) => {
    const { candidateCards } = context.repos;
    const updated = await candidateCards.checkAllCandidatePrintings(
      input.printingId,
      input.extraIds,
    );
    return { updated };
  }),

  checkCandidatePrinting: os.checkCandidatePrinting.handler(
    async ({ input, context }): Promise<void> => {
      const { candidateCards } = context.repos;
      const result = await candidateCards.checkCandidatePrinting(input.id);
      assertUpdated(result, "Candidate printing not found");
    },
  ),

  uncheckCandidatePrinting: os.uncheckCandidatePrinting.handler(
    async ({ input, context }): Promise<void> => {
      const { candidateCards } = context.repos;
      const result = await candidateCards.uncheckCandidatePrinting(input.id);
      assertUpdated(result, "Candidate printing not found");
    },
  ),

  checkAllForCard: os.checkAllForCard.handler(async ({ input, context }) => {
    const { catalogMutations: mut, candidateCards } = context.repos;

    const card = await mut.getCardById(input.cardId);
    assertFound(card, "Card not found");

    const cardNormName = normalizeNameForMatching(card.name);
    const aliasRows = await mut.getCardAliases(card.id);
    const uniqueVariants = [...new Set([cardNormName, ...aliasRows.map((a) => a.normName)])];

    const updated = await candidateCards.checkAllCandidateCards(uniqueVariants, card.id);
    return { updated };
  }),

  patchCandidatePrinting: os.patchCandidatePrinting.handler(
    async ({ input, context }): Promise<void> => {
      const { candidateCards, providerSettings } = context.repos;
      const { id, ...body } = input;

      const scope = await reviewableProviderScope(context.adminAccess, providerSettings);
      await assertCandidatePrintingsInScope(candidateCards, [id], scope);

      // The contract body IS the writable-column allowlist (zod drops anything
      // else), so pass it through typed rather than re-listing the columns in a
      // string loop the compiler cannot check against `candidate_printings`.
      const updates: Updateable<CandidatePrintingsTable> = { ...body };

      if (Object.keys(updates).length === 0) {
        throw new AppError(400, ERROR_CODES.BAD_REQUEST, "No valid fields to update");
      }

      const before = await candidateCards.getCandidatePrintingById(id);

      const result = await candidateCards.patchCandidatePrinting(id, updates);
      assertUpdated(result, "Candidate printing not found");

      await recordAdminEvent(context.repos, context.userId, {
        action: "candidate-printing.patch",
        entityType: "candidate-printing",
        entityId: id,
        entityLabel: before?.shortCode ?? null,
        oldValues: before
          ? Object.fromEntries(
              Object.keys(updates).map((k) => [k, (before as Record<string, unknown>)[k]]),
            )
          : null,
        newValues: updates,
      });
    },
  ),

  deleteCandidatePrinting: os.deleteCandidatePrinting.handler(
    async ({ input, context }): Promise<void> => {
      const { candidateCards } = context.repos;
      const before = await candidateCards.getCandidatePrintingById(input.id);
      const result = await candidateCards.deleteCandidatePrinting(input.id);
      assertDeleted(result, "Candidate printing not found");

      await recordAdminEvent(context.repos, context.userId, {
        action: "candidate-printing.delete",
        entityType: "candidate-printing",
        entityId: input.id,
        entityLabel: before?.shortCode ?? null,
        oldValues: before
          ? {
              shortCode: before.shortCode,
              setId: before.setId,
              rarity: before.rarity,
              finish: before.finish,
              artVariant: before.artVariant,
              externalId: before.externalId,
            }
          : null,
      });
    },
  ),

  copyCandidatePrinting: os.copyCandidatePrinting.handler(
    async ({ input, context }): Promise<void> => {
      const { catalogMutations: mut, candidateCards } = context.repos;
      const { id, printingId } = input;

      if (!printingId) {
        throw new AppError(400, ERROR_CODES.BAD_REQUEST, "printingId is required");
      }

      const ps = await candidateCards.getCandidatePrintingById(id);
      assertFound(ps, "Candidate printing not found");

      const target = await mut.getPrintingDifferentiatorsById(printingId);
      assertFound(target, "Target printing not found");

      await candidateCards.copyCandidatePrinting(ps, target);

      await recordAdminEvent(context.repos, context.userId, {
        action: "candidate-printing.copy",
        entityType: "candidate-printing",
        entityId: id,
        entityLabel: ps.shortCode,
        newValues: { targetPrintingId: printingId },
      });
    },
  ),

  linkCandidatePrintings: os.linkCandidatePrintings.handler(
    async ({ input, context }): Promise<void> => {
      const { candidateCards } = context.repos;
      const { candidatePrintingIds, printingId } = input;

      if (!Array.isArray(candidatePrintingIds) || candidatePrintingIds.length === 0) {
        throw new AppError(400, ERROR_CODES.BAD_REQUEST, "candidatePrintingIds[] required");
      }

      await candidateCards.linkCandidatePrintings(candidatePrintingIds, printingId);

      // Persist or remove link overrides so links survive delete + re-upload
      await (printingId
        ? candidateCards.upsertPrintingLinkOverrides(candidatePrintingIds, printingId)
        : candidateCards.removePrintingLinkOverrides(candidatePrintingIds));

      await recordAdminEvent(context.repos, context.userId, {
        action: "candidate-printing.link",
        entityType: "candidate-printing",
        entityId: printingId ?? null,
        newValues: { candidatePrintingIds, printingId: printingId ?? null },
      });
    },
  ),

  renameCard: os.renameCard.handler(async ({ input, context }): Promise<void> => {
    const { catalogMutations: mut } = context.repos;
    const { cardId, newId } = input;

    if (!newId?.trim()) {
      throw new AppError(400, ERROR_CODES.BAD_REQUEST, "newId is required");
    }

    const card = await mut.getCardById(cardId);
    assertFound(card, "Card not found");

    if (newId === card.slug) {
      return;
    }

    // UUID PK is immutable -- only the slug changes
    await mut.renameCardSlugById(card.id, newId.trim());

    await recordAdminEvent(context.repos, context.userId, {
      action: "card.rename",
      entityType: "card",
      entityId: card.id,
      entityLabel: card.name,
      cardSlug: newId.trim(),
      oldValues: { slug: card.slug },
      newValues: { slug: newId.trim() },
    });
  }),

  deletePrinting: os.deletePrinting.handler(async ({ input, context }): Promise<void> => {
    const { catalogMutations, catalogDeleteGuards } = context.repos;
    const before = await catalogMutations.getFullPrintingById(input.printingId);
    await deletePrinting(
      context.transact,
      context.io,
      { catalogMutations, catalogDeleteGuards },
      input.printingId,
    );

    await recordAdminEvent(context.repos, context.userId, {
      action: "printing.delete",
      entityType: "printing",
      entityId: input.printingId,
      entityLabel: before?.shortCode ?? null,
      oldValues: before
        ? {
            cardId: before.cardId,
            shortCode: before.shortCode,
            finish: before.finish,
            publicCode: before.publicCode,
            language: before.language,
          }
        : null,
    });
  }),

  deleteCard: os.deleteCard.handler(async ({ input, context }): Promise<void> => {
    const { catalogMutations, catalogDeleteGuards } = context.repos;
    const before = await catalogMutations.getCardById(input.cardId);
    await deleteCard(
      context.transact,
      context.io,
      { catalogMutations, catalogDeleteGuards },
      input.cardId,
    );
    await context.repos.catalog.refreshCatalogViews();

    await recordAdminEvent(context.repos, context.userId, {
      action: "card.delete",
      entityType: "card",
      entityId: input.cardId,
      entityLabel: before?.name ?? null,
      oldValues: before ? { id: before.id, name: before.name, slug: before.slug } : null,
    });
  }),

  checkByProvider: os.checkByProvider.handler(async ({ input, context }) => {
    const { candidateCards } = context.repos;
    const provider = input.provider;
    if (!provider.trim()) {
      throw new AppError(400, ERROR_CODES.BAD_REQUEST, "Provider name is required");
    }
    return await candidateCards.checkByProvider(provider.trim(), new Date());
  }),

  deleteByProvider: os.deleteByProvider.handler(async ({ input, context }) => {
    const { candidateCards } = context.repos;
    const provider = input.provider;
    if (!provider.trim()) {
      throw new AppError(400, ERROR_CODES.BAD_REQUEST, "Provider name is required");
    }
    const deleted = await candidateCards.deleteByProvider(provider.trim());

    await recordAdminEvent(context.repos, context.userId, {
      action: "provider.delete-candidates",
      entityType: "provider",
      entityId: provider.trim(),
      entityLabel: provider.trim(),
      newValues: { deleted },
    });

    return { provider, deleted };
  }),

  upsertErrata: os.upsertErrata.handler(async ({ input, context }): Promise<void> => {
    const { catalogMutations: mut, cardErrata } = context.repos;
    const { cardId, correctedRulesText, correctedEffectText, source, sourceUrl, effectiveDate } =
      input;

    const [errataBefore] = await cardErrata.getByCardIds([cardId]);
    const card = await mut.getCardById(cardId);

    await cardErrata.upsert(cardId, {
      correctedRulesText,
      correctedEffectText,
      source,
      sourceUrl,
      effectiveDate,
    });

    // Recompute keywords to include errata text
    const printingTexts = await mut.getPrintingTextsForCardId(cardId);
    const keywords = [
      ...extractKeywords(correctedRulesText ?? ""),
      ...extractKeywords(correctedEffectText ?? ""),
      ...printingTexts.flatMap((pt) => [
        ...extractKeywords(pt.printedRulesText ?? ""),
        ...extractKeywords(pt.printedEffectText ?? ""),
      ]),
    ].filter((v, i, a) => a.indexOf(v) === i);

    await mut.updateCardById(cardId, { keywords });

    await recordAdminEvent(context.repos, context.userId, {
      action: "errata.upsert",
      entityType: "errata",
      entityId: cardId,
      entityLabel: card?.name ?? null,
      cardSlug: card?.slug ?? null,
      oldValues: errataBefore ?? null,
      newValues: { correctedRulesText, correctedEffectText, source, sourceUrl, effectiveDate },
    });
  }),

  deleteErrata: os.deleteErrata.handler(async ({ input, context }): Promise<void> => {
    const { catalogMutations: mut, cardErrata } = context.repos;
    const { cardId } = input;

    const [errataBefore] = await cardErrata.getByCardIds([cardId]);
    const card = await mut.getCardById(cardId);

    await cardErrata.deleteByCardId(cardId);

    // Recompute keywords from printing text only (no errata anymore)
    const printingTexts = await mut.getPrintingTextsForCardId(cardId);
    const keywords = printingTexts
      .flatMap((pt) => [
        ...extractKeywords(pt.printedRulesText ?? ""),
        ...extractKeywords(pt.printedEffectText ?? ""),
      ])
      .filter((v, i, a) => a.indexOf(v) === i);

    await mut.updateCardById(cardId, { keywords });

    await recordAdminEvent(context.repos, context.userId, {
      action: "errata.delete",
      entityType: "errata",
      entityId: cardId,
      entityLabel: card?.name ?? null,
      cardSlug: card?.slug ?? null,
      oldValues: errataBefore ?? null,
    });
  }),

  uploadErrata: os.uploadErrata.handler(async ({ input, context }) => {
    const { importErrata } = context.services;
    const result = await importErrata(context.transact, {
      entries: input.entries,
      dryRun: input.dryRun,
    });

    // A dry run mutates nothing — no audit event.
    if (!input.dryRun) {
      await recordAdminEvent(context.repos, context.userId, {
        action: "errata.upload",
        entityType: "upload",
        newValues: {
          newCount: result.newCount,
          updatedCount: result.updatedCount,
          unchangedCount: result.unchangedCount,
          errors: result.errors.length,
        },
      });
    }

    return result;
  }),

  acceptField: os.acceptField.handler(async ({ input, context }): Promise<void> => {
    const { catalogMutations: mut, candidateCards, providerSettings } = context.repos;
    const { cardId, field, value } = input;

    // Grant holders may only edit cards that still have candidate data from
    // an allowed provider — without this, accept-field would be unscoped
    // card editing by id.
    const scope = await reviewableProviderScope(context.adminAccess, providerSettings);
    if (scope !== null) {
      assertSomeProviderInScope(await candidateCards.candidateProvidersForCard(cardId), scope);
    }

    // Normalize null to empty array for array-typed fields
    const arrayFields = new Set(["types", "superTypes", "domains", "tags"]);
    const normalized = value === null && arrayFields.has(field) ? [] : value;

    const validator = cardFieldRules[field as keyof typeof cardFieldRules];
    if (validator) {
      const parsed = validator.safeParse(normalized);
      if (!parsed.success) {
        throw new AppError(
          400,
          ERROR_CODES.VALIDATION_ERROR,
          `Invalid value for ${field}: ${parsed.error.issues[0].message}`,
        );
      }
    }

    const finalValue = normalized;

    // Snapshot before the write for the audit event. domains/superTypes live
    // only in junction tables — no cheap before-read, so their old is null;
    // types uses the denormalized cards.type scalar (ADR-037).
    const cardBefore = await mut.getFullCardById(cardId);
    const auditEvent = () =>
      recordAdminEvent(context.repos, context.userId, {
        action: "card.accept-field",
        entityType: "card",
        entityId: cardId,
        entityLabel: cardBefore?.name ?? null,
        cardSlug: cardBefore?.slug ?? null,
        oldValues:
          field === "domains" || field === "superTypes"
            ? null
            : {
                [field]:
                  field === "types"
                    ? cardBefore?.type
                    : (cardBefore as Record<string, unknown> | undefined)?.[field],
              },
        newValues: { [field]: finalValue },
      });

    // Domains and superTypes are stored in junction tables, not on the cards row
    if (field === "domains") {
      await mut.replaceCardDomainsById(cardId, finalValue as string[]);
      await context.repos.catalog.refreshCatalogViews();
      await auditEvent();
      return;
    }
    if (field === "superTypes") {
      await mut.replaceCardSuperTypesById(cardId, finalValue as string[]);
      await context.repos.catalog.refreshCatalogViews();
      await auditEvent();
      return;
    }
    // Card types live in the card_card_types junction; the repo keeps the
    // denormalized cards.type scalar in sync (ADR-037).
    if (field === "types") {
      try {
        await mut.replaceCardTypesById(cardId, finalValue as string[]);
      } catch (error: unknown) {
        // FK violation on card_types(slug) — unknown type slug, mirror the
        // scalar-column 400 below.
        if (error instanceof Error && "code" in error && error.code === "23503") {
          throw new AppError(
            400,
            ERROR_CODES.VALIDATION_ERROR,
            `Invalid value for ${field}: ${String(finalValue)}`,
          );
        }
        throw error;
      }
      await context.repos.catalog.refreshCatalogViews();
      await auditEvent();
      return;
    }

    const updates: Record<string, unknown> = { [field]: finalValue };

    try {
      await mut.updateCardById(cardId, updates);
    } catch (error: unknown) {
      if (error instanceof Error && "code" in error && error.code === "23503") {
        throw new AppError(
          400,
          ERROR_CODES.VALIDATION_ERROR,
          `Invalid value for ${field}: ${String(finalValue)}`,
        );
      }
      throw error;
    }

    // A name change updates cards.norm_name (via the cards_set_norm_name
    // trigger) but not card_name_aliases — reconcile the self-alias so the
    // rename leaves no stale old-name row and the new name is matchable.
    if (field === "name" && typeof finalValue === "string" && cardBefore) {
      await mut.syncSelfAliasOnRename(
        cardId,
        normalizeNameForMatching(cardBefore.name),
        normalizeNameForMatching(finalValue),
      );
    }

    await auditEvent();
  }),

  acceptPrintingField: os.acceptPrintingField.handler(async ({ input, context }): Promise<void> => {
    const { catalogMutations: mut, rarities, keywords } = context.repos;
    const { printingId, field, value, source } = input;

    // Normalize enum fields that have DB check constraints (before validation
    // so that case-insensitive input like "common" is accepted)
    let normalizedValue: unknown = value;
    if (field === "rarity" && typeof value === "string") {
      const rarityRows = await rarities.listAll();
      const raritySlugs = rarityRows.map((row) => row.slug);
      normalizedValue =
        raritySlugs.find((slug) => slug.toLowerCase() === value.toLowerCase()) || value;
    }

    // Validate against printingFieldRules when a rule exists for this field
    const validator = printingFieldRules[field as keyof typeof printingFieldRules];
    if (validator) {
      const parsed = validator.safeParse(normalizedValue);
      if (!parsed.success) {
        throw new AppError(
          400,
          ERROR_CODES.VALIDATION_ERROR,
          `Invalid value for ${field}: ${parsed.error.issues[0].message}`,
        );
      }
      normalizedValue = parsed.data;
    }

    // Ensure the printing exists before mutating so a bad id 404s instead of
    // silently updating nothing.
    const printingBefore = await mut.getFullPrintingById(printingId);
    assertFound(printingBefore, "Printing not found");

    // Same scoping rule as acceptField, resolved via the printing's card.
    const scope = await reviewableProviderScope(
      context.adminAccess,
      context.repos.providerSettings,
    );
    if (scope !== null) {
      assertSomeProviderInScope(
        await context.repos.candidateCards.candidateProvidersForCard(printingBefore.cardId),
        scope,
      );
    }

    // Audit snapshot: distributionChannelSlugs lives only in a junction table
    // (no denormalized column), so its old is null; everything else — including
    // markerSlugs — is on the printings row already fetched above.
    const auditEvent = (written: unknown) =>
      recordAdminEvent(context.repos, context.userId, {
        action: "printing.accept-field",
        entityType: "printing",
        entityId: printingId,
        entityLabel: printingBefore.shortCode,
        oldValues:
          field === "distributionChannelSlugs"
            ? null
            : { [field]: (printingBefore as Record<string, unknown>)[field] },
        newValues: { [field]: written },
      });

    // When markerSlugs changes, update via dedicated function (printing_markers
    // join is the source of truth; the trigger keeps printings.marker_slugs in sync).
    if (field === "markerSlugs") {
      const newSlugs = Array.isArray(normalizedValue)
        ? (normalizedValue as string[]).filter((s) => typeof s === "string")
        : [];
      await updatePrintingMarkers(context.transact, printingId, newSlugs);
      await auditEvent(newSlugs);
      return;
    }

    // Same pattern for distribution channels (rows in printing_distribution_channels).
    if (field === "distributionChannelSlugs") {
      const { catalogMutations, distributionChannels: channelsRepo } = context.repos;
      const newSlugs = Array.isArray(normalizedValue)
        ? (normalizedValue as string[]).filter((s) => typeof s === "string")
        : [];
      await updatePrintingDistributionChannels(
        { catalogMutations, distributionChannels: channelsRepo },
        printingId,
        newSlugs,
      );
      await auditEvent(newSlugs);
      return;
    }

    // Apply typography fixes to text fields only when accepting from a provider
    if (source === "provider") {
      const printingTextFields = new Set(["printedRulesText", "printedEffectText"]);
      if (printingTextFields.has(field) && typeof normalizedValue === "string") {
        const costKeywords = await context.repos.keywords.listCostKeywords();
        normalizedValue = fixTypography(normalizedValue, { costKeywords });
      }
      if (field === "flavorText" && typeof normalizedValue === "string") {
        normalizedValue = fixTypography(normalizedValue, {
          italicParens: false,
          keywordGlyphs: false,
        });
      }
    }

    // Append set total to publicCode when accepting from a provider
    if (source === "provider" && field === "publicCode" && typeof normalizedValue === "string") {
      const setTotal = await mut.getSetPrintedTotalForPrinting(printingId);
      normalizedValue = appendSetTotal(normalizedValue, setTotal?.printedTotal);
    }

    // Audit the human-readable value: for setId that's the slug, not the UUID
    // the conversion below writes.
    const auditValue = normalizedValue;

    // Candidate printings store setId as a slug; printings store it as a UUID FK
    if (field === "setId" && normalizedValue) {
      const { sets } = context.repos;
      const setRow = await sets.getBySlug(normalizedValue as string);
      assertFound(setRow, `Set not found: ${normalizedValue}`);
      normalizedValue = setRow.id;
    }

    try {
      await mut.updatePrintingFieldById(printingId, field, normalizedValue);
    } catch (error: unknown) {
      if (error instanceof Error && "code" in error && error.code === "23503") {
        throw new AppError(
          400,
          ERROR_CODES.VALIDATION_ERROR,
          `Invalid value for ${field}: ${String(normalizedValue)}`,
        );
      }
      throw error;
    }

    // Recompute card-level keywords when printing text changes
    if (field === "printedRulesText" || field === "printedEffectText") {
      await keywords.recomputeForPrintingCard(printingId);
    }

    await auditEvent(auditValue);
  }),

  acceptNewCard: os.acceptNewCard.handler(async ({ input, context }): Promise<void> => {
    const { name, cardFields } = input;

    // Grant holders may only accept names that have candidate data from an
    // allowed provider — otherwise this endpoint is arbitrary card creation
    // (the manual createCard is excluded from the card-review section).
    const scope = await reviewableProviderScope(
      context.adminAccess,
      context.repos.providerSettings,
    );
    if (scope !== null) {
      assertSomeProviderInScope(
        await context.repos.candidateCards.candidateProvidersForNormName(name),
        scope,
      );
    }

    await context.transact(async (trxRepos) => {
      // FK constraints validate values at DB level — safe to cast from z.string()
      await trxRepos.catalogMutations.acceptNewCardFromSources(
        cardFields as typeof cardFields & {
          types: CardType[];
          domains: Domain[];
          superTypes?: SuperType[];
        },
        name,
      );
    });

    await context.repos.catalog.refreshCatalogViews();

    await recordAdminEvent(context.repos, context.userId, {
      action: "card.accept-new",
      entityType: "card",
      entityId: cardFields.id,
      entityLabel: cardFields.name,
      cardSlug: cardFields.id,
      newValues: cardFields,
    });
  }),

  acceptFavoriteNewCard: os.acceptFavoriteNewCard.handler(async ({ input, context }) => {
    const {
      candidateCards,
      catalogMutations,
      printingImages,
      markers,
      distributionChannels,
      providerSettings,
      printingEvents,
    } = context.repos;
    const favoriteProviders = await providerSettings.favoriteProviders();

    const result = await acceptFavoriteNewCard(
      context.transact,
      context.io,
      {
        candidateCards,
        catalogMutations,
        printingImages,
        markers,
        distributionChannels,
        printingEvents,
      },
      input.name,
      favoriteProviders,
    );

    await context.repos.catalog.refreshCatalogViews();

    await recordAdminEvent(context.repos, context.userId, {
      action: "card.accept-favorites",
      entityType: "card",
      entityId: result.cardSlug,
      entityLabel: input.name,
      cardSlug: result.cardSlug,
      newValues: { cardSlug: result.cardSlug, printingsCreated: result.printingsCreated },
    });

    return result;
  }),

  acceptFavoritePrintings: os.acceptFavoritePrintings.handler(async ({ input, context }) => {
    const {
      candidateCards,
      catalogMutations,
      printingImages,
      markers,
      distributionChannels,
      providerSettings,
      printingEvents,
    } = context.repos;
    const favoriteProviders = await providerSettings.favoriteProviders();

    const result = await acceptFavoritePrintingsForCard(
      context.transact,
      context.io,
      {
        candidateCards,
        catalogMutations,
        printingImages,
        markers,
        distributionChannels,
        printingEvents,
      },
      input.cardSlug,
      favoriteProviders,
    );

    await recordAdminEvent(context.repos, context.userId, {
      action: "printing.accept-favorites",
      entityType: "printing",
      entityLabel: input.cardSlug,
      cardSlug: input.cardSlug,
      newValues: { printingsCreated: result.printingsCreated, skipped: result.skipped.length },
    });

    if (result.printingsCreated > 0) {
      // Same reason as the single acceptPrinting handler: candidates from other
      // providers were keyed before these printings existed.
      await relinkCandidatePrintings(context.repos);
    }

    return result;
  }),

  relinkCandidatePrintings: os.relinkCandidatePrintings.handler(async ({ context }) => {
    const result = await relinkCandidatePrintings(context.repos);

    await recordAdminEvent(context.repos, context.userId, {
      action: "candidate-printing.relink",
      entityType: "candidate-printing",
      newValues: { examined: result.examined, linked: result.linked },
    });

    return result;
  }),

  linkUnmatched: os.linkUnmatched.handler(async ({ input, context }): Promise<void> => {
    const { catalogMutations: mut } = context.repos;
    const { name, cardId } = input;

    if (!cardId) {
      throw new AppError(400, ERROR_CODES.BAD_REQUEST, "cardId required");
    }

    const card = await mut.getCardById(cardId);
    assertFound(card, "Target card not found");

    await context.transact(async (trxRepos) => {
      await trxRepos.catalogMutations.createNameAliases(name, card.id);
    });

    await recordAdminEvent(context.repos, context.userId, {
      action: "card.link-unmatched",
      entityType: "card",
      entityId: card.id,
      entityLabel: card.name,
      cardSlug: card.slug,
      newValues: { name, cardId },
    });
  }),

  acceptPrinting: os.acceptPrinting.handler(async ({ input, context }) => {
    const { catalogMutations, printingImages, markers, distributionChannels, printingEvents } =
      context.repos;
    const { cardId, printingFields, candidatePrintingIds } = input;

    const scope = await reviewableProviderScope(
      context.adminAccess,
      context.repos.providerSettings,
    );
    if (scope !== null) {
      // Without candidate ids this is de-facto manual printing creation
      // (createPrinting), which the card-review section excludes.
      if (candidatePrintingIds.length === 0) {
        throw new AppError(403, ERROR_CODES.FORBIDDEN, "Forbidden");
      }
      await assertCandidatePrintingsInScope(
        context.repos.candidateCards,
        candidatePrintingIds,
        scope,
      );
    }

    const printingId = await acceptPrinting(
      context.transact,
      { catalogMutations, printingImages, markers, distributionChannels, printingEvents },
      cardId,
      printingFields,
      candidatePrintingIds,
      context.io,
    );

    const card = await catalogMutations.getCardById(cardId);
    await recordAdminEvent(context.repos, context.userId, {
      action: "printing.accept",
      entityType: "printing",
      entityId: printingId,
      entityLabel: printingFields.shortCode,
      cardSlug: card?.slug ?? null,
      newValues: { printingFields, candidatePrintingIds },
    });

    // A brand-new printing has no rank row yet, so it would sort last until the
    // next refresh (migration 215).
    await context.repos.catalog.refreshCanonicalRank();

    // Other providers' candidates for this printing were uploaded before it
    // existed, so their ingest-time key resolution missed it. Re-resolve now so
    // they leave the "new printing" list on the very next refetch.
    await relinkCandidatePrintings(context.repos);

    return { printingId };
  }),

  createCard: os.createCard.handler(async ({ input, context }) => {
    const cardFields = input;

    await context.transact(async (trxRepos) => {
      await trxRepos.catalogMutations.acceptNewCardFromSources(
        cardFields as typeof cardFields & {
          types: CardType[];
          domains: Domain[];
          superTypes?: SuperType[];
        },
        normalizeNameForMatching(cardFields.name),
      );
    });

    await context.repos.catalog.refreshCatalogViews();

    await recordAdminEvent(context.repos, context.userId, {
      action: "card.create",
      entityType: "card",
      entityId: cardFields.id,
      entityLabel: cardFields.name,
      cardSlug: cardFields.id,
      newValues: cardFields,
    });

    return { cardSlug: cardFields.id };
  }),

  createPrinting: os.createPrinting.handler(async ({ input, context }) => {
    const { catalogMutations, printingImages, markers, distributionChannels, printingEvents } =
      context.repos;
    const { cardId, ...printingFields } = input;

    const printingId = await acceptPrinting(
      context.transact,
      { catalogMutations, printingImages, markers, distributionChannels, printingEvents },
      cardId,
      printingFields,
      [],
      context.io,
    );

    const card = await catalogMutations.getCardById(cardId);
    await recordAdminEvent(context.repos, context.userId, {
      action: "printing.create",
      entityType: "printing",
      entityId: printingId,
      entityLabel: printingFields.shortCode,
      cardSlug: card?.slug ?? null,
      newValues: printingFields,
    });

    // A brand-new printing has no rank row yet, so it would sort last until the
    // next refresh (migration 215).
    await context.repos.catalog.refreshCanonicalRank();

    return { printingId };
  }),

  upload: os.upload.handler(async ({ input, context }) => {
    const { provider, candidates: cards } = input;

    const { ingestCandidates } = context.services;
    const result = await ingestCandidates(context.transact, provider.trim(), cards);

    // Counts only — the per-card detail arrays are unbounded.
    await recordAdminEvent(context.repos, context.userId, {
      action: "candidates.upload",
      entityType: "upload",
      entityId: provider.trim(),
      entityLabel: provider.trim(),
      newValues: {
        newCards: result.newCards,
        removedCards: result.removedCards,
        updates: result.updates,
        unchanged: result.unchanged,
        newPrintings: result.newPrintings,
        removedPrintings: result.removedPrintings,
        printingUpdates: result.printingUpdates,
        printingsUnchanged: result.printingsUnchanged,
        errors: result.errors.length,
      },
    });

    return {
      provider: result.provider,
      newCards: result.newCards,
      removedCards: result.removedCards,
      updates: result.updates,
      unchanged: result.unchanged,
      newPrintings: result.newPrintings,
      removedPrintings: result.removedPrintings,
      printingUpdates: result.printingUpdates,
      printingsUnchanged: result.printingsUnchanged,
      errors: result.errors,
      newCardDetails: result.newCardDetails,
      removedCardDetails: result.removedCardDetails,
      updatedCards: result.updatedCards,
      newPrintingDetails: result.newPrintingDetails,
      removedPrintingDetails: result.removedPrintingDetails,
      updatedPrintings: result.updatedPrintings,
    };
  }),
};
