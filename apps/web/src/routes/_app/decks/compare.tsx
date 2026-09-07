import { createFileRoute, notFound, redirect } from "@tanstack/react-router";
import { z } from "zod";

import { NotFoundFallback, RouteErrorFallback } from "@/components/error-message";
import { deckDetailQueryOptions, decksQueryOptions } from "@/hooks/use-decks";
import { initQueryOptions } from "@/hooks/use-init";
import { sessionQueryOptions } from "@/lib/auth-session";
import { seoHead } from "@/lib/seo";
import { getSiteUrl } from "@/lib/site-config";
import { isLocalDeckId } from "@/stores/local-decks-store";

// Not a uuid check: either side may be a `local:` id, and either may be missing
// (a comparison opened from the deck menu starts with only one deck).
const compareSearchSchema = z.object({
  from: z.string().optional(),
  to: z.string().optional(),
});

export const Route = createFileRoute("/_app/decks/compare")({
  ssr: "data-only",
  validateSearch: compareSearchSchema,
  head: () => seoHead({ siteUrl: getSiteUrl(), title: "Compare decks", noIndex: true }),
  loaderDeps: ({ search }) => ({ from: search.from, to: search.to }),
  // A comparison between two `local:` decks needs no session; those sides
  // resolve client-side from the store.
  loader: async ({ context, location, deps }) => {
    await context.queryClient.query({ ...initQueryOptions, staleTime: "static" });
    const serverIds = [deps.from, deps.to].filter(
      (id): id is string => id !== undefined && !isLocalDeckId(id),
    );
    if (serverIds.length === 0) {
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
    const userId = session.user.id;
    try {
      await Promise.all([
        context.queryClient.query({ ...decksQueryOptions(userId), staleTime: "static" }),
        ...serverIds.map((id) =>
          context.queryClient.query({ ...deckDetailQueryOptions(userId, id), staleTime: "static" }),
        ),
      ]);
    } catch (error) {
      if (error instanceof Error && error.message === "NOT_FOUND") {
        throw notFound();
      }
      throw error;
    }
  },
  errorComponent: RouteErrorFallback,
  notFoundComponent: NotFoundFallback,
});
