import { ERROR_CODES } from "@openrift/shared/error-codes";

import type { Transact } from "../../../deps.js";
import { AppError } from "../../../errors.js";
import type { Io } from "../../../io.js";
import { assertFound } from "../../../lib/assertions.js";
import type {
  CardDeleteBlockers,
  catalogDeleteGuardsRepo,
} from "../repositories/catalog-delete-guards.js";
import type { catalogMutationsRepo } from "../repositories/catalog-mutations.js";
import { cleanupOrphanedImageFiles, deletePrintingRows } from "./printing-admin.js";

type CatalogMutationsRepo = ReturnType<typeof catalogMutationsRepo>;
type CatalogDeleteGuardsRepo = ReturnType<typeof catalogDeleteGuardsRepo>;

const BLOCKER_LABELS: Record<keyof CardDeleteBlockers, string> = {
  copies: "collection copies",
  collectionEvents: "collection history entries",
  deckCards: "deck cards",
  listEntries: "list entries",
  loans: "loans",
  cardTrades: "trades",
  marketplaceProductVariants: "marketplace variant mappings",
  productPrintings: "marketplace product mappings",
};

/**
 * Deletes a card, all of its printings, and its admin-owned children (bans,
 * marketplace card overrides; errata/aliases/junctions cascade). Refuses with
 * CONFLICT while user data or marketplace product mappings still reference
 * the card.
 */
export async function deleteCard(
  transact: Transact,
  io: Io,
  repos: { catalogMutations: CatalogMutationsRepo; catalogDeleteGuards: CatalogDeleteGuardsRepo },
  cardId: string,
): Promise<void> {
  const mut = repos.catalogMutations;

  const card = await mut.getCardById(cardId);
  assertFound(card, "Card not found");

  const blockers = await repos.catalogDeleteGuards.countForCard(card.id);
  throwIfBlocked(blockers);

  const printings = await mut.getPrintingIdsByCardId(card.id);

  let orphanCandidateImageIds: string[];
  try {
    orphanCandidateImageIds = await transact(async (trxRepos) => {
      const trxMut = trxRepos.catalogMutations;
      const imageFileIds: string[] = [];
      for (const printing of printings) {
        imageFileIds.push(...(await deletePrintingRows(trxRepos, printing.id)));
      }
      await trxMut.deleteCardBansByCardId(card.id);
      await trxMut.deleteMarketplaceCardOverridesByCardId(card.id);
      await trxMut.deleteCardById(card.id);
      return imageFileIds;
    });
  } catch (error: unknown) {
    // 23503 = foreign_key_violation: a row appeared after the blocker check, re-check for CONFLICT.
    if (error instanceof Error && "code" in error && error.code === "23503") {
      throwIfBlocked(await repos.catalogDeleteGuards.countForCard(card.id));
    }
    throw error;
  }

  await cleanupOrphanedImageFiles(io, mut, orphanCandidateImageIds);
}

/** Throws a CONFLICT AppError naming every non-zero blocker count. */
function throwIfBlocked(blockers: CardDeleteBlockers): void {
  const blocking = Object.entries(blockers).filter(([, count]) => count > 0);
  if (blocking.length > 0) {
    const detail = blocking
      .map(([source, count]) => `${BLOCKER_LABELS[source as keyof CardDeleteBlockers]} (${count})`)
      .join(", ");
    throw new AppError(
      409,
      ERROR_CODES.CONFLICT,
      `Card cannot be deleted, it is still referenced by: ${detail}`,
    );
  }
}
