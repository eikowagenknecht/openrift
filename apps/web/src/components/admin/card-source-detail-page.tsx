import type {
  AdminPrintingImageResponse,
  CardSourceResponse,
  PrintingSourceResponse,
  Rarity,
} from "@openrift/shared";
import { buildPrintingId, comparePrintings } from "@openrift/shared";
import { useNavigate } from "@tanstack/react-router";
import {
  ArrowRightIcon,
  BanIcon,
  CheckCheckIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  CopyCheckIcon,
  CopyIcon,
  DownloadIcon,
  EllipsisVerticalIcon,
  EyeIcon,
  EyeOffIcon,
  ImagePlusIcon,
  LinkIcon,
  MoveIcon,
  PlusIcon,
  RefreshCwIcon,
  RocketIcon,
  Trash2Icon,
  UploadIcon,
  XIcon,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";

import type { CardSearchResult } from "@/components/admin/card-search-dropdown";
import { CardSearchDropdown } from "@/components/admin/card-search-dropdown";
import type { FieldDef, PrintingGroup } from "@/components/admin/source-spreadsheet";
import {
  CARD_SOURCE_FIELDS,
  SourceSpreadsheet,
  buildPrintingSourceFields,
  groupPrintingSources,
} from "@/components/admin/source-spreadsheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  useAcceptCardField,
  useAcceptNewCard,
  useAcceptPrintingField,
  useAcceptPrintingGroup,
  useActivatePrintingImage,
  useAddImageFromUrl,
  useAllCards,
  useCardSourceDetail,
  useCheckAllCardSources,
  useCheckAllPrintingSources,
  useCheckCardSource,
  useCheckPrintingSource,
  useUncheckCardSource,
  useUncheckPrintingSource,
  useCopyPrintingSource,
  useDeletePrintingImage,
  useDeletePrintingSource,
  useLinkCard,
  useLinkPrintingSources,
  useReassignPrintingSource,
  useRehostPrintingImage,
  useRenameCard,
  useRenamePrinting,
  useSetPrintingSourceImage,
  useUnmatchedCardDetail,
  useUnrehostPrintingImage,
  useUploadPrintingImage,
} from "@/hooks/use-card-sources";
import { useFavoriteSources } from "@/hooks/use-favorite-sources";
import { useIgnoreCardSource, useIgnorePrintingSource } from "@/hooks/use-ignored-sources";
import { usePromoTypes } from "@/hooks/use-promo-types";
import { cn } from "@/lib/utils";

interface DetailData {
  card: Record<string, unknown>;
  sources: CardSourceResponse[];
  printings: Record<string, unknown>[];
  printingSources: PrintingSourceResponse[];
  printingImages: AdminPrintingImageResponse[];
}

interface UnmatchedData {
  name: string;
  sources: CardSourceResponse[];
  printingSources: PrintingSourceResponse[];
}

interface CardSourceDetailPageProps {
  mode: "existing" | "new";
  identifier: string;
}

export function CardSourceDetailPage({ mode, identifier }: CardSourceDetailPageProps) {
  const navigate = useNavigate();

  // --- Data fetching (both called, only one enabled via empty-string trick) ---
  const existingQuery = useCardSourceDetail(mode === "existing" ? identifier : "") as {
    data: DetailData | undefined;
    isLoading: boolean;
    isError: boolean;
  };
  const unmatchedQuery = useUnmatchedCardDetail(mode === "new" ? identifier : "") as {
    data: UnmatchedData | undefined;
    isLoading: boolean;
  };

  // --- Shared hooks ---
  const checkCardSource = useCheckCardSource();
  const uncheckCardSource = useUncheckCardSource();
  const checkPrintingSource = useCheckPrintingSource();
  const uncheckPrintingSource = useUncheckPrintingSource();
  const { favorites } = useFavoriteSources();

  // --- Existing-mode hooks ---
  const checkAllCardSources = useCheckAllCardSources();
  const checkAllPrintingSources = useCheckAllPrintingSources();
  const acceptCardField = useAcceptCardField();
  const acceptPrintingField = useAcceptPrintingField();
  const renameCard = useRenameCard();
  const acceptPrintingGroup = useAcceptPrintingGroup();
  const copyPrintingSource = useCopyPrintingSource();
  const deletePrintingSource = useDeletePrintingSource();
  const ignoreCardSource = useIgnoreCardSource();
  const ignorePrintingSource = useIgnorePrintingSource();
  const linkPrintingSources = useLinkPrintingSources();
  const renamePrinting = useRenamePrinting();

  // --- Promo types for dropdown ---
  const { data: promoTypesData } = usePromoTypes();
  const printingSourceFields = buildPrintingSourceFields(
    (promoTypesData?.promoTypes ?? []).map((pt: { id: string; label: string }) => ({
      value: pt.id,
      label: pt.label,
    })),
  );

  // --- New-mode hooks ---
  const acceptNewCard = useAcceptNewCard();
  const linkCard = useLinkCard();
  const reassignPrinting = useReassignPrintingSource();
  const { data: allCards } = useAllCards();

  // --- Existing-mode state ---
  const [expandedPrintings, setExpandedPrintings] = useState<Set<string>>(new Set());
  const pendingScrollTarget = useRef<string | null>(null);

  // --- New-mode state ---
  const [activeCard, setActiveCard] = useState<Record<string, unknown>>({});
  const [newCardId, setNewCardId] = useState<string | null>(null);
  const [linkCardId, setLinkCardId] = useState("");
  const [linkSearch, setLinkSearch] = useState("");

  // After accepting a printing, expand it and scroll into view once data refetches
  const existingData = existingQuery.data;
  useEffect(() => {
    const slug = pendingScrollTarget.current;
    if (!slug || !existingData) {
      return;
    }
    const printings = existingData.printings as Record<string, unknown>[];
    const printing = printings.find((p) => (p.slug as string) === slug);
    if (!printing) {
      return;
    }
    const id = printing.id as string;
    pendingScrollTarget.current = null;
    setExpandedPrintings((prev) => new Set(prev).add(id));
    requestAnimationFrame(() => {
      document
        .querySelector(`[data-printing-id="${id}"]`)
        ?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  }, [existingData]);

  // --- Resolve mode-specific data ---
  const isExisting = mode === "existing";
  const isLoading = isExisting ? existingQuery.isLoading : unmatchedQuery.isLoading;

  if (isExisting && existingQuery.isError) {
    return (
      <div className="space-y-2">
        <h2 className="text-lg font-semibold">Card not found</h2>
        <p className="text-sm text-muted-foreground">
          No card with ID &ldquo;{identifier}&rdquo; exists.
        </p>
      </div>
    );
  }

  if (isLoading || (isExisting ? !existingQuery.data : !unmatchedQuery.data)) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-64" />
      </div>
    );
  }

  // At this point, one of the two queries has data
  const unmatchedData = unmatchedQuery.data;

  const sources: CardSourceResponse[] = isExisting
    ? (existingData as NonNullable<typeof existingData>).sources
    : (unmatchedData as NonNullable<typeof unmatchedData>).sources;
  const printingSources: PrintingSourceResponse[] = isExisting
    ? (existingData as NonNullable<typeof existingData>).printingSources
    : (unmatchedData as NonNullable<typeof unmatchedData>).printingSources;
  const printings: Record<string, unknown>[] = isExisting
    ? (existingData as NonNullable<typeof existingData>).printings
    : [];
  const printingImages: AdminPrintingImageResponse[] = isExisting
    ? (existingData as NonNullable<typeof existingData>).printingImages
    : [];
  const cardId = isExisting ? identifier : "";

  // --- Existing-mode computed values ---
  const sourceLabels = Object.fromEntries(sources.map((s) => [s.id, s.source]));

  function togglePrinting(id: string) {
    setExpandedPrintings((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  const unmatchedGroups = groupPrintingSources(printingSources.filter((ps) => !ps.printingId));

  // Auto-match (existing mode only): for each unmatched group, check if exactly 1 accepted
  // printing shares the same differentiators (setId, artVariant, isSigned, finish)
  const { autoMatchedByPrinting, ambiguousGroups } = (() => {
    if (!isExisting) {
      return {
        autoMatchedByPrinting: new Map<string, PrintingGroup[]>(),
        ambiguousGroups: [] as PrintingGroup[],
      };
    }
    const matched = new Map<string, PrintingGroup[]>();
    const ambiguous: PrintingGroup[] = [];
    for (const group of unmatchedGroups) {
      const d = group.differentiators;
      const isWild = !d.rarity || !d.finish;
      const matches = printings.filter((p) => {
        const pSetId = (p.setId as string | null) ?? null;
        const pVariant = (p.artVariant as string) || "normal";
        return (
          pSetId === (d.setId ?? null) &&
          (isWild || pVariant === d.artVariant) &&
          (!d.rarity || (p.rarity as string) === d.rarity) &&
          (p.isSigned as boolean) === d.isSigned &&
          (p.promoTypeId as string | null) === (d.promoTypeId ?? null) &&
          (!d.finish || (p.finish as string) === d.finish)
        );
      });
      if (isWild && matches.length > 0) {
        for (const m of matches) {
          const pid = m.id as string;
          const existing = matched.get(pid) ?? [];
          existing.push(group);
          matched.set(pid, existing);
        }
      } else if (matches.length === 1) {
        const pid = matches[0].id as string;
        const existing = matched.get(pid) ?? [];
        existing.push(group);
        matched.set(pid, existing);
      } else {
        ambiguous.push(group);
      }
    }
    return { autoMatchedByPrinting: matched, ambiguousGroups: ambiguous };
  })();

  // Existing-mode: expected card ID from canonical printing
  const expectedCardId = (() => {
    if (!isExisting) {
      return "";
    }
    const linked = printingSources.filter((ps) => ps.printingId);
    if (linked.length === 0) {
      return cardId;
    }
    const isGallery = (ps: (typeof linked)[0]) => sourceLabels[ps.cardSourceId] === "gallery";
    const matchesCurrent = (ps: (typeof linked)[0]) =>
      ps.sourceId.replace(/(?<=\d)[a-z*]+$/, "") === cardId;
    const canonical = [...linked].sort(
      (a, b) =>
        Number(isGallery(b)) - Number(isGallery(a)) ||
        Number(matchesCurrent(b)) - Number(matchesCurrent(a)) ||
        comparePrintings(a, b),
    )[0];
    return canonical.sourceId.replace(/(?<=\d)[a-z*]+$/, "");
  })();
  const isCardIdStale = isExisting && cardId !== expectedCardId;

  // New-mode: derive default card ID from canonical printing source
  const defaultCardId = (() => {
    if (isExisting || printingSources.length === 0) {
      return "";
    }
    const canonical = [...printingSources].sort(comparePrintings)[0];
    return canonical.sourceId.replace(/(?<=\d)[a-z*]+$/, "");
  })();

  const newModeCardId = newCardId ?? defaultCardId;
  const hasRequiredFields = activeCard.name && activeCard.type && activeCard.domains;

  // New-mode: card search results
  const cardSearchResults: CardSearchResult[] =
    allCards && linkSearch.length >= 2
      ? allCards
          .filter((c) => c.name.toLowerCase().includes(linkSearch.toLowerCase()))
          .slice(0, 20)
          .map((c) => ({ id: c.slug, label: c.name, sublabel: c.slug, detail: c.type }))
      : [];

  function handleAcceptAsNew() {
    if (!hasRequiredFields || !newModeCardId.trim() || !unmatchedData) {
      return;
    }
    const id = newModeCardId.trim();
    acceptNewCard.mutate(
      {
        name: identifier,
        cardFields: { id, ...activeCard },
      },
      {
        onSuccess: () => {
          void navigate({ to: "/admin/cards/$cardId", params: { cardId: id } });
        },
      },
    );
  }

  function handleLink() {
    if (!linkCardId.trim()) {
      return;
    }
    const targetId = linkCardId.trim();
    linkCard.mutate(
      { name: identifier, cardId: targetId },
      {
        onSuccess: () => {
          void navigate({ to: "/admin/cards/$cardId", params: { cardId: targetId } });
        },
      },
    );
  }

  // New-mode: groups for the printings section
  const newModeGroups = isExisting ? [] : groupPrintingSources(printingSources);

  return (
    <div className="space-y-6">
      {/* ── Header ──────────────────────────────────────────────────────────── */}
      {isExisting ? (
        <div>
          <h2 className="text-lg font-semibold">
            {(existingData as NonNullable<typeof existingData>).card.name as string}
          </h2>
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <span className={isCardIdStale ? "text-orange-600 line-through" : ""}>{cardId}</span>
            {isCardIdStale && (
              <>
                <span>&rarr; {expectedCardId}</span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-5 text-xs"
                  disabled={renameCard.isPending}
                  onClick={() =>
                    renameCard.mutate(
                      { cardId, newId: expectedCardId },
                      {
                        onSuccess: () => {
                          void navigate({
                            to: "/admin/cards/$cardId",
                            params: { cardId: expectedCardId },
                          });
                        },
                      },
                    )
                  }
                >
                  <RefreshCwIcon className="mr-1 size-3" />
                  Regenerate
                </Button>
              </>
            )}
            <span>
              &mdash; {sources.length} source{sources.length === 1 ? "" : "s"}
            </span>
          </p>
        </div>
      ) : (
        <div>
          <h2 className="text-lg font-semibold">
            {(unmatchedData as NonNullable<typeof unmatchedData>).name}
          </h2>
          <p className="text-sm text-muted-foreground">
            Candidate card &mdash; {sources.length} source
            {sources.length === 1 ? "" : "s"}
          </p>
        </div>
      )}

      {/* ── Link / Accept bar (new mode only) ──────────────────────────────── */}
      {!isExisting && (
        <section className="flex flex-wrap items-end gap-4 rounded-md border p-4">
          <div className="flex items-end gap-2">
            <div className="space-y-1">
              <Label>Link to existing card</Label>
              <CardSearchDropdown
                results={cardSearchResults}
                onSearch={(q) => {
                  setLinkSearch(q);
                  setLinkCardId("");
                }}
                onSelect={(id) => setLinkCardId(id)}
                placeholder="Search by name…"
                className="w-64"
              />
            </div>
            <Button
              variant="outline"
              disabled={!linkCardId.trim() || linkCard.isPending}
              onClick={handleLink}
            >
              <LinkIcon className="mr-1 size-4" />
              Link
            </Button>
          </div>

          <div className="flex items-end gap-2">
            <div className="space-y-1">
              <Label>Card ID</Label>
              <Input
                value={newModeCardId}
                onChange={(e) => setNewCardId(e.target.value)}
                placeholder={defaultCardId || "e.g. SFD-T02"}
                className="w-40 font-mono"
              />
            </div>
            <Button
              disabled={!hasRequiredFields || !newModeCardId.trim() || acceptNewCard.isPending}
              onClick={handleAcceptAsNew}
            >
              <PlusIcon className="mr-1 size-4" />
              Accept as new card
            </Button>
          </div>
          {!hasRequiredFields && (
            <p className="text-xs text-muted-foreground">Select name, type, and domains first.</p>
          )}
        </section>
      )}

      {/* ── Card Fields ────────────────────────────────────────────────────── */}
      <section className="space-y-2">
        <div className="flex items-center gap-2">
          <h3 className="font-medium">Card Fields</h3>
          {isExisting && sources.some((s) => !s.checkedAt) && (
            <Button
              variant="outline"
              size="sm"
              className="h-6 text-xs"
              disabled={checkAllCardSources.isPending}
              onClick={() => checkAllCardSources.mutate(cardId)}
            >
              <CheckCheckIcon className="mr-1 size-3" />
              Check {sources.filter((s) => !s.checkedAt).length} unchecked
            </Button>
          )}
        </div>
        {!isExisting && (
          <p className="text-sm text-muted-foreground">
            Click a cell to select it for the new card. The Active column shows your selections.
          </p>
        )}
        <SourceSpreadsheet
          fields={
            isExisting
              ? CARD_SOURCE_FIELDS.map((f) =>
                  f.key === "sourceId" ? { ...f, readOnly: false } : f,
                )
              : CARD_SOURCE_FIELDS
          }
          requiredKeys={isExisting ? undefined : ["name", "type", "domains"]}
          activeRow={
            isExisting
              ? {
                  ...(existingData as NonNullable<typeof existingData>).card,
                  sourceId: (existingData as NonNullable<typeof existingData>).card.slug,
                }
              : Object.keys(activeCard).length > 0
                ? activeCard
                : null
          }
          sourceRows={sources}
          favoriteSources={favorites}
          onCellClick={(field, value) => {
            if (isExisting) {
              if (field === "sourceId") {
                const newId = String(value).trim();
                if (newId && newId !== cardId) {
                  renameCard.mutate(
                    { cardId, newId },
                    {
                      onSuccess: () => {
                        void navigate({
                          to: "/admin/cards/$cardId",
                          params: { cardId: newId },
                        });
                      },
                    },
                  );
                }
                return;
              }
              acceptCardField.mutate({ cardId, field, value });
            } else {
              setActiveCard((prev) => ({ ...prev, [field]: value }));
            }
          }}
          onActiveChange={(field, value) => {
            if (isExisting) {
              if (value === undefined) {
                return;
              }
              if (field === "sourceId") {
                const newId = String(value).trim();
                if (newId && newId !== cardId) {
                  renameCard.mutate(
                    { cardId, newId },
                    {
                      onSuccess: () => {
                        void navigate({
                          to: "/admin/cards/$cardId",
                          params: { cardId: newId },
                        });
                      },
                    },
                  );
                }
                return;
              }
              acceptCardField.mutate({ cardId, field, value });
            } else {
              setActiveCard((prev) =>
                value === null || value === undefined
                  ? Object.fromEntries(Object.entries(prev).filter(([k]) => k !== field))
                  : { ...prev, [field]: value },
              );
            }
          }}
          onCheck={(sourceId) => checkCardSource.mutate(sourceId)}
          onUncheck={(sourceId) => uncheckCardSource.mutate(sourceId)}
          columnActions={(row) =>
            isExisting ? (
              <>
                <DropdownMenuItem
                  onClick={() => {
                    const record = row as unknown as Record<string, unknown>;
                    for (const field of CARD_SOURCE_FIELDS) {
                      if (field.readOnly) {
                        continue;
                      }
                      const val = record[field.key];
                      if (val !== null && val !== undefined && val !== "") {
                        acceptCardField.mutate({ cardId, field: field.key, value: val });
                      }
                    }
                  }}
                >
                  <CopyCheckIcon className="mr-2 size-3.5" />
                  Accept all fields
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() =>
                    ignoreCardSource.mutate({
                      source: (row as CardSourceResponse).source,
                      sourceEntityId: row.sourceEntityId,
                    })
                  }
                >
                  <BanIcon className="mr-2 size-3.5" />
                  Ignore permanently
                </DropdownMenuItem>
              </>
            ) : (
              <>
                <DropdownMenuItem
                  disabled={!newModeCardId.trim() || acceptNewCard.isPending}
                  onClick={() => {
                    const record = row as unknown as Record<string, unknown>;
                    const values: Record<string, unknown> = {};
                    for (const field of CARD_SOURCE_FIELDS) {
                      if (field.readOnly) {
                        continue;
                      }
                      const val = record[field.key];
                      if (val !== null && val !== undefined && val !== "") {
                        values[field.key] = val;
                      }
                    }
                    if (!values.name || !values.type || !values.domains) {
                      return;
                    }
                    const id = newModeCardId.trim();
                    acceptNewCard.mutate(
                      { name: identifier, cardFields: { id, ...values } },
                      {
                        onSuccess: () => {
                          checkCardSource.mutate(row.id);
                          void navigate({ to: "/admin/cards/$cardId", params: { cardId: id } });
                        },
                      },
                    );
                  }}
                >
                  <RocketIcon className="mr-2 size-3.5" />
                  Accept all &amp; create card
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() =>
                    ignoreCardSource.mutate({
                      source: (row as CardSourceResponse).source,
                      sourceEntityId: row.sourceEntityId,
                    })
                  }
                >
                  <BanIcon className="mr-2 size-3.5" />
                  Ignore permanently
                </DropdownMenuItem>
              </>
            )
          }
        />
      </section>

      {/* ── Printings ──────────────────────────────────────────────────────── */}
      {isExisting ? (
        <section className="space-y-3">
          <div className="flex items-center gap-2">
            <h3 className="font-medium">Printings</h3>
            <Button
              variant="outline"
              size="sm"
              className="h-6 text-xs"
              onClick={() => {
                const allKeys = [
                  ...printings.map((p) => p.id as string),
                  ...ambiguousGroups.map((g) => g.key),
                ];
                setExpandedPrintings((prev) =>
                  prev.size === allKeys.length ? new Set() : new Set(allKeys),
                );
              }}
            >
              {expandedPrintings.size === printings.length + ambiguousGroups.length
                ? "Collapse all"
                : "Expand all"}
            </Button>
          </div>
          {printings.map((printing) => {
            const printingId = printing.id as string;
            const printingSlug = printing.slug as string;
            const isExpanded = expandedPrintings.has(printingId);
            const relatedSources = printingSources.filter((ps) => ps.printingId === printingId);
            const autoGroups = autoMatchedByPrinting.get(printingId);
            const autoSources = autoGroups ? autoGroups.flatMap((g) => g.sources) : [];
            const allSources = [...relatedSources, ...autoSources];
            const autoSourceIds = new Set(autoSources.map((s) => s.id));
            const activeImage = printingImages.find(
              (pi) => pi.printingId === printingId && pi.isActive,
            );
            const printingWithImage = {
              ...printing,
              imageUrl: activeImage?.originalUrl ?? null,
            };
            const expectedId = buildPrintingId(
              printing.sourceId as string,
              printing.rarity as string,
              (printing.promoTypeSlug as string | null) ?? null,
              printing.finish as string,
            );
            const isStale = printingSlug !== expectedId;

            const allChecked = allSources.length > 0 && allSources.every((ps) => ps.checkedAt);

            return (
              <div
                key={printingId}
                data-printing-id={printingId}
                className={cn("rounded-md border", allChecked && "border-green-600/40")}
              >
                <div className="flex w-full items-center gap-2 px-3 py-2 text-sm font-medium">
                  <button
                    type="button"
                    className="flex items-center gap-2 hover:opacity-70"
                    onClick={() => togglePrinting(printingId)}
                  >
                    {isExpanded ? (
                      <ChevronDownIcon className="size-4" />
                    ) : (
                      <ChevronRightIcon className="size-4" />
                    )}
                    <span className={isStale ? "text-orange-600 line-through" : ""}>
                      {printingSlug}
                    </span>
                    <span className="text-muted-foreground font-normal">
                      &mdash; {allSources.length} source
                      {allSources.length === 1 ? "" : "s"}
                    </span>
                    {allChecked && <CheckCheckIcon className="size-3.5 text-green-600" />}
                  </button>
                  {isStale && (
                    <>
                      <span className="text-muted-foreground">&rarr; {expectedId}</span>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 text-xs"
                        disabled={renamePrinting.isPending}
                        onClick={(e) => {
                          e.stopPropagation();
                          renamePrinting.mutate({ printingId: printingSlug, newId: expectedId });
                        }}
                      >
                        <RefreshCwIcon className="mr-1 size-3" />
                        Regenerate
                      </Button>
                    </>
                  )}
                  {allSources.some((ps) => !ps.checkedAt) && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-6 text-xs"
                      disabled={checkAllPrintingSources.isPending}
                      onClick={(e) => {
                        e.stopPropagation();
                        const extraIds = autoSources.map((s) => s.id);
                        checkAllPrintingSources.mutate({
                          printingId,
                          extraIds: extraIds.length > 0 ? extraIds : undefined,
                        });
                      }}
                    >
                      <CheckCheckIcon className="mr-1 size-3" />
                      Check {allSources.filter((ps) => !ps.checkedAt).length} unchecked
                    </Button>
                  )}
                </div>
                {isExpanded && (
                  <div className="flex gap-3 border-t p-3">
                    <PrintingImageSwitcher
                      printingId={printingId}
                      printingSlug={printingSlug}
                      images={printingImages.filter((pi) => pi.printingId === printingId)}
                      favoriteSources={favorites}
                      sourceImages={[
                        ...allSources
                          .filter(
                            (ps) =>
                              ps.imageUrl &&
                              !printingImages.some(
                                (pi) =>
                                  pi.printingId === printingId && pi.originalUrl === ps.imageUrl,
                              ),
                          )
                          .reduce((acc, ps) => {
                            const url = ps.imageUrl as string;
                            const src = sourceLabels[ps.cardSourceId] ?? "unknown";
                            const existing = acc.get(url);
                            if (existing) {
                              if (!existing.source.split(", ").includes(src)) {
                                existing.source += `, ${src}`;
                              }
                            } else {
                              acc.set(url, { printingSourceId: ps.id, url, source: src });
                            }
                            return acc;
                          }, new Map<string, { printingSourceId: string; url: string; source: string }>())
                          .values(),
                      ]}
                    />
                    <div className="min-w-0 flex-1 space-y-3">
                      <SourceSpreadsheet
                        fields={printingSourceFields}
                        activeRow={printingWithImage}
                        sourceRows={allSources}
                        sourceLabels={sourceLabels}
                        favoriteSources={favorites}
                        onCellClick={(field, value) => {
                          acceptPrintingField.mutate({ printingId: printingSlug, field, value });
                        }}
                        onActiveChange={(field, value) => {
                          if (value === undefined) {
                            return;
                          }
                          acceptPrintingField.mutate({ printingId: printingSlug, field, value });
                        }}
                        onCheck={(id) => checkPrintingSource.mutate(id)}
                        onUncheck={(id) => uncheckPrintingSource.mutate(id)}
                        columnClassName={(row) =>
                          autoSourceIds.has(row.id)
                            ? "bg-violet-50 dark:bg-violet-950/30"
                            : undefined
                        }
                        columnActions={(row) =>
                          autoSourceIds.has(row.id) ? (
                            <>
                              <DropdownMenuItem
                                onClick={() =>
                                  linkPrintingSources.mutate({
                                    printingSourceIds: [row.id],
                                    printingId,
                                  })
                                }
                              >
                                <MoveIcon className="mr-2 size-3.5" />
                                Link to this printing
                              </DropdownMenuItem>
                              {printings.some((p) => (p.id as string) !== printingId) && (
                                <DropdownMenuSub>
                                  <DropdownMenuSubTrigger>
                                    <ArrowRightIcon className="mr-2 size-3.5" />
                                    Link to…
                                  </DropdownMenuSubTrigger>
                                  <DropdownMenuSubContent>
                                    {printings
                                      .filter((p) => (p.id as string) !== printingId)
                                      .map((p) => (
                                        <DropdownMenuItem
                                          key={`autolink-${p.slug as string}`}
                                          onClick={() =>
                                            linkPrintingSources.mutate({
                                              printingSourceIds: [row.id],
                                              printingId: p.slug as string,
                                            })
                                          }
                                        >
                                          {p.slug as string}
                                        </DropdownMenuItem>
                                      ))}
                                  </DropdownMenuSubContent>
                                </DropdownMenuSub>
                              )}
                              <DropdownMenuItem onClick={() => deletePrintingSource.mutate(row.id)}>
                                <Trash2Icon className="mr-2 size-3.5" />
                                Delete
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() =>
                                  ignorePrintingSource.mutate({
                                    source:
                                      sourceLabels[(row as PrintingSourceResponse).cardSourceId] ??
                                      "",
                                    sourceEntityId: row.sourceEntityId,
                                    finish: (row as PrintingSourceResponse).finish,
                                  })
                                }
                              >
                                <BanIcon className="mr-2 size-3.5" />
                                Ignore permanently
                              </DropdownMenuItem>
                            </>
                          ) : (
                            <>
                              <DropdownMenuItem
                                onClick={() =>
                                  linkPrintingSources.mutate({
                                    printingSourceIds: [row.id],
                                    printingId: null,
                                  })
                                }
                              >
                                <XIcon className="mr-2 size-3.5" />
                                Unassign
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => deletePrintingSource.mutate(row.id)}>
                                <Trash2Icon className="mr-2 size-3.5" />
                                Delete
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() =>
                                  ignorePrintingSource.mutate({
                                    source:
                                      sourceLabels[(row as PrintingSourceResponse).cardSourceId] ??
                                      "",
                                    sourceEntityId: row.sourceEntityId,
                                    finish: (row as PrintingSourceResponse).finish,
                                  })
                                }
                              >
                                <BanIcon className="mr-2 size-3.5" />
                                Ignore permanently
                              </DropdownMenuItem>
                              {printings.some((p) => (p.id as string) !== printingId) && (
                                <>
                                  <DropdownMenuSub>
                                    <DropdownMenuSubTrigger>
                                      <MoveIcon className="mr-2 size-3.5" />
                                      Move to…
                                    </DropdownMenuSubTrigger>
                                    <DropdownMenuSubContent>
                                      {printings
                                        .filter((p) => (p.id as string) !== printingId)
                                        .map((p) => (
                                          <DropdownMenuItem
                                            key={`move-${p.slug as string}`}
                                            onClick={() =>
                                              linkPrintingSources.mutate({
                                                printingSourceIds: [row.id],
                                                printingId: p.slug as string,
                                              })
                                            }
                                          >
                                            {p.slug as string}
                                          </DropdownMenuItem>
                                        ))}
                                    </DropdownMenuSubContent>
                                  </DropdownMenuSub>
                                  <DropdownMenuSub>
                                    <DropdownMenuSubTrigger>
                                      <CopyIcon className="mr-2 size-3.5" />
                                      Copy to…
                                    </DropdownMenuSubTrigger>
                                    <DropdownMenuSubContent>
                                      {printings
                                        .filter((p) => (p.id as string) !== printingId)
                                        .map((p) => (
                                          <DropdownMenuItem
                                            key={`copy-${p.slug as string}`}
                                            onClick={() =>
                                              copyPrintingSource.mutate({
                                                id: row.id,
                                                printingId: p.slug as string,
                                              })
                                            }
                                          >
                                            {p.slug as string}
                                          </DropdownMenuItem>
                                        ))}
                                    </DropdownMenuSubContent>
                                  </DropdownMenuSub>
                                </>
                              )}
                            </>
                          )
                        }
                      />
                    </div>
                  </div>
                )}
              </div>
            );
          })}

          {/* Unmatched printing sources — only groups with 0 or 2+ printing matches */}
          {ambiguousGroups.map((group) => (
            <NewPrintingGroupCard
              key={group.key}
              cardId={cardId}
              group={group}
              existingPrintings={printings}
              sourceLabels={sourceLabels}
              favoriteSources={favorites}
              isExpanded={expandedPrintings.has(group.key)}
              onToggle={() => togglePrinting(group.key)}
              onCheck={(id) => checkPrintingSource.mutate(id)}
              onUncheck={(id) => uncheckPrintingSource.mutate(id)}
              onAccept={(printingFields, printingSourceIds) => {
                acceptPrintingGroup.mutate(
                  { cardId, printingFields, printingSourceIds },
                  {
                    onSuccess: (data) => {
                      pendingScrollTarget.current = (data as { printingId: string }).printingId;
                    },
                  },
                );
              }}
              onLink={(pid, printingSourceIds) => {
                linkPrintingSources.mutate({ printingId: pid, printingSourceIds });
              }}
              onCopy={(id, pid) => {
                copyPrintingSource.mutate({ id, printingId: pid });
              }}
              onDelete={(id) => {
                deletePrintingSource.mutate(id);
              }}
              onIgnore={(sourceEntityId, finish) => {
                ignorePrintingSource.mutate({
                  source:
                    sourceLabels[
                      group.sources.find((s) => s.sourceEntityId === sourceEntityId)
                        ?.cardSourceId ?? ""
                    ] ?? "",
                  sourceEntityId,
                  finish,
                });
              }}
              isAccepting={acceptPrintingGroup.isPending}
              isLinking={linkPrintingSources.isPending}
              printingFields={printingSourceFields}
            />
          ))}
        </section>
      ) : (
        <section className="space-y-3">
          <h3 className="font-medium">Printings</h3>
          {newModeGroups.map((group) => {
            const guessedSourceId = (() => {
              const counts = new Map<string, number>();
              for (const s of group.sources) {
                counts.set(s.sourceId, (counts.get(s.sourceId) ?? 0) + 1);
              }
              return [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
            })();
            const guessedId = buildPrintingId(
              guessedSourceId,
              group.sources[0]?.rarity ?? ("Common" satisfies Rarity),
              null,
              group.differentiators.finish,
            );

            return (
              <div key={group.key} className="rounded-md border border-dashed">
                <div className="flex items-center justify-between px-3 py-2">
                  <span className="text-sm font-medium">
                    {guessedId} &mdash; {group.sources.length} source
                    {group.sources.length === 1 ? "" : "s"}
                  </span>
                  {newModeGroups.length > 1 && (
                    <DropdownMenu>
                      <DropdownMenuTrigger
                        render={<Button variant="ghost" size="icon" className="size-7 shrink-0" />}
                      >
                        <EllipsisVerticalIcon className="size-3.5" />
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-max">
                        {newModeGroups
                          .filter((g) => g.key !== group.key)
                          .map((target) => {
                            const targetSourceId = (() => {
                              const counts = new Map<string, number>();
                              for (const s of target.sources) {
                                counts.set(s.sourceId, (counts.get(s.sourceId) ?? 0) + 1);
                              }
                              return [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
                            })();
                            const targetId = buildPrintingId(
                              targetSourceId,
                              target.sources[0]?.rarity ?? ("Common" satisfies Rarity),
                              null,
                              target.differentiators.finish,
                            );
                            return (
                              <DropdownMenuItem
                                key={target.key}
                                disabled={reassignPrinting.isPending}
                                onClick={() =>
                                  group.sources.forEach((s) =>
                                    reassignPrinting.mutate({
                                      id: s.id,
                                      fields: target.differentiators,
                                    }),
                                  )
                                }
                              >
                                <ArrowRightIcon className="mr-2 size-3.5" />
                                Merge into {targetId}
                              </DropdownMenuItem>
                            );
                          })}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                </div>
                <div className="flex gap-3 border-t p-3">
                  <GroupImagePreview
                    sources={group.sources}
                    sourceLabels={sourceLabels}
                    favoriteSources={favorites}
                  />
                  <div className="min-w-0 flex-1">
                    <SourceSpreadsheet
                      fields={printingSourceFields}
                      activeRow={null}
                      sourceRows={group.sources}
                      sourceLabels={sourceLabels}
                      favoriteSources={favorites}
                      onCheck={(id) => checkPrintingSource.mutate(id)}
                      onUncheck={(id) => uncheckPrintingSource.mutate(id)}
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </section>
      )}
    </div>
  );
}

const REQUIRED_PRINTING_KEYS = [
  "sourceId",
  "setId",
  "collectorNumber",
  "rarity",
  "artVariant",
  "isSigned",
  "promoTypeId",
  "finish",
  "artist",
  "publicCode",
];

function NewPrintingGroupCard({
  cardId: _cardId,
  group,
  existingPrintings,
  sourceLabels,
  favoriteSources,
  isExpanded,
  onToggle,
  onCheck,
  onUncheck,
  onAccept,
  onLink,
  onCopy,
  onDelete,
  onIgnore,
  isAccepting,
  printingFields,
}: {
  cardId: string;
  group: PrintingGroup;
  existingPrintings: Record<string, unknown>[];
  sourceLabels: Record<string, string>;
  favoriteSources: Set<string>;
  isExpanded: boolean;
  onToggle: () => void;
  onCheck: (id: string) => void;
  onUncheck: (id: string) => void;
  onAccept: (printingFields: Record<string, unknown>, printingSourceIds: string[]) => void;
  onLink: (printingId: string, printingSourceIds: string[]) => void;
  onCopy: (id: string, printingId: string) => void;
  onDelete: (id: string) => void;
  onIgnore: (sourceEntityId: string, finish: string) => void;
  isAccepting: boolean;
  isLinking?: boolean;
  printingFields: FieldDef[];
}) {
  const [activePrinting, setActivePrinting] = useState<Record<string, unknown>>({});
  const hasRequired = REQUIRED_PRINTING_KEYS.every((k) => {
    const v = activePrinting[k];
    return v !== undefined && v !== null && v !== "";
  });

  // Generate ID in the same format as the DB: "sourceId:rarity:finish:promoSlug"
  const printingId = hasRequired
    ? buildPrintingId(
        activePrinting.sourceId as string,
        String(activePrinting.rarity ?? ("Common" satisfies Rarity)),
        null,
        activePrinting.finish as string,
      )
    : "";

  // Guess the most likely ID from source data before fields are selected
  const { differentiators: d } = group;
  const guessedSourceId = (() => {
    const counts = new Map<string, number>();
    for (const s of group.sources) {
      counts.set(s.sourceId, (counts.get(s.sourceId) ?? 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
  })();
  const guessedId = buildPrintingId(
    guessedSourceId,
    group.sources[0]?.rarity ?? ("Common" satisfies Rarity),
    null,
    d.finish,
  );

  return (
    <div className="rounded-md border border-dashed">
      <div className="flex flex-wrap items-center gap-3 px-3 py-2">
        <button
          type="button"
          className="flex items-center gap-2 text-sm font-medium hover:opacity-70"
          onClick={onToggle}
        >
          {isExpanded ? (
            <ChevronDownIcon className="size-4" />
          ) : (
            <ChevronRightIcon className="size-4" />
          )}
          <span>
            New: <span className="text-muted-foreground">{printingId || guessedId}</span> &mdash;{" "}
            {group.sources.length} source
            {group.sources.length === 1 ? "" : "s"}
          </span>
        </button>
        <div className="ml-auto flex flex-wrap items-end gap-2">
          <Button
            size="sm"
            variant="outline"
            disabled={!hasRequired || isAccepting}
            onClick={() =>
              onAccept(
                { id: printingId, ...activePrinting },
                group.sources.map((s) => s.id),
              )
            }
          >
            <PlusIcon className="mr-1 size-3.5" />
            Accept as new printing
          </Button>
        </div>
      </div>
      {isExpanded && (
        <>
          {!hasRequired && (
            <p className="px-3 pb-2 text-xs text-muted-foreground">
              Click cells to fill all required fields (marked with *).
            </p>
          )}
          <div className="flex gap-3 border-t p-3">
            <GroupImagePreview
              sources={group.sources}
              sourceLabels={sourceLabels}
              favoriteSources={favoriteSources}
            />
            <div className="min-w-0 flex-1">
              <SourceSpreadsheet
                fields={printingFields}
                requiredKeys={REQUIRED_PRINTING_KEYS}
                activeRow={Object.keys(activePrinting).length > 0 ? activePrinting : null}
                sourceRows={group.sources}
                sourceLabels={sourceLabels}
                favoriteSources={favoriteSources}
                onCellClick={(field, value) => {
                  setActivePrinting((prev) => ({ ...prev, [field]: value }));
                }}
                onActiveChange={(field, value) => {
                  setActivePrinting((prev) =>
                    value === null || value === undefined
                      ? Object.fromEntries(Object.entries(prev).filter(([k]) => k !== field))
                      : { ...prev, [field]: value },
                  );
                }}
                onCheck={onCheck}
                onUncheck={onUncheck}
                columnActions={(row) => (
                  <>
                    <DropdownMenuItem
                      onClick={() => {
                        const record = row as unknown as Record<string, unknown>;
                        const values: Record<string, unknown> = {};
                        for (const field of printingFields) {
                          if (field.readOnly) {
                            continue;
                          }
                          const val = record[field.key];
                          if (val === null || val === undefined || val === "") {
                            continue;
                          }
                          if (field.options && !field.options.includes(String(val))) {
                            continue;
                          }
                          values[field.key] = val;
                        }
                        setActivePrinting((prev) => ({ ...prev, ...values }));
                      }}
                    >
                      <CopyCheckIcon className="mr-2 size-3.5" />
                      Accept all fields
                    </DropdownMenuItem>
                    {existingPrintings.length > 0 && (
                      <>
                        <DropdownMenuSub>
                          <DropdownMenuSubTrigger>
                            <MoveIcon className="mr-2 size-3.5" />
                            Assign to…
                          </DropdownMenuSubTrigger>
                          <DropdownMenuSubContent>
                            {existingPrintings.map((p) => (
                              <DropdownMenuItem
                                key={`link-${p.slug as string}`}
                                onClick={() => onLink(p.slug as string, [row.id])}
                              >
                                {p.slug as string}
                              </DropdownMenuItem>
                            ))}
                          </DropdownMenuSubContent>
                        </DropdownMenuSub>
                        <DropdownMenuSub>
                          <DropdownMenuSubTrigger>
                            <CopyIcon className="mr-2 size-3.5" />
                            Copy to…
                          </DropdownMenuSubTrigger>
                          <DropdownMenuSubContent>
                            {existingPrintings.map((p) => (
                              <DropdownMenuItem
                                key={`copy-${p.slug as string}`}
                                onClick={() => onCopy(row.id, p.slug as string)}
                              >
                                {p.slug as string}
                              </DropdownMenuItem>
                            ))}
                          </DropdownMenuSubContent>
                        </DropdownMenuSub>
                      </>
                    )}
                    <DropdownMenuItem onClick={() => onDelete(row.id)}>
                      <Trash2Icon className="mr-2 size-3.5" />
                      Delete
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() =>
                        onIgnore(
                          row.sourceEntityId,
                          (row as unknown as Record<string, string>).finish,
                        )
                      }
                    >
                      <BanIcon className="mr-2 size-3.5" />
                      Ignore permanently
                    </DropdownMenuItem>
                  </>
                )}
              />
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ── Read-only image preview for new/ambiguous groups ─────────────────────────

function GroupImagePreview({
  sources,
  sourceLabels,
  favoriteSources,
}: {
  sources: PrintingSourceResponse[];
  sourceLabels: Record<string, string>;
  favoriteSources: Set<string>;
}) {
  // Deduplicate source images by URL, collecting source labels
  const sourceImages = [
    ...sources
      .filter((ps) => ps.imageUrl)
      .reduce((acc, ps) => {
        const url = ps.imageUrl as string;
        const src = sourceLabels[ps.cardSourceId] ?? "unknown";
        const existing = acc.get(url);
        if (existing) {
          if (!existing.source.split(", ").includes(src)) {
            existing.source += `, ${src}`;
          }
        } else {
          acc.set(url, { id: ps.id, url, source: src });
        }
        return acc;
      }, new Map<string, { id: string; url: string; source: string }>())
      .values(),
  ];

  // Sort: favorites first, then alphabetical
  sourceImages.sort((a, b) => {
    const aFav = favoriteSources.has(a.source);
    const bFav = favoriteSources.has(b.source);
    if (aFav !== bFav) {
      return aFav ? -1 : 1;
    }
    return a.source.localeCompare(b.source);
  });

  const [selectedId, setSelectedId] = useState<string | null>(() => sourceImages[0]?.id ?? null);
  const [resolution, setResolution] = useState<string | null>(null);
  const [imgError, setImgError] = useState(false);

  if (sourceImages.length === 0) {
    return null;
  }

  const selected = sourceImages.find((si) => si.id === selectedId) ?? sourceImages[0];

  return (
    <div className="w-96 shrink-0 space-y-2">
      {/* Source image tabs */}
      <div className="flex flex-wrap items-center gap-1">
        {sourceImages.map((si) => (
          <button
            key={si.id}
            type="button"
            className={`rounded border border-dashed px-1.5 py-0.5 text-[10px] ${
              selected.id === si.id ? "border-primary bg-primary/10" : "text-muted-foreground"
            }`}
            onClick={() => {
              setSelectedId(si.id);
              setResolution(null);
              setImgError(false);
            }}
          >
            {si.source}
          </button>
        ))}
      </div>

      {/* Preview */}
      <div className="relative">
        {imgError ? (
          <a
            href={selected.url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex aspect-[5/7] w-full items-center justify-center rounded border bg-muted/30 text-xs text-muted-foreground hover:bg-muted/50"
          >
            Failed to load — click to open
          </a>
        ) : (
          <a href={selected.url} target="_blank" rel="noopener noreferrer">
            <img
              src={selected.url}
              alt="source"
              className="w-full rounded border object-contain"
              onLoad={(e) => {
                const img = e.currentTarget;
                setResolution(`${img.naturalWidth}×${img.naturalHeight}`);
              }}
              onError={() => setImgError(true)}
            />
          </a>
        )}
        {resolution && !imgError && (
          <span className="absolute bottom-1.5 right-1.5 rounded bg-black/60 px-1.5 py-0.5 text-[10px] text-white">
            {resolution}
          </span>
        )}
      </div>
      <a
        href={selected.url}
        target="_blank"
        rel="noopener noreferrer"
        className="block truncate text-[10px] text-muted-foreground hover:text-foreground"
        title={selected.url}
      >
        {selected.url}
      </a>
    </div>
  );
}

// ── Image hover link ─────────────────────────────────────────────────────────

// ── Printing image switcher (replaces the old table) ─────────────────────────

interface SourceImage {
  printingSourceId: string;
  url: string;
  source: string;
}

function getDisplayUrl(img: AdminPrintingImageResponse): string | null {
  return img.rehostedUrl ? `${img.rehostedUrl}-full.webp` : img.originalUrl;
}

function PrintingImageSwitcher({
  printingId,
  printingSlug,
  images,
  sourceImages,
  favoriteSources,
}: {
  printingId: string;
  printingSlug: string;
  images: AdminPrintingImageResponse[];
  sourceImages: SourceImage[];
  favoriteSources: Set<string>;
}) {
  const deletePrintingImage = useDeletePrintingImage();
  const activatePrintingImage = useActivatePrintingImage();
  const rehostPrintingImage = useRehostPrintingImage();
  const unrehostPrintingImage = useUnrehostPrintingImage();
  const addImageFromUrl = useAddImageFromUrl();
  const uploadPrintingImage = useUploadPrintingImage();
  const setPrintingSourceImage = useSetPrintingSourceImage();

  // Sort images + source images: favorites first, then alphabetical by source name
  const favSort = (aLabel: string, bLabel: string) => {
    const aFav = favoriteSources.has(aLabel);
    const bFav = favoriteSources.has(bLabel);
    if (aFav !== bFav) {
      return aFav ? -1 : 1;
    }
    return aLabel.localeCompare(bLabel);
  };
  const sortedImages = [...images].sort((a, b) => favSort(a.source, b.source));
  const sortedSourceImages = [...sourceImages].sort((a, b) => favSort(a.source, b.source));

  const [selectedId, setSelectedId] = useState<string | null>(
    () => sortedImages[0]?.id ?? sortedSourceImages[0]?.printingSourceId ?? null,
  );
  const [resolution, setResolution] = useState<string | null>(null);
  const [imgError, setImgError] = useState(false);
  const [showUrlInput, setShowUrlInput] = useState(false);
  const [urlValue, setUrlValue] = useState("");
  const [urlSource, setUrlSource] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Determine what's selected: an accepted image, a source image, or nothing
  const selectedImage = images.find((img) => img.id === selectedId);
  const selectedSource = sourceImages.find((si) => si.printingSourceId === selectedId);

  // Default to the active image when nothing is explicitly selected
  const activeImage = images.find((img) => img.isActive);
  const effectiveImage = selectedImage ?? (selectedId ? null : activeImage);
  const effectiveSource = selectedSource;
  const effectiveUrl = effectiveImage
    ? getDisplayUrl(effectiveImage)
    : (effectiveSource?.url ?? null);

  return (
    <div className="w-96 shrink-0 space-y-2">
      {/* Image tabs + add buttons */}
      <div className="flex flex-wrap items-center gap-1">
        {sortedImages.map((img) => {
          const isSelected = effectiveImage?.id === img.id;
          return (
            <button
              key={img.id}
              type="button"
              className={`rounded px-1.5 py-0.5 text-[10px] ${
                isSelected
                  ? "bg-primary text-primary-foreground"
                  : img.isActive
                    ? "bg-muted font-medium"
                    : "bg-muted/50 text-muted-foreground"
              }`}
              onClick={() => {
                setSelectedId(isSelected ? null : img.id);
                setResolution(null);
                setImgError(false);
              }}
            >
              {img.source}
              {img.rehostedUrl ? null : <span className="text-orange-500"> !</span>}
            </button>
          );
        })}
        {sortedSourceImages.map((si) => (
          <button
            key={si.printingSourceId}
            type="button"
            className={`rounded border border-dashed px-1.5 py-0.5 text-[10px] ${
              effectiveSource?.printingSourceId === si.printingSourceId
                ? "border-primary bg-primary/10"
                : "text-muted-foreground"
            }`}
            onClick={() => {
              setSelectedId(
                effectiveSource?.printingSourceId === si.printingSourceId
                  ? null
                  : si.printingSourceId,
              );
              setResolution(null);
              setImgError(false);
            }}
          >
            {si.source}
          </button>
        ))}
        <Button
          variant="ghost"
          size="icon"
          className="size-5"
          title="Add from URL"
          onClick={() => setShowUrlInput((v) => !v)}
        >
          <ImagePlusIcon className="size-3" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="size-5"
          title="Upload image"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploadPrintingImage.isPending}
        >
          <UploadIcon className="size-3" />
        </Button>
      </div>

      {/* Preview */}
      <div className="relative">
        {effectiveUrl && !imgError ? (
          <a href={effectiveUrl} target="_blank" rel="noopener noreferrer">
            <img
              src={effectiveUrl}
              alt={printingSlug}
              className="w-full rounded border object-contain"
              onLoad={(e) => {
                const img = e.currentTarget;
                setResolution(`${img.naturalWidth}×${img.naturalHeight}`);
              }}
              onError={() => setImgError(true)}
            />
          </a>
        ) : effectiveUrl && imgError ? (
          <a
            href={effectiveUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex aspect-[5/7] w-full items-center justify-center rounded border bg-muted/30 text-xs text-muted-foreground hover:bg-muted/50"
          >
            Failed to load — click to open
          </a>
        ) : (
          <div className="flex aspect-[5/7] w-full items-center justify-center rounded border text-xs text-muted-foreground">
            No image
          </div>
        )}
        {resolution && effectiveUrl && !imgError && (
          <span className="absolute bottom-1.5 right-1.5 rounded bg-black/60 px-1.5 py-0.5 text-[10px] text-white">
            {resolution}
          </span>
        )}
      </div>
      {(effectiveImage || effectiveSource) && (
        <div className="space-y-0.5">
          {effectiveImage?.originalUrl && (
            <a
              href={effectiveImage.originalUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="block truncate text-[10px] text-muted-foreground hover:text-foreground"
              title={effectiveImage.originalUrl}
            >
              {effectiveImage.originalUrl}
            </a>
          )}
          {effectiveImage?.rehostedUrl && (
            <a
              href={`${effectiveImage.rehostedUrl}-full.webp`}
              target="_blank"
              rel="noopener noreferrer"
              className="block truncate text-[10px] text-green-600 hover:text-green-500"
              title={`${effectiveImage.rehostedUrl}-full.webp`}
            >
              {effectiveImage.rehostedUrl.split("/").pop()}-full.webp
            </a>
          )}
          {effectiveSource && (
            <a
              href={effectiveSource.url}
              target="_blank"
              rel="noopener noreferrer"
              className="block truncate text-[10px] text-muted-foreground hover:text-foreground"
              title={effectiveSource.url}
            >
              {effectiveSource.url}
            </a>
          )}
        </div>
      )}

      {/* Status + actions bar */}
      {effectiveImage && (
        <div className="flex items-center gap-1">
          {effectiveImage.isActive ? (
            <Badge variant="default" className="h-4 text-[10px] leading-none">
              Active
            </Badge>
          ) : (
            <Badge variant="secondary" className="h-4 text-[10px] leading-none">
              Inactive
            </Badge>
          )}
          {effectiveImage.rehostedUrl ? (
            <Badge variant="outline" className="h-4 text-[10px] leading-none text-green-600">
              Rehosted
            </Badge>
          ) : (
            <Badge variant="outline" className="h-4 text-[10px] leading-none text-orange-600">
              External
            </Badge>
          )}
          <span className="text-[10px] text-muted-foreground">{effectiveImage.source}</span>
          <div className="ml-auto flex items-center gap-0.5">
            {effectiveImage.isActive ? (
              <Button
                variant="ghost"
                size="icon"
                className="size-6"
                title="Deactivate"
                disabled={activatePrintingImage.isPending}
                onClick={() =>
                  activatePrintingImage.mutate({ imageId: effectiveImage.id, active: false })
                }
              >
                <EyeIcon className="size-3" />
              </Button>
            ) : (
              <Button
                variant="ghost"
                size="icon"
                className="size-6"
                title="Set as active"
                disabled={activatePrintingImage.isPending}
                onClick={() =>
                  activatePrintingImage.mutate({ imageId: effectiveImage.id, active: true })
                }
              >
                <EyeOffIcon className="size-3" />
              </Button>
            )}
            {!effectiveImage.rehostedUrl && effectiveImage.originalUrl && (
              <Button
                variant="ghost"
                size="icon"
                className="size-6"
                title="Rehost"
                disabled={rehostPrintingImage.isPending}
                onClick={() => rehostPrintingImage.mutate(effectiveImage.id)}
              >
                <DownloadIcon className="size-3" />
              </Button>
            )}
            {effectiveImage.rehostedUrl && (
              <Button
                variant="ghost"
                size="icon"
                className="size-6"
                title="Un-rehost (delete files)"
                disabled={unrehostPrintingImage.isPending}
                onClick={() => unrehostPrintingImage.mutate(effectiveImage.id)}
              >
                <XIcon className="size-3" />
              </Button>
            )}
            <Button
              variant="ghost"
              size="icon"
              className="size-6 text-destructive"
              title="Remove"
              disabled={deletePrintingImage.isPending}
              onClick={() => deletePrintingImage.mutate(effectiveImage.id)}
            >
              <Trash2Icon className="size-3" />
            </Button>
          </div>
        </div>
      )}
      {!effectiveImage && effectiveSource && (
        <div className="flex items-center gap-1">
          <Badge variant="outline" className="h-4 text-[10px] leading-none">
            Source
          </Badge>
          <span className="text-[10px] text-muted-foreground">{effectiveSource.source}</span>
          <div className="ml-auto flex items-center gap-0.5">
            <Button
              variant="ghost"
              size="sm"
              className="h-6 text-[10px]"
              disabled={setPrintingSourceImage.isPending}
              onClick={() =>
                setPrintingSourceImage.mutate(
                  { printingSourceId: effectiveSource.printingSourceId, mode: "main" },
                  { onSuccess: () => setSelectedId(null) },
                )
              }
            >
              <PlusIcon className="mr-0.5 size-3" />
              Main
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 text-[10px]"
              disabled={setPrintingSourceImage.isPending}
              onClick={() =>
                setPrintingSourceImage.mutate(
                  { printingSourceId: effectiveSource.printingSourceId, mode: "additional" },
                  { onSuccess: () => setSelectedId(null) },
                )
              }
            >
              <PlusIcon className="mr-0.5 size-3" />
              Alt
            </Button>
          </div>
        </div>
      )}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) {
            uploadPrintingImage.mutate({ printingId, file, mode: "main" });
            e.target.value = "";
          }
        }}
      />

      {showUrlInput && (
        <div className="space-y-1">
          <Input
            placeholder="Image URL…"
            value={urlValue}
            onChange={(e) => setUrlValue(e.target.value)}
            className="h-7 text-xs"
          />
          <div className="flex gap-1">
            <Input
              placeholder="Source name"
              value={urlSource}
              onChange={(e) => setUrlSource(e.target.value)}
              className="h-7 flex-1 text-xs"
            />
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs"
              disabled={!urlValue.trim() || addImageFromUrl.isPending}
              onClick={() => {
                addImageFromUrl.mutate(
                  {
                    printingId,
                    url: urlValue.trim(),
                    source: urlSource.trim() || undefined,
                    mode: "main",
                  },
                  {
                    onSuccess: () => {
                      setUrlValue("");
                      setUrlSource("");
                      setShowUrlInput(false);
                    },
                  },
                );
              }}
            >
              Add
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs"
              onClick={() => {
                setShowUrlInput(false);
                setUrlValue("");
                setUrlSource("");
              }}
            >
              <XIcon className="size-3" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
