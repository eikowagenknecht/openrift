import type {
  AdminPrintingImageResponse,
  CandidateCardResponse,
  CandidatePrintingGroupResponse,
  CandidatePrintingResponse,
} from "@openrift/shared";
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
  LoaderIcon,
  RefreshCwIcon,
  Trash2Icon,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import {
  CANDIDATE_CARD_FIELDS,
  CandidateSpreadsheet,
} from "@/components/admin/candidate-spreadsheet";
import { CardBanManager } from "@/components/admin/card-ban-manager";
import {
  buildPrintingGroups,
  buildSourceLabels,
  deduplicateSourceImages,
  useCardDetailData,
} from "@/components/admin/card-detail-shared";
import { NewPrintingGroupCard } from "@/components/admin/new-printing-group-card";
import { PrintingImageSwitcher } from "@/components/admin/printing-image-switcher";
import { PrintingSourceActions } from "@/components/admin/printing-source-actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import {
  useAcceptCardField,
  useAcceptPrintingField,
  useAcceptPrintingGroup,
  useAdminCardDetail,
  useAllCards,
  useCheckAllCandidateCards,
  useCopyCandidatePrinting,
  useDeleteCandidatePrinting,
  useDeletePrinting,
  useLinkCandidatePrintings,
  useNextUncheckedCard,
  useRenameCard,
} from "@/hooks/use-admin-cards";
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

export function ExistingCardDetailPage({ identifier }: { identifier: string }) {
  const navigate = useNavigate();
  const cardId = identifier;

  // --- Data fetching ---
  const {
    data: existingData,
    isLoading,
    isError,
  } = useAdminCardDetail(identifier) as {
    data: DetailData | undefined;
    isLoading: boolean;
    isError: boolean;
  };

  // --- Shared hooks ---
  const {
    providerSettings,
    promoTypes,
    printingSourceFields,
    checkCandidateCard,
    uncheckCandidateCard,
    checkPrintingSource,
    uncheckPrintingSource,
    checkAllCandidatePrintings,
    ignoreCardSource,
    ignorePrintingSource,
  } = useCardDetailData();

  // --- Existing-mode hooks ---
  const checkAllCardSources = useCheckAllCandidateCards();
  const acceptCardField = useAcceptCardField();
  const acceptPrintingField = useAcceptPrintingField();
  const renameCard = useRenameCard();
  const acceptPrintingGroup = useAcceptPrintingGroup();
  const copyPrintingSource = useCopyCandidatePrinting();
  const deletePrintingSource = useDeleteCandidatePrinting();
  const linkPrintingSources = useLinkCandidatePrintings();
  const deletePrintingMutation = useDeletePrinting();
  const { data: allCards } = useAllCards();

  // --- State ---
  const [collapsedPrintings, setCollapsedPrintings] = useState<Set<string>>(new Set());
  const pendingScrollTarget = useRef<string | null>(null);

  // --- Check all & next card ---
  const { fetchNext } = useNextUncheckedCard(identifier);
  const [isCheckingAll, setIsCheckingAll] = useState(false);
  // oxlint-disable-next-line no-empty-function -- initialized before data is available, set after early returns
  const checkAllAndNextRef = useRef<() => void>(() => {});
  // oxlint-disable-next-line no-empty-function -- initialized after early returns when prevNextCards is available
  const prevNextRef = useRef<(dir: "prev" | "next") => void>(() => {});
  useHotkey("Mod+Enter", () => checkAllAndNextRef.current(), {
    enabled: !isCheckingAll,
  });
  useHotkey("Mod+ArrowLeft", () => prevNextRef.current("prev"));
  useHotkey("Mod+ArrowRight", () => prevNextRef.current("next"));

  // After accepting a printing, expand it and scroll into view once data refetches
  useEffect(() => {
    const targetId = pendingScrollTarget.current;
    if (!targetId || !existingData) {
      return;
    }
    const printings = existingData.printings as Record<string, unknown>[];
    const printing = printings.find((p) => (p.id as string) === targetId);
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
  const expectedCardId = existingData.expectedCardId;
  const isCardIdStale = cardId !== expectedCardId;
  const canonicalName = existingData.card.name as string;

  const { labels: sourceLabels, names: sourceNames } = buildSourceLabels(sources, canonicalName);

  // Collect printed rules/effect texts from accepted printings for mismatch warnings
  const printedRulesTexts = new Set(
    printings.map((p) => p.printedRulesText as string | null).filter(Boolean),
  );
  const printedEffectTexts = new Set(
    printings.map((p) => p.printedEffectText as string | null).filter(Boolean),
  );

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

  async function handleCheckAllAndNext() {
    if (isCheckingAll) {
      return;
    }
    setIsCheckingAll(true);
    try {
      const promises: Promise<unknown>[] = [];

      if (sources.some((s) => !s.checkedAt)) {
        promises.push(checkAllCardSources.mutateAsync(cardId));
      }

      for (const printing of printings) {
        const printingId = printing.id as string;
        const relatedSources = candidatePrintings.filter((ps) => ps.printingId === printingId);
        if (relatedSources.some((ps) => !ps.checkedAt)) {
          promises.push(checkAllCandidatePrintings.mutateAsync({ printingId }));
        }
      }

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
    if (!allCards) {
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

  // Compute collapse/expand keys once for the toggle button
  const allPrintingKeys = [
    ...printings.map((p) => p.id as string),
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
          <h2 className="text-lg font-semibold">{canonicalName}</h2>
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

      {/* ── Card Fields ────────────────────────────────────────────────────── */}
      <section className="space-y-2">
        <div className="flex items-center gap-2">
          <h3 className="font-medium">Card Fields</h3>
          {sources.some((s) => !s.checkedAt) && (
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
        <CandidateSpreadsheet
          fields={CANDIDATE_CARD_FIELDS.map((f) =>
            f.key === "shortCode" ? { ...f, readOnly: false } : f,
          )}
          requiredKeys={["shortCode", "name", "type", "domains"]}
          activeRow={{
            ...existingData.card,
            shortCode: existingData.card.slug,
          }}
          candidateRows={sources}
          providerSettings={providerSettings}
          cellWarning={
            printings.length > 0
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
          }}
          onActiveChange={(field, value) => {
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
          }}
          onCheck={(candidateId) => checkCandidateCard.mutate(candidateId)}
          onUncheck={(candidateId) => uncheckCandidateCard.mutate(candidateId)}
          columnActions={(row) => (
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
          )}
        />
      </section>

      {/* ── Bans ─────────────────────────────────────────────────────────────── */}
      <CardBanManager cardId={cardId} />

      {/* ── Printings ──────────────────────────────────────────────────────── */}
      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <h3 className="font-medium">Printings</h3>
          <Button
            variant="outline"
            size="sm"
            className="h-6 text-xs"
            onClick={() => {
              setCollapsedPrintings(allExpanded ? new Set(allPrintingKeys) : new Set());
            }}
          >
            {allExpanded ? "Collapse all" : "Expand all"}
          </Button>
        </div>
        {printings.map((printing) => {
          const printingId = printing.id as string;
          const printingLabel = printing.expectedPrintingId as string;
          const isExpanded = !collapsedPrintings.has(printingId);
          const allSources = candidatePrintings.filter((ps) => ps.printingId === printingId);
          const activeImage = printingImages.find(
            (pi) => pi.printingId === printingId && pi.isActive,
          );
          const printingWithImage = {
            ...printing,
            imageUrl: activeImage?.originalUrl ?? null,
          };

          const allChecked = allSources.every((ps) => ps.checkedAt);

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
                  <span>{printingLabel}</span>
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
                        `Delete printing "${printingLabel}"? This cannot be undone.`,
                      )
                    ) {
                      deletePrintingMutation.mutate(printingId);
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
                    printingLabel={printingLabel}
                    images={printingImages.filter((pi) => pi.printingId === printingId)}
                    providerSettings={providerSettings}
                    sourceImages={sourceImagesForSwitcher}
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
                            .filter((p) => (p.id as string) !== printingId)
                            .map((p) => ({
                              id: p.id as string,
                              label: p.expectedPrintingId as string,
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
                  size="sm"
                  variant="default"
                  disabled={linkPrintingSources.isPending}
                  onClick={() => {
                    for (const g of matchable) {
                      const pid = (
                        printings.find((p) => p.expectedPrintingId === g.expectedPrintingId) as {
                          id: string;
                        }
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

        {/* Ambiguous / new printing groups */}
        {ambiguousGroups.map((group) => (
          <NewPrintingGroupCard
            key={group.groupKey}
            group={group}
            existingPrintings={printings}
            promoTypes={promoTypes}
            providerLabels={sourceLabels}
            providerNames={sourceNames}
            providerSettings={providerSettings}
            setTotals={setTotals}
            isExpanded={!collapsedPrintings.has(group.groupKey)}
            onToggle={() => togglePrinting(group.groupKey)}
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
                    group.candidates.find((s) => s.externalId === externalId)?.candidateCardId ?? ""
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
    </div>
  );
}
