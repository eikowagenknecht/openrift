/* oxlint-disable unicorn/no-useless-undefined, promise/prefer-await-to-then, unicorn/prefer-top-level-await -- zod's `.catch(undefined)` is a sync fallback, not a Promise#catch */
import type { DeckZone } from "@openrift/shared";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { z } from "zod";

import { RouteErrorFallback } from "@/components/error-message";
import { initQueryOptions } from "@/hooks/use-init";
import { sessionQueryOptions } from "@/lib/auth-session";
import { catalogQueryOptions } from "@/lib/catalog-query";
import { queueCardsSearchSchema } from "@/lib/presentation-queue-search";
import { filterSearchSchema } from "@/lib/search-schemas";
import { seoHead } from "@/lib/seo";
import { getSiteUrl } from "@/lib/site-config";

/**
 * The stage's search params. Every field falls back to undefined on a
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

// The builder is a card-browser surface, so it carries the shared filter
// params on top of its own. Ownership filters are hidden in this browser (see
// QUEUE_HIDDEN_FILTER_SECTIONS) but the params stay in the schema: dropping
// them would make a link copied from /cards fail validation here.
const stageSearchSchema = filterSearchSchema.extend({
  /** Deck to walk, zone by zone. Takes precedence over everything below. */
  deck: z.string().optional().catch(undefined),
  /**
   * Tier list to present, by id. The creator's own list, so it needs a session;
   * like `deck` it carries one id and resolves the cards from the catalog.
   */
  tier: z.string().optional().catch(undefined),
  /**
   * Publicly shared tier list to present, by share token. Lets a co-streamer
   * run someone else's ranking without owning it.
   */
  tierShare: z.string().optional().catch(undefined),
  /**
   * Ad-hoc queue of printing ids, in presentation order. Truncated to the
   * queue limit rather than rejected — see {@link queueCardsSearchSchema}. A
   * `deck` walk has no such bound: it carries one id, not every card.
   */
  cards: queueCardsSearchSchema,
  /** Restricts a deck walk to a single zone. */
  zone: z.enum(DECK_ZONES).optional().catch(undefined),
  /** Position in the queue. Clamped against the resolved cards at render time. */
  i: z.number().int().nonnegative().optional().catch(undefined),
  /**
   * Whether the stage is showing its source or changing it. Absent, the source
   * is presented; `edit` puts the editable version up instead, for building on
   * camera. Today only a `tier` list the viewer owns has an editor, but the
   * param is named for the mode rather than for ranking so a deck walk can join
   * without a second spelling.
   *
   * The stage's own toggle writes this, so it is also what a link opens into and
   * what survives a reload.
   */
  mode: z.enum(["edit"]).optional().catch(undefined),
  /**
   * A saved stage preset, applied once when the stage opens. Lets a creator
   * keep a recording link that arrives already dressed — green ground, text
   * panel on, whatever that show is set up as.
   *
   * Ignored when signed out or when the id no longer resolves: a bookmark kept
   * past the preset's deletion must still open the stage.
   */
  preset: z.string().optional().catch(undefined),
  /**
   * Opens the queue builder with `cards` loaded instead of starting the show.
   * Leaving a queue presentation sets this, so Escape lands back on the queue
   * that was being presented rather than an empty builder.
   */
  edit: z.boolean().optional().catch(undefined),
});

export const Route = createFileRoute("/_app/stage")({
  // Deliberately not indexed: a stage URL is a working link for one creator's
  // recording session, not a page anyone should land on from search.
  head: () =>
    seoHead({
      siteUrl: getSiteUrl(),
      title: "Stage",
      description:
        "Put Riftbound cards on screen: a full-screen show for window capture, and a transparent browser source you push cards to in OBS.",
      path: "/stage",
      noIndex: true,
    }),
  validateSearch: stageSearchSchema,
  // Only `?tier=` needs a session; the queue builder, a deck walk and a shared
  // ranking all run signed out. Sign-in returns to this exact URL, so a lapsed
  // session resumes on the same list, position and preset.
  beforeLoad: async ({ context, location, search }) => {
    if (search.tier === undefined) {
      return;
    }
    const session = await context.queryClient.query({
      ...sessionQueryOptions(),
      staleTime: "static",
    });
    if (!session?.user) {
      throw redirect({
        to: "/login",
        search: { redirect: location.href || undefined, email: undefined },
      });
    }
  },
  loader: async ({ context }) => {
    // Both the deck walk and the ad-hoc queue resolve their cards against the
    // catalog, and the stage reads zone labels off /init.
    await Promise.all([
      context.queryClient.query({ ...catalogQueryOptions, staleTime: "static" }),
      context.queryClient.query({ ...initQueryOptions, staleTime: "static" }),
    ]);
    return null;
  },
  errorComponent: RouteErrorFallback,
});
