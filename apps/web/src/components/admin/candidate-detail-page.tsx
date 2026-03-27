import type {
  AdminPrintingImageResponse,
  CandidateCardResponse,
  CandidatePrintingGroupResponse,
  CandidatePrintingResponse,
  ProviderSettingResponse,
} from "@openrift/shared";
import { buildPrintingId } from "@openrift/shared";
import { useHotkey } from "@tanstack/react-hotkeys";
import { useNavigate } from "@tanstack/react-router";
import {
  ArrowRightIcon,
  BanIcon,
  CheckCheckIcon,
  ChevronDownIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  CopyCheckIcon,
  DownloadIcon,
  EllipsisVerticalIcon,
  EyeIcon,
  EyeOffIcon,
  ImagePlusIcon,
  LinkIcon,
  PlusIcon,
  RefreshCwIcon,
  LoaderIcon,
  Trash2Icon,
  UploadIcon,
  XIcon,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import type { FieldDef, PrintingGroup } from "@/components/admin/candidate-spreadsheet";
import {
  CANDIDATE_CARD_FIELDS,
  CandidateSpreadsheet,
  buildCandidatePrintingFields,
} from "@/components/admin/candidate-spreadsheet";
import type { CardSearchResult } from "@/components/admin/card-search-dropdown";
import { CardSearchDropdown } from "@/components/admin/card-search-dropdown";
import { PrintingSourceActions } from "@/components/admin/printing-source-actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
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
  useCandidateDetail,
  useCheckAllCandidateCards,
  useCheckAllCandidatePrintings,
  useCheckCandidateCard,
  useCheckCandidatePrinting,
  useUncheckCandidateCard,
  useUncheckCandidatePrinting,
  useCopyCandidatePrinting,
  useDeletePrintingImage,
  useDeleteCandidatePrinting,
  useDeletePrinting,
  useLinkCard,
  useNextUncheckedCard,
  useLinkCandidatePrintings,
  useReassignCandidatePrinting,
  useRehostPrintingImage,
  useRenameCard,
  useRenamePrinting,
  useSetCandidatePrintingImage,
  useUnmatchedCardDetail,
  useUnrehostPrintingImage,
  useUploadPrintingImage,
} from "@/hooks/use-candidates";
import { useDistinctArtists } from "@/hooks/use-distinct-artists";
import { useIgnoreCandidateCard, useIgnoreCandidatePrinting } from "@/hooks/use-ignored-candidates";
import { usePromoTypes } from "@/hooks/use-promo-types";
import { useProviderSettings } from "@/hooks/use-provider-settings";
import { cn } from "@/lib/utils";

interface DetailData {
  card: Record<string, unknown>;
  sources: CandidateCardResponse[];
  printings: Record<string, unknown>[];
  candidatePrintings: CandidatePrintingResponse[];
  candidatePrintingGroups: CandidatePrintingGroupResponse[];
  expectedCardId: string;
  printingImages: AdminPrintingImageResponse[];
  setTotals: Record<string, number>;
}

interface UnmatchedData {
  displayName: string;
  sources: CandidateCardResponse[];
  candidatePrintings: CandidatePrintingResponse[];
  candidatePrintingGroups: CandidatePrintingGroupResponse[];
  defaultCardId: string;
  setTotals: Record<string, number>;
}

interface CandidateDetailPageProps {
  mode: "existing" | "new";
  identifier: string;
}

export function CandidateDetailPage({ mode, identifier }: CandidateDetailPageProps) {
  const navigate = useNavigate();

  // --- Data fetching (both called, only one enabled via empty-string trick) ---
  const existingQuery = useCandidateDetail(mode === "existing" ? identifier : "") as {
    data: DetailData | undefined;
    isLoading: boolean;
    isError: boolean;
  };
  const unmatchedQuery = useUnmatchedCardDetail(mode === "new" ? identifier : "") as {
    data: UnmatchedData | undefined;
    isLoading: boolean;
  };

  // --- Shared hooks ---
  const checkCandidateCard = useCheckCandidateCard();
  const uncheckCandidateCard = useUncheckCandidateCard();
  const checkPrintingSource = useCheckCandidatePrinting();
  const uncheckPrintingSource = useUncheckCandidatePrinting();
  const { data: providerSettingsData } = useProviderSettings();
  const providerSettings = providerSettingsData?.providerSettings ?? [];

  // --- Existing-mode hooks ---
  const checkAllCardSources = useCheckAllCandidateCards();
  const checkAllCandidatePrintings = useCheckAllCandidatePrintings();
  const acceptCardField = useAcceptCardField();
  const acceptPrintingField = useAcceptPrintingField();
  const renameCard = useRenameCard();
  const acceptPrintingGroup = useAcceptPrintingGroup();
  const copyPrintingSource = useCopyCandidatePrinting();
  const deletePrintingSource = useDeleteCandidatePrinting();
  const ignoreCardSource = useIgnoreCandidateCard();
  const ignorePrintingSource = useIgnoreCandidatePrinting();
  const linkPrintingSources = useLinkCandidatePrintings();
  const renamePrinting = useRenamePrinting();
  const deletePrintingMutation = useDeletePrinting();

  // --- Promo types for dropdown + slug lookup ---
  const { data: promoTypesData } = usePromoTypes();
  const promoTypes = promoTypesData?.promoTypes ?? [];
  const { data: artistSuggestions } = useDistinctArtists();
  const printingSourceFields = buildCandidatePrintingFields(
    promoTypes.map((pt: { id: string; label: string }) => ({
      value: pt.id,
      label: pt.label,
    })),
    artistSuggestions,
  );

  // --- New-mode hooks ---
  const acceptNewCard = useAcceptNewCard();
  const linkCard = useLinkCard();
  const reassignPrinting = useReassignCandidatePrinting();
  const { data: allCards } = useAllCards();

  // --- Existing-mode state ---
  const [collapsedPrintings, setCollapsedPrintings] = useState<Set<string>>(new Set());
  const pendingScrollTarget = useRef<string | null>(null);

  // --- New-mode state ---
  const [activeCard, setActiveCard] = useState<Record<string, unknown>>({});
  const [newCardId, setNewCardId] = useState<string | null>(null);
  const [linkCardId, setLinkCardId] = useState("");
  const [linkSearch, setLinkSearch] = useState("");

  // --- Check all & next card ---
  const { fetchNext } = useNextUncheckedCard(mode === "existing" ? identifier : "");
  const [isCheckingAll, setIsCheckingAll] = useState(false);
  // oxlint-disable-next-line no-empty-function -- initialized before data is available, set after early returns
  const checkAllAndNextRef = useRef<() => void>(() => {});
  // oxlint-disable-next-line no-empty-function -- initialized after early returns when prevNextCards is available
  const prevNextRef = useRef<(dir: "prev" | "next") => void>(() => {});
  useHotkey("Mod+Enter", () => checkAllAndNextRef.current(), {
    enabled: mode === "existing" && !isCheckingAll,
  });
  useHotkey("Mod+ArrowLeft", () => prevNextRef.current("prev"), {
    enabled: mode === "existing",
  });
  useHotkey("Mod+ArrowRight", () => prevNextRef.current("next"), {
    enabled: mode === "existing",
  });

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
    setCollapsedPrintings((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
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
        <p className="text-muted-foreground text-sm">
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

  const sources: CandidateCardResponse[] = isExisting
    ? (existingData as NonNullable<typeof existingData>).sources
    : (unmatchedData as NonNullable<typeof unmatchedData>).sources;
  const candidatePrintings: CandidatePrintingResponse[] = isExisting
    ? (existingData as NonNullable<typeof existingData>).candidatePrintings
    : (unmatchedData as NonNullable<typeof unmatchedData>).candidatePrintings;
  const printings: Record<string, unknown>[] = isExisting
    ? (existingData as NonNullable<typeof existingData>).printings
    : [];
  const printingImages: AdminPrintingImageResponse[] = isExisting
    ? (existingData as NonNullable<typeof existingData>).printingImages
    : [];
  const setTotals: Record<string, number> = isExisting
    ? ((existingData as NonNullable<typeof existingData>).setTotals ?? {})
    : ((unmatchedData as NonNullable<typeof unmatchedData>).setTotals ?? {});
  const cardId = isExisting ? identifier : "";

  // --- Existing-mode computed values ---
  const sourceLabels = Object.fromEntries(sources.map((s) => [s.id, s.provider]));
  const canonicalName = isExisting
    ? ((existingData as NonNullable<typeof existingData>).card.name as string)
    : null;
  // Collect printed rules/effect texts from accepted printings for mismatch warnings
  const printedRulesTexts = new Set(
    printings.map((p) => p.printedRulesText as string | null).filter(Boolean),
  );
  const printedEffectTexts = new Set(
    printings.map((p) => p.printedEffectText as string | null).filter(Boolean),
  );

  const sourceNames = Object.fromEntries(
    sources
      .filter((s) => s.name !== canonicalName)
      .map((s) => {
        let label = s.name;
        if (canonicalName) {
          // Strip canonical name prefix, then trim surrounding parens, dashes, and whitespace
          label = label.startsWith(canonicalName) ? label.slice(canonicalName.length) : label;
          label = label.replaceAll(/^[\s\-–—(]+|[)\s]+$/g, "");
        }
        return [s.id, label];
      }),
  );

  function togglePrinting(id: string) {
    setCollapsedPrintings((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  // Use API-provided printing source groups for auto-matching
  const apiGroups: CandidatePrintingGroupResponse[] = isExisting
    ? (existingData as NonNullable<typeof existingData>).candidatePrintingGroups
    : (unmatchedData as NonNullable<typeof unmatchedData>).candidatePrintingGroups;

  // Build PrintingGroup[] from API groups (for components that still need the old shape)
  const candidatePrintingById = new Map(candidatePrintings.map((ps) => [ps.id, ps]));
  const apiToLocalGroup = (
    g: CandidatePrintingGroupResponse,
    index: number,
  ): PrintingGroup & { groupKey: string } => {
    const candidates = g.shortCodes
      .map((id: string) => candidatePrintingById.get(id))
      .filter(Boolean) as CandidatePrintingResponse[];
    return {
      candidates,
      expectedPrintingId: g.expectedPrintingId,
      // Use first candidate ID to disambiguate groups with the same expectedPrintingId
      groupKey: candidates[0]?.id ?? `${g.expectedPrintingId}-${index}`,
    };
  };

  // Existing-mode: split into auto-matched and ambiguous groups
  const ambiguousGroups = isExisting ? apiGroups.map((g, i) => apiToLocalGroup(g, i)) : [];

  // Use API-provided expectedCardId / defaultCardId
  const expectedCardId = isExisting
    ? (existingData as NonNullable<typeof existingData>).expectedCardId
    : "";
  const isCardIdStale = isExisting && cardId !== expectedCardId;

  const defaultCardId = isExisting
    ? ""
    : (unmatchedData as NonNullable<typeof unmatchedData>).defaultCardId;

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
          void navigate({ to: "/admin/cards/$cardSlug", params: { cardSlug: id } });
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
          void navigate({ to: "/admin/cards/$cardSlug", params: { cardSlug: targetId } });
        },
      },
    );
  }

  // New-mode: groups for the printings section (from API groups)
  const newModeGroups = isExisting ? [] : apiGroups.map((g, i) => apiToLocalGroup(g, i));

  const hasUnchecked =
    isExisting &&
    (sources.some((s) => !s.checkedAt) || candidatePrintings.some((ps) => !ps.checkedAt));

  async function handleCheckAllAndNext() {
    if (!isExisting || isCheckingAll) {
      return;
    }
    setIsCheckingAll(true);
    try {
      const promises: Promise<unknown>[] = [];

      // Check all card sources
      if (sources.some((s) => !s.checkedAt)) {
        promises.push(checkAllCardSources.mutateAsync(cardId));
      }

      // Check all printing sources (each accepted printing separately)
      for (const printing of printings) {
        const printingId = printing.id as string;
        const relatedSources = candidatePrintings.filter((ps) => ps.printingId === printingId);

        if (relatedSources.some((ps) => !ps.checkedAt)) {
          promises.push(checkAllCandidatePrintings.mutateAsync({ printingId }));
        }
      }

      // Check all printing sources in new/ambiguous groups (no printingId yet)
      for (const group of ambiguousGroups) {
        const uncheckedIds = group.candidates.filter((s) => !s.checkedAt).map((s) => s.id);
        if (uncheckedIds.length > 0) {
          promises.push(checkAllCandidatePrintings.mutateAsync({ extraIds: uncheckedIds }));
        }
      }

      await Promise.all(promises);

      const nextCardId = await fetchNext();
      if (nextCardId) {
        void navigate({ to: "/admin/cards/$cardSlug", params: { cardSlug: nextCardId } });
      } else {
        toast.success("All cards reviewed!");
        void navigate({ to: "/admin/cards" });
      }
    } finally {
      setIsCheckingAll(false);
    }
  }
  checkAllAndNextRef.current = () => void handleCheckAllAndNext();

  // --- Prev / Next card navigation ---
  const prevNextCards = (() => {
    if (!isExisting || !allCards) {
      return { prev: null, next: null };
    }
    const idx = allCards.findIndex((c: { slug: string }) => c.slug === identifier);
    return {
      prev: idx > 0 ? allCards[idx - 1].slug : null,
      next: idx !== -1 && idx < allCards.length - 1 ? allCards[idx + 1].slug : null,
    };
  })();
  prevNextRef.current = (dir) => {
    const slug = dir === "prev" ? prevNextCards.prev : prevNextCards.next;
    if (slug) {
      void navigate({ to: "/admin/cards/$cardSlug", params: { cardSlug: slug } });
    }
  };

  return (
    <div className="space-y-6">
      {/* ── Header ──────────────────────────────────────────────────────────── */}
      {isExisting ? (
        <div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                className="size-7"
                disabled={!prevNextCards.prev}
                onClick={() =>
                  prevNextCards.prev &&
                  void navigate({
                    to: "/admin/cards/$cardSlug",
                    params: { cardSlug: prevNextCards.prev },
                  })
                }
              >
                <ChevronLeftIcon className="size-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="size-7"
                disabled={!prevNextCards.next}
                onClick={() =>
                  prevNextCards.next &&
                  void navigate({
                    to: "/admin/cards/$cardSlug",
                    params: { cardSlug: prevNextCards.next },
                  })
                }
              >
                <ChevronRightIcon className="size-4" />
              </Button>
            </div>
            <h2 className="text-lg font-semibold">
              {(existingData as NonNullable<typeof existingData>).card.name as string}
            </h2>
            <Button
              variant={hasUnchecked ? "default" : "outline"}
              size="sm"
              className="h-7 gap-1.5 text-xs"
              disabled={isCheckingAll}
              onClick={() => void handleCheckAllAndNext()}
            >
              {isCheckingAll ? (
                <LoaderIcon className="size-3.5 animate-spin" />
              ) : (
                <CheckCheckIcon className="size-3.5" />
              )}
              {isCheckingAll ? "Checking…" : "Check all & next"}
              <kbd className="bg-background/20 pointer-events-none ml-1 rounded px-1 py-0.5 font-mono text-[10px] leading-none opacity-60">
                Ctrl ↵
              </kbd>
            </Button>
          </div>
          <p className="text-muted-foreground flex items-center gap-2 text-sm">
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
                            to: "/admin/cards/$cardSlug",
                            params: { cardSlug: expectedCardId },
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
            {(unmatchedData as NonNullable<typeof unmatchedData>).displayName}
          </h2>
          <p className="text-muted-foreground text-sm">
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
            <p className="text-muted-foreground text-xs">Select name, type, and domains first.</p>
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
          <p className="text-muted-foreground text-sm">
            Click a cell to select it for the new card. The Active column shows your selections.
          </p>
        )}
        <CandidateSpreadsheet
          fields={
            isExisting
              ? CANDIDATE_CARD_FIELDS.map((f) =>
                  f.key === "shortCode" ? { ...f, readOnly: false } : f,
                )
              : CANDIDATE_CARD_FIELDS
          }
          requiredKeys={["shortCode", "name", "type", "domains"]}
          activeRow={
            isExisting
              ? {
                  ...(existingData as NonNullable<typeof existingData>).card,
                  shortCode: (existingData as NonNullable<typeof existingData>).card.slug,
                }
              : Object.keys(activeCard).length > 0
                ? activeCard
                : null
          }
          candidateRows={sources}
          providerSettings={providerSettings}
          cellWarning={
            isExisting && printings.length > 0
              ? (fieldKey, value) => {
                  if (
                    fieldKey === "rulesText" &&
                    typeof value === "string" &&
                    printedRulesTexts.size > 0 &&
                    !printedRulesTexts.has(value)
                  ) {
                    return "This rules text doesn\u2019t match any printing\u2019s printed rules";
                  }
                  if (
                    fieldKey === "effectText" &&
                    typeof value === "string" &&
                    printedEffectTexts.size > 0 &&
                    !printedEffectTexts.has(value)
                  ) {
                    return "This effect text doesn\u2019t match any printing\u2019s printed effect";
                  }
                  return null;
                }
              : undefined
          }
          onCellClick={(field, value) => {
            if (isExisting) {
              if (field === "shortCode") {
                const newId = String(value).trim();
                if (newId && newId !== cardId) {
                  renameCard.mutate(
                    { cardId, newId },
                    {
                      onSuccess: () => {
                        void navigate({
                          to: "/admin/cards/$cardSlug",
                          params: { cardSlug: newId },
                        });
                      },
                    },
                  );
                }
                return;
              }
              acceptCardField.mutate({ cardId, field, value, source: "provider" });
            } else {
              setActiveCard((prev) => ({ ...prev, [field]: value }));
            }
          }}
          onActiveChange={(field, value) => {
            if (isExisting) {
              if (value === undefined) {
                return;
              }
              if (field === "shortCode") {
                const newId = String(value).trim();
                if (newId && newId !== cardId) {
                  renameCard.mutate(
                    { cardId, newId },
                    {
                      onSuccess: () => {
                        void navigate({
                          to: "/admin/cards/$cardSlug",
                          params: { cardSlug: newId },
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
          onCheck={(candidateId) => checkCandidateCard.mutate(candidateId)}
          onUncheck={(candidateId) => uncheckCandidateCard.mutate(candidateId)}
          columnActions={(row) =>
            isExisting ? (
              <>
                <DropdownMenuItem
                  onClick={() => {
                    const record = row as unknown as Record<string, unknown>;
                    for (const field of CANDIDATE_CARD_FIELDS) {
                      if (field.readOnly) {
                        continue;
                      }
                      const val = record[field.key];
                      if (val !== null && val !== undefined && val !== "") {
                        acceptCardField.mutate({
                          cardId,
                          field: field.key,
                          value: val,
                          source: "provider",
                        });
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
                      provider: (row as CandidateCardResponse).provider,
                      externalId: row.externalId,
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
                  onClick={() => {
                    const record = row as unknown as Record<string, unknown>;
                    for (const field of CANDIDATE_CARD_FIELDS) {
                      if (field.readOnly) {
                        continue;
                      }
                      const val = record[field.key];
                      if (val !== null && val !== undefined && val !== "") {
                        setActiveCard((prev) => ({ ...prev, [field.key]: val }));
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
                      provider: (row as CandidateCardResponse).provider,
                      externalId: row.externalId,
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
                  ...ambiguousGroups.map((g) => g.groupKey),
                ];
                const allExpanded =
                  allKeys.length > 0 && allKeys.every((k) => !collapsedPrintings.has(k));
                setCollapsedPrintings(allExpanded ? new Set(allKeys) : new Set());
              }}
            >
              {(() => {
                const allKeys = [
                  ...printings.map((p) => p.id as string),
                  ...ambiguousGroups.map((g) => g.expectedPrintingId),
                ];
                return allKeys.length > 0 && allKeys.every((k) => !collapsedPrintings.has(k))
                  ? "Collapse all"
                  : "Expand all";
              })()}
            </Button>
          </div>
          {printings.map((printing) => {
            const printingId = printing.id as string;
            const printingSlug = printing.slug as string;
            const isExpanded = !collapsedPrintings.has(printingId);
            const allSources = candidatePrintings.filter((ps) => ps.printingId === printingId);
            const activeImage = printingImages.find(
              (pi) => pi.printingId === printingId && pi.isActive,
            );
            const printingWithImage = {
              ...printing,
              imageUrl: activeImage?.originalUrl ?? null,
            };
            const expectedId = printing.expectedPrintingId as string;
            const isStale = printingSlug !== expectedId;

            const allChecked = allSources.every((ps) => ps.checkedAt);

            return (
              <div
                key={printingId}
                data-printing-id={printingId}
                className={cn("rounded-md border", allChecked && "border-green-600/40")}
              >
                {/* oxlint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions -- contains nested buttons, can't use <button> */}
                <div
                  className="flex w-full cursor-pointer items-center gap-2 px-3 py-2 text-sm font-medium hover:opacity-70"
                  onClick={() => togglePrinting(printingId)}
                >
                  <span className="flex items-center gap-2">
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
                    {!activeImage && (
                      <Badge variant="destructive" className="text-xs">
                        no image
                      </Badge>
                    )}
                  </span>
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
                      disabled={checkAllCandidatePrintings.isPending}
                      onClick={(e) => {
                        e.stopPropagation();
                        checkAllCandidatePrintings.mutate({ printingId });
                      }}
                    >
                      <CheckCheckIcon className="mr-1 size-3" />
                      Check {allSources.filter((ps) => !ps.checkedAt).length} unchecked
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-destructive hover:text-destructive ml-auto h-6 text-xs"
                    disabled={deletePrintingMutation.isPending}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (
                        globalThis.confirm(
                          `Delete printing "${printingSlug}"? This cannot be undone.`,
                        )
                      ) {
                        deletePrintingMutation.mutate(printingSlug);
                      }
                    }}
                  >
                    <Trash2Icon className="mr-1 size-3" />
                    Delete
                  </Button>
                </div>
                {isExpanded && (
                  <div className="flex gap-3 border-t p-3">
                    <PrintingImageSwitcher
                      printingId={printingId}
                      printingSlug={printingSlug}
                      images={printingImages.filter((pi) => pi.printingId === printingId)}
                      providerSettings={providerSettings}
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
                            const src = sourceLabels[ps.candidateCardId] ?? "unknown";
                            const existing = acc.get(url);
                            if (existing) {
                              if (!existing.source.split(", ").includes(src)) {
                                existing.source += `, ${src}`;
                              }
                            } else {
                              acc.set(url, { candidatePrintingId: ps.id, url, source: src });
                            }
                            return acc;
                          }, new Map<string, { candidatePrintingId: string; url: string; source: string }>())
                          .values(),
                      ]}
                    />
                    <div className="min-w-0 flex-1 space-y-3">
                      <CandidateSpreadsheet
                        key={allSources.map((s) => s.id).join(",")}
                        fields={printingSourceFields}
                        activeRow={printingWithImage}
                        candidateRows={allSources}
                        providerLabels={sourceLabels}
                        providerNames={sourceNames}
                        providerSettings={providerSettings}
                        onCellClick={(field, value) => {
                          acceptPrintingField.mutate({
                            printingId: printingSlug,
                            field,
                            value,
                            source: "provider",
                          });
                        }}
                        onActiveChange={(field, value) => {
                          if (value === undefined) {
                            return;
                          }
                          acceptPrintingField.mutate({ printingId: printingSlug, field, value });
                        }}
                        onCheck={(id) => checkPrintingSource.mutate(id)}
                        onUncheck={(id) => uncheckPrintingSource.mutate(id)}
                        columnActions={(row) => (
                          <PrintingSourceActions
                            targets={printings
                              .filter((p) => (p.id as string) !== printingId)
                              .map((p) => ({ id: p.id as string, slug: p.slug as string }))}
                            onAssign={(pid) =>
                              linkPrintingSources.mutate({
                                candidatePrintingIds: [row.id],
                                printingId: pid,
                              })
                            }
                            onCopy={(pid) =>
                              copyPrintingSource.mutate({ id: row.id, printingId: pid })
                            }
                            onUnassign={() =>
                              linkPrintingSources.mutate({
                                candidatePrintingIds: [row.id],
                                printingId: null,
                              })
                            }
                            onIgnore={() =>
                              ignorePrintingSource.mutate({
                                provider:
                                  sourceLabels[
                                    (row as CandidatePrintingResponse).candidateCardId
                                  ] ?? "",
                                externalId: row.externalId,
                                finish: (row as CandidatePrintingResponse).finish,
                              })
                            }
                            onDelete={() => deletePrintingSource.mutate(row.id)}
                          />
                        )}
                      />
                    </div>
                  </div>
                )}
              </div>
            );
          })}

          {/* Unmatched printing sources — only groups with 0 or 2+ printing matches */}
          {ambiguousGroups.length > 0 &&
            (() => {
              const matchable = ambiguousGroups.filter((g) =>
                printings.some((p) => p.slug === g.expectedPrintingId),
              );
              if (matchable.length < 2) {
                return null;
              }
              return (
                <div className="flex items-center">
                  <Button
                    size="sm"
                    variant="default"
                    disabled={linkPrintingSources.isPending}
                    onClick={() => {
                      for (const g of matchable) {
                        const pid = (
                          printings.find((p) => p.slug === g.expectedPrintingId) as { id: string }
                        ).id;
                        linkPrintingSources.mutate({
                          printingId: pid,
                          candidatePrintingIds: g.candidates.map((s) => s.id),
                        });
                      }
                    }}
                  >
                    <ArrowRightIcon className="mr-1 size-3.5" />
                    Assign all {matchable.length} groups to existing
                  </Button>
                </div>
              );
            })()}
          {ambiguousGroups.map((group) => (
            <NewPrintingGroupCard
              key={group.groupKey}
              cardId={cardId}
              group={group}
              existingPrintings={printings}
              promoTypes={promoTypes}
              providerLabels={sourceLabels}
              providerNames={sourceNames}
              providerSettings={providerSettings}
              setTotals={setTotals}
              isExpanded={!collapsedPrintings.has(group.groupKey)}
              onToggle={() => togglePrinting(group.groupKey)}
              onCheck={(id) => checkPrintingSource.mutate(id)}
              onCheckAll={(candidateIds) =>
                checkAllCandidatePrintings.mutate({ extraIds: candidateIds })
              }
              isCheckingAll={checkAllCandidatePrintings.isPending}
              onUncheck={(id) => uncheckPrintingSource.mutate(id)}
              onAccept={(printingFields, candidatePrintingIds) => {
                acceptPrintingGroup.mutate(
                  { cardId, printingFields, candidatePrintingIds },
                  {
                    onSuccess: (data) => {
                      pendingScrollTarget.current = (data as { printingId: string }).printingId;
                    },
                  },
                );
              }}
              onLink={(pid, candidatePrintingIds) => {
                linkPrintingSources.mutate({ printingId: pid, candidatePrintingIds });
              }}
              onCopy={(id, pid) => {
                copyPrintingSource.mutate({ id, printingId: pid });
              }}
              onDelete={(id) => {
                deletePrintingSource.mutate(id);
              }}
              onIgnore={(externalId, finish) => {
                ignorePrintingSource.mutate({
                  provider:
                    sourceLabels[
                      group.candidates.find((s) => s.externalId === externalId)?.candidateCardId ??
                        ""
                    ] ?? "",
                  externalId,
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
            const guessedId = group.expectedPrintingId;

            return (
              <div key={group.groupKey} className="rounded-md border border-dashed">
                <div className="flex items-center justify-between px-3 py-2">
                  <span className="text-sm font-medium">
                    {guessedId} &mdash; {group.candidates.length} source
                    {group.candidates.length === 1 ? "" : "s"}
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
                          .filter((g) => g.groupKey !== group.groupKey)
                          .map((target) => {
                            const targetId = target.expectedPrintingId;
                            return (
                              <DropdownMenuItem
                                key={target.groupKey}
                                disabled={reassignPrinting.isPending}
                                onClick={() => {
                                  const t = target.candidates[0];
                                  group.candidates.forEach((s) =>
                                    reassignPrinting.mutate({
                                      id: s.id,
                                      fields: {
                                        setId: t.setId,
                                        collectorNumber: t.collectorNumber,
                                        artVariant: t.artVariant,
                                        isSigned: t.isSigned,
                                        promoTypeId: t.promoTypeId,
                                        rarity: t.rarity,
                                        finish: t.finish,
                                      },
                                    }),
                                  );
                                }}
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
                    sources={group.candidates}
                    providerLabels={sourceLabels}
                    providerSettings={providerSettings}
                  />
                  <div className="min-w-0 flex-1">
                    <CandidateSpreadsheet
                      fields={printingSourceFields}
                      activeRow={null}
                      candidateRows={group.candidates}
                      providerLabels={sourceLabels}
                      providerNames={sourceNames}
                      providerSettings={providerSettings}
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
  "shortCode",
  "setId",
  "collectorNumber",
  "rarity",
  "artVariant",
  "isSigned",
  "finish",
  "artist",
  "publicCode",
];

function NewPrintingGroupCard({
  cardId: _cardId,
  group,
  existingPrintings,
  promoTypes,
  providerLabels,
  providerNames,
  providerSettings,
  setTotals,
  isExpanded,
  onToggle,
  onCheck,
  onCheckAll,
  isCheckingAll,
  onUncheck,
  onAccept,
  onLink,
  onCopy,
  onDelete,
  onIgnore,
  isAccepting,
  isLinking, // custom: used for "Assign all to existing" button disabled state
  printingFields,
}: {
  cardId: string;
  group: PrintingGroup;
  existingPrintings: Record<string, unknown>[];
  promoTypes: { id: string; slug: string }[];
  providerLabels: Record<string, string>;
  providerNames: Record<string, string>;
  providerSettings: ProviderSettingResponse[];
  setTotals: Record<string, number>;
  isExpanded: boolean;
  onToggle: () => void;
  onCheck: (id: string) => void;
  onCheckAll: (candidateIds: string[]) => void;
  isCheckingAll: boolean;
  onUncheck: (id: string) => void;
  onAccept: (printingFields: Record<string, unknown>, candidatePrintingIds: string[]) => void;
  onLink: (printingId: string, candidatePrintingIds: string[]) => void;
  onCopy: (id: string, printingId: string) => void;
  onDelete: (id: string) => void;
  onIgnore: (externalId: string, finish: string) => void;
  isAccepting: boolean;
  isLinking?: boolean;
  printingFields: FieldDef[];
}) {
  const [activePrinting, setActivePrinting] = useState<Record<string, unknown>>({});

  /**
   * Append `/{printedTotal}` to a public code if the set total is known and not already present.
   *
   * @returns The record with publicCode updated, or unchanged if not applicable.
   */
  function withSetTotal(record: Record<string, unknown>): Record<string, unknown> {
    const code = record.publicCode;
    const setSlug = record.setId;
    if (typeof code !== "string" || typeof setSlug !== "string") {
      return record;
    }
    const total = setTotals[setSlug];
    if (!total || code.includes("/")) {
      return record;
    }
    return { ...record, publicCode: `${code}/${total}` };
  }

  const hasRequired = REQUIRED_PRINTING_KEYS.every((k) => {
    const v = activePrinting[k];
    return v !== undefined && v !== null && v !== "";
  });

  // Generate ID in the same format as the DB: "shortCode:finish:promoSlug"
  const promoSlug = activePrinting.promoTypeId
    ? (promoTypes.find((pt) => pt.id === activePrinting.promoTypeId)?.slug ?? null)
    : null;
  const printingId = hasRequired
    ? buildPrintingId(
        activePrinting.shortCode as string,
        promoSlug,
        activePrinting.finish as string,
      )
    : "";

  const guessedId = group.expectedPrintingId;

  // custom: find existing printing whose slug matches the guessed ID so we can offer a quick "assign all" action
  const matchingExisting = existingPrintings.find((p) => p.slug === guessedId) as
    | { id: string; slug: string }
    | undefined;

  return (
    <div
      className={cn(
        "rounded-md border border-dashed",
        group.candidates.every((s) => s.checkedAt) ? "border-green-600/40" : "border-yellow-500/60",
      )}
    >
      {/* oxlint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions -- contains nested buttons, can't use <button> */}
      <div
        className="flex cursor-pointer flex-wrap items-center gap-3 px-3 py-2 hover:opacity-70"
        onClick={onToggle}
      >
        <span className="flex items-center gap-2 text-sm font-medium">
          {isExpanded ? (
            <ChevronDownIcon className="size-4" />
          ) : (
            <ChevronRightIcon className="size-4" />
          )}
          <span>
            New: <span className="text-muted-foreground">{printingId || guessedId}</span> &mdash;{" "}
            {group.candidates.length} source
            {group.candidates.length === 1 ? "" : "s"}
          </span>
        </span>
        {/* oxlint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions -- stopPropagation wrapper, not interactive */}
        <div className="flex flex-wrap items-end gap-2" onClick={(e) => e.stopPropagation()}>
          {group.candidates.some((s) => !s.checkedAt) && (
            <Button
              variant="outline"
              size="sm"
              className="h-6 text-xs"
              disabled={isCheckingAll}
              onClick={(e) => {
                e.stopPropagation();
                onCheckAll(group.candidates.filter((s) => !s.checkedAt).map((s) => s.id));
              }}
            >
              <CheckCheckIcon className="mr-1 size-3" />
              Check {group.candidates.filter((s) => !s.checkedAt).length} unchecked
            </Button>
          )}
          {/* custom: quick-assign all candidates to matching existing printing */}
          {matchingExisting && (
            <Button
              size="sm"
              variant="default"
              disabled={isLinking}
              onClick={() =>
                onLink(
                  matchingExisting.id,
                  group.candidates.map((s) => s.id),
                )
              }
            >
              <ArrowRightIcon className="mr-1 size-3.5" />
              Assign all to existing
            </Button>
          )}
          <Button
            size="sm"
            variant="outline"
            disabled={!hasRequired || isAccepting}
            onClick={() =>
              onAccept(
                activePrinting,
                group.candidates.map((s) => s.id),
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
            <p className="text-muted-foreground px-3 pb-2 text-xs">
              Click cells to fill all required fields (marked with *).
            </p>
          )}
          <div className="flex gap-3 border-t p-3">
            <GroupImagePreview
              sources={group.candidates}
              providerLabels={providerLabels}
              providerSettings={providerSettings}
            />
            <div className="min-w-0 flex-1">
              <CandidateSpreadsheet
                key={group.candidates.map((s) => s.id).join(",")}
                fields={printingFields}
                requiredKeys={REQUIRED_PRINTING_KEYS}
                activeRow={Object.keys(activePrinting).length > 0 ? activePrinting : null}
                candidateRows={group.candidates}
                providerLabels={providerLabels}
                providerNames={providerNames}
                providerSettings={providerSettings}
                onCellClick={(field, value) => {
                  setActivePrinting((prev) => withSetTotal({ ...prev, [field]: value }));
                }}
                onActiveChange={(field, value) => {
                  setActivePrinting((prev) =>
                    value === null || value === undefined
                      ? Object.fromEntries(Object.entries(prev).filter(([k]) => k !== field))
                      : withSetTotal({ ...prev, [field]: value }),
                  );
                }}
                onCheck={onCheck}
                onUncheck={onUncheck}
                columnActions={(row) => (
                  <PrintingSourceActions
                    targets={existingPrintings.map((p) => ({
                      id: p.id as string,
                      slug: p.slug as string,
                    }))}
                    onAssign={(pid) => onLink(pid, [row.id])}
                    onCopy={(pid) => onCopy(row.id, pid)}
                    onAcceptAll={() => {
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
                      setActivePrinting((prev) => withSetTotal({ ...prev, ...values }));
                    }}
                    onIgnore={() =>
                      onIgnore(row.externalId, (row as unknown as Record<string, string>).finish)
                    }
                    onDelete={() => onDelete(row.id)}
                  />
                )}
              />
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ── Shared image preview + provider sort helpers ─────────────────────────────

function sortByProviderOrder(providerSettings: ProviderSettingResponse[]) {
  const settingsMap = new Map(providerSettings.map((s) => [s.provider, s]));
  return (aLabel: string, bLabel: string) => {
    const aOrder = settingsMap.get(aLabel)?.sortOrder ?? 0;
    const bOrder = settingsMap.get(bLabel)?.sortOrder ?? 0;
    if (aOrder !== bOrder) {
      return aOrder - bOrder;
    }
    return aLabel.localeCompare(bLabel);
  };
}

function ImagePreview({
  url,
  alt,
  resolution,
  setResolution,
  imgError,
  setImgError,
}: {
  url: string | null;
  alt: string;
  resolution: string | null;
  setResolution: (v: string | null) => void;
  imgError: boolean;
  setImgError: (v: boolean) => void;
}) {
  return (
    <div className="relative">
      {url && !imgError ? (
        <a href={url} target="_blank" rel="noreferrer">
          <img
            src={url}
            alt={alt}
            className="w-full rounded border object-contain"
            onLoad={(e) => {
              const img = e.currentTarget;
              setResolution(`${img.naturalWidth}×${img.naturalHeight}`);
            }}
            onError={() => setImgError(true)}
          />
        </a>
      ) : url && imgError ? (
        <a
          href={url}
          target="_blank"
          rel="noreferrer"
          className="bg-muted/30 text-muted-foreground hover:bg-muted/50 flex aspect-[5/7] w-full items-center justify-center rounded border text-xs"
        >
          Failed to load — click to open
        </a>
      ) : (
        <div className="text-muted-foreground flex aspect-[5/7] w-full items-center justify-center rounded border text-xs">
          No image
        </div>
      )}
      {resolution && url && !imgError && (
        <span className="absolute right-1.5 bottom-1.5 rounded bg-black/60 px-1.5 py-0.5 text-[10px] text-white">
          {resolution}
        </span>
      )}
    </div>
  );
}

// ── Read-only image preview for new/ambiguous groups ─────────────────────────

function GroupImagePreview({
  sources,
  providerLabels,
  providerSettings,
}: {
  sources: CandidatePrintingResponse[];
  providerLabels: Record<string, string>;
  providerSettings: ProviderSettingResponse[];
}) {
  // Deduplicate source images by URL, collecting source labels
  const sourceImages = [
    ...sources
      .filter((ps) => ps.imageUrl)
      .reduce((acc, ps) => {
        const url = ps.imageUrl as string;
        const src = providerLabels[ps.candidateCardId] ?? "unknown";
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

  sourceImages.sort((a, b) => sortByProviderOrder(providerSettings)(a.source, b.source));

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

      <ImagePreview
        url={selected.url}
        alt="source"
        resolution={resolution}
        setResolution={setResolution}
        imgError={imgError}
        setImgError={setImgError}
      />
      <a
        href={selected.url}
        target="_blank"
        rel="noreferrer"
        className="text-muted-foreground hover:text-foreground block truncate text-[10px]"
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
  candidatePrintingId: string;
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
  providerSettings,
}: {
  printingId: string;
  printingSlug: string;
  images: AdminPrintingImageResponse[];
  sourceImages: SourceImage[];
  providerSettings: ProviderSettingResponse[];
}) {
  const deletePrintingImage = useDeletePrintingImage();
  const activatePrintingImage = useActivatePrintingImage();
  const rehostPrintingImage = useRehostPrintingImage();
  const unrehostPrintingImage = useUnrehostPrintingImage();
  const addImageFromUrl = useAddImageFromUrl();
  const uploadPrintingImage = useUploadPrintingImage();
  const setPrintingSourceImage = useSetCandidatePrintingImage();

  // Sort images + source images by sort_order, then alphabetical by source name
  const orderSort = sortByProviderOrder(providerSettings);
  const sortedImages = images.toSorted((a, b) => orderSort(a.provider, b.provider));
  const sortedSourceImages = sourceImages.toSorted((a, b) => orderSort(a.source, b.source));

  const [selectedId, setSelectedId] = useState<string | null>(
    () => sortedImages[0]?.id ?? sortedSourceImages[0]?.candidatePrintingId ?? null,
  );
  const [resolution, setResolution] = useState<string | null>(null);
  const [imgError, setImgError] = useState(false);
  const [showUrlInput, setShowUrlInput] = useState(false);
  const [urlValue, setUrlValue] = useState("");
  const [urlSource, setUrlSource] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Determine what's selected: an accepted image, a source image, or nothing
  const selectedImage = images.find((img) => img.id === selectedId);
  const selectedSource = sourceImages.find((si) => si.candidatePrintingId === selectedId);

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
              {img.provider}
              {img.rehostedUrl ? null : <span className="text-orange-500"> !</span>}
            </button>
          );
        })}
        {sortedSourceImages.map((si) => (
          <button
            key={si.candidatePrintingId}
            type="button"
            className={`rounded border border-dashed px-1.5 py-0.5 text-[10px] ${
              effectiveSource?.candidatePrintingId === si.candidatePrintingId
                ? "border-primary bg-primary/10"
                : "text-muted-foreground"
            }`}
            onClick={() => {
              setSelectedId(
                effectiveSource?.candidatePrintingId === si.candidatePrintingId
                  ? null
                  : si.candidatePrintingId,
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
      <ImagePreview
        url={effectiveUrl}
        alt={printingSlug}
        resolution={resolution}
        setResolution={setResolution}
        imgError={imgError}
        setImgError={setImgError}
      />
      {(effectiveImage || effectiveSource) && (
        <div className="space-y-0.5">
          {effectiveImage?.originalUrl && (
            <a
              href={effectiveImage.originalUrl}
              target="_blank"
              rel="noreferrer"
              className="text-muted-foreground hover:text-foreground block truncate text-[10px]"
              title={effectiveImage.originalUrl}
            >
              {effectiveImage.originalUrl}
            </a>
          )}
          {effectiveImage?.rehostedUrl && (
            <a
              href={`${effectiveImage.rehostedUrl}-full.webp`}
              target="_blank"
              rel="noreferrer"
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
              rel="noreferrer"
              className="text-muted-foreground hover:text-foreground block truncate text-[10px]"
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
          <span className="text-muted-foreground text-[10px]">{effectiveImage.provider}</span>
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
            {effectiveImage.rehostedUrl && effectiveImage.originalUrl && (
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
              className="text-destructive size-6"
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
          <span className="text-muted-foreground text-[10px]">{effectiveSource.source}</span>
          <div className="ml-auto flex items-center gap-0.5">
            <Button
              variant="ghost"
              size="sm"
              className="h-6 text-[10px]"
              disabled={setPrintingSourceImage.isPending}
              onClick={() =>
                setPrintingSourceImage.mutate(
                  { candidatePrintingId: effectiveSource.candidatePrintingId, mode: "main" },
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
                  { candidatePrintingId: effectiveSource.candidatePrintingId, mode: "additional" },
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
