import { z } from "zod";

/* oxlint-disable no-unused-vars -- imported for JSDoc @link cross-references */
import type { CardErrataTable, SetsTable } from "./tables.js";
/* oxlint-enable no-unused-vars */

// Card / printing / candidate field rules live in `@openrift/shared` so both
// the API (admin endpoints, candidate ingest) and the web app (contribute
// form, JSON Schema generation for openrift-data) can reuse them.
export {
  cardFieldRules,
  candidateCardFieldRules,
  candidatePrintingFieldRules,
  printingFieldRules,
} from "@openrift/shared/db-field-rules";

// ---------------------------------------------------------------------------
// API-only field rules — admin touches these tables; nothing in shared needs
// them.
// ---------------------------------------------------------------------------

/** Mirrors DB constraints on the `sets` table. @see {@link SetsTable} */
export const setFieldRules = {
  slug: z.string().min(1),
  name: z.string().min(1),
  printedTotal: z.number().int().min(0).nullable(),
  setType: z.enum(["main", "supplemental"]),
} satisfies Record<string, z.ZodType>;

/** Mirrors DB constraints on the `card_errata` table. @see {@link CardErrataTable} */
export const cardErrataFieldRules = {
  correctedRulesText: z.string().min(1).nullable(),
  correctedEffectText: z.string().min(1).nullable(),
  source: z.string().min(1),
  sourceUrl: z.string().min(1).nullable(),
  effectiveDate: z.string().nullable(),
} satisfies Record<string, z.ZodType>;
