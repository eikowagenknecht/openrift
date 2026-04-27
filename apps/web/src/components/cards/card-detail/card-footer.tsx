import type { Printing, TimeRange } from "@openrift/shared";
import { Suspense, lazy, useState } from "react";

import { Skeleton } from "@/components/ui/skeleton";
import { usePrices } from "@/hooks/use-prices";
import { useDisplayStore } from "@/stores/display-store";

import { PricingSection } from "./pricing";

const PriceSparkline = lazy(async () => {
  const m = await import("@/components/cards/price-sparkline");
  return { default: m.PriceSparkline };
});

function SparklineSkeleton() {
  return <Skeleton data-testid="sparkline-skeleton" className="h-12 w-full rounded-lg" />;
}

export function CardFooter({ printing }: { printing: Printing }) {
  const [priceRange, setPriceRange] = useState<TimeRange>("30d");
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
      <PricingSection printing={printing} range={priceRange} />
      {hasPrice && (
        <Suspense fallback={<SparklineSkeleton />}>
          <PriceSparkline printingId={printing.id} onRangeChange={setPriceRange} />
        </Suspense>
      )}
    </div>
  );
}
