import { useSuspenseQuery } from "@tanstack/react-query";
import { Link, createLazyFileRoute } from "@tanstack/react-router";
import { ArrowLeftIcon } from "lucide-react";

import { CardDetail } from "@/components/cards/card-detail";
import { Skeleton } from "@/components/ui/skeleton";
import { cardDetailQueryOptions } from "@/hooks/use-card-detail";
import { PAGE_PADDING } from "@/lib/utils";

export const Route = createLazyFileRoute("/_app/cards_/$cardSlug")({
  component: CardDetailPage,
  pendingComponent: CardDetailPending,
});

function CardDetailPage() {
  const { cardSlug } = Route.useParams();
  const { data } = useSuspenseQuery(cardDetailQueryOptions(cardSlug));
  const { printings } = data;
  const firstPrinting = printings[0];

  if (!firstPrinting) {
    return (
      <div className={PAGE_PADDING}>
        <p className="text-muted-foreground">No printings found for this card.</p>
      </div>
    );
  }

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Thing",
    name: data.card.name,
    description: `${data.card.name} is a ${data.card.type} card from Riftbound.`,
    image: firstPrinting.images.find((i) => i.face === "front")?.url,
  };

  return (
    <div className={`${PAGE_PADDING} flex flex-col gap-3`}>
      <div>
        <Link
          to="/cards"
          className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 text-sm"
        >
          <ArrowLeftIcon className="size-4" />
          All cards
        </Link>
      </div>
      <div className="mx-auto w-full max-w-md">
        <CardDetail printing={firstPrinting} showImages printings={printings} />
      </div>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
    </div>
  );
}

function CardDetailPending() {
  return (
    <div className={`${PAGE_PADDING} flex flex-col gap-3`}>
      <Skeleton className="h-5 w-24" />
      <div className="mx-auto w-full max-w-md space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="aspect-card w-full rounded-xl" />
        <div className="flex justify-center gap-1.5">
          <Skeleton className="h-7 w-16 rounded-md" />
          <Skeleton className="h-7 w-16 rounded-md" />
        </div>
        <Skeleton className="h-20 w-full rounded-lg" />
      </div>
    </div>
  );
}
