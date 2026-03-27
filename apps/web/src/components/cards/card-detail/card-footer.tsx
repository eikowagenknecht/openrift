import type { Printing, TimeRange } from "@openrift/shared";
import { useState } from "react";

import { PriceSparkline } from "@/components/cards/price-sparkline";

import { PricingSection } from "./pricing";

export function CardFooter({ printing }: { printing: Printing }) {
  const [priceRange, setPriceRange] = useState<TimeRange>("30d");

  return (
    <div className="mt-2 space-y-2">
      <p className="text-muted-foreground flex items-center gap-1 text-xs">
        <img src="/images/artist.svg" alt="" className="size-3.5 brightness-0 dark:invert" />
        {printing.artist}
      </p>
      <PricingSection printing={printing} range={priceRange} />
      {printing.marketPrice !== undefined && (
        <PriceSparkline printingId={printing.id} onRangeChange={setPriceRange} />
      )}
    </div>
  );
}
