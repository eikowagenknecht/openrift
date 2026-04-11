import type {
  ArtVariant,
  CardType,
  Domain,
  Finish,
  Printing,
  Rarity,
  SuperType,
} from "@openrift/shared";
import { formatShortCodes } from "@openrift/shared";
import { useHotkey } from "@tanstack/react-hotkeys";
import {
  CheckCircle2Icon,
  ChevronDownIcon,
  ChevronRightIcon,
  EyeIcon,
  WandSparklesIcon,
  WrenchIcon,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { CardThumbnail } from "@/components/cards/card-thumbnail";
import { Badge } from "@/components/ui/badge";
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
import {
  useUnifiedAssignToCard,
  useUnifiedIgnoreProducts,
  useUnifiedIgnoreVariants,
  useUnifiedMappings,
  useUnifiedSaveMappings,
  useUnifiedUnassignFromCard,
  useUnifiedUnmapPrinting,
} from "@/hooks/use-unified-mappings";
import { cn } from "@/lib/utils";

import type {
  AssignableCard,
  MappingGroup,
  StagedProduct,
  UnifiedMappingGroup,
  UnifiedMappingPrinting,
} from "./price-mappings-types";
import { formatCents, NOOP, ProductLink } from "./price-mappings-utils";
import { ProductSelect } from "./product-select";
import { SectionHeading } from "./section-heading";
import { CM_CONFIG, CT_CONFIG, TCG_CONFIG } from "./source-configs";
import { StagedProductCard } from "./staged-product-card";
import { computeSuggestions, STRONG_MATCH_THRESHOLD } from "./suggest-mapping";

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Build a per-marketplace MappingGroup for the suggestion algorithm.
 * @returns A single-marketplace MappingGroup
 */
type MappableMarketplace = "tcgplayer" | "cardmarket" | "cardtrader";

function externalIdForMarketplace(p: UnifiedMappingPrinting, marketplace: MappableMarketplace) {
  if (marketplace === "tcgplayer") {
    return p.tcgExternalId;
  }
  if (marketplace === "cardmarket") {
    return p.cmExternalId;
  }
  return p.ctExternalId;
}

function toMarketplaceGroup(
  group: UnifiedMappingGroup,
  marketplace: MappableMarketplace,
): MappingGroup {
  const mkData = group[marketplace];
  return {
    cardId: group.cardId,
    cardSlug: group.cardSlug,
    cardName: group.cardName,
    cardType: group.cardType,
    superTypes: group.superTypes,
    domains: group.domains,
    energy: group.energy,
    might: group.might,
    setId: group.setId,
    setName: group.setName,
    printings: group.printings.map((p) => ({
      ...p,
      externalId: externalIdForMarketplace(p, marketplace),
    })),
    stagedProducts: mkData.stagedProducts,
    assignedProducts: mkData.assignedProducts,
  };
}

// Admin-only escape hatch: `MappingPrintingResponse.imageUrl` is either a
// self-hosted base URL (`/card-images/{prefix}/{uuid}` — needs the variant
// suffix appended) or an external provider URL (used as-is for both sizes).
// Public APIs already hand callers ready-to-use `{ full, thumbnail }` URLs;
// only admin pages still see the raw form.
function toAdminImage(url: string): { face: "front"; full: string; thumbnail: string } {
  if (url.startsWith("/card-images/")) {
    return { face: "front", full: `${url}-full.webp`, thumbnail: `${url}-400w.webp` };
  }
  return { face: "front", full: url, thumbnail: url };
}

function toPrinting(group: UnifiedMappingGroup, p: UnifiedMappingPrinting): Printing {
  return {
    id: p.printingId,
    cardId: group.cardId,
    shortCode: p.shortCode,
    setId: group.setName,
    setSlug: group.setName,
    rarity: p.rarity as Rarity,
    artVariant: p.artVariant as ArtVariant,
    isSigned: p.isSigned,
    promoType: p.promoTypeSlug ? { id: "", slug: p.promoTypeSlug, label: p.promoTypeSlug } : null,
    finish: p.finish as Finish,
    images: p.imageUrl ? [toAdminImage(p.imageUrl)] : [],
    artist: "",
    publicCode: p.shortCode,
    printedRulesText: null,
    printedEffectText: null,
    flavorText: null,
    printedName: null,
    language: "EN",
    card: {
      slug: group.cardId,
      name: group.cardName,
      type: group.cardType as CardType,
      superTypes: group.superTypes as SuperType[],
      domains: group.domains as Domain[],
      energy: group.energy,
      might: group.might,
      power: 0,
      keywords: [],
      tags: [],
      mightBonus: null,
      errata: null,
      bans: [],
    },
  };
}

// ── Status badge for a marketplace ───────────────────────────────────────────

function MarketplaceStatusBadge({
  label,
  group,
  marketplace,
}: {
  label: string;
  group: UnifiedMappingGroup;
  marketplace: MappableMarketplace;
}) {
  const mkGroup = toMarketplaceGroup(group, marketplace);
  const unmapped = mkGroup.printings.filter((p) => p.externalId === null).length;
  const suggestions = computeSuggestions(mkGroup);
  const extraProducts = mkGroup.stagedProducts.length;

  if (unmapped === 0 && extraProducts === 0) {
    return (
      <Badge className="border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
        <CheckCircle2Icon className="size-3" />
        {label}
      </Badge>
    );
  }
  if (unmapped === 0 && extraProducts > 0) {
    return (
      <Badge className="border-orange-500/30 bg-orange-500/10 text-orange-600 dark:text-orange-400">
        <WrenchIcon className="size-3" />
        {label} +{extraProducts}
      </Badge>
    );
  }
  if (suggestions.size >= unmapped) {
    const allStrong = [...suggestions.values()].every((s) => s.score >= STRONG_MATCH_THRESHOLD);
    return allStrong ? (
      <Badge className="border-green-500/30 bg-green-500/10 text-green-600 dark:text-green-400">
        <WandSparklesIcon className="size-3" />
        {label}
      </Badge>
    ) : (
      <Badge className="border-yellow-500/30 bg-yellow-500/10 text-yellow-600 dark:text-yellow-400">
        <WandSparklesIcon className="size-3" />
        {label}
      </Badge>
    );
  }
  if (mkGroup.stagedProducts.length === 0 && mkGroup.assignedProducts.length === 0) {
    return (
      <Badge variant="outline" className="text-muted-foreground">
        {label}
      </Badge>
    );
  }
  return (
    <Badge className="border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400">
      <WrenchIcon className="size-3" />
      {label}
    </Badge>
  );
}

// ── Marketplace product sidebar column ───────────────────────────────────────

function MarketplaceProductColumn({
  marketplace,
  group,
  allCards,
  onIgnoreVariant,
  onIgnoreProduct,
  isIgnoring,
  onUnassign,
  isUnassigning,
  onAssignToCard,
  isAssigning,
}: {
  marketplace: MappableMarketplace;
  group: UnifiedMappingGroup;
  allCards: AssignableCard[];
  onIgnoreVariant: (externalId: number, finish: string, language: string) => void;
  onIgnoreProduct: (externalId: number) => void;
  isIgnoring: boolean;
  onUnassign: (externalId: number, finish: string, language: string) => void;
  isUnassigning: boolean;
  onAssignToCard: (externalId: number, finish: string, language: string, cardId: string) => void;
  isAssigning: boolean;
}) {
  const config =
    marketplace === "tcgplayer" ? TCG_CONFIG : marketplace === "cardmarket" ? CM_CONFIG : CT_CONFIG;
  const mkData = group[marketplace];
  const allProducts = [...mkData.stagedProducts, ...mkData.assignedProducts].toSorted(
    (a, b) => a.productName.localeCompare(b.productName) || b.finish.localeCompare(a.finish),
  );

  return (
    <div className="w-full shrink-0 sm:w-64">
      <SectionHeading>{config.shortName} Products</SectionHeading>
      <div className="flex flex-col gap-2">
        {allProducts.map((sp) => {
          const isAssigned = mkData.assignedProducts.some(
            (ap) => ap.externalId === sp.externalId && ap.finish === sp.finish,
          );
          return (
            <StagedProductCard
              key={`${sp.externalId}::${sp.finish}`}
              config={config}
              product={sp}
              isAssigned={isAssigned}
              // Sidebar cards: this product is about to map (or already did),
              // so per-SKU ignores are the common case ("this card doesn't
              // come in foil, deny that variant"). Level-2 stays available
              // via the dropdown.
              primaryIgnoreLevel="variant"
              onIgnoreVariant={
                isAssigned
                  ? undefined
                  : () => onIgnoreVariant(sp.externalId, sp.finish, sp.language)
              }
              onIgnoreProduct={isAssigned ? undefined : () => onIgnoreProduct(sp.externalId)}
              isIgnoring={isIgnoring}
              onUnassign={
                sp.isOverride ? () => onUnassign(sp.externalId, sp.finish, sp.language) : undefined
              }
              isUnassigning={isUnassigning}
              allCards={sp.isOverride ? undefined : isAssigned ? undefined : allCards}
              onAssignToCard={
                sp.isOverride || isAssigned
                  ? undefined
                  : (cardId) => onAssignToCard(sp.externalId, sp.finish, sp.language, cardId)
              }
              isAssigning={isAssigning}
              assignLabel="Reassign"
            />
          );
        })}
        {allProducts.length === 0 && <p className="text-muted-foreground">No products</p>}
      </div>
    </div>
  );
}

// ── Suggestion button ────────────────────────────────────────────────────────

function SuggestionButton({
  label,
  suggestion,
  config,
  disabled,
  onClick,
}: {
  label: string;
  suggestion: { product: StagedProduct; score: number };
  config: typeof TCG_CONFIG;
  disabled: boolean;
  onClick: () => void;
}) {
  const sp = suggestion.product;
  const isStrong = suggestion.score >= STRONG_MATCH_THRESHOLD;
  return (
    <button
      type="button"
      className={cn(
        "flex w-full items-center rounded-md px-2 py-1.5 disabled:opacity-50",
        isStrong
          ? "border border-solid border-green-600/50 bg-green-500/10 text-green-700 hover:bg-green-500/20 dark:text-green-400"
          : "border-primary/40 bg-primary/5 text-primary hover:bg-primary/10 border border-dashed",
      )}
      disabled={disabled}
      onClick={onClick}
    >
      <span className="min-w-0 flex-1 text-left">
        <span className="flex items-center gap-1 truncate font-medium">
          <WandSparklesIcon className="size-3 shrink-0" />
          <span className="text-muted-foreground mr-1">{label}</span>
          {sp.productName}
        </span>
        <span className="block truncate pl-4 opacity-80">
          {sp.finish} ·{" "}
          <ProductLink config={config} externalId={sp.externalId}>
            #{sp.externalId}
          </ProductLink>
        </span>
      </span>
      <span className="shrink-0 text-sm font-semibold tabular-nums">
        {formatCents(sp.marketCents ?? sp.lowCents, sp.currency)}
      </span>
    </button>
  );
}

// ── Expanded detail (both marketplaces side by side) ─────────────────────────

function UnifiedExpandedDetail({
  group,
  allCards,
  tcgSave,
  cmSave,
  ctSave,
  tcgUnmap,
  cmUnmap,
  ctUnmap,
  tcgIgnoreVariant,
  cmIgnoreVariant,
  ctIgnoreVariant,
  tcgIgnoreProduct,
  cmIgnoreProduct,
  ctIgnoreProduct,
  tcgUnassign,
  cmUnassign,
  ctUnassign,
  tcgAssignToCard,
  cmAssignToCard,
  ctAssignToCard,
  onBatchAccept,
  showHotkeyHint,
}: {
  group: UnifiedMappingGroup;
  allCards: AssignableCard[];
  tcgSave: MutSave;
  cmSave: MutSave;
  ctSave: MutSave;
  tcgUnmap: MutId;
  cmUnmap: MutId;
  ctUnmap: MutId;
  tcgIgnoreVariant: MutProducts;
  cmIgnoreVariant: MutProducts;
  ctIgnoreVariant: MutProducts;
  tcgIgnoreProduct: MutExternalIds;
  cmIgnoreProduct: MutExternalIds;
  ctIgnoreProduct: MutExternalIds;
  tcgUnassign: MutProduct;
  cmUnassign: MutProduct;
  ctUnassign: MutProduct;
  tcgAssignToCard: MutAssign;
  cmAssignToCard: MutAssign;
  ctAssignToCard: MutAssign;
  onBatchAccept: () => void;
  showHotkeyHint: boolean;
}) {
  const tcgGroup = toMarketplaceGroup(group, "tcgplayer");
  const cmGroup = toMarketplaceGroup(group, "cardmarket");
  const ctGroup = toMarketplaceGroup(group, "cardtrader");
  const tcgSuggestions = computeSuggestions(tcgGroup);
  const cmSuggestions = computeSuggestions(cmGroup);
  const ctSuggestions = computeSuggestions(ctGroup);
  const totalSuggestions = tcgSuggestions.size + cmSuggestions.size + ctSuggestions.size;
  const isSaving = tcgSave.isPending || cmSave.isPending || ctSave.isPending;

  return (
    <div className="bg-muted/30 flex flex-col gap-6 px-4 py-4 sm:flex-row sm:px-6">
      {/* Printings */}
      <div className="min-w-0 flex-1">
        <div className="mb-3 flex items-center gap-3">
          <h4 className="text-muted-foreground font-semibold tracking-wide uppercase">Printings</h4>
          {totalSuggestions > 0 && (
            <button
              type="button"
              className={cn(
                "flex items-center gap-1.5 rounded-md px-2 py-1 font-medium disabled:opacity-50",
                "border border-solid border-green-600/50 bg-green-500/10 text-green-700 hover:bg-green-500/20 dark:text-green-400",
              )}
              disabled={isSaving}
              onClick={onBatchAccept}
            >
              <WandSparklesIcon className="size-3" />
              Accept {totalSuggestions} suggestion{totalSuggestions === 1 ? "" : "s"}
              {showHotkeyHint && (
                <Kbd className="ml-1 border border-current/25 bg-transparent leading-none text-inherit opacity-60">
                  Enter
                </Kbd>
              )}
            </button>
          )}
        </div>
        <div className="flex flex-wrap gap-4">
          {group.printings.map((p) => {
            const tcgSug = p.tcgExternalId === null ? tcgSuggestions.get(p.printingId) : undefined;
            const cmSug = p.cmExternalId === null ? cmSuggestions.get(p.printingId) : undefined;
            const ctSug = p.ctExternalId === null ? ctSuggestions.get(p.printingId) : undefined;
            const hasAnyUnmapped =
              p.tcgExternalId === null || p.cmExternalId === null || p.ctExternalId === null;
            return (
              <div
                key={p.printingId}
                className={cn(
                  "w-[280px] rounded-lg",
                  hasAnyUnmapped && "ring-destructive/40 bg-destructive/5 ring-2",
                )}
              >
                <CardThumbnail printing={toPrinting(group, p)} onClick={NOOP} showImages />
                <div className="space-y-1.5 px-2.5 pb-2">
                  <div className="text-muted-foreground flex flex-wrap items-center gap-1">
                    <span>
                      {p.finish}
                      {p.artVariant === ("altart" satisfies ArtVariant) ? " · Alt Art" : ""}
                      {p.artVariant === ("overnumbered" satisfies ArtVariant)
                        ? " · Overnumbered"
                        : ""}
                      {p.isSigned ? " · Signed" : ""}
                      {p.promoTypeSlug ? ` · ${p.promoTypeSlug}` : ""}
                    </span>
                  </div>

                  {/* Mapped IDs — single row when all are mapped */}
                  {p.tcgExternalId !== null &&
                  p.cmExternalId !== null &&
                  p.ctExternalId !== null ? (
                    <div className="text-muted-foreground flex flex-wrap items-center gap-x-3 gap-y-1">
                      <span className="flex items-center gap-1">
                        <Badge variant="outline" className="px-1 py-0">
                          TCG
                        </Badge>
                        <ProductLink config={TCG_CONFIG} externalId={p.tcgExternalId}>
                          #{p.tcgExternalId}
                        </ProductLink>
                        <button
                          type="button"
                          className="hover:text-foreground disabled:opacity-50"
                          onClick={() => tcgUnmap.mutate(p.printingId)}
                          disabled={tcgUnmap.isPending}
                          title="Unmap TCGplayer"
                        >
                          ×
                        </button>
                      </span>
                      <span className="flex items-center gap-1">
                        <Badge variant="outline" className="px-1 py-0">
                          CM
                        </Badge>
                        <ProductLink config={CM_CONFIG} externalId={p.cmExternalId}>
                          #{p.cmExternalId}
                        </ProductLink>
                        <button
                          type="button"
                          className="hover:text-foreground disabled:opacity-50"
                          onClick={() => cmUnmap.mutate(p.printingId)}
                          disabled={cmUnmap.isPending}
                          title="Unmap Cardmarket"
                        >
                          ×
                        </button>
                      </span>
                      <span className="flex items-center gap-1">
                        <Badge variant="outline" className="px-1 py-0">
                          CT
                        </Badge>
                        <ProductLink config={CT_CONFIG} externalId={p.ctExternalId}>
                          #{p.ctExternalId}
                        </ProductLink>
                        <button
                          type="button"
                          className="hover:text-foreground disabled:opacity-50"
                          onClick={() => ctUnmap.mutate(p.printingId)}
                          disabled={ctUnmap.isPending}
                          title="Unmap CardTrader"
                        >
                          ×
                        </button>
                      </span>
                    </div>
                  ) : (
                    <>
                      {/* TCGplayer mapping status */}
                      <div className="space-y-1">
                        {p.tcgExternalId === null ? (
                          <>
                            {tcgSug && (
                              <SuggestionButton
                                label="TCG"
                                suggestion={tcgSug}
                                config={TCG_CONFIG}
                                disabled={tcgSave.isPending}
                                onClick={() =>
                                  tcgSave.mutate({
                                    mappings: [
                                      {
                                        printingId: p.printingId,
                                        externalId: tcgSug.product.externalId,
                                      },
                                    ],
                                  })
                                }
                              />
                            )}
                            <ProductSelect
                              config={TCG_CONFIG}
                              stagedProducts={group.tcgplayer.stagedProducts}
                              assignedProducts={group.tcgplayer.assignedProducts}
                              currentPrintingId={p.printingId}
                              disabled={tcgSave.isPending}
                              onSelect={(extId) =>
                                tcgSave.mutate({
                                  mappings: [{ printingId: p.printingId, externalId: extId }],
                                })
                              }
                            />
                          </>
                        ) : (
                          <div className="text-muted-foreground flex items-center gap-1">
                            <Badge variant="outline" className="px-1 py-0">
                              TCG
                            </Badge>
                            <ProductLink config={TCG_CONFIG} externalId={p.tcgExternalId}>
                              #{p.tcgExternalId}
                            </ProductLink>
                            <button
                              type="button"
                              className="hover:text-foreground disabled:opacity-50"
                              onClick={() => tcgUnmap.mutate(p.printingId)}
                              disabled={tcgUnmap.isPending}
                              title="Unmap TCGplayer"
                            >
                              ×
                            </button>
                          </div>
                        )}
                      </div>

                      {/* Cardmarket mapping status */}
                      <div className="space-y-1">
                        {p.cmExternalId === null ? (
                          <>
                            {cmSug && (
                              <SuggestionButton
                                label="CM"
                                suggestion={cmSug}
                                config={CM_CONFIG}
                                disabled={cmSave.isPending}
                                onClick={() =>
                                  cmSave.mutate({
                                    mappings: [
                                      {
                                        printingId: p.printingId,
                                        externalId: cmSug.product.externalId,
                                      },
                                    ],
                                  })
                                }
                              />
                            )}
                            <ProductSelect
                              config={CM_CONFIG}
                              stagedProducts={group.cardmarket.stagedProducts}
                              assignedProducts={group.cardmarket.assignedProducts}
                              currentPrintingId={p.printingId}
                              disabled={cmSave.isPending}
                              onSelect={(extId) =>
                                cmSave.mutate({
                                  mappings: [{ printingId: p.printingId, externalId: extId }],
                                })
                              }
                            />
                          </>
                        ) : (
                          <div className="text-muted-foreground flex items-center gap-1">
                            <Badge variant="outline" className="px-1 py-0">
                              CM
                            </Badge>
                            <ProductLink config={CM_CONFIG} externalId={p.cmExternalId}>
                              #{p.cmExternalId}
                            </ProductLink>
                            <button
                              type="button"
                              className="hover:text-foreground disabled:opacity-50"
                              onClick={() => cmUnmap.mutate(p.printingId)}
                              disabled={cmUnmap.isPending}
                              title="Unmap Cardmarket"
                            >
                              ×
                            </button>
                          </div>
                        )}
                      </div>

                      {/* CardTrader mapping status */}
                      <div className="space-y-1">
                        {p.ctExternalId === null ? (
                          <>
                            {ctSug && (
                              <SuggestionButton
                                label="CT"
                                suggestion={ctSug}
                                config={CT_CONFIG}
                                disabled={ctSave.isPending}
                                onClick={() =>
                                  ctSave.mutate({
                                    mappings: [
                                      {
                                        printingId: p.printingId,
                                        externalId: ctSug.product.externalId,
                                      },
                                    ],
                                  })
                                }
                              />
                            )}
                            <ProductSelect
                              config={CT_CONFIG}
                              stagedProducts={group.cardtrader.stagedProducts}
                              assignedProducts={group.cardtrader.assignedProducts}
                              currentPrintingId={p.printingId}
                              disabled={ctSave.isPending}
                              onSelect={(extId) =>
                                ctSave.mutate({
                                  mappings: [{ printingId: p.printingId, externalId: extId }],
                                })
                              }
                            />
                          </>
                        ) : (
                          <div className="text-muted-foreground flex items-center gap-1">
                            <Badge variant="outline" className="px-1 py-0">
                              CT
                            </Badge>
                            <ProductLink config={CT_CONFIG} externalId={p.ctExternalId}>
                              #{p.ctExternalId}
                            </ProductLink>
                            <button
                              type="button"
                              className="hover:text-foreground disabled:opacity-50"
                              onClick={() => ctUnmap.mutate(p.printingId)}
                              disabled={ctUnmap.isPending}
                              title="Unmap CardTrader"
                            >
                              ×
                            </button>
                          </div>
                        )}
                      </div>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Product sidebars */}
      <div className="flex flex-col gap-6 sm:flex-row">
        <MarketplaceProductColumn
          marketplace="tcgplayer"
          group={group}
          allCards={allCards}
          onIgnoreVariant={(eid, fin, lang) =>
            tcgIgnoreVariant.mutate([{ externalId: eid, finish: fin, language: lang }])
          }
          onIgnoreProduct={(eid) => tcgIgnoreProduct.mutate([{ externalId: eid }])}
          isIgnoring={tcgIgnoreVariant.isPending || tcgIgnoreProduct.isPending}
          onUnassign={(eid, fin, lang) =>
            tcgUnassign.mutate({ externalId: eid, finish: fin, language: lang })
          }
          isUnassigning={tcgUnassign.isPending}
          onAssignToCard={(eid, fin, lang, cid) =>
            tcgAssignToCard.mutate({ externalId: eid, finish: fin, language: lang, cardId: cid })
          }
          isAssigning={tcgAssignToCard.isPending}
        />
        <MarketplaceProductColumn
          marketplace="cardmarket"
          group={group}
          allCards={allCards}
          onIgnoreVariant={(eid, fin, lang) =>
            cmIgnoreVariant.mutate([{ externalId: eid, finish: fin, language: lang }])
          }
          onIgnoreProduct={(eid) => cmIgnoreProduct.mutate([{ externalId: eid }])}
          isIgnoring={cmIgnoreVariant.isPending || cmIgnoreProduct.isPending}
          onUnassign={(eid, fin, lang) =>
            cmUnassign.mutate({ externalId: eid, finish: fin, language: lang })
          }
          isUnassigning={cmUnassign.isPending}
          onAssignToCard={(eid, fin, lang, cid) =>
            cmAssignToCard.mutate({ externalId: eid, finish: fin, language: lang, cardId: cid })
          }
          isAssigning={cmAssignToCard.isPending}
        />
        <MarketplaceProductColumn
          marketplace="cardtrader"
          group={group}
          allCards={allCards}
          onIgnoreVariant={(eid, fin, lang) =>
            ctIgnoreVariant.mutate([{ externalId: eid, finish: fin, language: lang }])
          }
          onIgnoreProduct={(eid) => ctIgnoreProduct.mutate([{ externalId: eid }])}
          isIgnoring={ctIgnoreVariant.isPending || ctIgnoreProduct.isPending}
          onUnassign={(eid, fin, lang) =>
            ctUnassign.mutate({ externalId: eid, finish: fin, language: lang })
          }
          isUnassigning={ctUnassign.isPending}
          onAssignToCard={(eid, fin, lang, cid) =>
            ctAssignToCard.mutate({ externalId: eid, finish: fin, language: lang, cardId: cid })
          }
          isAssigning={ctAssignToCard.isPending}
        />
      </div>
    </div>
  );
}

// ── Unmatched products section ───────────────────────────────────────────────

function UnmatchedSection({
  marketplace,
  products,
  allCards,
  onIgnoreVariant,
  onIgnoreProduct,
  isIgnoring,
  onAssignToCard,
  isAssigning,
}: {
  marketplace: MappableMarketplace;
  products: StagedProduct[];
  allCards: AssignableCard[];
  onIgnoreVariant: (p: { externalId: number; finish: string; language: string }[]) => void;
  onIgnoreProduct: (p: { externalId: number }[]) => void;
  isIgnoring: boolean;
  onAssignToCard: (p: {
    externalId: number;
    finish: string;
    language: string;
    cardId: string;
  }) => void;
  isAssigning: boolean;
}) {
  const config =
    marketplace === "tcgplayer" ? TCG_CONFIG : marketplace === "cardmarket" ? CM_CONFIG : CT_CONFIG;
  if (products.length === 0) {
    return null;
  }
  return (
    <div>
      <SectionHeading>
        Unmatched {config.shortName} Products ({products.length})
      </SectionHeading>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-[repeat(auto-fill,minmax(280px,1fr))]">
        {products
          .toSorted(
            (a, b) =>
              a.productName.localeCompare(b.productName) || b.finish.localeCompare(a.finish),
          )
          .map((sp) => (
            <StagedProductCard
              key={`${sp.externalId}::${sp.finish}`}
              config={config}
              product={sp}
              // In the unmatched section, most rows are sealed product or
              // bundles that should be denied wholesale. Make the level-2
              // action primary, with level-3 available from the dropdown.
              primaryIgnoreLevel="product"
              onIgnoreProduct={() => onIgnoreProduct([{ externalId: sp.externalId }])}
              onIgnoreVariant={() =>
                onIgnoreVariant([
                  { externalId: sp.externalId, finish: sp.finish, language: sp.language },
                ])
              }
              isIgnoring={isIgnoring}
              allCards={allCards}
              onAssignToCard={(cardId) =>
                onAssignToCard({
                  externalId: sp.externalId,
                  finish: sp.finish,
                  language: sp.language,
                  cardId,
                })
              }
              isAssigning={isAssigning}
            />
          ))}
      </div>
    </div>
  );
}

// ── Main page ────────────────────────────────────────────────────────────────

export function UnifiedMappingsPage() {
  const [showAll, setShowAll] = useState(false);
  const { data } = useUnifiedMappings(showAll);
  const [expandedCards, setExpandedCards] = useState<Set<string>>(new Set());

  // Per-marketplace mutations
  const tcgSave = useUnifiedSaveMappings("tcgplayer");
  const cmSave = useUnifiedSaveMappings("cardmarket");
  const ctSave = useUnifiedSaveMappings("cardtrader");
  const tcgUnmap = useUnifiedUnmapPrinting("tcgplayer");
  const cmUnmap = useUnifiedUnmapPrinting("cardmarket");
  const ctUnmap = useUnifiedUnmapPrinting("cardtrader");
  const tcgIgnoreVariant = useUnifiedIgnoreVariants("tcgplayer");
  const cmIgnoreVariant = useUnifiedIgnoreVariants("cardmarket");
  const ctIgnoreVariant = useUnifiedIgnoreVariants("cardtrader");
  const tcgIgnoreProduct = useUnifiedIgnoreProducts("tcgplayer");
  const cmIgnoreProduct = useUnifiedIgnoreProducts("cardmarket");
  const ctIgnoreProduct = useUnifiedIgnoreProducts("cardtrader");
  const tcgUnassign = useUnifiedUnassignFromCard("tcgplayer");
  const cmUnassign = useUnifiedUnassignFromCard("cardmarket");
  const ctUnassign = useUnifiedUnassignFromCard("cardtrader");
  const tcgAssignToCard = useUnifiedAssignToCard("tcgplayer");
  const cmAssignToCard = useUnifiedAssignToCard("cardmarket");
  const ctAssignToCard = useUnifiedAssignToCard("cardtrader");

  const allCards = data.allCards;

  // API returns groups pre-sorted by primaryShortCode
  const groups = data.groups;
  const orderedCardIds = groups.map((g) => g.cardId);

  // Auto-expand
  const autoExpandRef = useRef<{ cardId: string; nextCardId: string | null } | null>(null);

  useEffect(() => {
    if (!autoExpandRef.current) {
      return;
    }
    const { cardId, nextCardId } = autoExpandRef.current;
    if (orderedCardIds.includes(cardId)) {
      return;
    }
    autoExpandRef.current = null;
    if (nextCardId && orderedCardIds.includes(nextCardId)) {
      setExpandedCards(new Set([nextCardId]));
      requestAnimationFrame(() => {
        document
          .querySelector(`[data-card-id="${nextCardId}"]`)
          ?.scrollIntoView({ block: "start" });
      });
    }
  }, [orderedCardIds]);

  const queueAutoExpand = (cardId: string) => {
    const idx = orderedCardIds.indexOf(cardId);
    let nextCardId: string | null = null;
    if (idx !== -1) {
      for (let i = idx + 1; i < orderedCardIds.length; i++) {
        nextCardId = orderedCardIds[i];
        break;
      }
    }
    autoExpandRef.current = { cardId, nextCardId };
  };

  const toggleExpanded = (cardId: string) => {
    setExpandedCards((prev) => {
      const next = new Set(prev);
      if (next.has(cardId)) {
        next.delete(cardId);
      } else {
        next.add(cardId);
      }
      return next;
    });
  };

  const handleBatchAccept = (group: UnifiedMappingGroup) => {
    const tcgGroup = toMarketplaceGroup(group, "tcgplayer");
    const cmGroup = toMarketplaceGroup(group, "cardmarket");
    const ctGroup = toMarketplaceGroup(group, "cardtrader");
    const tcgSuggestions = computeSuggestions(tcgGroup);
    const cmSuggestions = computeSuggestions(cmGroup);
    const ctSuggestions = computeSuggestions(ctGroup);
    const tcgMappings: { printingId: string; externalId: number }[] = [];
    const cmMappings: { printingId: string; externalId: number }[] = [];
    const ctMappings: { printingId: string; externalId: number }[] = [];
    for (const [pid, s] of tcgSuggestions) {
      tcgMappings.push({ printingId: pid, externalId: s.product.externalId });
    }
    for (const [pid, s] of cmSuggestions) {
      cmMappings.push({ printingId: pid, externalId: s.product.externalId });
    }
    for (const [pid, s] of ctSuggestions) {
      ctMappings.push({ printingId: pid, externalId: s.product.externalId });
    }
    queueAutoExpand(group.cardId);
    if (tcgMappings.length > 0) {
      tcgSave.mutate({ mappings: tcgMappings });
    }
    if (cmMappings.length > 0) {
      cmSave.mutate({ mappings: cmMappings });
    }
    if (ctMappings.length > 0) {
      ctSave.mutate({ mappings: ctMappings });
    }
  };

  // Count "accept all safe" groups
  let safeGroupCount = 0;
  for (const group of groups) {
    const tcgGroup = toMarketplaceGroup(group, "tcgplayer");
    const cmGroup = toMarketplaceGroup(group, "cardmarket");
    const ctGroup = toMarketplaceGroup(group, "cardtrader");
    const tcgUnmapped = tcgGroup.printings.filter((p) => p.externalId === null).length;
    const cmUnmapped = cmGroup.printings.filter((p) => p.externalId === null).length;
    const ctUnmapped = ctGroup.printings.filter((p) => p.externalId === null).length;
    if (tcgUnmapped === 0 && cmUnmapped === 0 && ctUnmapped === 0) {
      continue;
    }
    const tcgSug = tcgUnmapped > 0 ? computeSuggestions(tcgGroup) : new Map();
    const cmSug = cmUnmapped > 0 ? computeSuggestions(cmGroup) : new Map();
    const ctSug = ctUnmapped > 0 ? computeSuggestions(ctGroup) : new Map();
    const isSafe = (unmapped: number, sug: Map<string, { score: number }>) =>
      unmapped === 0 ||
      (sug.size >= unmapped && [...sug.values()].every((s) => s.score >= STRONG_MATCH_THRESHOLD));
    if (isSafe(tcgUnmapped, tcgSug) && isSafe(cmUnmapped, cmSug) && isSafe(ctUnmapped, ctSug)) {
      safeGroupCount++;
    }
  }

  const handleAcceptAllSafe = () => {
    const tcgMappings: { printingId: string; externalId: number }[] = [];
    const cmMappings: { printingId: string; externalId: number }[] = [];
    const ctMappings: { printingId: string; externalId: number }[] = [];
    for (const group of groups) {
      const tcgGroup = toMarketplaceGroup(group, "tcgplayer");
      const cmGroup = toMarketplaceGroup(group, "cardmarket");
      const ctGroup = toMarketplaceGroup(group, "cardtrader");
      const tcgUnmapped = tcgGroup.printings.filter((p) => p.externalId === null).length;
      const cmUnmapped = cmGroup.printings.filter((p) => p.externalId === null).length;
      const ctUnmapped = ctGroup.printings.filter((p) => p.externalId === null).length;
      if (tcgUnmapped === 0 && cmUnmapped === 0 && ctUnmapped === 0) {
        continue;
      }
      const tcgSug = tcgUnmapped > 0 ? computeSuggestions(tcgGroup) : new Map();
      const cmSug = cmUnmapped > 0 ? computeSuggestions(cmGroup) : new Map();
      const ctSug = ctUnmapped > 0 ? computeSuggestions(ctGroup) : new Map();
      const isSafe = (unmapped: number, sug: Map<string, { score: number }>) =>
        unmapped === 0 ||
        (sug.size >= unmapped && [...sug.values()].every((s) => s.score >= STRONG_MATCH_THRESHOLD));
      if (
        !isSafe(tcgUnmapped, tcgSug) ||
        !isSafe(cmUnmapped, cmSug) ||
        !isSafe(ctUnmapped, ctSug)
      ) {
        continue;
      }
      for (const [pid, s] of tcgSug) {
        tcgMappings.push({ printingId: pid, externalId: s.product.externalId });
      }
      for (const [pid, s] of cmSug) {
        cmMappings.push({ printingId: pid, externalId: s.product.externalId });
      }
      for (const [pid, s] of ctSug) {
        ctMappings.push({ printingId: pid, externalId: s.product.externalId });
      }
    }
    if (tcgMappings.length > 0) {
      tcgSave.mutate({ mappings: tcgMappings });
    }
    if (cmMappings.length > 0) {
      cmSave.mutate({ mappings: cmMappings });
    }
    if (ctMappings.length > 0) {
      ctSave.mutate({ mappings: ctMappings });
    }
  };

  // Hotkey
  const expandedGroup = groups.find((g) => expandedCards.has(g.cardId));
  const isSaving = tcgSave.isPending || cmSave.isPending || ctSave.isPending;
  useHotkey(
    "Enter",
    () => {
      if (expandedGroup) {
        handleBatchAccept(expandedGroup);
      }
    },
    { enabled: Boolean(expandedGroup) && !isSaving },
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
        <p className="text-muted-foreground text-sm">
          {groups.length === 0
            ? "No products need mapping."
            : `${groups.length} card${groups.length === 1 ? "" : "s"} need${groups.length === 1 ? "s" : ""} attention`}
        </p>
        <div className="flex items-center gap-2">
          {safeGroupCount > 0 && (
            <Button
              variant="outline"
              className="border-green-600/50 bg-green-500/10 text-green-700 hover:bg-green-500/20 dark:text-green-400"
              onClick={handleAcceptAllSafe}
              disabled={isSaving}
            >
              <CheckCircle2Icon />
              Accept {safeGroupCount} safe
            </Button>
          )}
          <Button variant={showAll ? "default" : "outline"} onClick={() => setShowAll((v) => !v)}>
            <EyeIcon />
            {showAll ? "Showing all" : "Show all"}
          </Button>
        </div>
      </div>

      {isSaving && <p className="text-muted-foreground">Saving…</p>}

      {groups.length > 0 && (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-8" />
                <TableHead>Card</TableHead>
                <TableHead>Printings</TableHead>
                <TableHead className="text-center">TCG</TableHead>
                <TableHead className="text-center">CM</TableHead>
                <TableHead className="text-center">CT</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {groups.map((group) => {
                const isExpanded = expandedCards.has(group.cardId);
                return (
                  <UnifiedCardGroupRow
                    key={group.cardId}
                    group={group}
                    isExpanded={isExpanded}
                    isHotkeyTarget={expandedGroup?.cardId === group.cardId}
                    onToggle={() => toggleExpanded(group.cardId)}
                    allCards={allCards}
                    tcgSave={tcgSave}
                    cmSave={cmSave}
                    ctSave={ctSave}
                    tcgUnmap={tcgUnmap}
                    cmUnmap={cmUnmap}
                    ctUnmap={ctUnmap}
                    tcgIgnoreVariant={tcgIgnoreVariant}
                    cmIgnoreVariant={cmIgnoreVariant}
                    ctIgnoreVariant={ctIgnoreVariant}
                    tcgIgnoreProduct={tcgIgnoreProduct}
                    cmIgnoreProduct={cmIgnoreProduct}
                    ctIgnoreProduct={ctIgnoreProduct}
                    tcgUnassign={tcgUnassign}
                    cmUnassign={cmUnassign}
                    ctUnassign={ctUnassign}
                    tcgAssignToCard={tcgAssignToCard}
                    cmAssignToCard={cmAssignToCard}
                    ctAssignToCard={ctAssignToCard}
                    onBatchAccept={() => handleBatchAccept(group)}
                  />
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Unmatched products */}
      {(data.unmatchedProducts.tcgplayer.length > 0 ||
        data.unmatchedProducts.cardmarket.length > 0 ||
        data.unmatchedProducts.cardtrader.length > 0) && (
        <div className="mt-6 space-y-6">
          <UnmatchedSection
            marketplace="tcgplayer"
            products={data.unmatchedProducts.tcgplayer}
            allCards={allCards}
            onIgnoreVariant={(p) => tcgIgnoreVariant.mutate(p)}
            onIgnoreProduct={(p) => tcgIgnoreProduct.mutate(p)}
            isIgnoring={tcgIgnoreVariant.isPending || tcgIgnoreProduct.isPending}
            onAssignToCard={(p) => tcgAssignToCard.mutate(p)}
            isAssigning={tcgAssignToCard.isPending}
          />
          <UnmatchedSection
            marketplace="cardmarket"
            products={data.unmatchedProducts.cardmarket}
            allCards={allCards}
            onIgnoreVariant={(p) => cmIgnoreVariant.mutate(p)}
            onIgnoreProduct={(p) => cmIgnoreProduct.mutate(p)}
            isIgnoring={cmIgnoreVariant.isPending || cmIgnoreProduct.isPending}
            onAssignToCard={(p) => cmAssignToCard.mutate(p)}
            isAssigning={cmAssignToCard.isPending}
          />
          <UnmatchedSection
            marketplace="cardtrader"
            products={data.unmatchedProducts.cardtrader}
            allCards={allCards}
            onIgnoreVariant={(p) => ctIgnoreVariant.mutate(p)}
            onIgnoreProduct={(p) => ctIgnoreProduct.mutate(p)}
            isIgnoring={ctIgnoreVariant.isPending || ctIgnoreProduct.isPending}
            onAssignToCard={(p) => ctAssignToCard.mutate(p)}
            isAssigning={ctAssignToCard.isPending}
          />
        </div>
      )}
    </div>
  );
}

// ── Card group row ───────────────────────────────────────────────────────────

interface MutSave {
  mutate: (b: { mappings: { printingId: string; externalId: number }[] }) => void;
  isPending: boolean;
}
interface MutId {
  mutate: (id: string) => void;
  isPending: boolean;
}
interface MutProducts {
  mutate: (p: { externalId: number; finish: string; language: string }[]) => void;
  isPending: boolean;
}
interface MutExternalIds {
  mutate: (p: { externalId: number }[]) => void;
  isPending: boolean;
}
interface MutProduct {
  mutate: (p: { externalId: number; finish: string; language: string }) => void;
  isPending: boolean;
}
interface MutAssign {
  mutate: (p: { externalId: number; finish: string; language: string; cardId: string }) => void;
  isPending: boolean;
}

function UnifiedCardGroupRow({
  group,
  isExpanded,
  isHotkeyTarget,
  onToggle,
  allCards,
  tcgSave,
  cmSave,
  ctSave,
  tcgUnmap,
  cmUnmap,
  ctUnmap,
  tcgIgnoreVariant,
  cmIgnoreVariant,
  ctIgnoreVariant,
  tcgIgnoreProduct,
  cmIgnoreProduct,
  ctIgnoreProduct,
  tcgUnassign,
  cmUnassign,
  ctUnassign,
  tcgAssignToCard,
  cmAssignToCard,
  ctAssignToCard,
  onBatchAccept,
}: {
  group: UnifiedMappingGroup;
  isExpanded: boolean;
  isHotkeyTarget: boolean;
  onToggle: () => void;
  allCards: AssignableCard[];
  tcgSave: MutSave;
  cmSave: MutSave;
  ctSave: MutSave;
  tcgUnmap: MutId;
  cmUnmap: MutId;
  ctUnmap: MutId;
  tcgIgnoreVariant: MutProducts;
  cmIgnoreVariant: MutProducts;
  ctIgnoreVariant: MutProducts;
  tcgIgnoreProduct: MutExternalIds;
  cmIgnoreProduct: MutExternalIds;
  ctIgnoreProduct: MutExternalIds;
  tcgUnassign: MutProduct;
  cmUnassign: MutProduct;
  ctUnassign: MutProduct;
  tcgAssignToCard: MutAssign;
  cmAssignToCard: MutAssign;
  ctAssignToCard: MutAssign;
  onBatchAccept: () => void;
}) {
  return (
    <>
      <TableRow
        className="cursor-pointer scroll-mt-14"
        data-card-id={group.cardId}
        onClick={onToggle}
      >
        <TableCell>
          {isExpanded ? (
            <ChevronDownIcon className="size-4" />
          ) : (
            <ChevronRightIcon className="size-4" />
          )}
        </TableCell>
        <TableCell className="font-medium">
          <span className="text-muted-foreground">{group.cardSlug}</span> {group.cardName}
        </TableCell>
        <TableCell className="text-muted-foreground">
          {formatShortCodes(group.printings.map((p) => p.shortCode))}
        </TableCell>
        <TableCell className="text-center">
          <MarketplaceStatusBadge label="TCG" group={group} marketplace="tcgplayer" />
        </TableCell>
        <TableCell className="text-center">
          <MarketplaceStatusBadge label="CM" group={group} marketplace="cardmarket" />
        </TableCell>
        <TableCell className="text-center">
          <MarketplaceStatusBadge label="CT" group={group} marketplace="cardtrader" />
        </TableCell>
      </TableRow>
      {isExpanded && (
        <TableRow className="hover:bg-transparent">
          <TableCell colSpan={6} className="p-0">
            <UnifiedExpandedDetail
              group={group}
              allCards={allCards}
              tcgSave={tcgSave}
              cmSave={cmSave}
              ctSave={ctSave}
              tcgUnmap={tcgUnmap}
              cmUnmap={cmUnmap}
              ctUnmap={ctUnmap}
              tcgIgnoreVariant={tcgIgnoreVariant}
              cmIgnoreVariant={cmIgnoreVariant}
              ctIgnoreVariant={ctIgnoreVariant}
              tcgIgnoreProduct={tcgIgnoreProduct}
              cmIgnoreProduct={cmIgnoreProduct}
              ctIgnoreProduct={ctIgnoreProduct}
              tcgUnassign={tcgUnassign}
              cmUnassign={cmUnassign}
              ctUnassign={ctUnassign}
              tcgAssignToCard={tcgAssignToCard}
              cmAssignToCard={cmAssignToCard}
              ctAssignToCard={ctAssignToCard}
              onBatchAccept={onBatchAccept}
              showHotkeyHint={isHotkeyTarget}
            />
          </TableCell>
        </TableRow>
      )}
    </>
  );
}
