import { Link } from "@tanstack/react-router";
import { ArrowUpIcon } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { CardArtThumb } from "@/features/cards/components/card-art-thumb";
import type { PricedCard } from "@/features/collections/hooks/use-collection-stats";

const COLLAPSED_EXPENSIVE_PRINTINGS = 2;

export function MostExpensivePrintings({
  printings,
  formatPrice,
}: {
  printings: PricedCard[];
  formatPrice: (value?: number | null) => string;
}) {
  const [expanded, setExpanded] = useState(false);

  if (printings.length === 0) {
    return null;
  }

  const visible = expanded ? printings : printings.slice(0, COLLAPSED_EXPENSIVE_PRINTINGS);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-1.5">
          <ArrowUpIcon className="size-4" />
          Most Expensive Printings
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {visible.map((printing, index) => (
            <Link
              key={printing.printingId}
              to="/cards/$cardSlug/{-$printingSlug}"
              params={{ cardSlug: printing.cardSlug }}
              className="hover:bg-muted/50 focus-visible:ring-ring/50 flex items-center gap-3 rounded-md p-2 no-underline transition-colors outline-none focus-visible:ring-2"
            >
              <span className="text-muted-foreground w-5 shrink-0 text-right tabular-nums">
                {index + 1}
              </span>
              {printing.thumbnail && (
                <HoverCard>
                  {/* Base UI's default trigger is an anchor, which can't nest
                      inside the row's own link. */}
                  <HoverCardTrigger render={<span />}>
                    <CardArtThumb src={printing.thumbnail} className="h-32" />
                  </HoverCardTrigger>
                  {printing.fullImage && (
                    <HoverCardContent side="right" className="w-auto p-1">
                      <img src={printing.fullImage} alt="" className="h-80 w-auto rounded-md" />
                    </HoverCardContent>
                  )}
                </HoverCard>
              )}
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{printing.name}</p>
                <p className="text-muted-foreground text-xs tabular-nums">
                  {formatPrice(printing.price)}
                </p>
              </div>
            </Link>
          ))}
        </div>
        {printings.length > COLLAPSED_EXPENSIVE_PRINTINGS && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setExpanded(!expanded);
            }}
          >
            {expanded ? "Show less" : `Show more (${printings.length})`}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
