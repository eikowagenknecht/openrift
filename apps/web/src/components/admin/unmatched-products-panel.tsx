import type { StagedProductResponse } from "@openrift/shared";
import { useNavigate } from "@tanstack/react-router";
import { AlertTriangleIcon, BanIcon, EllipsisVerticalIcon, LinkIcon, XIcon } from "lucide-react";
import React, { useMemo, useState } from "react";

import type { CardSearchResult } from "@/components/admin/card-search-dropdown";
import { CardSearchDropdown } from "@/components/admin/card-search-dropdown";
import { displayedProductLanguage } from "@/components/admin/marketplace-products-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  useUnifiedAssignToCard,
  useUnifiedIgnoreProducts,
  useUnifiedIgnoreVariants,
  useUnifiedMappings,
} from "@/hooks/use-unified-mappings";

import type { AssignableCard, SourceMappingConfig, StagedProduct } from "./price-mappings-types";
import { formatCents, ProductLink } from "./price-mappings-utils";
import { CM_CONFIG, CT_CONFIG, TCG_CONFIG } from "./source-configs";

const MARKETPLACES = ["tcgplayer", "cardmarket", "cardtrader"] as const;
type Marketplace = (typeof MARKETPLACES)[number];
const CONFIG_BY_MARKETPLACE: Record<Marketplace, SourceMappingConfig> = {
  tcgplayer: TCG_CONFIG,
  cardmarket: CM_CONFIG,
  cardtrader: CT_CONFIG,
};

const STALE_THRESHOLD_MS = 48 * 60 * 60 * 1000;
const COLUMN_COUNT = 7;

interface UnmatchedRow {
  marketplace: Marketplace;
  product: StagedProduct;
}

function flattenUnmatched(data: {
  unmatchedProducts: Record<Marketplace, StagedProductResponse[]>;
}): UnmatchedRow[] {
  const rows: UnmatchedRow[] = [];
  for (const marketplace of MARKETPLACES) {
    for (const product of data.unmatchedProducts[marketplace]) {
      rows.push({ marketplace, product });
    }
  }
  return rows;
}

/**
 * Build the post-assign redirect target. The card-detail route is keyed by
 * `cardSlug`, not the UUID — passing the UUID lands on a "No card data" error
 * page. The redirect pre-focuses the marketplace cell that was just assigned
 * so the admin can finalize the printing mapping in place.
 * @returns A TanStack Router navigation descriptor for the card detail page.
 */
export function buildAssignSuccessNavigation(
  marketplace: Marketplace,
  product: { finish: string; language: string | null },
  card: { cardSlug: string },
) {
  return {
    to: "/admin/cards/$cardSlug" as const,
    params: { cardSlug: card.cardSlug },
    search: {
      focusMarketplace: marketplace,
      focusFinish: product.finish,
      // CM/TCG have no per-language SKU; fall back to empty so the search param
      // is always a string (TanStack Router rejects undefined keys).
      focusLanguage: product.language ?? "",
    },
  };
}

export function UnmatchedProductsPanel() {
  const navigate = useNavigate();
  const { data } = useUnifiedMappings();

  const [marketplaceFilter, setMarketplaceFilter] = useState<"all" | Marketplace>("all");
  const [finishFilter, setFinishFilter] = useState<"all" | string>("all");
  const [languageFilter, setLanguageFilter] = useState<"all" | string>("all");
  const [search, setSearch] = useState("");

  const allRows = useMemo(() => flattenUnmatched(data), [data]);

  // Populate finish and language filters from the visible data so options
  // reflect what's actually in the current dataset, not a fixed allow-list.
  const availableFinishes = useMemo(
    () => [...new Set(allRows.map((row) => row.product.finish))].toSorted(),
    [allRows],
  );
  const availableLanguages = useMemo(
    () =>
      [
        ...new Set(
          allRows.map((row) => row.product.language).filter((l): l is string => l !== null),
        ),
      ].toSorted(),
    [allRows],
  );

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return allRows.filter((row) => {
      if (marketplaceFilter !== "all" && row.marketplace !== marketplaceFilter) {
        return false;
      }
      if (finishFilter !== "all" && row.product.finish !== finishFilter) {
        return false;
      }
      if (languageFilter !== "all" && row.product.language !== languageFilter) {
        return false;
      }
      if (needle && !row.product.productName.toLowerCase().includes(needle)) {
        return false;
      }
      return true;
    });
  }, [allRows, marketplaceFilter, finishFilter, languageFilter, search]);

  // Sort rows so marketplace-grouped header rows render in a stable order and
  // the rows within each marketplace match the per-card marketplace table.
  const sortedRows = useMemo(() => {
    const marketplaceOrder: Record<Marketplace, number> = {
      tcgplayer: 0,
      cardmarket: 1,
      cardtrader: 2,
    };
    return [...filtered].sort(
      (a, b) =>
        marketplaceOrder[a.marketplace] - marketplaceOrder[b.marketplace] ||
        a.product.productName.localeCompare(b.product.productName) ||
        b.product.finish.localeCompare(a.product.finish) ||
        (a.product.language ?? "").localeCompare(b.product.language ?? "") ||
        a.product.externalId - b.product.externalId,
    );
  }, [filtered]);

  // Mutations — one per marketplace, reused from the old unified page.
  const tcgAssign = useUnifiedAssignToCard("tcgplayer");
  const cmAssign = useUnifiedAssignToCard("cardmarket");
  const ctAssign = useUnifiedAssignToCard("cardtrader");
  const tcgIgnoreVariant = useUnifiedIgnoreVariants("tcgplayer");
  const cmIgnoreVariant = useUnifiedIgnoreVariants("cardmarket");
  const ctIgnoreVariant = useUnifiedIgnoreVariants("cardtrader");
  const tcgIgnoreProduct = useUnifiedIgnoreProducts("tcgplayer");
  const cmIgnoreProduct = useUnifiedIgnoreProducts("cardmarket");
  const ctIgnoreProduct = useUnifiedIgnoreProducts("cardtrader");

  function mutationsFor(marketplace: Marketplace) {
    switch (marketplace) {
      case "tcgplayer": {
        return {
          assign: tcgAssign,
          ignoreVariant: tcgIgnoreVariant,
          ignoreProduct: tcgIgnoreProduct,
        };
      }
      case "cardmarket": {
        return { assign: cmAssign, ignoreVariant: cmIgnoreVariant, ignoreProduct: cmIgnoreProduct };
      }
      case "cardtrader": {
        return { assign: ctAssign, ignoreVariant: ctIgnoreVariant, ignoreProduct: ctIgnoreProduct };
      }
    }
  }

  function handleAssignToCard(
    marketplace: Marketplace,
    product: StagedProduct,
    card: { cardId: string; cardSlug: string },
  ) {
    const mutations = mutationsFor(marketplace);
    mutations.assign.mutate(
      {
        externalId: product.externalId,
        finish: product.finish,
        language: product.language,
        cardId: card.cardId,
      },
      {
        onSuccess: () => {
          void navigate(buildAssignSuccessNavigation(marketplace, product, card));
        },
      },
    );
  }

  return (
    <div className="space-y-4 p-4">
      <FilterBar
        marketplaceFilter={marketplaceFilter}
        onMarketplaceChange={setMarketplaceFilter}
        finishFilter={finishFilter}
        onFinishChange={setFinishFilter}
        availableFinishes={availableFinishes}
        languageFilter={languageFilter}
        onLanguageChange={setLanguageFilter}
        availableLanguages={availableLanguages}
        search={search}
        onSearchChange={setSearch}
        totalCount={allRows.length}
        filteredCount={filtered.length}
      />

      {filtered.length === 0 ? (
        <div className="text-muted-foreground py-8 text-center text-sm">
          {allRows.length === 0 ? "No unmatched products." : "No matches for the current filters."}
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-20">ID</TableHead>
              <TableHead>Product</TableHead>
              <TableHead className="w-16">Language</TableHead>
              <TableHead>Set</TableHead>
              <TableHead className="w-16">Finish</TableHead>
              <TableHead className="w-20 text-right">Price</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {sortedRows.map((row, index) => {
              const { marketplace, product } = row;
              const key = `${marketplace}::${product.externalId}::${product.finish}::${product.language}`;
              const isFirstOfMarketplace =
                index === 0 || sortedRows[index - 1].marketplace !== marketplace;
              const mutations = mutationsFor(marketplace);
              return (
                <React.Fragment key={key}>
                  {isFirstOfMarketplace && (
                    <TableRow className="hover:bg-transparent">
                      <TableCell
                        colSpan={COLUMN_COUNT}
                        className="bg-muted/50 text-muted-foreground py-1.5 font-semibold tracking-wide uppercase"
                      >
                        {CONFIG_BY_MARKETPLACE[marketplace].displayName}
                      </TableCell>
                    </TableRow>
                  )}
                  <UnmatchedProductRow
                    marketplace={marketplace}
                    product={product}
                    allCards={data.allCards as AssignableCard[]}
                    onAssignToCard={(card) => handleAssignToCard(marketplace, product, card)}
                    isAssigning={mutations.assign.isPending}
                    onIgnoreVariant={() =>
                      mutations.ignoreVariant.mutate([
                        {
                          externalId: product.externalId,
                          finish: product.finish,
                          language: product.language,
                        },
                      ])
                    }
                    onIgnoreProduct={() =>
                      mutations.ignoreProduct.mutate([{ externalId: product.externalId }])
                    }
                    isIgnoring={
                      mutations.ignoreVariant.isPending || mutations.ignoreProduct.isPending
                    }
                  />
                </React.Fragment>
              );
            })}
          </TableBody>
        </Table>
      )}
    </div>
  );
}

// ── Row ─────────────────────────────────────────────────────────────────────

function UnmatchedProductRow({
  marketplace,
  product,
  allCards,
  onAssignToCard,
  isAssigning,
  onIgnoreVariant,
  onIgnoreProduct,
  isIgnoring,
}: {
  marketplace: Marketplace;
  product: StagedProduct;
  allCards: AssignableCard[];
  onAssignToCard: (card: { cardId: string; cardSlug: string }) => void;
  isAssigning: boolean;
  onIgnoreVariant: () => void;
  onIgnoreProduct: () => void;
  isIgnoring: boolean;
}) {
  const [showAssign, setShowAssign] = useState(false);
  const [cardSearchQuery, setCardSearchQuery] = useState("");

  const config = CONFIG_BY_MARKETPLACE[marketplace];
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
        <TableCell className="max-w-0">
          <span className="block truncate font-medium" title={product.productName}>
            {product.productName}
          </span>
        </TableCell>
        <TableCell className="text-muted-foreground w-16">
          {displayedProductLanguage(marketplace, product.language) ?? (
            <span className="text-muted-foreground/50">—</span>
          )}
        </TableCell>
        <TableCell className="text-muted-foreground max-w-0">
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
        <TableCell className="py-0">
          <div className="flex items-center justify-end gap-1">
            <Button
              variant="outline"
              size="sm"
              disabled={isAssigning}
              onClick={() => setShowAssign((v) => !v)}
              title="Assign this product to a card"
            >
              {showAssign ? <XIcon /> : <LinkIcon />}
              {showAssign ? "Cancel" : "Assign"}
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button variant="ghost" size="icon" title="More actions">
                    <EllipsisVerticalIcon className="size-4" />
                  </Button>
                }
              />
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  disabled={isIgnoring}
                  onClick={onIgnoreProduct}
                  title="Ignore every SKU of this upstream product"
                >
                  <BanIcon className="size-3.5" />
                  Ignore entire product
                </DropdownMenuItem>
                <DropdownMenuItem
                  disabled={isIgnoring}
                  onClick={onIgnoreVariant}
                  title="Ignore this specific finish/language SKU"
                >
                  <BanIcon className="size-3.5" />
                  Ignore variant
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </TableCell>
      </TableRow>
      {showAssign && (
        <TableRow>
          <TableCell colSpan={COLUMN_COUNT} className="bg-muted/30">
            <div className="max-w-md">
              <CardSearchDropdown
                results={filteredResults}
                onSearch={setCardSearchQuery}
                onSelect={(cardId) => {
                  // The dropdown emits only the id, so resolve the slug from
                  // the same allCards list the results were built from. The
                  // card-detail route is keyed by slug, not id.
                  const card = allCards.find((c) => c.cardId === cardId);
                  if (!card) {
                    return;
                  }
                  onAssignToCard({ cardId: card.cardId, cardSlug: card.cardSlug });
                  setShowAssign(false);
                  setCardSearchQuery("");
                }}
                disabled={isAssigning}
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

// ── Filter bar ──────────────────────────────────────────────────────────────

function FilterBar({
  marketplaceFilter,
  onMarketplaceChange,
  finishFilter,
  onFinishChange,
  availableFinishes,
  languageFilter,
  onLanguageChange,
  availableLanguages,
  search,
  onSearchChange,
  totalCount,
  filteredCount,
}: {
  marketplaceFilter: "all" | Marketplace;
  onMarketplaceChange: (value: "all" | Marketplace) => void;
  finishFilter: "all" | string;
  onFinishChange: (value: "all" | string) => void;
  availableFinishes: string[];
  languageFilter: "all" | string;
  onLanguageChange: (value: "all" | string) => void;
  availableLanguages: string[];
  search: string;
  onSearchChange: (value: string) => void;
  totalCount: number;
  filteredCount: number;
}) {
  const marketplaceItems = [
    { value: "all", label: "All marketplaces" },
    { value: "tcgplayer", label: "TCGplayer" },
    { value: "cardmarket", label: "Cardmarket" },
    { value: "cardtrader", label: "CardTrader" },
  ];
  const finishItems = [
    { value: "all", label: "All finishes" },
    ...availableFinishes.map((f) => ({ value: f, label: f })),
  ];
  const languageItems = [
    { value: "all", label: "All languages" },
    ...availableLanguages.map((lang) => ({ value: lang, label: lang })),
  ];

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Select
        items={marketplaceItems}
        value={marketplaceFilter}
        onValueChange={(v) => onMarketplaceChange((v ?? "all") as "all" | Marketplace)}
      >
        <SelectTrigger className="h-9 w-44" aria-label="Filter by marketplace">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            {marketplaceItems.map((item) => (
              <SelectItem key={item.value} value={item.value}>
                {item.label}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>

      <Select
        items={finishItems}
        value={finishFilter}
        onValueChange={(v) => onFinishChange(v ?? "all")}
      >
        <SelectTrigger className="h-9 w-36" aria-label="Filter by finish">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            {finishItems.map((item) => (
              <SelectItem key={item.value} value={item.value}>
                {item.label}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>

      <Select
        items={languageItems}
        value={languageFilter}
        onValueChange={(v) => onLanguageChange(v ?? "all")}
      >
        <SelectTrigger className="h-9 w-36" aria-label="Filter by language">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            {languageItems.map((item) => (
              <SelectItem key={item.value} value={item.value}>
                {item.label}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>

      <Input
        type="search"
        placeholder="Search product name…"
        value={search}
        onChange={(event) => onSearchChange(event.target.value)}
        className="h-9 w-64"
      />

      <span className="text-muted-foreground ml-auto text-xs">
        {filteredCount === totalCount
          ? `${totalCount} unmatched`
          : `${filteredCount} of ${totalCount} unmatched`}
      </span>
    </div>
  );
}
