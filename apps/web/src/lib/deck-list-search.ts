/* oxlint-disable unicorn/no-useless-undefined, promise/prefer-await-to-then, unicorn/prefer-top-level-await -- zod's `.catch(undefined)` is a sync fallback, not a Promise#catch */
import { z } from "zod";

/** Filters only; density, sort and grouping live in the preference stores instead. */
export const deckListSearchSchema = z.object({
  search: z.string().optional().catch(undefined),
  formats: z.array(z.string()).optional().catch(undefined),
  validity: z.enum(["valid", "invalid"]).optional().catch(undefined),
  domains: z.array(z.string()).optional().catch(undefined),
  folders: z.array(z.string()).optional().catch(undefined),
  formatsEx: z.array(z.string()).optional().catch(undefined),
  domainsEx: z.array(z.string()).optional().catch(undefined),
  foldersEx: z.array(z.string()).optional().catch(undefined),
  drafts: z.enum(["hide", "only"]).optional().catch(undefined),
  archived: z.boolean().optional().catch(undefined),
});

export type DeckListSearch = z.infer<typeof deckListSearchSchema>;
