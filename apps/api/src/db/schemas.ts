import { z } from "zod";

/* oxlint-disable no-unused-vars -- imported for JSDoc @link cross-references */
import type { CardErrataTable } from "./tables.js";
/* oxlint-enable no-unused-vars */

// Card / printing / candidate field rules live in `@openrift/shared` so both
// the API (admin endpoints, candidate ingest) and the web app (contribute
// form, JSON Schema generation for openrift-data) can reuse them.
export {
  cardFieldRules,
  candidateCardFieldRules,
  candidatePrintingFieldRules,
} from "@openrift/shared/db-field-rules";

// ---------------------------------------------------------------------------
// API-only field rules — admin touches these tables; nothing in shared needs
// them.
// ---------------------------------------------------------------------------

/** Mirrors DB constraints on the `card_errata` table. @see {@link CardErrataTable} */
export const cardErrataFieldRules = {
  correctedRulesText: z.string().min(1).nullable(),
  correctedEffectText: z.string().min(1).nullable(),
  source: z.string().min(1),
  sourceUrl: z.string().min(1).nullable(),
  effectiveDate: z.string().nullable(),
} satisfies Record<string, z.ZodType>;
