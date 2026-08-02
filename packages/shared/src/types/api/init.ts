import type {
  coloredEnumRowSchema,
  enumRowSchema,
  initResponseSchema,
} from "@openrift/shared/contracts/init";
import type { z } from "zod";

export type InitResponse = z.infer<typeof initResponseSchema>;

/** One `/init` enum row: the slug, its display label, and its DB sort order. */
export type EnumRow = z.infer<typeof enumRowSchema>;
/** An enum row that also carries a chip colour (domains, rarities, languages). */
export type ColoredEnumRow = z.infer<typeof coloredEnumRowSchema>;
