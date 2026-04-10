import type { Printing } from "@openrift/shared";
import { useSuspenseQuery } from "@tanstack/react-query";
import { Link, createLazyFileRoute, useNavigate } from "@tanstack/react-router";
import { ArrowLeftIcon } from "lucide-react";

import { CardThumbnail } from "@/components/cards/card-thumbnail";
import { Skeleton } from "@/components/ui/skeleton";
import { publicSetDetailQueryOptions } from "@/hooks/use-public-sets";
import { PAGE_PADDING } from "@/lib/utils";
import { useDisplayStore } from "@/stores/display-store";

export const Route = createLazyFileRoute("/_app/sets_/$setSlug")({
  component: SetDetailPage,
  pendingComponent: SetDetailPending,
});

function SetDetailPage() {
  const { setSlug } = Route.useParams();
  const { data } = useSuspenseQuery(publicSetDetailQueryOptions(setSlug));
  const navigate = useNavigate();
  const showImages = useDisplayStore((s) => s.showImages);

  // Deduplicate to one printing per card (prefer the first one, which has images)
  const seen = new Set<string>();
  const uniquePrintings = data.printings.filter((p) => {
    if (seen.has(p.cardId)) {
      return false;
    }
    seen.add(p.cardId);
    return true;
  });

  const handleCardClick = (printing: Printing) => {
    void navigate({ to: "/cards/$cardSlug", params: { cardSlug: printing.card.slug } });
  };

  return (
    <div className={PAGE_PADDING}>
      <div className="mb-4">
        <Link
          to="/sets"
          className="text-muted-foreground hover:text-foreground mb-2 inline-flex items-center gap-1.5 text-sm"
        >
          <ArrowLeftIcon className="size-4" />
          All sets
        </Link>
        <h1 className="text-2xl font-bold">{data.set.name}</h1>
        <p className="text-muted-foreground text-sm">
          {uniquePrintings.length} {uniquePrintings.length === 1 ? "card" : "cards"},{" "}
          {data.printings.length} {data.printings.length === 1 ? "printing" : "printings"}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-8">
        {uniquePrintings.map((printing) => (
          <CardThumbnail
            key={printing.id}
            printing={printing}
            onClick={handleCardClick}
            showImages={showImages}
          />
        ))}
      </div>
    </div>
  );
}

function SetDetailPending() {
  return (
    <div className={PAGE_PADDING}>
      <Skeleton className="mb-2 h-5 w-16" />
      <Skeleton className="mb-1 h-8 w-48" />
      <Skeleton className="mb-4 h-5 w-32" />
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-8">
        {Array.from({ length: 20 }, (_, i) => (
          <div key={i} className="p-1.5">
            <Skeleton className="aspect-card rounded-lg" />
          </div>
        ))}
      </div>
    </div>
  );
}
