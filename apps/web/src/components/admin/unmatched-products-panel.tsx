import type { StagedProductResponse } from "@openrift/shared";
import { useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";

import { StagedProductCard } from "@/components/admin/staged-product-card";
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
  useUnifiedAssignToCard,
  useUnifiedIgnoreProducts,
  useUnifiedIgnoreVariants,
  useUnifiedMappings,
} from "@/hooks/use-unified-mappings";

import type { AssignableCard, StagedProduct } from "./price-mappings-types";
import { CM_CONFIG, CT_CONFIG, TCG_CONFIG } from "./source-configs";

const MARKETPLACES = ["tcgplayer", "cardmarket", "cardtrader"] as const;
type Marketplace = (typeof MARKETPLACES)[number];
const CONFIG_BY_MARKETPLACE: Record<Marketplace, typeof TCG_CONFIG> = {
  tcgplayer: TCG_CONFIG,
  cardmarket: CM_CONFIG,
  cardtrader: CT_CONFIG,
};

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

export function UnmatchedProductsPanel() {
  const navigate = useNavigate();
  const { data } = useUnifiedMappings(false);

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
    () => [...new Set(allRows.map((row) => row.product.language))].toSorted(),
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

  // Group filtered rows by marketplace so the dense grid stays organized.
  const grouped = useMemo(() => {
    const result: Record<Marketplace, UnmatchedRow[]> = {
      tcgplayer: [],
      cardmarket: [],
      cardtrader: [],
    };
    for (const row of filtered) {
      result[row.marketplace].push(row);
    }
    return result;
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

  function handleAssignToCard(marketplace: Marketplace, product: StagedProduct, cardId: string) {
    const mutations = mutationsFor(marketplace);
    mutations.assign.mutate(
      {
        externalId: product.externalId,
        finish: product.finish,
        language: product.language,
        cardId,
      },
      {
        onSuccess: () => {
          // Jump straight to the card detail, pre-focused on the relevant
          // marketplace cell so the admin can finalize the mapping without
          // having to locate the right printing by hand.
          void navigate({
            to: "/admin/cards/$cardSlug",
            params: { cardSlug: cardId },
            search: {
              focusMarketplace: marketplace,
              focusFinish: product.finish,
              focusLanguage: product.language,
            },
          });
        },
      },
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 p-4">
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
        <div className="text-muted-foreground flex flex-1 items-center justify-center text-sm">
          {allRows.length === 0 ? "No unmatched products." : "No matches for the current filters."}
        </div>
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="space-y-6">
            {MARKETPLACES.map((marketplace) => {
              const rows = grouped[marketplace];
              if (rows.length === 0) {
                return null;
              }
              const config = CONFIG_BY_MARKETPLACE[marketplace];
              const mutations = mutationsFor(marketplace);
              const isIgnoring =
                mutations.ignoreVariant.isPending || mutations.ignoreProduct.isPending;
              return (
                <section key={marketplace} className="space-y-2">
                  <h3 className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
                    {config.displayName} ({rows.length})
                  </h3>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-[repeat(auto-fill,minmax(280px,1fr))]">
                    {rows
                      .toSorted(
                        (a, b) =>
                          a.product.productName.localeCompare(b.product.productName) ||
                          b.product.finish.localeCompare(a.product.finish),
                      )
                      .map(({ product }) => (
                        <StagedProductCard
                          key={`${product.externalId}::${product.finish}::${product.language}`}
                          config={config}
                          product={product}
                          // Most unmatched rows are sealed product or bundles —
                          // make the level-2 ignore primary like the old page.
                          primaryIgnoreLevel="product"
                          onIgnoreProduct={() =>
                            mutations.ignoreProduct.mutate([{ externalId: product.externalId }])
                          }
                          onIgnoreVariant={() =>
                            mutations.ignoreVariant.mutate([
                              {
                                externalId: product.externalId,
                                finish: product.finish,
                                language: product.language,
                              },
                            ])
                          }
                          isIgnoring={isIgnoring}
                          allCards={data.allCards as AssignableCard[]}
                          onAssignToCard={(cardId) =>
                            handleAssignToCard(marketplace, product, cardId)
                          }
                          isAssigning={mutations.assign.isPending}
                        />
                      ))}
                  </div>
                </section>
              );
            })}
          </div>
        </div>
      )}
    </div>
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
