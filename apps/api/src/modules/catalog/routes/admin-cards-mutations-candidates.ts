import { adminCardMutationsContract } from "@openrift/shared/contracts/admin/card-mutations";
import { ERROR_CODES } from "@openrift/shared/error-codes";
import { normalizeNameForIdentity } from "@openrift/shared/utils";
import { implement } from "@orpc/server";
import type { Updateable } from "kysely";

import type { CandidatePrintingsTable } from "../../../db/tables/candidates.js";
import { AppError } from "../../../errors.js";
import { assertDeleted, assertFound, assertUpdated } from "../../../lib/assertions.js";
import { requireAuthedUser } from "../../../orpc/base.js";
import type { ApiContext } from "../../../orpc/context.js";
import {
  assertCandidatePrintingsInScope,
  reviewableProviderScope,
} from "../../candidates/services/card-review-scope.js";
import { resolveCheckedSubmissions } from "../../candidates/services/card-submission-outcomes.js";
import { relinkCandidatePrintings } from "../../candidates/services/relink-candidates.js";
import { recordAdminEvent } from "../../system/services/record-admin-event.js";

const os = implement(adminCardMutationsContract).$context<ApiContext>().use(requireAuthedUser);

export const adminCardMutationsCandidatesRouter = {
  checkCandidateCard: os.checkCandidateCard.handler(async ({ input, context }): Promise<void> => {
    const { candidateCards } = context.repos;
    const result = await candidateCards.checkCandidateCard(input.candidateCardId);
    assertUpdated(result, "Candidate card not found");

    await resolveCheckedSubmissions(context.repos, {
      candidateCardIds: [input.candidateCardId],
      adminUserId: context.userId,
      now: new Date(),
      io: context.io,
    });
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
    const { updated, candidateCardIds } = await candidateCards.checkAllCandidatePrintings(
      input.printingId,
      input.extraIds,
    );

    await resolveCheckedSubmissions(context.repos, {
      candidateCardIds,
      adminUserId: context.userId,
      now: new Date(),
      io: context.io,
    });
    return { updated };
  }),

  checkCandidatePrinting: os.checkCandidatePrinting.handler(
    async ({ input, context }): Promise<void> => {
      const { candidateCards } = context.repos;
      const result = await candidateCards.checkCandidatePrinting(input.id);
      assertFound(result, "Candidate printing not found");

      await resolveCheckedSubmissions(context.repos, {
        candidateCardIds: [result.candidateCardId],
        adminUserId: context.userId,
        now: new Date(),
        io: context.io,
      });
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

    const cardNormName = normalizeNameForIdentity(card.name);
    const aliasRows = await mut.getCardAliases(card.id);
    const uniqueVariants = [...new Set([cardNormName, ...aliasRows.map((a) => a.normName)])];

    const { updated, candidateCardIds } = await candidateCards.checkAllCandidateCards(
      uniqueVariants,
      card.id,
    );

    await resolveCheckedSubmissions(context.repos, {
      candidateCardIds,
      adminUserId: context.userId,
      now: new Date(),
      io: context.io,
    });
    return { updated };
  }),

  patchCandidatePrinting: os.patchCandidatePrinting.handler(
    async ({ input, context }): Promise<void> => {
      const { candidateCards, providerSettings } = context.repos;
      const { id, ...body } = input;

      const scope = await reviewableProviderScope(context.adminAccess, providerSettings);
      await assertCandidatePrintingsInScope(candidateCards, [id], scope);

      // Zod already restricts `body` to the writable-column allowlist for candidate_printings.
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

  relinkCandidatePrintings: os.relinkCandidatePrintings.handler(async ({ context }) => {
    const result = await relinkCandidatePrintings(context.repos);

    await recordAdminEvent(context.repos, context.userId, {
      action: "candidate-printing.relink",
      entityType: "candidate-printing",
      newValues: { examined: result.examined, linked: result.linked },
    });

    return result;
  }),

  checkByProvider: os.checkByProvider.handler(async ({ input, context }) => {
    const { candidateCards } = context.repos;
    const provider = input.provider;
    if (!provider.trim()) {
      throw new AppError(400, ERROR_CODES.BAD_REQUEST, "Provider name is required");
    }
    const now = new Date();
    const result = await candidateCards.checkByProvider(provider.trim(), now);

    // checkByProvider returns a count, not ids; fetch affected submissions from the ledger.
    const pending = await context.repos.cardSubmissions.pendingByProvider(provider.trim());
    await resolveCheckedSubmissions(context.repos, {
      candidateCardIds: pending
        .map((submission) => submission.candidateCardId)
        .filter((id): id is string => id !== null),
      adminUserId: context.userId,
      now,
      io: context.io,
    });
    return result;
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
