import { adminCardMutationsContract } from "@openrift/shared/contracts/admin/card-mutations";
import { printingFieldRules } from "@openrift/shared/db-field-rules";
import { ERROR_CODES } from "@openrift/shared/error-codes";
import { appendSetTotal, fixTypography } from "@openrift/shared/fix-typography";
import { implement } from "@orpc/server";

import { AppError } from "../../../errors.js";
import { assertFound } from "../../../lib/assertions.js";
import { requireAuthedUser } from "../../../orpc/base.js";
import type { ApiContext } from "../../../orpc/context.js";
import { acceptFavoritePrintingsForCard } from "../../candidates/services/accept-favorite-printings.js";
import {
  assertCandidatePrintingsInScope,
  assertSomeProviderInScope,
  reviewableProviderScope,
} from "../../candidates/services/card-review-scope.js";
import { relinkCandidatePrintings } from "../../candidates/services/relink-candidates.js";
import { recordAdminEvent } from "../../system/services/record-admin-event.js";
import {
  acceptPrinting,
  deletePrinting,
  updatePrintingDistributionChannels,
  updatePrintingMarkers,
} from "../services/printing-admin.js";

const os = implement(adminCardMutationsContract).$context<ApiContext>().use(requireAuthedUser);

export const adminCardMutationsPrintingsRouter = {
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

  acceptPrintingField: os.acceptPrintingField.handler(async ({ input, context }): Promise<void> => {
    const { catalogMutations: mut, rarities, keywords } = context.repos;
    const { printingId, field, value, source } = input;

    // Normalize enum fields before validation so case-insensitive input like
    // "common" is accepted.
    let normalizedValue: unknown = value;
    if (field === "rarity" && typeof value === "string") {
      const rarityRows = await rarities.listAll();
      const raritySlugs = rarityRows.map((row) => row.slug);
      normalizedValue =
        raritySlugs.find((slug) => slug.toLowerCase() === value.toLowerCase()) ?? value;
    }

    const validator = printingFieldRules[field as keyof typeof printingFieldRules];
    if (validator) {
      const parsed = validator.safeParse(normalizedValue);
      if (!parsed.success) {
        throw new AppError(
          400,
          ERROR_CODES.VALIDATION_ERROR,
          `Invalid value for ${field}: ${parsed.error.issues[0]?.message ?? "invalid value"}`,
        );
      }
      normalizedValue = parsed.data;
    }

    const printingBefore = await mut.getFullPrintingById(printingId);
    assertFound(printingBefore, "Printing not found");

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

    // Distribution channels also live only in a junction table
    // (printing_distribution_channels).
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
      const slug = normalizedValue as string;
      const setRow = await sets.getBySlug(slug);
      assertFound(setRow, `Set not found: ${slug}`);
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

    if (field === "printedRulesText" || field === "printedEffectText") {
      await keywords.recomputeForPrintingCard(printingId);
      await context.repos.cardTokens.recomputeForPrintingCard(printingId);
      await context.repos.catalog.refreshCardAggregates();
    }

    await auditEvent(auditValue);
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

    // A brand-new printing has no rank row yet, and may complete an existing
    // one's foil-twin pair — both need the full refresh, not just the rank one.
    await context.repos.catalog.refreshCatalogViews();

    // Other providers' candidates for this printing were uploaded before it
    // existed, so their ingest-time key resolution missed it. Re-resolve now so
    // they leave the "new printing" list on the very next refetch.
    await relinkCandidatePrintings(context.repos);

    return { printingId };
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

  createPrinting: os.createPrinting.handler(async ({ input, context }) => {
    const { catalogMutations, printingImages, markers, distributionChannels, printingEvents } =
      context.repos;
    const { cardId, ...printingFields } = input;

    // An identity collision here is rejected; the shared upsert never overwrites it.
    const printingId = await acceptPrinting(
      context.transact,
      { catalogMutations, printingImages, markers, distributionChannels, printingEvents },
      cardId,
      printingFields,
      [],
      context.io,
      { requireNew: true },
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

    // A brand-new printing has no rank row yet, and may complete an existing
    // one's foil-twin pair — both need the full refresh, not just the rank one.
    await context.repos.catalog.refreshCatalogViews();

    return { printingId };
  }),
};
