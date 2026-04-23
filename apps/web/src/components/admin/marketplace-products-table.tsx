import type { AdminMarketplaceName } from "@openrift/shared";
import { formatPrintingLabel } from "@openrift/shared/utils";
import {
  AlertTriangleIcon,
  BanIcon,
  CheckIcon,
  ChevronDownIcon,
  EllipsisVerticalIcon,
  LinkIcon,
  XIcon,
} from "lucide-react";
import { useState } from "react";

import type { CardSearchResult } from "@/components/admin/card-search-dropdown";
import { CardSearchDropdown } from "@/components/admin/card-search-dropdown";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
  SourceMappingConfig,
  StagedProduct,
  UnifiedMappingGroup,
  UnifiedMappingPrinting,
} from "./price-mappings-types";
import { formatCents, ProductLink } from "./price-mappings-utils";
import { CM_CONFIG, CT_CONFIG, TCG_CONFIG } from "./source-configs";

const MARKETPLACE_CONFIGS: Record<AdminMarketplaceName, SourceMappingConfig> = {
  tcgplayer: TCG_CONFIG,
  cardmarket: CM_CONFIG,
  cardtrader: CT_CONFIG,
};

const STALE_THRESHOLD_MS = 48 * 60 * 60 * 1000;

export interface MarketplaceHandlers {
  onIgnoreVariant: (externalId: number, finish: string, language: string) => void;
  onIgnoreProduct: (externalId: number) => void;
  onAssignToCard: (externalId: number, finish: string, language: string, cardId: string) => void;
  onAssignToPrinting: (externalId: number, printingId: string) => void;
  onUnassign: (externalId: number, finish: string, language: string) => void;
  onUnmapPrinting: (printingId: string) => void;
  isIgnoring: boolean;
  isAssigning: boolean;
  isAssigningToPrinting: boolean;
  isUnassigning: boolean;
  isUnmappingPrinting: boolean;
}

interface AssignedPrinting {
  printingId: string;
  label: string;
}

interface TableEntry {
  marketplace: AdminMarketplaceName;
  product: StagedProduct;
  isAssigned: boolean;
  assignedPrintings: AssignedPrinting[];
  assignedPrintingIds: Set<string>;
}

export function collectEntries(group: UnifiedMappingGroup): TableEntry[] {
  const printingById = new Map(group.printings.map((p) => [p.printingId, p]));
  const entries: TableEntry[] = [];
  for (const marketplace of ["tcgplayer", "cardmarket", "cardtrader"] as const) {
    const { stagedProducts, assignedProducts, assignments = [] } = group[marketplace];
    const seen = new Set<string>();
    for (const product of [...stagedProducts, ...assignedProducts]) {
      const dedupeKey = `${product.externalId}::${product.finish}::${product.language}`;
      if (seen.has(dedupeKey)) {
        continue;
      }
      seen.add(dedupeKey);
      const isAssigned = assignedProducts.some(
        (ap) =>
          ap.externalId === product.externalId &&
          ap.finish === product.finish &&
          ap.language === product.language,
      );
      // Match assignments that apply to this specific (externalId, finish, language)
      // tuple. Language-aggregate marketplaces (Cardmarket) store `null` for the
      // assignment language, so a null assignment matches every row's language.
      const matchingPrintings = assignments
        .filter(
          (a) =>
            a.externalId === product.externalId &&
            a.finish === product.finish &&
            (a.language === null || a.language === product.language),
        )
        .map((a) => printingById.get(a.printingId))
        .filter((p): p is UnifiedMappingPrinting => p !== undefined);
      const assignedPrintings: AssignedPrinting[] = matchingPrintings
        .map((p) => ({
          printingId: p.printingId,
          label: formatPrintingLabel(p.shortCode, p.markerSlugs, p.finish, p.language),
        }))
        .toSorted((a, b) => a.label.localeCompare(b.label));
      const assignedPrintingIds = new Set(matchingPrintings.map((p) => p.printingId));
      entries.push({
        marketplace,
        product,
        isAssigned,
        assignedPrintings,
        assignedPrintingIds,
      });
    }
  }
  entries.sort((a, b) => {
    if (a.marketplace !== b.marketplace) {
      return a.marketplace.localeCompare(b.marketplace);
    }
    return (
      a.product.productName.localeCompare(b.product.productName) ||
      b.product.finish.localeCompare(a.product.finish)
    );
  });
  return entries;
}

export function MarketplaceProductsTable({
  group,
  allCards,
  handlers,
}: {
  group: UnifiedMappingGroup;
  allCards: AssignableCard[];
  handlers: Record<AdminMarketplaceName, MarketplaceHandlers>;
}) {
  const entries = collectEntries(group);

  if (entries.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">No marketplace products linked to this card.</p>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-16">Marketplace</TableHead>
          <TableHead className="w-20">ID</TableHead>
          <TableHead>Set</TableHead>
          <TableHead>Product</TableHead>
          <TableHead className="w-16">Language</TableHead>
          <TableHead className="w-16">Finish</TableHead>
          <TableHead className="w-20 text-right">Price</TableHead>
          <TableHead>Assigned printings</TableHead>
          <TableHead />
        </TableRow>
      </TableHeader>
      <TableBody>
        {entries.map((entry) => (
          <MarketplaceProductRow
            key={`${entry.marketplace}::${entry.product.externalId}::${entry.product.finish}::${entry.product.language}`}
            entry={entry}
            printings={group.printings}
            allCards={allCards}
            handlers={handlers[entry.marketplace]}
          />
        ))}
      </TableBody>
    </Table>
  );
}

function MarketplaceProductRow({
  entry,
  printings,
  allCards,
  handlers,
}: {
  entry: TableEntry;
  printings: UnifiedMappingPrinting[];
  allCards: AssignableCard[];
  handlers: MarketplaceHandlers;
}) {
  const [showAssign, setShowAssign] = useState(false);
  const [cardSearchQuery, setCardSearchQuery] = useState("");

  const { marketplace, product, isAssigned, assignedPrintings, assignedPrintingIds } = entry;
  const config = MARKETPLACE_CONFIGS[marketplace];
  const canIgnore = !isAssigned;
  const canUnassign = Boolean(product.isOverride);
  const canReassign = !isAssigned && !product.isOverride;

  const recordedAt = new Date(product.recordedAt);
  const isStale = Date.now() - recordedAt.getTime() > STALE_THRESHOLD_MS;

  const priceCents = product.marketCents ?? product.lowCents;
  const priceDisplay =
    priceCents && priceCents > 0 ? formatCents(priceCents, product.currency) : "";

  const filteredResults: CardSearchResult[] =
    cardSearchQuery.length >= 2
      ? allCards
          .filter((c) => c.cardName.toLowerCase().includes(cardSearchQuery.toLowerCase()))
          .slice(0, 10)
          .map((c) => {
            const firstId = c.shortCodes.toSorted((a, b) => a.localeCompare(b))[0] ?? "";
            return { id: c.cardId, label: c.cardName, sublabel: firstId, detail: c.setName };
          })
      : [];

  return (
    <>
      <TableRow>
        <TableCell className="w-16">
          <Badge variant="outline" className="font-normal">
            {config.shortName}
          </Badge>
        </TableCell>
        <TableCell className="w-20">
          <ProductLink config={config} externalId={product.externalId}>
            #{product.externalId}
          </ProductLink>
        </TableCell>
        <TableCell className="text-muted-foreground max-w-0">
          <span className="block truncate" title={product.groupName ?? undefined}>
            {product.groupName ?? <span className="text-muted-foreground/50">—</span>}
          </span>
        </TableCell>
        <TableCell className="max-w-0">
          <div className="flex items-center gap-1.5">
            {isAssigned ? (
              <CheckIcon className="size-3.5 shrink-0 text-green-600 dark:text-green-400" />
            ) : (
              <span aria-hidden className="inline-block size-3.5 shrink-0" />
            )}
            <span className="truncate font-medium" title={product.productName}>
              {product.productName}
            </span>
          </div>
        </TableCell>
        <TableCell className="text-muted-foreground w-16">
          {product.language || <span className="text-muted-foreground/50">—</span>}
        </TableCell>
        <TableCell className="w-16">
          <Badge variant="outline">{product.finish}</Badge>
        </TableCell>
        <TableCell className="w-20 text-right tabular-nums">
          <div className="flex items-center justify-end gap-1">
            {isStale && (
              <AlertTriangleIcon
                className="text-destructive size-3.5"
                title={`Last seen ${product.recordedAt.slice(0, 16).replace("T", " ")}`}
              />
            )}
            <span>{priceDisplay}</span>
          </div>
        </TableCell>
        <TableCell>
          {assignedPrintings.length === 0 ? (
            <span className="text-muted-foreground/50">—</span>
          ) : (
            <div className="flex flex-wrap gap-1">
              {assignedPrintings.map((p) => (
                <Badge key={p.printingId} variant="outline" className="gap-1 pr-1">
                  {p.label}
                  <button
                    type="button"
                    aria-label={`Unassign ${p.label}`}
                    title="Unassign"
                    disabled={handlers.isUnmappingPrinting}
                    onClick={() => handlers.onUnmapPrinting(p.printingId)}
                    className="text-muted-foreground hover:text-destructive -mr-0.5 inline-flex size-3.5 items-center justify-center rounded-sm disabled:opacity-50"
                  >
                    <XIcon className="size-3" />
                  </button>
                </Badge>
              ))}
            </div>
          )}
        </TableCell>
        <TableCell className="py-0">
          <div className="flex items-center justify-end gap-1">
            <AssignToPrintingButton
              printings={printings}
              product={product}
              assignedPrintingIds={assignedPrintingIds}
              onAssignToPrinting={(eid, pid) => handlers.onAssignToPrinting(eid, pid)}
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
          <TableCell colSpan={9} className="bg-muted/30">
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

function AssignToPrintingButton({
  printings,
  product,
  assignedPrintingIds,
  onAssignToPrinting,
  isAssigning,
}: {
  printings: UnifiedMappingPrinting[];
  product: StagedProduct;
  assignedPrintingIds: Set<string>;
  onAssignToPrinting: (externalId: number, printingId: string) => void;
  isAssigning: boolean;
}) {
  const sorted = [...printings].toSorted((a, b) => a.shortCode.localeCompare(b.shortCode));
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
        {sorted.map((printing) => {
          const label = formatPrintingLabel(
            printing.shortCode,
            printing.markerSlugs,
            printing.finish,
            printing.language,
          );
          const currentlyAssigned = assignedPrintingIds.has(printing.printingId);
          return (
            <DropdownMenuItem
              key={printing.printingId}
              disabled={isAssigning}
              onClick={() => onAssignToPrinting(product.externalId, printing.printingId)}
            >
              {currentlyAssigned ? (
                <CheckIcon className="size-3.5 text-green-600 dark:text-green-400" />
              ) : (
                <span className="inline-block size-3.5" />
              )}
              {label}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function RowActions({
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
