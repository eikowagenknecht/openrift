import type { Printing } from "@openrift/shared";
import { deduplicateByCard } from "@openrift/shared";
import { useSuspenseQuery } from "@tanstack/react-query";
import { Link, createLazyFileRoute, useNavigate } from "@tanstack/react-router";
import { ArrowLeftIcon } from "lucide-react";

import { CardThumbnail, useCardThumbnailDisplay } from "@/components/cards/card-thumbnail";
import { Skeleton } from "@/components/ui/skeleton";
import { useEffectiveLanguageOrder } from "@/hooks/use-effective-language-order";
import { publicSetDetailQueryOptions } from "@/hooks/use-public-sets";
import { PAGE_PADDING } from "@/lib/utils";
import { useDisplayStore } from "@/stores/display-store";

export const Route = createLazyFileRoute("/_app/sets_/$setSlug")({
  component: SetDetailPage,
  pendingComponent: SetDetailPending,
});

// Mirrors the grid below: cols 2 / 3@640 / 4@768 / 5@1024 / 6@1280 / 8@1536,
// gap-4 (16px) between cells, p-1.5 (6px) inside each cell, inside _app's
// CONTAINER_WIDTH cap (1280 → 1720@wide → 2160@xwide → 2560@xxwide) plus
// PAGE_PADDING (px-3 = -24px). Once the cap binds the per-cell size is
// constant, so the wide breakpoints use fixed px values.
const SETS_CARD_SIZES =
  "(min-width: 2560px) 291px, (min-width: 2160px) 240px, (min-width: 1720px) 186px, (min-width: 1536px) 131px, (min-width: 1280px) 184px, (min-width: 1024px) calc((100vw - 88px) / 5 - 12px), (min-width: 768px) calc((100vw - 72px) / 4 - 12px), (min-width: 640px) calc((100vw - 56px) / 3 - 12px), calc((100vw - 40px) / 2 - 12px)";

function SetDetailPage() {
  const { setSlug } = Route.useParams();
  const { data } = useSuspenseQuery(publicSetDetailQueryOptions(setSlug));
  const navigate = useNavigate();
  const showImages = useDisplayStore((s) => s.showImages);
  const display = useCardThumbnailDisplay();
  const effectiveLanguageOrder = useEffectiveLanguageOrder();

  const uniquePrintings = deduplicateByCard(data.printings, effectiveLanguageOrder);

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
            display={display}
            sizes={SETS_CARD_SIZES}
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
