import type { AdminMarketplaceName } from "@openrift/shared";
import { formatPrintingLabel, normalizeNameForMatching } from "@openrift/shared/utils";
import {
  AlertTriangleIcon,
  BanIcon,
  CheckIcon,
  ChevronDownIcon,
  EllipsisVerticalIcon,
  LinkIcon,
  Loader2Icon,
  WandSparklesIcon,
  XIcon,
} from "lucide-react";
import React, { useEffect, useState } from "react";

import type { CardSearchResult } from "@/components/admin/card-search-dropdown";
import { CardSearchDropdown } from "@/components/admin/card-search-dropdown";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Kbd } from "@/components/ui/kbd";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

import type {
  AssignableCard,
  SourceMappingConfig,
  StagedProduct,
  UnifiedMappingGroup,
  UnifiedMappingPrinting,
} from "./price-mappings-types";
import { formatCents, ProductLink } from "./price-mappings-utils";
import { CM_CONFIG, CT_CONFIG, TCG_CONFIG } from "./source-configs";
import type { ProductSuggestion } from "./suggest-mapping";
import { productSuggestionKey, STRONG_MATCH_THRESHOLD } from "./suggest-mapping";

interface PrintingAssignment {
  externalId: number;
  finish: string;
  language: string | null;
  printingId: string;
}

const MARKETPLACE_CONFIGS: Record<AdminMarketplaceName, SourceMappingConfig> = {
  tcgplayer: TCG_CONFIG,
  cardmarket: CM_CONFIG,
  cardtrader: CT_CONFIG,
};

const STALE_THRESHOLD_MS = 48 * 60 * 60 * 1000;

export interface MarketplaceHandlers {
  onIgnoreVariant: (externalId: number, finish: string, language: string | null) => void;
  onIgnoreProduct: (externalId: number) => void;
  onAssignToCard: (
    externalId: number,
    finish: string,
    language: string | null,
    cardId: string,
  ) => void;
  onAssignToPrinting: (
    externalId: number,
    finish: string,
    language: string | null,
    printingId: string,
  ) => void;
  onBatchAssignToPrintings: (mappings: PrintingAssignment[]) => void;
  onUnassign: (externalId: number, finish: string, language: string | null) => void;
  onUnmapPrinting: (printingId: string, externalId: number) => void;
  isIgnoring: boolean;
  isAssigning: boolean;
  isAssigningToPrinting: boolean;
  isUnassigning: boolean;
  isUnmappingPrinting: boolean;
}

interface AssignedPrinting {
  printingId: string;
  shortCode: string;
  markerSlugs: string[];
  finish: string;
  language: string;
}

interface TableEntry {
  marketplace: AdminMarketplaceName;
  product: StagedProduct;
  isAssigned: boolean;
  assignedPrintings: AssignedPrinting[];
  assignedPrintingIds: Set<string>;
  /**
   * Printings already assigned to a *different* external ID within the same
   * marketplace. Used by the Assign dropdown to dim entries that would
   * conflict with an existing mapping — the user can still pick them, but the
   * visual cue flags the conflict.
   */
  otherAssignedPrintingIds: Set<string>;
}

/**
 * The set portion of a short code — everything before the first dash.
 * "OGN-027a" → "OGN", "SFD-123" → "SFD". Short codes without a dash return
 * the full string as the prefix.
 * @returns The set prefix portion of a short code.
 */
function setPrefix(shortCode: string): string {
  const dash = shortCode.indexOf("-");
  return dash === -1 ? shortCode : shortCode.slice(0, dash);
}

/**
 * Whether a product name does not normalize to the exact same string as the
 * card name. Uses the alphanumeric-spaceless normalization from
 * `suggest-mapping`, so cosmetic differences (punctuation, spacing, casing)
 * don't trigger a mismatch — but any extra suffix like "(Foil)" or
 * "Alternate Art" does.
 * @returns true when the normalized product and card names are not equal.
 */
export function isCardNameMismatch(productName: string, cardName: string): boolean {
  const normProduct = normalizeNameForMatching(productName);
  const normCard = normalizeNameForMatching(cardName);
  if (normCard.length === 0) {
    return false;
  }
  return normProduct !== normCard;
}

/**
 * The language string to surface in the table's Language column for a staged
 * product. Cardmarket's price guide is language-aggregate, so every CM
 * staging row carries a placeholder "EN" regardless of the physical card's
 * real language — displaying it would falsely imply we've identified an
 * English product. Return null for CM so the UI renders a dash.
 * @returns Display string, or null when no meaningful language is known.
 */
export function displayedProductLanguage(
  marketplace: AdminMarketplaceName,
  language: string | null,
): string | null {
  if (marketplace === "cardmarket") {
    return null;
  }
  return language || null;
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
          shortCode: p.shortCode,
          markerSlugs: p.markerSlugs,
          finish: p.finish,
          language: p.language,
        }))
        .toSorted((a, b) =>
          formatPrintingLabel(a.shortCode, a.markerSlugs, a.finish, a.language).localeCompare(
            formatPrintingLabel(b.shortCode, b.markerSlugs, b.finish, b.language),
          ),
        );
      const assignedPrintingIds = new Set(matchingPrintings.map((p) => p.printingId));
      const otherAssignedPrintingIds = new Set(
        assignments.filter((a) => a.externalId !== product.externalId).map((a) => a.printingId),
      );
      entries.push({
        marketplace,
        product,
        isAssigned,
        assignedPrintings,
        assignedPrintingIds,
        otherAssignedPrintingIds,
      });
    }
  }
  entries.sort((a, b) => {
    if (a.marketplace !== b.marketplace) {
      return a.marketplace.localeCompare(b.marketplace);
    }
    return (
      (a.product.language ?? "").localeCompare(b.product.language ?? "") ||
      (a.product.groupName ?? "").localeCompare(b.product.groupName ?? "") ||
      b.product.finish.localeCompare(a.product.finish) ||
      a.product.externalId - b.product.externalId
    );
  });
  return entries;
}

/**
 * Group every strong-match (score ≥ {@link STRONG_MATCH_THRESHOLD}) suggestion
 * for unassigned products by marketplace. Language-aggregate marketplaces
 * (Cardmarket, TCG) can legitimately emit multiple strong siblings for the
 * same product — all of them are included so a batch accept materialises every
 * sibling mapping.
 * @returns A record keyed by marketplace with one entry per accepted mapping.
 */
export function collectStrongMappings(
  group: UnifiedMappingGroup,
  suggestions: Map<string, ProductSuggestion[]> | undefined,
): Record<AdminMarketplaceName, PrintingAssignment[]> {
  const out: Record<AdminMarketplaceName, PrintingAssignment[]> = {
    tcgplayer: [],
    cardmarket: [],
    cardtrader: [],
  };
  for (const entry of collectEntries(group)) {
    if (entry.isAssigned) {
      continue;
    }
    const key = productSuggestionKey(
      entry.marketplace,
      entry.product.externalId,
      entry.product.finish,
      entry.product.language,
    );
    for (const s of suggestions?.get(key) ?? []) {
      if (s.score < STRONG_MATCH_THRESHOLD) {
        continue;
      }
      out[entry.marketplace].push({
        externalId: entry.product.externalId,
        finish: entry.product.finish,
        language: entry.product.language,
        printingId: s.printingId,
      });
    }
  }
  return out;
}

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
  const totalStrongCount =
    strongMappingsByMarketplace.tcgplayer.length +
    strongMappingsByMarketplace.cardmarket.length +
    strongMappingsByMarketplace.cardtrader.length;
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
          const isFirstOfMarketplace =
            index === 0 || entries[index - 1].marketplace !== entry.marketplace;
          const strongMappings = strongMappingsByMarketplace[entry.marketplace];
          const marketplaceHandlers = handlers[entry.marketplace];
          return (
            <React.Fragment key={key}>
              {isFirstOfMarketplace && (
                <TableRow className="hover:bg-transparent">
                  <TableCell colSpan={8} className="bg-muted/50 py-1 pr-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-muted-foreground font-semibold tracking-wide uppercase">
                        {MARKETPLACE_CONFIGS[entry.marketplace].displayName}
                      </span>
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

function MarketplaceProductRow({
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
        <TableCell className="w-20">
          <ProductLink config={config} externalId={product.externalId}>
            #{product.externalId}
          </ProductLink>
        </TableCell>
        <TableCell className="w-80 max-w-0">
          <div className="flex items-center gap-1.5">
            {isAssigned ? (
              <CheckIcon className="size-3.5 shrink-0 text-green-600 dark:text-green-400" />
            ) : (
              <span aria-hidden className="inline-block size-3.5 shrink-0" />
            )}
            <span
              className={cn(
                "truncate font-medium",
                nameMismatched && "text-yellow-600 dark:text-yellow-400",
              )}
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
              <span title={`Last seen ${product.recordedAt.slice(0, 16).replace("T", " ")}`}>
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
                const label = formatPrintingLabel(p.shortCode, p.markerSlugs, p.finish, p.language);
                return (
                  <Badge key={p.printingId} variant="outline" className="gap-1 pr-1">
                    <PrintingLabel
                      printing={p}
                      highlightFinish={product.finish}
                      highlightLanguage={highlightLanguage}
                      highlightMarkers={product.groupKind === "special" && p.markerSlugs.length > 0}
                    />
                    <button
                      type="button"
                      aria-label={`Unassign ${label}`}
                      title="Unassign"
                      disabled={handlers.isUnmappingPrinting}
                      onClick={() => handlers.onUnmapPrinting(p.printingId, product.externalId)}
                      className="text-muted-foreground hover:text-destructive -mr-0.5 inline-flex size-3.5 items-center justify-center rounded-sm disabled:opacity-50"
                    >
                      <XIcon className="size-3" />
                    </button>
                  </Badge>
                );
              })}
            </div>
          )}
        </TableCell>
        <TableCell className="py-0">
          <div className="flex items-center justify-end gap-1">
            <AssignToPrintingButton
              printings={printings}
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

function SuggestionChip({
  suggestion,
  productExternalId,
  highlightFinish,
  highlightLanguage,
  highlightMarkers,
  onAssign,
  disabled,
}: {
  suggestion: ProductSuggestion & { printing: UnifiedMappingPrinting };
  productExternalId: number;
  highlightFinish?: string;
  highlightLanguage?: string;
  highlightMarkers?: boolean;
  onAssign: (externalId: number, printingId: string) => void;
  disabled: boolean;
}) {
  const { printing } = suggestion;
  const isStrong = suggestion.score >= STRONG_MATCH_THRESHOLD;
  // Local pending flag gives synchronous click feedback — the parent's
  // `disabled` (driven by mutation isPending) also applies but transitions
  // later, and has the same value across every chip in the marketplace, so we
  // can't tell which one the user actually clicked. Timeout resets it if the
  // server somehow skips the save, so the chip doesn't get stuck.
  const [pending, setPending] = useState(false);
  useEffect(() => {
    if (!pending) {
      return;
    }
    const handle = globalThis.setTimeout(() => setPending(false), 5000);
    return () => globalThis.clearTimeout(handle);
  }, [pending]);
  const busy = pending || disabled;
  return (
    <button
      type="button"
      title={`Accept suggestion (score ${suggestion.score})`}
      disabled={busy}
      onClick={() => {
        setPending(true);
        onAssign(productExternalId, printing.printingId);
      }}
      className={cn(
        "inline-flex h-5 items-center gap-1 rounded-4xl border px-2 py-0.5 text-xs font-medium disabled:opacity-50",
        isStrong
          ? "border-solid border-green-600/50 bg-green-500/10 text-green-700 hover:bg-green-500/20 dark:text-green-400"
          : "border-primary/40 bg-primary/5 text-primary hover:bg-primary/10 border-dashed",
      )}
    >
      {pending ? (
        <Loader2Icon className="size-3 shrink-0 animate-spin" />
      ) : (
        <WandSparklesIcon className="size-3 shrink-0" />
      )}
      <PrintingLabel
        printing={printing}
        highlightFinish={highlightFinish}
        highlightLanguage={highlightLanguage}
        highlightMarkers={highlightMarkers}
      />
    </button>
  );
}

/**
 * Render a printing's label as segmented spans so individual fields can be
 * highlighted. When the printing's language/finish match the caller's
 * `highlight*` values, those segments are underlined as a visual confirmation
 * — helping admins spot whether the assigned/suggested printing matches the
 * staged product's finish and language.
 * @returns A span containing the printing label with optional underlines.
 */
function PrintingLabel({
  printing,
  highlightFinish,
  highlightLanguage,
  highlightMarkers,
}: {
  printing: Pick<UnifiedMappingPrinting, "shortCode" | "markerSlugs" | "finish" | "language">;
  highlightFinish?: string;
  highlightLanguage?: string;
  highlightMarkers?: boolean;
}) {
  const langMatches = highlightLanguage !== undefined && printing.language === highlightLanguage;
  const finishMatches = highlightFinish !== undefined && printing.finish === highlightFinish;
  const matchCls = "underline decoration-2 underline-offset-2";
  return (
    <span>
      {printing.language && (
        <>
          <span className={langMatches ? matchCls : undefined}>{printing.language}</span>:
        </>
      )}
      {printing.shortCode}:
      <span className={highlightMarkers ? matchCls : undefined}>
        {printing.markerSlugs.join("+")}
      </span>
      :<span className={finishMatches ? matchCls : undefined}>{printing.finish}</span>
    </span>
  );
}

function AssignToPrintingButton({
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
          // Printings are sorted by (language, shortCode), so any change in
          // language OR set-prefix across adjacent items marks a group
          // boundary. One separator covers either case — no doubles.
          const prev = index > 0 ? sorted[index - 1] : null;
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
                  <CheckIcon className="size-3.5 text-green-600 dark:text-green-400" />
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
