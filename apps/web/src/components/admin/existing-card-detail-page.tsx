import type {
  AdminCardDetailResponse,
  AdminMarketplaceName,
  CandidateCardResponse,
  CandidatePrintingResponse,
} from "@openrift/shared";
import { useHotkey } from "@tanstack/react-hotkeys";
import { Link, useNavigate } from "@tanstack/react-router";
import {
  ArrowRightIcon,
  BanIcon,
  CheckCheckIcon,
  CopyIcon,
  FileWarningIcon,
  ChevronDownIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  CopyCheckIcon,
  EllipsisVerticalIcon,
  LoaderIcon,
  PlusIcon,
  RefreshCwIcon,
  Trash2Icon,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { CandidateSpreadsheet } from "@/components/admin/candidate-spreadsheet";
import { CardBanManager } from "@/components/admin/card-ban-manager";
import {
  buildPrintingGroups,
  buildPrintingNormalizer,
  buildSourceLabels,
  computePrintingMatchStatus,
  deduplicateSourceImages,
  useCardDetailData,
} from "@/components/admin/card-detail-shared";
import { CardErrataManager } from "@/components/admin/card-errata-manager";
import { NewPrintingGroupCard } from "@/components/admin/new-printing-group-card";
import { PrintingImageSwitcher } from "@/components/admin/printing-image-switcher";
import {
  PrintingMarketplaceBadges,
  PrintingMarketplaceCells,
} from "@/components/admin/printing-marketplace-cells";
import { PrintingSourceActions } from "@/components/admin/printing-source-actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Kbd } from "@/components/ui/kbd";
import { Skeleton } from "@/components/ui/skeleton";
import {
  useAcceptCardField,
  useAcceptPrintingField,
  useAcceptPrintingGroup,
  useCheckAllCandidateCards,
  useCopyCandidatePrinting,
  useDeleteCandidatePrinting,
  useDeletePrinting,
  useLinkCandidatePrintings,
  useRenameCard,
} from "@/hooks/use-admin-card-mutations";
import type { AcceptPrintingBody } from "@/hooks/use-admin-card-mutations";
import {
  useAdminCardDetail,
  useAllCards,
  useNextUncheckedCard,
} from "@/hooks/use-admin-card-queries";
import { queryKeys } from "@/lib/query-keys";
import { cn } from "@/lib/utils";

export function ExistingCardDetailPage({
  identifier,
  focusMarketplace,
  focusFinish,
  focusLanguage,
}: {
  identifier: string;
  focusMarketplace?: AdminMarketplaceName;
  focusFinish?: string;
  focusLanguage?: string;
}) {
  const navigate = useNavigate();
  const cardId = identifier;

  // Narrow invalidation so mutations only refetch this card's detail + the
  // admin card list — not every query under `admin.cards`.
  const invalidateScope = [queryKeys.admin.cards.detail(cardId), queryKeys.admin.cards.list];

  // --- Data fetching ---
  const {
    data: existingData,
    isLoading,
    isError,
  } = useAdminCardDetail(identifier) as {
    data: AdminCardDetailResponse | undefined;
    isLoading: boolean;
    isError: boolean;
  };

  // --- Shared hooks ---
  const {
    providerSettings,
    candidateCardFields,
    printingSourceFields,
    checkCandidateCard,
    uncheckCandidateCard,
    checkPrintingSource,
    uncheckPrintingSource,
    checkAllCandidatePrintings,
    ignoreCardSource,
    ignorePrintingSource,
  } = useCardDetailData(invalidateScope);

  // --- Existing-mode hooks ---
  const checkAllCardSources = useCheckAllCandidateCards();
  const acceptCardField = useAcceptCardField();
  const acceptPrintingField = useAcceptPrintingField(invalidateScope);
  const renameCard = useRenameCard();
  const acceptPrintingGroup = useAcceptPrintingGroup();
  const copyPrintingSource = useCopyCandidatePrinting(invalidateScope);
  const deletePrintingSource = useDeleteCandidatePrinting(invalidateScope);
  const linkPrintingSources = useLinkCandidatePrintings(invalidateScope);
  const deletePrintingMutation = useDeletePrinting(invalidateScope);
  const { data: allCards } = useAllCards();

  // --- State ---
  const [collapsedPrintings, setCollapsedPrintings] = useState<Set<string>>(new Set());
  const [showBanForm, setShowBanForm] = useState(false);
  const [showErrataForm, setShowErrataForm] = useState(false);
  const [focusedPrintingId, setFocusedPrintingId] = useState<string | null>(null);
  const pendingScrollTarget = useRef<string | null>(null);
  const focusHandledRef = useRef(false);

  // --- Check all & next card ---
  const { fetchNext } = useNextUncheckedCard(identifier);
  const [isCheckingAll, setIsCheckingAll] = useState(false);
  // oxlint-disable-next-line no-empty-function -- default no-op until the effect below installs the real handler
  const checkAllAndNextRef = useRef<() => void>(() => {});
  // oxlint-disable-next-line no-empty-function -- default no-op until the effect below installs the real handler
  const prevNextRef = useRef<(dir: "prev" | "next") => void>(() => {});
  useHotkey("Mod+Enter", () => checkAllAndNextRef.current(), {
    enabled: !isCheckingAll,
  });
  useHotkey("Mod+ArrowLeft", () => prevNextRef.current("prev"));
  useHotkey("Mod+ArrowRight", () => prevNextRef.current("next"));

  // Re-point the ref-backed hotkey handlers every render, in effects (react-compiler
  // forbids ref mutation during render). Declared here with the other hooks so they
  // run before the early returns below, keeping hook call order stable.
  async function handleCheckAllAndNext() {
    if (isCheckingAll || !existingData) {
      return;
    }
    const card = existingData.card;
    if (!card) {
      return;
    }
    const sources = existingData.sources;
    const candidatePrintings = existingData.candidatePrintings;
    const printings = existingData.printings;
    const ambiguousGroups = buildPrintingGroups(
      existingData.candidatePrintingGroups,
      candidatePrintings,
    );

    // Kick off the mutations outside the try so react-compiler doesn't flag the
    // for-of + filter + .some() value blocks inside a try/catch statement.
    const promises: Promise<unknown>[] = [];
    if (sources.some((s) => !s.checkedAt)) {
      promises.push(checkAllCardSources.mutateAsync(card.id));
    }
    for (const printing of printings) {
      const relatedSources = candidatePrintings.filter((ps) => ps.printingId === printing.id);
      if (relatedSources.some((ps) => !ps.checkedAt)) {
        promises.push(checkAllCandidatePrintings.mutateAsync({ printingId: printing.id }));
      }
    }
    for (const group of ambiguousGroups) {
      const uncheckedIds = group.candidates.filter((s) => !s.checkedAt).map((s) => s.id);
      if (uncheckedIds.length > 0) {
        promises.push(checkAllCandidatePrintings.mutateAsync({ extraIds: uncheckedIds }));
      }
    }

    setIsCheckingAll(true);
    try {
      await Promise.all(promises);

      const nextSlug = await fetchNext();
      if (nextSlug) {
        void navigate({ to: "/admin/cards/$cardSlug", params: { cardSlug: nextSlug } });
      } else {
        toast.success("All cards reviewed!");
        void navigate({ to: "/admin/cards" });
      }
    } catch (error) {
      setIsCheckingAll(false);
      throw error;
    }
    setIsCheckingAll(false);
  }

  useEffect(() => {
    checkAllAndNextRef.current = () => void handleCheckAllAndNext();
  });
  useEffect(() => {
    prevNextRef.current = (dir) => {
      if (!allCards) {
        return;
      }
      const idx = allCards.findIndex((c: { slug: string }) => c.slug === identifier);
      let slug: string | null = null;
      if (dir === "prev" && idx > 0) {
        slug = allCards[idx - 1].slug;
      } else if (dir === "next" && idx !== -1 && idx < allCards.length - 1) {
        slug = allCards[idx + 1].slug;
      }
      if (slug) {
        void navigate({ to: "/admin/cards/$cardSlug", params: { cardSlug: slug } });
      }
    };
  });

  // After accepting a printing, expand it and scroll into view once data refetches
  useEffect(() => {
    const targetId = pendingScrollTarget.current;
    if (!targetId || !existingData) {
      return;
    }
    const printing = existingData.printings.find((p) => p.id === targetId);
    if (!printing) {
      return;
    }
    const id = printing.id;
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

  // When the user arrives via a "Route to card" click on the Unmatched tab,
  // find the printing that matches the staging row (finish match, plus
  // language match for non-aggregate marketplaces — Cardmarket rows apply to
  // all siblings so any matching finish works), auto-expand it, scroll to it,
  // and mark it focused so the marketplace cell can flash a ring.
  useEffect(() => {
    if (focusHandledRef.current || !focusMarketplace || !focusFinish || !existingData) {
      return;
    }
    const printings = existingData.printings;
    if (printings.length === 0) {
      return;
    }
    const isLanguageAggregate = focusMarketplace === "cardmarket";
    const match =
      printings.find(
        (p) =>
          p.finish === focusFinish &&
          (isLanguageAggregate || !focusLanguage || p.language === focusLanguage),
      ) ??
      printings.find((p) => p.finish === focusFinish) ??
      null;
    if (!match) {
      return;
    }
    focusHandledRef.current = true;
    setCollapsedPrintings((prev) => {
      const next = new Set(prev);
      next.delete(match.id);
      return next;
    });
    setFocusedPrintingId(match.id);
    requestAnimationFrame(() => {
      document
        .querySelector(`[data-printing-id="${match.id}"]`)
        ?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
    const timeout = setTimeout(() => setFocusedPrintingId(null), 2400);
    return () => clearTimeout(timeout);
  }, [existingData, focusMarketplace, focusFinish, focusLanguage]);

  // --- Error / loading states ---
  if (isError) {
    return (
      <div className="space-y-2">
        <h2 className="text-lg font-semibold">Card not found</h2>
        <p className="text-muted-foreground text-sm">
          No card with ID &ldquo;{identifier}&rdquo; exists.
        </p>
      </div>
    );
  }

  if (isLoading || !existingData) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-64" />
      </div>
    );
  }

  // --- Resolved data ---
  const sources = existingData.sources;
  const candidatePrintings = existingData.candidatePrintings;
  const printings = existingData.printings;
  const printingImages = existingData.printingImages;
  const setTotals = existingData.setTotals ?? {};
  const marketplaceMappings = existingData.marketplaceMappings ?? [];
  const marketplaceStagingCandidates = existingData.marketplaceStagingCandidates ?? [];
  const expectedCardId = existingData.expectedCardId;
  const isCardIdStale = cardId !== expectedCardId;
  const card = existingData.card;
  if (!card) {
    return (
      <div className="space-y-2">
        <h2 className="text-lg font-semibold">Card not found</h2>
        <p className="text-muted-foreground text-sm">
          No card data for &ldquo;{identifier}&rdquo;.
        </p>
      </div>
    );
  }
  const canonicalName = card.name;

  const { labels: sourceLabels, names: sourceNames } = buildSourceLabels(sources, canonicalName);

  // Build printing groups for ambiguous/unmatched sources
  const ambiguousGroups = buildPrintingGroups(
    existingData.candidatePrintingGroups,
    candidatePrintings,
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

  const hasUnchecked =
    sources.some((s) => !s.checkedAt) || candidatePrintings.some((ps) => !ps.checkedAt);

  // Used by the render for prev/next buttons. The hotkey equivalents live in the
  // effect above, which recomputes navigation inline from `allCards` + `identifier`.
  const prevNextCards = (() => {
    if (!allCards) {
      return { prev: null, next: null };
    }
    const idx = allCards.findIndex((c: { slug: string }) => c.slug === identifier);
    return {
      prev: idx > 0 ? allCards[idx - 1].slug : null,
      next: idx !== -1 && idx < allCards.length - 1 ? allCards[idx + 1].slug : null,
    };
  })();

  // Compute collapse/expand keys once for the toggle button
  const allPrintingKeys = [
    ...printings.map((p) => p.id),
    ...ambiguousGroups.map((g) => g.groupKey),
  ];
  const allExpanded =
    allPrintingKeys.length > 0 && allPrintingKeys.every((k) => !collapsedPrintings.has(k));

  return (
    <div className="space-y-6">
      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              disabled={!prevNextCards.prev}
              onClick={() =>
                prevNextCards.prev &&
                void navigate({
                  to: "/admin/cards/$cardSlug",
                  params: { cardSlug: prevNextCards.prev },
                })
              }
            >
              <ChevronLeftIcon />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              disabled={!prevNextCards.next}
              onClick={() =>
                prevNextCards.next &&
                void navigate({
                  to: "/admin/cards/$cardSlug",
                  params: { cardSlug: prevNextCards.next },
                })
              }
            >
              <ChevronRightIcon />
            </Button>
          </div>
          <h2 className="text-lg font-semibold">{canonicalName}</h2>
          <Button
            variant={hasUnchecked ? "default" : "outline"}
            className="gap-1.5"
            disabled={isCheckingAll}
            onClick={() => void handleCheckAllAndNext()}
          >
            {isCheckingAll ? <LoaderIcon className="animate-spin" /> : <CheckCheckIcon />}
            {isCheckingAll ? "Checking…" : "Check all & next"}
            <Kbd className="bg-background/20 pointer-events-none ml-1 leading-none text-inherit opacity-60">
              Ctrl ↵
            </Kbd>
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger render={<Button variant="ghost" size="icon" />}>
              <EllipsisVerticalIcon />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                render={
                  <Link
                    to="/admin/cards/$cardSlug/printings/create"
                    params={{ cardSlug: cardId }}
                  />
                }
              >
                <PlusIcon className="mr-2" />
                Create printing
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setShowBanForm(true)}>
                <BanIcon className="mr-2" />
                Add ban
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setShowErrataForm(true)}>
                <FileWarningIcon className="mr-2" />
                {card.errata ? "Edit errata" : "Add errata"}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        <p className="text-muted-foreground flex items-center gap-2 text-sm">
          <span className={isCardIdStale ? "text-orange-600 line-through" : ""}>{cardId}</span>
          {isCardIdStale && (
            <>
              <span>&rarr; {expectedCardId}</span>
              <Button
                variant="ghost"
                disabled={renameCard.isPending}
                onClick={() =>
                  renameCard.mutate(
                    { cardId: card.id, newId: expectedCardId },
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
                <RefreshCwIcon className="mr-1" />
                Regenerate
              </Button>
            </>
          )}
          <span>
            ({sources.length} source{sources.length === 1 ? "" : "s"})
          </span>
        </p>
      </div>

      {/* ── Card Fields ────────────────────────────────────────────────────── */}
      <section className="space-y-2">
        <div className="flex items-center gap-2">
          <h3 className="font-medium">Card Fields</h3>
          {sources.some((s) => !s.checkedAt) && (
            <Button
              variant="outline"
              disabled={checkAllCardSources.isPending}
              onClick={() => checkAllCardSources.mutate(card.id)}
            >
              <CheckCheckIcon className="mr-1" />
              Check {sources.filter((s) => !s.checkedAt).length} unchecked
            </Button>
          )}
        </div>
        <CandidateSpreadsheet
          fields={candidateCardFields
            .filter((f) => f.key !== "rulesText" && f.key !== "effectText")
            .map((f) => (f.key === "shortCode" ? { ...f, readOnly: false } : f))}
          requiredKeys={["shortCode", "name", "type", "domains"]}
          activeRow={{
            ...card,
            shortCode: card.slug,
          }}
          candidateRows={sources}
          providerSettings={providerSettings}
          onCellClick={(field, value) => {
            if (field === "shortCode") {
              const newId = String(value).trim();
              if (newId && newId !== cardId) {
                renameCard.mutate(
                  { cardId: card.id, newId },
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
            acceptCardField.mutate({ cardId: card.id, field, value, source: "provider" });
          }}
          onActiveChange={(field, value) => {
            if (value === undefined) {
              return;
            }
            if (field === "shortCode") {
              const newId = String(value).trim();
              if (newId && newId !== cardId) {
                renameCard.mutate(
                  { cardId: card.id, newId },
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
            acceptCardField.mutate({ cardId: card.id, field, value });
          }}
          onCheck={(candidateId) => checkCandidateCard.mutate(candidateId)}
          onUncheck={(candidateId) => uncheckCandidateCard.mutate(candidateId)}
          columnActions={(row) => (
            <>
              <DropdownMenuItem
                onClick={() => {
                  const record = row as unknown as Record<string, unknown>;
                  for (const field of candidateCardFields) {
                    if (field.readOnly) {
                      continue;
                    }
                    const val = record[field.key];
                    if (val !== null && val !== undefined && val !== "") {
                      acceptCardField.mutate({
                        cardId: card.id,
                        field: field.key,
                        value: val,
                        source: "provider",
                      });
                    }
                  }
                }}
              >
                <CopyCheckIcon className="mr-2" />
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
                <BanIcon className="mr-2" />
                Ignore permanently
              </DropdownMenuItem>
            </>
          )}
        />
      </section>

      {/* ── Bans ─────────────────────────────────────────────────────────────── */}
      <CardBanManager cardId={card.id} showForm={showBanForm} onShowFormChange={setShowBanForm} />

      {/* ── Errata ────────────────────────────────────────────────────────── */}
      <CardErrataManager
        cardId={card.id}
        errata={card.errata}
        showForm={showErrataForm}
        onShowFormChange={setShowErrataForm}
      />

      {/* ── Printings ──────────────────────────────────────────────────────── */}
      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <h3 className="font-medium">Printings</h3>
          <Button
            variant="outline"
            onClick={() => {
              setCollapsedPrintings(allExpanded ? new Set(allPrintingKeys) : new Set());
            }}
          >
            {allExpanded ? "Collapse all" : "Expand all"}
          </Button>
        </div>
        {printings.map((printing) => {
          const printingId = printing.id;
          const printingLabel = printing.expectedPrintingId;
          const isExpanded = !collapsedPrintings.has(printingId);
          const allSources = candidatePrintings.filter((ps) => ps.printingId === printingId);
          const activeImage = printingImages.find(
            (pi) => pi.printingId === printingId && pi.isActive,
          );
          const printingWithImage = {
            ...printing,
            imageUrl: activeImage?.originalUrl ?? null,
          };

          const matchStatus = computePrintingMatchStatus(
            printing,
            allSources,
            sourceLabels,
            providerSettings,
            printingSourceFields,
            setTotals,
          );
          const headerBgClass =
            matchStatus === "match"
              ? "bg-green-50 dark:bg-green-950/30"
              : "bg-yellow-50 dark:bg-yellow-950/30";

          // Deduplicate source images not yet accepted as printing images
          const sourceImagesForSwitcher = deduplicateSourceImages(
            allSources.filter(
              (ps) =>
                ps.imageUrl &&
                !printingImages.some(
                  (pi) => pi.printingId === printingId && pi.originalUrl === ps.imageUrl,
                ),
            ),
            sourceLabels,
          );

          return (
            <div
              key={printingId}
              data-printing-id={printingId}
              className="overflow-hidden rounded-md border"
            >
              {/* oxlint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions -- contains nested buttons, can't use <button> */}
              <div
                className={cn(
                  "flex w-full cursor-pointer items-center gap-2 px-3 py-2 text-sm font-medium hover:opacity-90",
                  headerBgClass,
                )}
                onClick={() => togglePrinting(printingId)}
              >
                <span className="flex items-center gap-2">
                  {isExpanded ? <ChevronDownIcon /> : <ChevronRightIcon />}
                  <span>{printingLabel}</span>
                  <span className="text-muted-foreground font-normal">
                    ({allSources.length} source
                    {allSources.length === 1 ? "" : "s"})
                  </span>
                  {!activeImage && <Badge variant="destructive">no image</Badge>}
                  <PrintingMarketplaceBadges
                    printingId={printingId}
                    mappings={marketplaceMappings}
                  />
                </span>
                {allSources.some((ps) => !ps.checkedAt) && (
                  <Button
                    variant="outline"
                    disabled={checkAllCandidatePrintings.isPending}
                    onClick={(e) => {
                      e.stopPropagation();
                      checkAllCandidatePrintings.mutate({ printingId });
                    }}
                  >
                    <CheckCheckIcon className="mr-1" />
                    Check {allSources.filter((ps) => !ps.checkedAt).length} unchecked
                  </Button>
                )}
                <DropdownMenu>
                  <DropdownMenuTrigger
                    render={
                      <Button
                        variant="ghost"
                        size="icon"
                        className="ml-auto"
                        onClick={(e) => e.stopPropagation()}
                      />
                    }
                  >
                    <EllipsisVerticalIcon />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem
                      render={
                        <Link
                          to="/admin/cards/$cardSlug/printings/create"
                          params={{ cardSlug: cardId }}
                          search={{ duplicateFrom: printingId }}
                        />
                      }
                    >
                      <CopyIcon className="mr-2" />
                      Duplicate printing
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      disabled={deletePrintingMutation.isPending}
                      onClick={() => {
                        if (
                          globalThis.confirm(
                            `Delete printing "${printingLabel}"? This cannot be undone.`,
                          )
                        ) {
                          deletePrintingMutation.mutate(printingId);
                        }
                      }}
                    >
                      <Trash2Icon className="text-destructive mr-2" />
                      <span className="text-destructive">Delete</span>
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
              {isExpanded && (
                <div className="flex gap-3 border-t p-3">
                  <div className="flex flex-col gap-3">
                    <PrintingImageSwitcher
                      printingId={printingId}
                      printingLabel={printingLabel}
                      images={printingImages.filter((pi) => pi.printingId === printingId)}
                      providerSettings={providerSettings}
                      sourceImages={sourceImagesForSwitcher}
                      invalidates={invalidateScope}
                    />
                    <PrintingMarketplaceCells
                      printing={printing}
                      mappings={marketplaceMappings}
                      stagingCandidates={marketplaceStagingCandidates}
                      allPrintings={printings}
                      highlightMarketplace={
                        focusedPrintingId === printingId ? focusMarketplace : undefined
                      }
                    />
                  </div>
                  <div className="min-w-0 flex-1 space-y-3">
                    <CandidateSpreadsheet
                      key={allSources.map((s) => s.id).join(",")}
                      fields={printingSourceFields}
                      activeRow={printingWithImage}
                      candidateRows={allSources}
                      providerLabels={sourceLabels}
                      providerNames={sourceNames}
                      providerSettings={providerSettings}
                      normalizeCandidate={buildPrintingNormalizer(setTotals, printing.setSlug)}
                      onCellClick={(field, value) => {
                        acceptPrintingField.mutate({
                          printingId,
                          field,
                          value,
                          source: "provider",
                        });
                      }}
                      onActiveChange={(field, value) => {
                        if (value === undefined) {
                          return;
                        }
                        acceptPrintingField.mutate({ printingId, field, value });
                      }}
                      onCheck={(id) => checkPrintingSource.mutate(id)}
                      onUncheck={(id) => uncheckPrintingSource.mutate(id)}
                      columnActions={(row) => (
                        <PrintingSourceActions
                          targets={printings
                            .filter((p) => p.id !== printingId)
                            .map((p) => ({
                              id: p.id,
                              label: p.expectedPrintingId,
                            }))}
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
                                sourceLabels[(row as CandidatePrintingResponse).candidateCardId] ??
                                "",
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

        {/* Bulk assign all matchable ambiguous groups */}
        {ambiguousGroups.length > 0 &&
          (() => {
            const matchable = ambiguousGroups.filter((g) =>
              printings.some((p) => p.expectedPrintingId === g.expectedPrintingId),
            );
            if (matchable.length < 2) {
              return null;
            }
            return (
              <div className="flex items-center">
                <Button
                  variant="default"
                  disabled={linkPrintingSources.isPending}
                  onClick={() => {
                    for (const g of matchable) {
                      const match = printings.find(
                        (p) => p.expectedPrintingId === g.expectedPrintingId,
                      );
                      if (!match) {
                        continue;
                      }
                      const pid = match.id;
                      linkPrintingSources.mutate({
                        printingId: pid,
                        candidatePrintingIds: g.candidates.map((s) => s.id),
                      });
                    }
                  }}
                >
                  <ArrowRightIcon className="mr-1" />
                  Assign all {matchable.length} groups to existing
                </Button>
              </div>
            );
          })()}

        {/* Ambiguous / new printing groups */}
        {ambiguousGroups.map((group) => (
          <NewPrintingGroupCard
            key={group.groupKey}
            group={group}
            existingPrintings={printings}
            providerLabels={sourceLabels}
            providerNames={sourceNames}
            providerSettings={providerSettings}
            setTotals={setTotals}
            isExpanded={!collapsedPrintings.has(group.groupKey)}
            onToggle={() => togglePrinting(group.groupKey)}
            onAccept={(printingFields, candidatePrintingIds) => {
              acceptPrintingGroup.mutate(
                {
                  cardId: card.id,
                  printingFields: printingFields as AcceptPrintingBody["printingFields"],
                  candidatePrintingIds,
                },
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
                    group.candidates.find((s) => s.externalId === externalId)?.candidateCardId ?? ""
                  ] ?? "",
                externalId,
                finish,
              });
            }}
            isAccepting={acceptPrintingGroup.isPending}
            isLinking={linkPrintingSources.isPending}
            printingFields={printingSourceFields}
            invalidates={invalidateScope}
          />
        ))}
      </section>
    </div>
  );
}
