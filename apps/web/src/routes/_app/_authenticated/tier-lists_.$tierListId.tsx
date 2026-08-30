import { createFileRoute, Link, notFound, redirect } from "@tanstack/react-router";
import { Link2OffIcon } from "lucide-react";

import { EmptyState } from "@/components/empty-state";
import { RouteErrorFallback } from "@/components/error-message";
import { buttonVariants } from "@/components/ui/button";
import { tierListQueryOptions } from "@/hooks/use-tier-lists";
import { cleanedSearchForRedirect, filterSearchSchema } from "@/lib/search-schemas";
import { seoHead } from "@/lib/seo";
import { getSiteUrl } from "@/lib/site-config";
import { cn, PAGE_WIDTH, PAGE_PADDING } from "@/lib/utils";

export const Route = createFileRoute("/_app/_authenticated/tier-lists_/$tierListId")({
  ssr: "data-only",
  // The builder hosts a full card browser (the pool), so it carries the shared
  // filter search params like /cards and the deck editor do.
  validateSearch: filterSearchSchema,
  head: () => seoHead({ siteUrl: getSiteUrl(), title: "Tier list", noIndex: true }),
  beforeLoad: ({ search, location, params }) => {
    // Strip unknown / malformed search params — same canonicalization as /cards.
    const cleaned = cleanedSearchForRedirect(filterSearchSchema, search, location.searchStr);
    if (cleaned) {
      throw redirect({
        to: "/tier-lists/$tierListId",
        params: { tierListId: params.tierListId },
        search: cleaned,
        replace: true,
      });
    }
  },
  loader: async ({ context, params }) => {
    try {
      await context.queryClient.ensureQueryData(
        tierListQueryOptions(context.userId, params.tierListId),
      );
    } catch (error) {
      if (error instanceof Error && error.message === "NOT_FOUND") {
        throw notFound();
      }
      throw error;
    }
  },
  errorComponent: RouteErrorFallback,
  notFoundComponent: TierListNotFound,
});

/**
 * Shown when the id resolves to nothing — a deleted list, or one belonging to
 * another account.
 * @returns The not-found explanation.
 */
function TierListNotFound() {
  return (
    <div className={cn(PAGE_PADDING, PAGE_WIDTH.full)}>
      <EmptyState
        className="py-16"
        icon={Link2OffIcon}
        title="This tier list is gone"
        description="It may have been deleted, or it belongs to another account."
      >
        <Link to="/tier-lists" className={buttonVariants()}>
          Go to your tier lists
        </Link>
      </EmptyState>
    </div>
  );
}
