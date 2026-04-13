import type { Printing } from "@openrift/shared";
import { deduplicateByCard } from "@openrift/shared";
import { useSuspenseQuery } from "@tanstack/react-query";
import { createLazyFileRoute, useNavigate } from "@tanstack/react-router";

import { CardThumbnail } from "@/components/cards/card-thumbnail";
import { Skeleton } from "@/components/ui/skeleton";
import { publicPromoListQueryOptions } from "@/hooks/use-public-promos";
import { PAGE_PADDING } from "@/lib/utils";
import { useDisplayStore } from "@/stores/display-store";

export const Route = createLazyFileRoute("/_app/promos")({
  component: PromosPage,
  pendingComponent: PromosPending,
});

const EMPTY_SET_ORDER_MAP = new Map<string, number>();

function PromosPage() {
  const { data } = useSuspenseQuery(publicPromoListQueryOptions);
  const navigate = useNavigate();
  const showImages = useDisplayStore((s) => s.showImages);
  const languageOrder = useDisplayStore((s) => s.languages);

  const printingsByPromo = Map.groupBy(data.printings, (p) => p.promoType?.id ?? "");

  const handleCardClick = (printing: Printing) => {
    void navigate({ to: "/cards/$cardSlug", params: { cardSlug: printing.card.slug } });
  };

  return (
    <div className={PAGE_PADDING}>
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Promo Cards</h1>
        <p className="text-muted-foreground text-sm">
          Promotional printings grouped by promo type.
        </p>
      </div>

      {data.promoTypes.length === 0 && (
        <p className="text-muted-foreground text-sm">No promo types yet.</p>
      )}

      <div className="space-y-10">
        {data.promoTypes.map((promoType) => {
          const promoPrintings = printingsByPromo.get(promoType.id) ?? [];
          const uniquePrintings = deduplicateByCard(
            promoPrintings,
            EMPTY_SET_ORDER_MAP,
            languageOrder,
          );

          return (
            <section key={promoType.id}>
              <div className="mb-3">
                <h2 className="text-xl font-semibold">{promoType.label}</h2>
                {promoType.description && (
                  <p className="text-muted-foreground text-sm">{promoType.description}</p>
                )}
                <p className="text-muted-foreground text-xs">
                  {uniquePrintings.length} {uniquePrintings.length === 1 ? "card" : "cards"},{" "}
                  {promoPrintings.length} {promoPrintings.length === 1 ? "printing" : "printings"}
                </p>
              </div>

              {uniquePrintings.length === 0 ? (
                <p className="text-muted-foreground text-sm">No printings assigned yet.</p>
              ) : (
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
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}

function PromosPending() {
  return (
    <div className={PAGE_PADDING}>
      <Skeleton className="mb-1 h-8 w-48" />
      <Skeleton className="mb-6 h-5 w-64" />
      <Skeleton className="mb-2 h-7 w-36" />
      <Skeleton className="mb-4 h-4 w-48" />
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-8">
        {Array.from({ length: 12 }, (_, i) => (
          <div key={i} className="p-1.5">
            <Skeleton className="aspect-card rounded-lg" />
          </div>
        ))}
      </div>
    </div>
  );
}
