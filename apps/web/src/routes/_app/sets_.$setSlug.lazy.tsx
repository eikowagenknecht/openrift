import { useSuspenseQuery } from "@tanstack/react-query";
import { Link, createLazyFileRoute } from "@tanstack/react-router";
import { ArrowLeftIcon } from "lucide-react";

import { Skeleton } from "@/components/ui/skeleton";
import { publicSetDetailQueryOptions } from "@/hooks/use-public-sets";
import { getCardImageUrl } from "@/lib/images";
import { PAGE_PADDING } from "@/lib/utils";

export const Route = createLazyFileRoute("/_app/sets_/$setSlug")({
  component: SetDetailPage,
  pendingComponent: SetDetailPending,
});

function SetDetailPage() {
  const { setSlug } = Route.useParams();
  const { data } = useSuspenseQuery(publicSetDetailQueryOptions(setSlug));

  // Deduplicate to one printing per card (prefer the first one, which has images)
  const seen = new Set<string>();
  const uniquePrintings = data.printings.filter((p) => {
    if (seen.has(p.card.id)) {
      return false;
    }
    seen.add(p.card.id);
    return true;
  });

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

      <div className="grid grid-cols-[repeat(auto-fill,minmax(10rem,1fr))] gap-4">
        {uniquePrintings.map((printing) => {
          const frontImage = printing.images.find((i) => i.face === "front");
          return (
            <Link
              key={printing.id}
              to="/cards/$cardSlug"
              params={{ cardSlug: printing.card.slug }}
              className="group flex flex-col gap-1.5"
            >
              <div className="bg-muted aspect-card overflow-hidden rounded-lg">
                {frontImage ? (
                  <img
                    src={getCardImageUrl(frontImage.url, "thumbnail")}
                    alt={printing.card.name}
                    className="size-full object-cover transition-transform group-hover:scale-105"
                    loading="lazy"
                  />
                ) : (
                  <div className="flex size-full items-center justify-center">
                    <span className="text-muted-foreground text-xs">No image</span>
                  </div>
                )}
              </div>
              <p className="group-hover:text-foreground text-muted-foreground truncate text-center text-xs font-medium">
                {printing.card.name}
              </p>
            </Link>
          );
        })}
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
      <div className="grid grid-cols-[repeat(auto-fill,minmax(10rem,1fr))] gap-4">
        {Array.from({ length: 20 }, (_, i) => (
          <Skeleton key={i} className="aspect-card rounded-lg" />
        ))}
      </div>
    </div>
  );
}
