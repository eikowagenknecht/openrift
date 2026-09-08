import {
  BanIcon,
  CheckIcon,
  ChevronDownIcon,
  EllipsisVerticalIcon,
  LinkIcon,
  XIcon,
} from "lucide-react";
import React from "react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type {
  StagedProduct,
  UnifiedMappingPrinting,
} from "@/features/admin/lib/price-mappings-types";
import { cn } from "@/lib/utils";

import { PrintingLabel } from "./marketplace-printing-label";
import type { MarketplaceHandlers } from "./marketplace-product-entries";
import { setPrefix } from "./marketplace-product-entries";

export function AssignToPrintingButton({
  printings,
  product,
  assignedPrintingIds,
  otherAssignedPrintingIds,
  highlightFinish,
  highlightLanguage,
  highlightSpecialMarkers,
  onAssignToPrinting,
  isAssigning,
}: {
  printings: UnifiedMappingPrinting[];
  product: StagedProduct;
  assignedPrintingIds: Set<string>;
  otherAssignedPrintingIds: Set<string>;
  highlightFinish?: string;
  highlightLanguage?: string;
  highlightSpecialMarkers?: boolean;
  onAssignToPrinting: (externalId: number, printingId: string) => void;
  isAssigning: boolean;
}) {
  const sorted = [...printings].toSorted(
    (a, b) =>
      a.language.localeCompare(b.language) ||
      a.shortCode.localeCompare(b.shortCode) ||
      (a.markerSlugs.length === 0 ? 0 : 1) - (b.markerSlugs.length === 0 ? 0 : 1) ||
      a.markerSlugs.join("+").localeCompare(b.markerSlugs.join("+")) ||
      a.finish.localeCompare(b.finish),
  );
  if (sorted.length === 0) {
    return null;
  }
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button variant="outline" size="sm" disabled={isAssigning}>
            <LinkIcon />
            Assign
            <ChevronDownIcon />
          </Button>
        }
      />
      <DropdownMenuContent align="end">
        {sorted.map((printing, index) => {
          const currentlyAssigned = assignedPrintingIds.has(printing.printingId);
          const assignedElsewhere =
            !currentlyAssigned && otherAssignedPrintingIds.has(printing.printingId);
          // Sorted by (language, shortCode); either changing marks a group boundary.
          const prev = sorted[index - 1] ?? null;
          const needsSeparator =
            prev !== null &&
            (prev.language !== printing.language ||
              setPrefix(prev.shortCode) !== setPrefix(printing.shortCode));
          return (
            <React.Fragment key={printing.printingId}>
              {needsSeparator && <DropdownMenuSeparator />}
              <DropdownMenuItem
                disabled={isAssigning}
                onClick={(event) => {
                  if (event.ctrlKey || event.metaKey) {
                    event.preventBaseUIHandler();
                  }
                  onAssignToPrinting(product.externalId, printing.printingId);
                }}
                title={assignedElsewhere ? "Already assigned to another product" : undefined}
                className={cn(assignedElsewhere && "text-muted-foreground/60")}
              >
                {currentlyAssigned ? (
                  <CheckIcon className="text-success size-3.5" />
                ) : (
                  <span className="inline-block size-3.5" />
                )}
                <PrintingLabel
                  printing={printing}
                  highlightFinish={highlightFinish}
                  highlightLanguage={highlightLanguage}
                  highlightMarkers={
                    highlightSpecialMarkers === true && printing.markerSlugs.length > 0
                  }
                />
              </DropdownMenuItem>
            </React.Fragment>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function RowActions({
  canIgnore,
  canReassign,
  canUnassign,
  handlers,
  product,
  onToggleReassign,
  showAssign,
}: {
  canIgnore: boolean;
  canReassign: boolean;
  canUnassign: boolean;
  handlers: MarketplaceHandlers;
  product: StagedProduct;
  onToggleReassign: () => void;
  showAssign: boolean;
}) {
  if (!canIgnore && !canReassign && !canUnassign) {
    // Render an invisible placeholder so the Assign button stays aligned
    // across rows whether or not the "more actions" menu is present.
    return <span aria-hidden className="inline-block size-8" />;
  }
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button variant="ghost" size="icon" title="More actions">
            <EllipsisVerticalIcon className="size-4" />
          </Button>
        }
      />
      <DropdownMenuContent align="end">
        {canIgnore && (
          <>
            <DropdownMenuItem
              disabled={handlers.isIgnoring}
              onClick={() =>
                handlers.onIgnoreVariant(product.externalId, product.finish, product.language)
              }
            >
              <BanIcon className="size-3.5" />
              Ignore variant
            </DropdownMenuItem>
            <DropdownMenuItem
              disabled={handlers.isIgnoring}
              onClick={() => handlers.onIgnoreProduct(product.externalId)}
            >
              <BanIcon className="size-3.5" />
              Ignore entire product
            </DropdownMenuItem>
          </>
        )}
        {canReassign && (
          <DropdownMenuItem onClick={onToggleReassign}>
            {showAssign ? <XIcon className="size-3.5" /> : <LinkIcon className="size-3.5" />}
            {showAssign ? "Cancel reassign" : "Reassign to card"}
          </DropdownMenuItem>
        )}
        {canUnassign && (
          <DropdownMenuItem
            disabled={handlers.isUnassigning}
            onClick={() =>
              handlers.onUnassign(product.externalId, product.finish, product.language)
            }
          >
            <XIcon className="size-3.5" />
            Unassign
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
