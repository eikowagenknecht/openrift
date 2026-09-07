/* oxlint-disable unicorn/no-useless-undefined, promise/prefer-await-to-then, unicorn/prefer-top-level-await -- zod's `.catch(undefined)` is a sync fallback, not a Promise#catch */
import type { DeckZone } from "@openrift/shared/types/enums";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { z } from "zod";

import { RouteErrorFallback } from "@/components/error-message";
import { catalogQueryOptions } from "@/hooks/catalog-query";
import { initQueryOptions } from "@/hooks/use-init";
import { sessionQueryOptions } from "@/lib/auth-session";
import { queueCardsSearchSchema } from "@/lib/presentation-queue-search";
import { filterSearchSchema } from "@/lib/search-schemas";
import { seoHead } from "@/lib/seo";
import { getSiteUrl } from "@/lib/site-config";

const DECK_ZONES = [
  "main",
  "sideboard",
  "legend",
  "champion",
  "runes",
  "battlefield",
  "overflow",
] as const satisfies readonly DeckZone[];

// Carries the shared filter params on top of its own: dropping them would
// make a link copied from /cards fail validation here.
const stageSearchSchema = filterSearchSchema.extend({
  deck: z.string().optional().catch(undefined),
  tier: z.string().optional().catch(undefined),
  tierShare: z.string().optional().catch(undefined),
  cards: queueCardsSearchSchema,
  zone: z.enum(DECK_ZONES).optional().catch(undefined),
  i: z.number().int().nonnegative().optional().catch(undefined),
  mode: z.enum(["edit"]).optional().catch(undefined),
  preset: z.string().optional().catch(undefined),
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
  // Only `?tier=` needs a session; the other sources all run signed out.
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
