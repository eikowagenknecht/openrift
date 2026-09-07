import type { Kysely } from "kysely";

import type { Database } from "../../../db/tables.js";
import { candidateCardDetailRepo } from "./candidate-cards-detail.js";
import { candidateExportRepo } from "./candidate-cards-export.js";
import { candidatePrintingLinksRepo } from "./candidate-cards-links.js";
import { candidateReviewRepo } from "./candidate-cards-review.js";
import { candidateSourceListRepo } from "./candidate-cards-source-list.js";
import { candidateCardWritesRepo } from "./candidate-cards-writes.js";

/**
 * Writes to the accepted catalog itself live in `catalogMutationsRepo`. Each
 * method performs a single database query (or returns early for empty inputs);
 * response shaping and multi-query orchestration live in the service layer.
 */
export function candidateCardsRepo(db: Kysely<Database>) {
  return {
    ...candidateSourceListRepo(db),
    ...candidateCardDetailRepo(db),
    ...candidateExportRepo(db),
    ...candidateReviewRepo(db),
    ...candidateCardWritesRepo(db),
    ...candidatePrintingLinksRepo(db),
  };
}
