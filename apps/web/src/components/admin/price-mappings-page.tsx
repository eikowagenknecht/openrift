import { ChevronDownIcon, ChevronRightIcon, EyeIcon, Undo2Icon } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  useAssignToCard,
  useIgnoreProducts,
  useUnassignFromCard,
  usePriceMappings,
  useSavePriceMappings,
  useUnignoreProducts,
  useUnmapAllMappings,
  useUnmapPrinting,
} from "@/hooks/use-price-mappings";

import { CardGroupRow } from "./card-group-row";
import type { MappingGroup, SetGroup, SourceMappingConfig } from "./price-mappings-types";
import { StagedProductCard } from "./staged-product-card";
import { computeSuggestions } from "./suggest-mapping";

function groupBySet(groups: MappingGroup[]): SetGroup[] {
  const bySet = new Map<string, SetGroup>();
  for (const group of groups) {
    let setGroup = bySet.get(group.setId);
    if (!setGroup) {
      setGroup = { setId: group.setId, setName: group.setName, cards: [] };
      bySet.set(group.setId, setGroup);
    }
    setGroup.cards.push(group);
  }
  // Sort cards within each set by lowest collector number (matches card grid default)
  for (const setGroup of bySet.values()) {
    setGroup.cards.sort((a, b) => {
      const aNum = Math.min(...a.printings.map((p) => p.collectorNumber));
      const bNum = Math.min(...b.printings.map((p) => p.collectorNumber));
      return aNum - bNum;
    });
  }
  return [...bySet.values()];
}

export function PriceMappingsPage({ config }: { config: SourceMappingConfig }) {
  const [showAll, setShowAll] = useState(false);
  const { data, isLoading, error } = usePriceMappings(config, showAll);
  const saveMutation = useSavePriceMappings(config);
  const unmapMutation = useUnmapPrinting(config);
  const unmapAllMutation = useUnmapAllMappings(config);
  const ignoreMutation = useIgnoreProducts(config);
  const unignoreMutation = useUnignoreProducts(config);
  const assignToCardMutation = useAssignToCard(config);
  const unassignMutation = useUnassignFromCard(config);
  const [expandedCards, setExpandedCards] = useState<Set<string>>(new Set());
  const [confirmUnmapAll, setConfirmUnmapAll] = useState(false);
  const [showIgnored, setShowIgnored] = useState(false);

  // Auto-expand: when a card leaves the list after mapping, expand the next one
  const autoExpandRef = useRef<{ cardId: string; nextCardId: string | null } | null>(null);

  const groups = data?.groups ?? [];
  const allCards = data?.allCards ?? [];
  const setGroups = groupBySet(groups);

  // Flat ordered list of card IDs matching the rendered order
  const orderedCardIds = setGroups.flatMap((sg) => sg.cards.map((c) => c.cardId));

  useEffect(() => {
    if (!autoExpandRef.current) {
      return;
    }
    const { cardId, nextCardId } = autoExpandRef.current;
    // Card is still in the list — not fully assigned yet
    if (orderedCardIds.includes(cardId)) {
      return;
    }
    autoExpandRef.current = null;
    if (nextCardId && orderedCardIds.includes(nextCardId)) {
      setExpandedCards(new Set([nextCardId]));
    }
  }, [orderedCardIds]);

  const queueAutoExpand = (cardId: string) => {
    const idx = orderedCardIds.indexOf(cardId);
    let nextCardId: string | null = null;
    if (idx !== -1) {
      const groupsByCardId = new Map(groups.map((g) => [g.cardId, g]));
      for (let i = idx + 1; i < orderedCardIds.length; i++) {
        const candidate = groupsByCardId.get(orderedCardIds[i]);
        if (candidate && candidate.printings.some((p) => p.externalId === null)) {
          nextCardId = orderedCardIds[i];
          break;
        }
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

  const handleMap = (printingId: string, externalId: number, cardId: string) => {
    queueAutoExpand(cardId);
    saveMutation.mutate({ mappings: [{ printingId, externalId }] });
  };

  const handleBatchAccept = (group: MappingGroup) => {
    const suggestions = computeSuggestions(group);
    const mappings: { printingId: string; externalId: number }[] = [];
    for (const [printingId, suggestion] of suggestions) {
      mappings.push({ printingId, externalId: suggestion.product.externalId });
    }
    if (mappings.length > 0) {
      queueAutoExpand(group.cardId);
      saveMutation.mutate({ mappings });
    }
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

  const unmatchedProducts = data?.unmatchedProducts ?? [];
  const ignoredProducts = data?.ignoredProducts ?? [];

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
        <p className="text-sm text-muted-foreground">
          {groups.length === 0
            ? `No staged ${config.displayName} products need mapping.`
            : `${groups.length} card${groups.length === 1 ? "" : "s"} across ${setGroups.length} set${setGroups.length === 1 ? "" : "s"} with ${showAll ? `${config.shortName} mappings or` : ""} staged ${config.shortName} products`}
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

        {setGroups.map((setGroup) => (
          <div key={setGroup.setId}>
            {/* Set header — mirrors the card grid's set divider style */}
            <div className="flex items-center gap-3 pt-4 pb-2">
              <div className="h-px flex-1 bg-border" />
              <span className="text-sm font-medium text-muted-foreground">{setGroup.setId}</span>
              <span className="text-sm font-semibold">{setGroup.setName}</span>
              <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                {setGroup.cards.length}
              </span>
              <div className="h-px flex-1 bg-border" />
            </div>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-8" />
                    <TableHead>Card</TableHead>
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
                  {setGroup.cards.map((group) => (
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
                      onBatchAccept={() => handleBatchAccept(group)}
                      onIgnore={(externalId, finish) =>
                        ignoreMutation.mutate([{ externalId, finish }])
                      }
                      isIgnoring={ignoreMutation.isPending}
                      onUnassign={(externalId, finish) =>
                        unassignMutation.mutate({ externalId, finish })
                      }
                      isUnassigning={unassignMutation.isPending}
                      allCards={allCards}
                      onAssignToCard={(externalId, finish, cardId, setId) =>
                        assignToCardMutation.mutate({ externalId, finish, cardId, setId })
                      }
                      isAssigning={assignToCardMutation.isPending}
                    />
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        ))}

        {unmatchedProducts.length > 0 && (
          <div className="mt-6">
            <h4 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Unmatched {config.shortName} Products ({unmatchedProducts.length})
            </h4>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-[repeat(auto-fill,minmax(280px,1fr))]">
              {unmatchedProducts
                .toSorted(
                  (a, b) =>
                    a.productName.localeCompare(b.productName) || b.finish.localeCompare(a.finish),
                )
                .map((sp) => (
                  <StagedProductCard
                    key={`${sp.externalId}::${sp.finish}`}
                    config={config}
                    product={sp}
                    onIgnore={() =>
                      ignoreMutation.mutate([{ externalId: sp.externalId, finish: sp.finish }])
                    }
                    isIgnoring={ignoreMutation.isPending}
                    allCards={allCards}
                    onAssignToCard={(cardId, setId) =>
                      assignToCardMutation.mutate({
                        externalId: sp.externalId,
                        finish: sp.finish,
                        cardId,
                        setId,
                      })
                    }
                    isAssigning={assignToCardMutation.isPending}
                  />
                ))}
            </div>
          </div>
        )}

        {ignoredProducts.length > 0 && (
          <div className="mt-6">
            <button
              type="button"
              className="mb-3 flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground hover:text-foreground"
              onClick={() => setShowIgnored((v) => !v)}
            >
              {showIgnored ? (
                <ChevronDownIcon className="size-3.5" />
              ) : (
                <ChevronRightIcon className="size-3.5" />
              )}
              Ignored Products ({ignoredProducts.length})
            </button>
            {showIgnored && (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-[repeat(auto-fill,minmax(280px,1fr))]">
                {ignoredProducts
                  .toSorted(
                    (a, b) =>
                      a.productName.localeCompare(b.productName) ||
                      b.finish.localeCompare(a.finish),
                  )
                  .map((sp) => (
                    <StagedProductCard
                      key={`ignored::${sp.externalId}`}
                      config={config}
                      product={sp}
                      onUnignore={() =>
                        unignoreMutation.mutate([{ externalId: sp.externalId, finish: sp.finish }])
                      }
                      isUnignoring={unignoreMutation.isPending}
                    />
                  ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
