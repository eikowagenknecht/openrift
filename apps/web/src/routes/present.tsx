/* oxlint-disable unicorn/no-useless-undefined, promise/prefer-await-to-then, unicorn/prefer-top-level-await -- zod's `.catch(undefined)` is a sync fallback, not a Promise#catch */
import type { DeckZone } from "@openrift/shared";
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import { RouteErrorFallback } from "@/components/error-message";
import { initQueryOptions } from "@/hooks/use-init";
import { catalogQueryOptions } from "@/lib/catalog-query";
import { MAX_QUEUE_LENGTH } from "@/lib/presentation-queue";
import { seoHead } from "@/lib/seo";
import { getSiteUrl } from "@/lib/site-config";

/**
 * Presentation mode's search params. Every field falls back to undefined on a
 * malformed value so a hand-edited or stale URL opens the queue builder rather
 * than crashing the route.
 */
/**
 * Every zone slug, for validating the `zone` search param. `satisfies` keeps
 * each entry a real `DeckZone`; a typo'd or stale zone in a URL falls back to
 * a full deck walk instead of a blank stage.
 */
const DECK_ZONES = [
  "main",
  "sideboard",
  "legend",
  "champion",
  "runes",
  "battlefield",
  "overflow",
] as const satisfies readonly DeckZone[];

const presentSearchSchema = z.object({
  /** Deck to walk, zone by zone. Takes precedence over `cards`. */
  deck: z.string().optional().catch(undefined),
  /** Ad-hoc queue of printing ids, in presentation order. */
  cards: z.array(z.string()).max(MAX_QUEUE_LENGTH).optional().catch(undefined),
  /** Restricts a deck walk to a single zone. */
  zone: z.enum(DECK_ZONES).optional().catch(undefined),
  /** Position in the queue. Clamped against the resolved cards at render time. */
  i: z.number().int().nonnegative().optional().catch(undefined),
  /**
   * Opens the queue builder with `cards` loaded instead of starting the show.
   * Leaving a queue presentation sets this, so Escape lands back on the queue
   * that was being presented rather than an empty builder.
   */
  edit: z.boolean().optional().catch(undefined),
});

export const Route = createFileRoute("/present")({
  // Deliberately not indexed: a presentation URL is a working link for one
  // creator's recording session, not a page anyone should land on from search.
  head: () =>
    seoHead({
      siteUrl: getSiteUrl(),
      title: "Presentation mode",
      path: "/present",
      noIndex: true,
    }),
  validateSearch: presentSearchSchema,
  loader: async ({ context }) => {
    // Both the deck walk and the ad-hoc queue resolve their cards against the
    // catalog, and the stage reads zone labels off /init.
    await Promise.all([
      context.queryClient.ensureQueryData(catalogQueryOptions),
      context.queryClient.ensureQueryData(initQueryOptions),
    ]);
    return null;
  },
  errorComponent: RouteErrorFallback,
});
