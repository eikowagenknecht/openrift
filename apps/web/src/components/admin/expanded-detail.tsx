import type {
  ArtVariant,
  CardType,
  Domain,
  Finish,
  Printing,
  Rarity,
  SuperType,
} from "@openrift/shared";
import { Undo2Icon, WandSparklesIcon } from "lucide-react";

import { CardThumbnail } from "@/components/cards/card-thumbnail";
import { cn } from "@/lib/utils";

import type {
  AssignableCard,
  MappingGroup,
  MappingPrinting,
  SourceMappingConfig,
} from "./price-mappings-types";
import { formatCents, NOOP, ProductLink } from "./price-mappings-utils";
import { ProductSelect } from "./product-select";
import { SectionHeading } from "./section-heading";
import { StagedProductCard } from "./staged-product-card";
import { computeSuggestions, STRONG_MATCH_THRESHOLD } from "./suggest-mapping";
import type { Suggestion } from "./suggest-mapping";

function toPrinting(group: MappingGroup, p: MappingPrinting): Printing {
  return {
    id: p.printingId,
    sourceId: p.sourceId,
    set: group.setName,
    collectorNumber: p.collectorNumber,
    rarity: p.rarity as Rarity,
    artVariant: p.artVariant as ArtVariant,
    isSigned: p.isSigned,
    isPromo: p.isPromo,
    finish: p.finish as Finish,
    images: p.imageUrl ? [{ face: "front", url: p.imageUrl }] : [],
    artist: "",
    publicCode: p.sourceId,
    card: {
      id: group.cardId,
      name: group.cardName,
      type: group.cardType as CardType,
      superTypes: group.superTypes as SuperType[],
      domains: group.domains as Domain[],
      stats: { energy: group.energy, might: group.might, power: 0 },
      keywords: [],
      tags: [],
      mightBonus: null,
      description: "",
      effect: "",
    },
  };
}

function SuggestionButton({
  config,
  suggestion,
  disabled,
  onClick,
}: {
  config: SourceMappingConfig;
  suggestion: Suggestion;
  disabled: boolean;
  onClick: () => void;
}) {
  const sp = suggestion.product;
  const isStrong = suggestion.score >= STRONG_MATCH_THRESHOLD;
  return (
    <button
      type="button"
      className={cn(
        "flex w-full items-center rounded-md px-2 py-1.5 text-xs disabled:opacity-50",
        isStrong
          ? "border border-solid border-green-600/50 bg-green-500/10 text-green-700 hover:bg-green-500/20 dark:text-green-400"
          : "border border-dashed border-primary/40 bg-primary/5 text-primary hover:bg-primary/10",
      )}
      disabled={disabled}
      onClick={onClick}
    >
      <span className="min-w-0 flex-1 text-left">
        <span className="flex items-center gap-1 truncate font-medium">
          <WandSparklesIcon className="size-3 shrink-0" />
          {sp.productName}
        </span>
        <span className="block truncate text-xs opacity-80 pl-4">
          {sp.finish} ·{" "}
          <ProductLink config={config} externalId={sp.externalId}>
            #{sp.externalId}
          </ProductLink>
        </span>
      </span>
      <span className="shrink-0 text-sm font-semibold tabular-nums">
        {formatCents(sp.marketCents, sp.currency)}
      </span>
    </button>
  );
}

export function ExpandedDetail({
  config,
  group,
  onMap,
  isSaving,
  onUnmap,
  isUnmapping,
  onBatchAccept,
  onIgnore,
  isIgnoring,
  onUnassign,
  isUnassigning,
  allCards,
  onAssignToCard,
  isAssigning,
}: {
  config: SourceMappingConfig;
  group: MappingGroup;
  onMap: (printingId: string, externalId: number) => void;
  isSaving: boolean;
  onUnmap: (printingId: string) => void;
  isUnmapping: boolean;
  onBatchAccept: () => void;
  onIgnore: (externalId: number, finish: string) => void;
  isIgnoring: boolean;
  onUnassign: (externalId: number, finish: string) => void;
  isUnassigning: boolean;
  allCards: AssignableCard[];
  onAssignToCard: (externalId: number, finish: string, cardId: string, setId: string) => void;
  isAssigning: boolean;
}) {
  const suggestions = computeSuggestions(group);

  return (
    <div className="flex flex-col gap-6 bg-muted/30 px-4 py-4 sm:flex-row sm:px-6">
      {/* Printings — card-like grid */}
      <div className="min-w-0">
        <div className="mb-3 flex items-center gap-3">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Printings
          </h4>
          {suggestions.size > 0 &&
            (() => {
              const allStrong = [...suggestions.values()].every(
                (s) => s.score >= STRONG_MATCH_THRESHOLD,
              );
              return (
                <button
                  type="button"
                  className={cn(
                    "flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium disabled:opacity-50",
                    allStrong
                      ? "border border-solid border-green-600/50 bg-green-500/10 text-green-700 hover:bg-green-500/20 dark:text-green-400"
                      : "border border-solid border-yellow-600/50 bg-yellow-500/10 text-yellow-700 hover:bg-yellow-500/20 dark:text-yellow-400",
                  )}
                  disabled={isSaving}
                  onClick={onBatchAccept}
                >
                  <WandSparklesIcon className="size-3" />
                  Accept {suggestions.size} suggestion{suggestions.size === 1 ? "" : "s"}
                </button>
              );
            })()}
        </div>
        <div className="flex flex-wrap gap-4">
          {group.printings.map((p) => {
            const suggestion = p.externalId === null ? suggestions.get(p.printingId) : undefined;
            return (
              <div
                key={p.printingId}
                className={cn(
                  "w-[260px] rounded-lg",
                  p.externalId === null && "ring-2 ring-destructive/40 bg-destructive/5",
                )}
              >
                <CardThumbnail
                  printing={toPrinting(group, p)}
                  onClick={NOOP}
                  showImages
                  cardFields={{ number: true, title: true, type: true, rarity: true, price: false }}
                />
                <div className="space-y-1.5 px-2.5 pb-2">
                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                    <span>
                      {p.finish}
                      {p.isSigned ? " · Signed" : ""}
                      {p.isPromo ? " · Promo" : ""}
                    </span>
                    <span>·</span>
                    {p.externalId === null ? (
                      <span>unmapped</span>
                    ) : (
                      <>
                        <ProductLink config={config} externalId={p.externalId}>
                          #{p.externalId}
                        </ProductLink>
                        <button
                          type="button"
                          className="hover:text-foreground disabled:opacity-50"
                          onClick={() => onUnmap(p.printingId)}
                          disabled={isUnmapping}
                          title="Unmap — return to staging"
                        >
                          <Undo2Icon className="size-3" />
                        </button>
                      </>
                    )}
                  </div>
                  {suggestion && (
                    <SuggestionButton
                      config={config}
                      suggestion={suggestion}
                      disabled={isSaving}
                      onClick={() => onMap(p.printingId, suggestion.product.externalId)}
                    />
                  )}
                  <ProductSelect
                    config={config}
                    stagedProducts={group.stagedProducts}
                    assignedProducts={group.assignedProducts}
                    currentPrintingId={p.printingId}
                    disabled={isSaving}
                    onSelect={(extId) => onMap(p.printingId, extId)}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Products — sidebar */}
      <div className="w-full shrink-0 sm:w-80">
        <SectionHeading>{config.shortName} Products</SectionHeading>
        <div className="flex flex-col gap-2">
          {[...group.stagedProducts, ...group.assignedProducts]
            .toSorted(
              (a, b) =>
                a.productName.localeCompare(b.productName) || b.finish.localeCompare(a.finish),
            )
            .map((sp) => {
              const isAssigned = group.assignedProducts.some(
                (ap) => ap.externalId === sp.externalId && ap.finish === sp.finish,
              );
              return (
                <StagedProductCard
                  key={`${sp.externalId}::${sp.finish}`}
                  config={config}
                  product={sp}
                  isAssigned={isAssigned}
                  onIgnore={isAssigned ? undefined : () => onIgnore(sp.externalId, sp.finish)}
                  isIgnoring={isIgnoring}
                  onUnassign={
                    sp.isOverride ? () => onUnassign(sp.externalId, sp.finish) : undefined
                  }
                  isUnassigning={isUnassigning}
                  allCards={sp.isOverride ? undefined : isAssigned ? undefined : allCards}
                  onAssignToCard={
                    sp.isOverride || isAssigned
                      ? undefined
                      : (cardId, setId) => onAssignToCard(sp.externalId, sp.finish, cardId, setId)
                  }
                  isAssigning={isAssigning}
                  assignLabel="Reassign"
                />
              );
            })}
          {group.stagedProducts.length === 0 && group.assignedProducts.length === 0 && (
            <p className="text-xs text-muted-foreground">No products</p>
          )}
        </div>
      </div>
    </div>
  );
}
