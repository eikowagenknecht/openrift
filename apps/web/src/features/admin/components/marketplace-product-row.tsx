import { formatDayTime } from "@openrift/shared/format-date";
import { marketplaceCarriesLanguage } from "@openrift/shared/types/pricing";
import { formatCents, formatPrintingLabel } from "@openrift/shared/utils";
import { AlertTriangleIcon, CheckIcon, WandSparklesIcon } from "lucide-react";
import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ChipRemoveButton } from "@/components/ui/chip-remove-button";
import { TableCell, TableRow } from "@/components/ui/table";
import type {
  AssignableCard,
  UnifiedMappingPrinting,
} from "@/features/admin/lib/price-mappings-types";
import { CardSearchDropdown } from "@/features/cards/components/card-search-dropdown";
import { useAssignableCardSearch } from "@/features/cards/hooks/use-card-search";
import { cn } from "@/lib/utils";

import { PrintingLabel } from "./marketplace-printing-label";
import type { MarketplaceHandlers, TableEntry } from "./marketplace-product-entries";
import {
  displayedProductLanguage,
  isCardNameMismatch,
  isStaleRecord,
  MARKETPLACE_CONFIGS,
} from "./marketplace-product-entries";
import { AssignToPrintingButton, RowActions } from "./marketplace-row-actions";
import { SuggestionChip } from "./marketplace-suggestion-chip";
import { ProductLink } from "./price-mappings-utils";
import type { ProductSuggestion } from "./suggest-mapping";

export function MarketplaceProductRow({
  entry,
  cardName,
  printings,
  allCards,
  handlers,
  suggestions,
}: {
  entry: TableEntry;
  cardName: string;
  printings: UnifiedMappingPrinting[];
  allCards: AssignableCard[];
  handlers: MarketplaceHandlers;
  suggestions: (ProductSuggestion & { printing: UnifiedMappingPrinting })[];
}) {
  const [showAssign, setShowAssign] = useState(false);
  const [cardSearchQuery, setCardSearchQuery] = useState("");

  const {
    marketplace,
    product,
    isAssigned,
    assignedPrintings,
    assignedPrintingIds,
    otherAssignedPrintingIds,
  } = entry;
  const config = MARKETPLACE_CONFIGS[marketplace];
  const canIgnore = !isAssigned;
  const canUnassign = Boolean(product.isOverride);
  const canReassign = !isAssigned && !product.isOverride;
  const nameMismatched = isCardNameMismatch(product.productName, cardName);
  const highlightLanguage = displayedProductLanguage(marketplace, product.language) ?? undefined;
  // A marketplace that doesn't stock a language drops its printings from the
  // manual Assign dropdown the same way it drops out of the suggester.
  const assignablePrintings = printings.filter((p) =>
    marketplaceCarriesLanguage(marketplace, p.language),
  );

  const recordedAt = new Date(product.recordedAt);
  const isStale = isStaleRecord(recordedAt);

  const priceCents = product.marketCents ?? product.lowCents;
  const priceDisplay =
    priceCents && priceCents > 0 ? formatCents(priceCents, product.currency) : "";

  const filteredResults = useAssignableCardSearch(allCards, cardSearchQuery);

  return (
    <>
      <TableRow>
        <TableCell className="w-20">
          <ProductLink config={config} externalId={product.externalId}>
            #{product.externalId}
          </ProductLink>
        </TableCell>
        <TableCell className="w-80 max-w-0">
          <div className="flex items-center gap-1.5">
            {isAssigned ? (
              <CheckIcon className="text-success size-3.5 shrink-0" />
            ) : (
              <span aria-hidden className="inline-block size-3.5 shrink-0" />
            )}
            <span
              className={cn("truncate font-medium", nameMismatched && "text-warning")}
              title={
                nameMismatched
                  ? `${product.productName} (does not match card name "${cardName}")`
                  : product.productName
              }
            >
              {product.productName}
            </span>
          </div>
        </TableCell>
        <TableCell className="text-muted-foreground w-16">
          {displayedProductLanguage(marketplace, product.language) ?? (
            <span className="text-muted-foreground/50">—</span>
          )}
        </TableCell>
        <TableCell className="text-muted-foreground w-40 max-w-0">
          <span className="block truncate" title={product.groupName ?? undefined}>
            {product.groupName ?? <span className="text-muted-foreground/50">—</span>}
          </span>
        </TableCell>
        <TableCell className="w-16">
          <Badge variant="outline">{product.finish}</Badge>
        </TableCell>
        <TableCell className="w-20 text-right tabular-nums">
          <div className="flex items-center justify-end gap-1">
            {isStale && (
              <span title={`Last seen ${formatDayTime(product.recordedAt)}`}>
                <AlertTriangleIcon className="text-destructive size-3.5" />
              </span>
            )}
            <span>{priceDisplay}</span>
          </div>
        </TableCell>
        <TableCell>
          {assignedPrintings.length === 0 ? (
            suggestions.length > 0 ? (
              <div className="flex flex-wrap items-center gap-1">
                {suggestions.map((s) => (
                  <SuggestionChip
                    key={s.printingId}
                    suggestion={s}
                    productExternalId={product.externalId}
                    highlightFinish={product.finish}
                    highlightLanguage={highlightLanguage}
                    highlightMarkers={
                      product.groupKind === "special" && s.printing.markerSlugs.length > 0
                    }
                    onAssign={(eid, pid) =>
                      handlers.onAssignToPrinting(eid, product.finish, product.language, pid)
                    }
                    disabled={handlers.isAssigningToPrinting}
                  />
                ))}
                {suggestions.length >= 2 && (
                  <Button
                    variant="outline"
                    size="xs"
                    disabled={handlers.isAssigningToPrinting}
                    onClick={() =>
                      handlers.onBatchAssignToPrintings(
                        suggestions.map((s) => ({
                          externalId: product.externalId,
                          finish: product.finish,
                          language: product.language,
                          printingId: s.printingId,
                        })),
                      )
                    }
                  >
                    <WandSparklesIcon />
                    Accept all
                  </Button>
                )}
              </div>
            ) : (
              <span className="text-muted-foreground/50">—</span>
            )
          ) : (
            <div className="flex flex-wrap gap-1">
              {assignedPrintings.map((p) => {
                const label = formatPrintingLabel(
                  p.shortCode,
                  p.markerSlugs,
                  p.finish,
                  p.language,
                  p.size,
                );
                return (
                  <Badge key={p.printingId} variant="outline" className="gap-1 pr-1">
                    <PrintingLabel
                      printing={p}
                      highlightFinish={product.finish}
                      highlightLanguage={highlightLanguage}
                      highlightMarkers={product.groupKind === "special" && p.markerSlugs.length > 0}
                    />
                    <ChipRemoveButton
                      aria-label={`Unassign ${label}`}
                      title="Unassign"
                      disabled={handlers.isUnmappingPrinting}
                      onClick={() =>
                        handlers.onUnmapPrinting(
                          p.printingId,
                          product.externalId,
                          product.finish,
                          product.language,
                        )
                      }
                      className="text-muted-foreground hover:text-destructive -mr-0.5 disabled:opacity-50"
                    />
                  </Badge>
                );
              })}
            </div>
          )}
        </TableCell>
        <TableCell className="py-0">
          <div className="flex items-center justify-end gap-1">
            <AssignToPrintingButton
              printings={assignablePrintings}
              product={product}
              assignedPrintingIds={assignedPrintingIds}
              otherAssignedPrintingIds={otherAssignedPrintingIds}
              highlightFinish={product.finish}
              highlightLanguage={highlightLanguage}
              highlightSpecialMarkers={product.groupKind === "special"}
              onAssignToPrinting={(eid, pid) =>
                handlers.onAssignToPrinting(eid, product.finish, product.language, pid)
              }
              isAssigning={handlers.isAssigningToPrinting}
            />
            <RowActions
              canIgnore={canIgnore}
              canReassign={canReassign}
              canUnassign={canUnassign}
              handlers={handlers}
              product={product}
              onToggleReassign={() => setShowAssign((v) => !v)}
              showAssign={showAssign}
            />
          </div>
        </TableCell>
      </TableRow>
      {showAssign && canReassign && (
        <TableRow>
          <TableCell colSpan={8} className="bg-muted/30">
            <div className="max-w-md">
              <CardSearchDropdown
                results={filteredResults}
                onSearch={setCardSearchQuery}
                onSelect={(cardId) => {
                  handlers.onAssignToCard(
                    product.externalId,
                    product.finish,
                    product.language,
                    cardId,
                  );
                  setShowAssign(false);
                  setCardSearchQuery("");
                }}
                disabled={handlers.isAssigning}
                // oxlint-disable-next-line jsx-a11y/no-autofocus -- admin-only UI, autofocus is intentional
                autoFocus
              />
            </div>
          </TableCell>
        </TableRow>
      )}
    </>
  );
}
