import type { Marketplace } from "@openrift/shared";
import { ALL_MARKETPLACES } from "@openrift/shared";
import { ArrowDownIcon, ArrowUpIcon, RotateCcwIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useDisplayStore } from "@/stores/display-store";

const MARKETPLACE_LABELS: Record<Marketplace, string> = {
  tcgplayer: "TCGplayer",
  cardmarket: "Cardmarket",
  cardtrader: "CardTrader",
};

const MARKETPLACE_CURRENCY: Record<Marketplace, string> = {
  tcgplayer: "USD",
  cardmarket: "EUR",
  cardtrader: "EUR",
};

export function MarketplacesSection() {
  const marketplaceOrder = useDisplayStore((s) => s.marketplaceOrder);
  const setMarketplaceOrder = useDisplayStore((s) => s.setMarketplaceOrder);
  const overrides = useDisplayStore((s) => s.overrides);
  const resetPreference = useDisplayStore((s) => s.resetPreference);

  const enabledSet = new Set(marketplaceOrder);

  function toggleMarketplace(marketplace: Marketplace) {
    if (enabledSet.has(marketplace)) {
      setMarketplaceOrder(marketplaceOrder.filter((m) => m !== marketplace));
    } else {
      setMarketplaceOrder([...marketplaceOrder, marketplace]);
    }
  }

  function moveMarketplace(marketplace: Marketplace, direction: -1 | 1) {
    const index = marketplaceOrder.indexOf(marketplace);
    if (index === -1) {
      return;
    }
    const newIndex = index + direction;
    if (newIndex < 0 || newIndex >= marketplaceOrder.length) {
      return;
    }
    const next = [...marketplaceOrder];
    next.splice(index, 1);
    next.splice(newIndex, 0, marketplace);
    setMarketplaceOrder(next);
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Marketplaces</CardTitle>
            <CardDescription className="space-y-2">
              <p>Enable and reorder price sources. The first one is shown in the card grid.</p>
              <p>
                We recommend CardTrader, since it separates prices by language and condition, so you
                get the real Near Mint price. Cardmarket only shows the overall lowest price, and
                TCGplayer only lists English printings (but in USD, which may be more convenient for
                US buyers).
              </p>
            </CardDescription>
          </div>
          {overrides.marketplaceOrder !== null && (
            <ResetButton
              onClick={() => resetPreference("marketplaceOrder")}
              label="Reset marketplace order"
            />
          )}
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-1">
          {/* Show enabled marketplaces first (in order), then disabled ones */}
          {[...marketplaceOrder, ...ALL_MARKETPLACES.filter((m) => !enabledSet.has(m))].map(
            (marketplace) => {
              const enabled = enabledSet.has(marketplace);
              const index = marketplaceOrder.indexOf(marketplace);
              return (
                <div
                  key={marketplace}
                  className="flex items-center justify-between gap-3 rounded-md px-2.5 py-1.5"
                >
                  <div className="flex items-center gap-2">
                    <Switch
                      id={`pref-mp-${marketplace}`}
                      checked={enabled}
                      onCheckedChange={() => toggleMarketplace(marketplace)}
                    />
                    <Label htmlFor={`pref-mp-${marketplace}`} className="font-normal">
                      {MARKETPLACE_LABELS[marketplace]}
                    </Label>
                    <span className="text-muted-foreground text-xs">
                      {MARKETPLACE_CURRENCY[marketplace]}
                    </span>
                    {enabled && index === 0 && (
                      <span className="bg-primary/10 text-primary rounded px-1.5 py-0.5 text-[10px] font-medium">
                        Favorite
                      </span>
                    )}
                  </div>
                  {enabled && (
                    <div className="flex items-center gap-0.5">
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        disabled={index === 0}
                        onClick={() => moveMarketplace(marketplace, -1)}
                        aria-label={`Move ${MARKETPLACE_LABELS[marketplace]} up`}
                      >
                        <ArrowUpIcon className="size-3" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        disabled={index === marketplaceOrder.length - 1}
                        onClick={() => moveMarketplace(marketplace, 1)}
                        aria-label={`Move ${MARKETPLACE_LABELS[marketplace]} down`}
                      >
                        <ArrowDownIcon className="size-3" />
                      </Button>
                    </div>
                  )}
                </div>
              );
            },
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function ResetButton({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <button
            type="button"
            onClick={onClick}
            className="text-muted-foreground hover:text-foreground relative z-10 p-1 transition-colors"
            aria-label={label}
          />
        }
      >
        <RotateCcwIcon className="size-3.5" />
      </TooltipTrigger>
      <TooltipContent>Reset to default</TooltipContent>
    </Tooltip>
  );
}
