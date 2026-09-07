import type { Printing } from "@openrift/shared";
import { Suspense, lazy } from "react";

import { Skeleton } from "@/components/ui/skeleton";
import { usePrices } from "@/hooks/use-prices";
import { useDisplayStore } from "@/stores/display-store";

import { PricingSection } from "./pricing";

const PriceHistoryChart = lazy(async () => {
  const m = await import("@/components/cards/price-history-chart");
  return { default: m.PriceHistoryChart };
});

function ChartSkeleton() {
  return (
    <div data-testid="price-chart-skeleton" className="space-y-3">
      <Skeleton className="h-8 w-full rounded-lg" />
      <Skeleton className="aspect-[2.5/1] w-full rounded-lg" />
    </div>
  );
}

export function CardFooter({ printing }: { printing: Printing }) {
  const marketplaceOrder = useDisplayStore((s) => s.marketplaceOrder);
  const favorite = marketplaceOrder[0] ?? "cardtrader";
  const prices = usePrices();
  const hasPrice = prices.get(printing.id, favorite) !== undefined;

  return (
    <div className="mt-2 space-y-2">
      <p className="text-muted-foreground flex items-center gap-1 text-xs">
        <img src="/images/artist.svg" alt="" className="size-3.5 brightness-0 dark:invert" />
        {printing.artist}
      </p>
      {hasPrice && (
        <Suspense fallback={<ChartSkeleton />}>
          <PriceHistoryChart printingId={printing.id} />
        </Suspense>
      )}
      <PricingSection printing={printing} />
    </div>
  );
}
