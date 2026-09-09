import { CoinsIcon, CopyIcon, SquareIcon, SquareStackIcon } from "lucide-react";

import { MarketplaceLink } from "@/components/marketplace-link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CardLink } from "@/components/ui/card-link";
import { MARKETPLACE_META } from "@/features/cards/lib/marketplace-meta";
import { CollectionMissingImagesTile } from "@/features/collections/components/collection-missing-images-tile";
import type { CollectionStats } from "@/features/collections/hooks/use-collection-stats";

export function StatsHeroStats({ stats }: { stats: CollectionStats }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-muted-foreground flex items-center gap-1.5">
            <SquareIcon className="size-4" />
            Unique Cards
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="font-heading text-2xl font-semibold tabular-nums">
            {stats.uniqueCards.toLocaleString()}
          </p>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="text-muted-foreground flex items-center gap-1.5">
            <CopyIcon className="size-4" />
            Unique Printings
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="font-heading text-2xl font-semibold tabular-nums">
            {stats.uniquePrintings.toLocaleString()}
          </p>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="text-muted-foreground flex items-center gap-1.5">
            <SquareStackIcon className="size-4" />
            Total Copies
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="font-heading text-2xl font-semibold tabular-nums">
            {stats.totalCopies.toLocaleString()}
          </p>
        </CardContent>
      </Card>
      <CardLink
        render={
          <MarketplaceLink
            marketplace={stats.marketplace}
            href={MARKETPLACE_META[stats.marketplace].searchUrl("riftbound")}
          />
        }
      >
        <CardHeader>
          <CardTitle className="text-muted-foreground flex items-center gap-1.5">
            <CoinsIcon className="size-4" />
            Estimated Value
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="font-heading text-2xl font-semibold tabular-nums">
            {stats.formatPrice(stats.estimatedValue)}
          </p>
          <div className="text-muted-foreground text-xs">
            <p className="flex items-center gap-1">
              <img
                src={MARKETPLACE_META[stats.marketplace].icon}
                alt=""
                className="h-3 invert dark:invert-0"
              />
              {MARKETPLACE_META[stats.marketplace].label}
            </p>
            {stats.unpricedCount > 0 && (
              <p>
                {stats.unpricedCount} {stats.unpricedCount === 1 ? "copy" : "copies"} unpriced
              </p>
            )}
          </div>
        </CardContent>
      </CardLink>
      <CollectionMissingImagesTile />
    </div>
  );
}
