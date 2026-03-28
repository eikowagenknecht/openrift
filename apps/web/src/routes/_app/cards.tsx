import { createFileRoute } from "@tanstack/react-router";

import { CardBrowser } from "@/components/card-browser";
import { RouteErrorFallback } from "@/components/error-message";
import { Footer } from "@/components/layout/footer";
import { Skeleton } from "@/components/ui/skeleton";
import { catalogQueryOptions } from "@/hooks/use-cards";
import { useHideScrollbar } from "@/hooks/use-hide-scrollbar";
import { PAGE_PADDING } from "@/lib/utils";

export const Route = createFileRoute("/_app/cards")({
  loader: ({ context }) => context.queryClient.ensureQueryData(catalogQueryOptions),
  component: CardsPage,
  pendingComponent: CardsPending,
  errorComponent: RouteErrorFallback,
});

function CardsPage() {
  useHideScrollbar();
  return (
    <>
      <div className={`flex flex-1 flex-col ${PAGE_PADDING}`}>
        <CardBrowser />
      </div>
      <Footer />
    </>
  );
}

// Skeleton UI for the cards page while loading
function CardsPending() {
  return (
    <div className={`${PAGE_PADDING} space-y-4`}>
      <Skeleton className="h-10 w-full rounded-lg" />
      <div className="min-w-0 flex-1">
        <div className="grid grid-cols-[repeat(auto-fill,minmax(10rem,1fr))] gap-4">
          {Array.from({ length: 20 }, (_, i) => (
            <Skeleton key={i} className="aspect-card rounded-lg" />
          ))}
        </div>
      </div>
    </div>
  );
}
