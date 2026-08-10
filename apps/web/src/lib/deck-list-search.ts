/* oxlint-disable unicorn/no-useless-undefined, promise/prefer-await-to-then, unicorn/prefer-top-level-await -- zod's `.catch(undefined)` is a sync fallback, not a Promise#catch */
import { z } from "zod";

/**
 * Search-param schema for the deck list's filters. Mirrors the card browser's
 * `filterSearchSchema` conventions: every field is optional and `.catch`es to
 * undefined, so a stale bookmark or a hand-edited URL loses the bad value
 * instead of crashing the route, and unknown keys are stripped.
 *
 * Only the *filters* live here. Density, sort and grouping stay in the
 * preference stores, because they describe how the user likes to read a list
 * rather than which decks the list is showing.
 */
export const deckListSearchSchema = z.object({
  search: z.string().optional().catch(undefined),
  /** Deck-format slugs, matched as a union. Absent or empty means every format. */
  formats: z.array(z.string()).optional().catch(undefined),
  /** The tri-state legality flag: absent = either, "valid" / "invalid" = require it. */
  validity: z.enum(["valid", "invalid"]).optional().catch(undefined),
  /**
   * Domains, read the same way the card browser reads them: one picks any deck
   * playing it, several restrict to decks that play nothing outside the set.
   */
  domains: z.array(z.string()).optional().catch(undefined),
  /**
   * Folder ids, matched as a union — a deck in any of them passes. Not a subset
   * test like domains: a deck legitimately sits in several folders, so
   * "everything outside this set" would reject most of them.
   */
  folders: z.array(z.string()).optional().catch(undefined),
  // Negation companions (ADR-034), named to match the card browser's `*Ex`
  // params so the two surfaces' URLs read alike.
  formatsEx: z.array(z.string()).optional().catch(undefined),
  domainsEx: z.array(z.string()).optional().catch(undefined),
  foldersEx: z.array(z.string()).optional().catch(undefined),
  /** Present and true when archived decks are shown alongside the rest. */
  archived: z.boolean().optional().catch(undefined),
});

export type DeckListSearch = z.infer<typeof deckListSearchSchema>;
