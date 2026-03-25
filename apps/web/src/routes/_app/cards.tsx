import { createFileRoute } from "@tanstack/react-router";
import { useEffect } from "react";

import { CardBrowser } from "@/components/card-browser";
import { InlineError } from "@/components/error-message";
import { Skeleton } from "@/components/ui/skeleton";
import { catalogQueryOptions } from "@/hooks/use-cards";

export const Route = createFileRoute("/_app/cards")({
  loader: ({ context }) => context.queryClient.ensureQueryData(catalogQueryOptions),
  component: CardsPage,
  pendingComponent: CardsPending,
  errorComponent: () => <InlineError centered />,
});

function CardsPending() {
  return (
    <div className="space-y-4">
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

function CardsPage() {
  useEffect(() => {
    document.documentElement.classList.add("hide-scrollbar");
    return () => document.documentElement.classList.remove("hide-scrollbar");
  }, []);

  return <CardBrowser />;
}
