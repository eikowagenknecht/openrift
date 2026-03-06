import type { Card as CardData, CardType, Rarity } from "@openrift/shared";
import {
  ChevronDownIcon,
  ChevronRightIcon,
  EyeIcon,
  Undo2Icon,
  WandSparklesIcon,
} from "lucide-react";
import { useState } from "react";

import { CardThumbnail } from "@/components/cards/card-thumbnail";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  usePriceMappings,
  useSavePriceMappings,
  useUnmapAllMappings,
  useUnmapPrinting,
} from "@/hooks/use-price-mappings";
import { cn } from "@/lib/utils";

import type {
  MappingGroup,
  MappingPrinting,
  SourceMappingConfig,
  StagedProduct,
} from "./price-mappings-types";
import { computeSuggestions, STRONG_MATCH_THRESHOLD } from "./suggest-mapping";
import type { Suggestion } from "./suggest-mapping";

// oxlint-disable-next-line no-empty-function -- intentional no-op for non-interactive CardThumbnail
const NOOP = () => {};

/**
 * Build a minimal Card object from admin API data for CardThumbnail.
 * @returns A Card object.
 */
function toCard(group: MappingGroup, p: MappingPrinting): CardData {
  return {
    id: p.printingId,
    cardId: group.cardId,
    sourceId: p.sourceId,
    name: group.cardName,
    type: group.cardType as CardType,
    superTypes: group.superTypes,
    domains: group.domains,
    stats: { energy: group.energy, might: group.might, power: 0 },
    keywords: [],
    tags: [],
    mightBonus: null,
    set: group.setName,
    collectorNumber: p.collectorNumber,
    rarity: p.rarity as Rarity,
    artVariant: p.artVariant,
    isSigned: p.isSigned,
    isPromo: p.isPromo,
    finish: p.finish,
    art: { imageURL: p.imageUrl, artist: "" },
    description: "",
    effect: "",
    publicCode: p.sourceId,
  };
}

function formatCents(cents: number, currency: string): string {
  return new Intl.NumberFormat("en", {
    style: "currency",
    currency,
  }).format(cents / 100);
}

function ProductLink({
  config,
  externalId,
  children,
}: {
  config: SourceMappingConfig;
  externalId: number;
  children: React.ReactNode;
}) {
  return (
    <a
      href={config.productUrl(externalId)}
      target="_blank"
      rel="noopener noreferrer"
      className="underline decoration-muted-foreground/50 underline-offset-2 hover:decoration-foreground"
      onClick={(e) => e.stopPropagation()}
    >
      {children}
    </a>
  );
}

export function PriceMappingsPage({ config }: { config: SourceMappingConfig }) {
  const [showAll, setShowAll] = useState(false);
  const { data, isLoading, error } = usePriceMappings(config, showAll);
  const saveMutation = useSavePriceMappings(config);
  const unmapMutation = useUnmapPrinting(config);
  const unmapAllMutation = useUnmapAllMappings(config);
  const [expandedCards, setExpandedCards] = useState<Set<string>>(new Set());
  const [confirmUnmapAll, setConfirmUnmapAll] = useState(false);

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

  const handleMap = (printingId: string, externalId: number) => {
    saveMutation.mutate({ mappings: [{ printingId, externalId }] });
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">Loading staged products…</p>
        <div className="space-y-3">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      </div>
    );
  }

  if (error) {
    return <p className="text-sm text-destructive">Failed to load: {error.message}</p>;
  }

  const groups = data?.groups ?? [];
  const unmatchedProducts = data?.unmatchedProducts ?? [];

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
        <p className="text-sm text-muted-foreground">
          {groups.length === 0
            ? `No staged ${config.displayName} products need mapping.`
            : `${groups.length} card${groups.length === 1 ? "" : "s"} with ${showAll ? `${config.shortName} mappings or` : ""} staged ${config.shortName} products`}
        </p>
        <div className="flex items-center gap-2">
          {showAll && !confirmUnmapAll && (
            <Button
              variant="destructive"
              size="sm"
              onClick={() => setConfirmUnmapAll(true)}
              disabled={unmapAllMutation.isPending}
            >
              <Undo2Icon />
              Unmap all
            </Button>
          )}
          {confirmUnmapAll && (
            <div className="flex items-center gap-2">
              <span className="text-sm text-destructive">
                Unmap all {config.shortName} mappings?
              </span>
              <Button
                variant="destructive"
                size="sm"
                onClick={() => {
                  unmapAllMutation.mutate(undefined, {
                    onSettled: () => setConfirmUnmapAll(false),
                  });
                }}
                disabled={unmapAllMutation.isPending}
              >
                {unmapAllMutation.isPending ? "Unmapping…" : "Confirm"}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setConfirmUnmapAll(false)}
                disabled={unmapAllMutation.isPending}
              >
                Cancel
              </Button>
            </div>
          )}
          <Button
            variant={showAll ? "default" : "outline"}
            size="sm"
            onClick={() => setShowAll((v) => !v)}
          >
            <EyeIcon />
            {showAll ? "Showing all" : "Show all"}
          </Button>
        </div>
      </div>
      <div>
        {saveMutation.isError && (
          <div className="mb-4">
            <span className="text-destructive text-sm">{saveMutation.error.message}</span>
          </div>
        )}
        {unmapAllMutation.isError && (
          <div className="mb-4">
            <span className="text-destructive text-sm">{unmapAllMutation.error.message}</span>
          </div>
        )}

        {groups.length > 0 && (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8" />
                  <TableHead>Card</TableHead>
                  <TableHead>Set</TableHead>
                  <TableHead
                    className="text-center"
                    title={`Physical card variants (art, finish, signed) that need ${config.shortName} product mappings`}
                  >
                    Printings
                  </TableHead>
                  <TableHead
                    className="text-center"
                    title={`${config.displayName} products awaiting manual assignment to a printing`}
                  >
                    Staged {config.shortName}
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {groups.map((group) => (
                  <CardGroupRow
                    key={`${group.setId}::${group.cardId}`}
                    config={config}
                    group={group}
                    isExpanded={expandedCards.has(group.cardId)}
                    onToggle={() => toggleExpanded(group.cardId)}
                    onMap={handleMap}
                    isSaving={saveMutation.isPending}
                    onUnmap={(printingId) => unmapMutation.mutate(printingId)}
                    isUnmapping={unmapMutation.isPending}
                  />
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        {unmatchedProducts.length > 0 && (
          <div className="mt-6">
            <h4 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Unmatched {config.shortName} Products ({unmatchedProducts.length})
            </h4>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-[repeat(auto-fill,minmax(280px,1fr))]">
              {unmatchedProducts.map((sp) => (
                <StagedProductCard
                  key={`${sp.externalId}::${sp.finish}`}
                  config={config}
                  product={sp}
                />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function CardGroupRow({
  config,
  group,
  isExpanded,
  onToggle,
  onMap,
  isSaving,
  onUnmap,
  isUnmapping,
}: {
  config: SourceMappingConfig;
  group: MappingGroup;
  isExpanded: boolean;
  onToggle: () => void;
  onMap: (printingId: string, externalId: number) => void;
  isSaving: boolean;
  onUnmap: (printingId: string) => void;
  isUnmapping: boolean;
}) {
  const unmappedCount = group.printings.filter((p) => p.externalId === null).length;
  const suggestions = computeSuggestions(group);
  const suggestionCount = suggestions.size;

  return (
    <>
      <TableRow className="cursor-pointer" onClick={onToggle}>
        <TableCell>
          {isExpanded ? (
            <ChevronDownIcon className="size-4" />
          ) : (
            <ChevronRightIcon className="size-4" />
          )}
        </TableCell>
        <TableCell className="font-medium">{group.cardName}</TableCell>
        <TableCell>{group.setName}</TableCell>
        <TableCell className="text-center">
          {group.printings.length}
          {unmappedCount > 0 && (
            <Badge variant="destructive" className="ml-2">
              {unmappedCount} unmapped
            </Badge>
          )}
        </TableCell>
        <TableCell className="text-center">
          {group.stagedProducts.length}
          {suggestionCount > 0 && (
            <Badge className="ml-2 border-primary/30 bg-primary/10 text-primary">
              <WandSparklesIcon className="size-3" />
              {suggestionCount} suggested
            </Badge>
          )}
        </TableCell>
      </TableRow>

      {isExpanded && (
        <TableRow className="hover:bg-transparent">
          <TableCell colSpan={5} className="p-0">
            <ExpandedDetail
              config={config}
              group={group}
              onMap={onMap}
              isSaving={isSaving}
              onUnmap={onUnmap}
              isUnmapping={isUnmapping}
            />
          </TableCell>
        </TableRow>
      )}
    </>
  );
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

function ExpandedDetail({
  config,
  group,
  onMap,
  isSaving,
  onUnmap,
  isUnmapping,
}: {
  config: SourceMappingConfig;
  group: MappingGroup;
  onMap: (printingId: string, externalId: number) => void;
  isSaving: boolean;
  onUnmap: (printingId: string) => void;
  isUnmapping: boolean;
}) {
  const suggestions = computeSuggestions(group);

  return (
    <div className="flex flex-col gap-6 bg-muted/30 px-4 py-4 sm:flex-row sm:px-6">
      {/* Printings — card-like grid */}
      <div className="min-w-0">
        <h4 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Printings
        </h4>
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
                  card={toCard(group, p)}
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
      <div className="w-full shrink-0 space-y-5 sm:w-80">
        <div>
          <h4 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Staged {config.shortName} Products
          </h4>
          <div className="flex flex-col gap-2">
            {group.stagedProducts.map((sp) => (
              <StagedProductCard
                key={`${sp.externalId}::${sp.finish}`}
                config={config}
                product={sp}
              />
            ))}
            {group.stagedProducts.length === 0 && (
              <p className="text-xs text-muted-foreground">No staged products</p>
            )}
          </div>
        </div>
        {group.assignedProducts.length > 0 && (
          <div>
            <h4 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Assigned {config.shortName} Products
            </h4>
            <div className="flex flex-col gap-2">
              {group.assignedProducts.map((sp) => (
                <StagedProductCard
                  key={`${sp.externalId}::${sp.finish}`}
                  config={config}
                  product={sp}
                />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

const EXTRA_FIELDS = [
  { key: "lowCents" as const, label: "low" },
  { key: "midCents" as const, label: "mid" },
  { key: "highCents" as const, label: "high" },
  { key: "trendCents" as const, label: "trend" },
  { key: "avg1Cents" as const, label: "avg1" },
  { key: "avg7Cents" as const, label: "avg7" },
  { key: "avg30Cents" as const, label: "avg30" },
];

function StagedProductCard({
  config,
  product: sp,
}: {
  config: SourceMappingConfig;
  product: StagedProduct;
}) {
  return (
    <div className="rounded-lg border bg-background px-3 py-2.5">
      <p className="truncate text-sm font-medium" title={sp.productName}>
        {sp.productName}
      </p>
      <div className="mt-1.5 flex items-baseline gap-2">
        <span className="text-lg font-semibold tabular-nums">
          {formatCents(sp.marketCents, sp.currency)}
        </span>
        <Badge variant="outline" className="shrink-0">
          {sp.finish}
        </Badge>
        <Badge variant="outline" className="shrink-0">
          <ProductLink config={config} externalId={sp.externalId}>
            #{sp.externalId}
          </ProductLink>
        </Badge>
      </div>
      {EXTRA_FIELDS.some((f) => sp[f.key] !== null) && (
        <div className="mt-1.5 flex flex-wrap gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
          {EXTRA_FIELDS.filter((f) => sp[f.key] !== null).map((f) => (
            <span key={f.key}>
              {f.label}{" "}
              <span className="tabular-nums">{formatCents(sp[f.key] ?? 0, sp.currency)}</span>
            </span>
          ))}
        </div>
      )}
      <p className="mt-1.5 w-fit rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
        {sp.recordedAt.slice(0, 16).replace("T", " ")}
      </p>
    </div>
  );
}

function ProductSelect({
  config,
  stagedProducts,
  assignedProducts,
  currentPrintingId,
  disabled,
  onSelect,
}: {
  config: SourceMappingConfig;
  stagedProducts: StagedProduct[];
  assignedProducts: StagedProduct[];
  currentPrintingId: string;
  disabled?: boolean;
  onSelect: (externalId: number) => void;
}) {
  const sortedStaged = stagedProducts.toSorted((a, b) => a.externalId - b.externalId);
  const sortedAssigned = assignedProducts.toSorted((a, b) => a.externalId - b.externalId);

  return (
    <Select
      value=""
      onValueChange={(val) => {
        if (val) {
          onSelect(Number(val.split("::")[0]));
        }
      }}
      disabled={disabled}
    >
      <SelectTrigger
        className="w-full"
        aria-label={`Assign ${config.shortName} product to printing ${currentPrintingId}`}
      >
        <SelectValue placeholder="Assign product…" />
      </SelectTrigger>
      <SelectContent className="w-auto min-w-[var(--anchor-width)]">
        {sortedStaged.length > 0 && (
          <SelectGroup>
            <SelectLabel>Staged</SelectLabel>
            {sortedStaged.map((p, i) => (
              <SelectItem key={`s::${p.externalId}::${i}`} value={`${p.externalId}::s${i}`}>
                {p.productName.length > 30 ? `${p.productName.slice(0, 30)}…` : p.productName} ·{" "}
                {p.finish} · {formatCents(p.marketCents, p.currency)}
              </SelectItem>
            ))}
          </SelectGroup>
        )}
        {sortedAssigned.length > 0 && (
          <SelectGroup>
            <SelectLabel>Assigned</SelectLabel>
            {sortedAssigned.map((p, i) => (
              <SelectItem key={`a::${p.externalId}::${i}`} value={`${p.externalId}::a${i}`}>
                {p.productName.length > 30 ? `${p.productName.slice(0, 30)}…` : p.productName} ·{" "}
                {p.finish} · {formatCents(p.marketCents, p.currency)}
              </SelectItem>
            ))}
          </SelectGroup>
        )}
      </SelectContent>
    </Select>
  );
}
