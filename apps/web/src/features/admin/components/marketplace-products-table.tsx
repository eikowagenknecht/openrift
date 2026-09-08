import type { AdminMarketplaceName } from "@openrift/shared/types/api/admin";
import { WandSparklesIcon } from "lucide-react";
import React from "react";

import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/kbd";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type {
  AssignableCard,
  UnifiedMappingGroup,
} from "@/features/admin/lib/price-mappings-types";

import type { MarketplaceHandlers } from "./marketplace-product-entries";
import {
  collectEntries,
  collectStrongMappings,
  collectWeakMappings,
  MARKETPLACE_CONFIGS,
} from "./marketplace-product-entries";
import { MarketplaceProductRow } from "./marketplace-product-row";
import type { ProductSuggestion } from "./suggest-mapping";
import { productSuggestionKey } from "./suggest-mapping";

export function MarketplaceProductsTable({
  group,
  allCards,
  handlers,
  suggestions,
}: {
  group: UnifiedMappingGroup;
  allCards: AssignableCard[];
  handlers: Record<AdminMarketplaceName, MarketplaceHandlers>;
  suggestions?: Map<string, ProductSuggestion[]>;
}) {
  const entries = collectEntries(group);

  if (entries.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">No marketplace products linked to this card.</p>
    );
  }

  const printingById = new Map(group.printings.map((p) => [p.printingId, p]));
  const strongMappingsByMarketplace = collectStrongMappings(group, suggestions);
  const weakMappingsByMarketplace = collectWeakMappings(group, suggestions);
  const totalStrongCount =
    strongMappingsByMarketplace.tcgplayer.length +
    strongMappingsByMarketplace.cardmarket.length +
    strongMappingsByMarketplace.cardtrader.length;
  const totalWeakCount =
    weakMappingsByMarketplace.tcgplayer.length +
    weakMappingsByMarketplace.cardmarket.length +
    weakMappingsByMarketplace.cardtrader.length;
  // Ctrl+Enter falls through to weak suggestions only when no strong matches are
  // available, so it never silently accepts a low-confidence mapping over a strong one.
  const showWeakAcceptAll = totalStrongCount === 0 && totalWeakCount > 0;
  const anyMarketplacePending = Object.values(handlers).some((h) => h.isAssigningToPrinting);

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-20">ID</TableHead>
          <TableHead className="w-80">Product</TableHead>
          <TableHead className="w-16">Language</TableHead>
          <TableHead className="w-48">Set</TableHead>
          <TableHead className="w-16">Finish</TableHead>
          <TableHead className="w-20 text-right">Price</TableHead>
          <TableHead>Assigned printings</TableHead>
          <TableHead className="py-1 text-right">
            {totalStrongCount > 0 && (
              <Button
                variant="outline"
                size="xs"
                disabled={anyMarketplacePending}
                onClick={() => {
                  for (const mp of ["tcgplayer", "cardmarket", "cardtrader"] as const) {
                    const mappings = strongMappingsByMarketplace[mp];
                    if (mappings.length > 0) {
                      handlers[mp].onBatchAssignToPrintings(mappings);
                    }
                  }
                }}
              >
                <WandSparklesIcon />
                Accept all {totalStrongCount} suggestion{totalStrongCount === 1 ? "" : "s"}
                <Kbd className="bg-background/20 pointer-events-none ml-1 leading-none text-inherit opacity-60">
                  Ctrl ↵
                </Kbd>
              </Button>
            )}
            {showWeakAcceptAll && (
              <Button
                variant="outline"
                size="xs"
                disabled={anyMarketplacePending}
                onClick={() => {
                  for (const mp of ["tcgplayer", "cardmarket", "cardtrader"] as const) {
                    const mappings = weakMappingsByMarketplace[mp];
                    if (mappings.length > 0) {
                      handlers[mp].onBatchAssignToPrintings(mappings);
                    }
                  }
                }}
                className="border-warning/40 text-warning hover:bg-warning-soft"
              >
                <WandSparklesIcon />
                Accept all {totalWeakCount} weak suggestion{totalWeakCount === 1 ? "" : "s"}
                <Kbd className="bg-background/20 pointer-events-none ml-1 leading-none text-inherit opacity-60">
                  Ctrl ↵
                </Kbd>
              </Button>
            )}
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {entries.map((entry, index) => {
          const key = productSuggestionKey(
            entry.marketplace,
            entry.product.externalId,
            entry.product.finish,
            entry.product.language,
          );
          const productSuggestions = entry.isAssigned
            ? []
            : (suggestions?.get(key) ?? []).flatMap((s) => {
                const printing = printingById.get(s.printingId);
                return printing ? [{ ...s, printing }] : [];
              });
          const prevEntry = entries[index - 1];
          const isFirstOfMarketplace = !prevEntry || prevEntry.marketplace !== entry.marketplace;
          const strongMappings = strongMappingsByMarketplace[entry.marketplace];
          const weakMappings = weakMappingsByMarketplace[entry.marketplace];
          const marketplaceHandlers = handlers[entry.marketplace];
          return (
            <React.Fragment key={key}>
              {isFirstOfMarketplace && (
                <TableRow className="hover:bg-transparent">
                  <TableCell colSpan={8} className="bg-muted/50 py-1 pr-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
                        {MARKETPLACE_CONFIGS[entry.marketplace].displayName}
                      </span>
                      <div className="flex items-center gap-2">
                        {weakMappings.length > 0 && (
                          <Button
                            variant="outline"
                            size="xs"
                            disabled={marketplaceHandlers.isAssigningToPrinting}
                            onClick={() =>
                              marketplaceHandlers.onBatchAssignToPrintings(weakMappings)
                            }
                            className="border-warning/40 text-warning hover:bg-warning-soft"
                          >
                            <WandSparklesIcon />
                            Accept {weakMappings.length} weak suggestion
                            {weakMappings.length === 1 ? "" : "s"}
                          </Button>
                        )}
                        {strongMappings.length > 0 && (
                          <Button
                            variant="outline"
                            size="xs"
                            disabled={marketplaceHandlers.isAssigningToPrinting}
                            onClick={() =>
                              marketplaceHandlers.onBatchAssignToPrintings(strongMappings)
                            }
                          >
                            <WandSparklesIcon />
                            Accept {strongMappings.length} suggestion
                            {strongMappings.length === 1 ? "" : "s"}
                          </Button>
                        )}
                      </div>
                    </div>
                  </TableCell>
                </TableRow>
              )}
              <MarketplaceProductRow
                entry={entry}
                cardName={group.cardName}
                printings={group.printings}
                allCards={allCards}
                handlers={marketplaceHandlers}
                suggestions={productSuggestions}
              />
            </React.Fragment>
          );
        })}
      </TableBody>
    </Table>
  );
}
