import { ERROR_CODES } from "@openrift/shared";

import type { Transact } from "../deps.js";
import { AppError } from "../errors.js";
import type { Io } from "../io.js";
import type {
  CardDeleteBlockers,
  catalogDeleteGuardsRepo,
} from "../repositories/catalog-delete-guards.js";
import type { catalogMutationsRepo } from "../repositories/catalog-mutations.js";
import { assertFound } from "../utils/assertions.js";
import { cleanupOrphanedImageFiles, deletePrintingRows } from "./printing-admin.js";

type CatalogMutationsRepo = ReturnType<typeof catalogMutationsRepo>;
type CatalogDeleteGuardsRepo = ReturnType<typeof catalogDeleteGuardsRepo>;

// ── deleteCard ───────────────────────────────────────────────────────────────

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
 * Delete a card, all of its printings, and its admin-owned children (bans,
 * marketplace card overrides; errata/aliases/junctions cascade). Refuses with
 * CONFLICT while user data (copies, decks, lists, loans, trades, collection
 * history) or marketplace product mappings still reference the card — those
 * must be removed or unmapped first.
 * @returns Promise that resolves when the card and its printings are gone.
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
    // 23503 = foreign_key_violation: a referencing row appeared between the
    // blocker check and the delete — re-check so the client gets the same
    // CONFLICT it would have gotten had the row existed up front.
    if (error instanceof Error && "code" in error && error.code === "23503") {
      throwIfBlocked(await repos.catalogDeleteGuards.countForCard(card.id));
    }
    throw error;
  }

  await cleanupOrphanedImageFiles(io, mut, orphanCandidateImageIds);
}

/**
 * Throw a CONFLICT AppError naming every non-zero blocker count.
 * @returns Nothing; returns normally when all counts are zero.
 */
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
