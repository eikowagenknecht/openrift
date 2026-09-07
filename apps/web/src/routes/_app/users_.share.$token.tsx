import type { PublicUserBundleResponse } from "@openrift/shared/types/api/user-share";
import { createFileRoute, notFound } from "@tanstack/react-router";

import { NotFoundFallback, RouteErrorFallback } from "@/components/error-message";
import { Skeleton } from "@/components/ui/skeleton";
import { publicUserBundleQueryOptions } from "@/hooks/use-user-share";
import { seoHead } from "@/lib/seo";
import { bundleShareImageUrl, shareImageVersion } from "@/lib/share-image";
import { getSiteUrl } from "@/lib/site-config";
import { cn, PAGE_WIDTH, PAGE_PADDING } from "@/lib/utils";

export const Route = createFileRoute("/_app/users_/share/$token")({
  head: ({ loaderData, params }) => {
    const siteUrl = getSiteUrl();
    const path = `/users/share/${params.token}`;
    const data = loaderData as PublicUserBundleResponse | undefined;
    if (!data) {
      return seoHead({ siteUrl, title: "Shared lists", path, unlisted: true });
    }
    const wishCount = data.lists.filter((list) => list.intent === "wish").length;
    const tradeCount = data.lists.filter((list) => list.intent === "trade").length;
    const totalEntries = data.lists.reduce((sum, list) => sum + list.entryCount, 0);
    const title = `${data.owner.displayName}'s wish & tradelists`;
    const description = `${wishCount} wishlist${wishCount === 1 ? "" : "s"}, ${tradeCount} tradelist${tradeCount === 1 ? "" : "s"}, ${totalEntries} cards in total.`;
    const latestUpdate = data.lists.reduce(
      (latest, list) => (list.updatedAt > latest ? list.updatedAt : latest),
      "",
    );
    // Fold the list count into the version so removing a list from the bundle
    // advances the cache key; a plain MAX over surviving lists would not.
    const bundleVersion = `${shareImageVersion(latestUpdate)}-${data.lists.length}`;
    const ogImage = bundleShareImageUrl(siteUrl, params.token, bundleVersion);
    return seoHead({ siteUrl, title, description, path, ogImage, oembed: true, unlisted: true });
  },
  loader: async ({ context, params }): Promise<PublicUserBundleResponse> => {
    try {
      return await context.queryClient.query({
        ...publicUserBundleQueryOptions(params.token),
        staleTime: "static",
      });
    } catch (error) {
      if (error instanceof Error && error.message === "NOT_FOUND") {
        throw notFound();
      }
      throw error;
    }
  },
  pendingComponent: SharedUserBundlePending,
  errorComponent: RouteErrorFallback,
  notFoundComponent: NotFoundFallback,
});

function SharedUserBundlePending() {
  return (
    <div className={cn(PAGE_PADDING, PAGE_WIDTH.full, "flex flex-col gap-4 py-4")}>
      <div className="flex items-center gap-3">
        <Skeleton className="size-12 rounded-full" />
        <div className="flex flex-col gap-2">
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-32" />
        </div>
      </div>
      <Skeleton className="h-32 w-full" />
      <Skeleton className="h-32 w-full" />
    </div>
  );
}
