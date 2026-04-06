import type { CandidateCardResponse, UnmatchedCardDetailResponse } from "@openrift/shared";
import { useNavigate } from "@tanstack/react-router";
import {
  ArrowRightIcon,
  BanIcon,
  CopyCheckIcon,
  EllipsisVerticalIcon,
  LinkIcon,
  PlusIcon,
} from "lucide-react";
import { useState } from "react";

import {
  CANDIDATE_CARD_FIELDS,
  CandidateSpreadsheet,
} from "@/components/admin/candidate-spreadsheet";
import {
  buildPrintingGroups,
  buildSourceLabels,
  useCardDetailData,
} from "@/components/admin/card-detail-shared";
import type { CardSearchResult } from "@/components/admin/card-search-dropdown";
import { CardSearchDropdown } from "@/components/admin/card-search-dropdown";
import { GroupImagePreview } from "@/components/admin/image-preview";
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
import type { AcceptNewCardBody } from "@/hooks/use-admin-card-mutations";
import {
  useAcceptNewCard,
  useLinkCard,
  useReassignCandidatePrinting,
} from "@/hooks/use-admin-card-mutations";
import { useAllCards, useUnmatchedCardDetail } from "@/hooks/use-admin-card-queries";

export function NewCardDetailPage({ identifier }: { identifier: string }) {
  const navigate = useNavigate();

  // --- Data fetching ---
  const { data: unmatchedData, isLoading } = useUnmatchedCardDetail(identifier) as {
    data: UnmatchedCardDetailResponse | undefined;
    isLoading: boolean;
  };

  // --- Shared hooks ---
  const {
    providerSettings,
    printingSourceFields,
    checkCandidateCard,
    uncheckCandidateCard,
    checkPrintingSource,
    uncheckPrintingSource,
    ignoreCardSource,
  } = useCardDetailData();

  // --- New-mode hooks ---
  const acceptNewCard = useAcceptNewCard();
  const linkCard = useLinkCard();
  const reassignPrinting = useReassignCandidatePrinting();
  const { data: allCards } = useAllCards();

  // --- State ---
  const [activeCard, setActiveCard] = useState<Record<string, unknown>>({});
  const [newCardId, setNewCardId] = useState<string | null>(null);
  const [linkCardId, setLinkCardId] = useState("");
  const [linkSearch, setLinkSearch] = useState("");

  // --- Loading state ---
  if (isLoading || !unmatchedData) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-64" />
      </div>
    );
  }

  // --- Resolved data ---
  const sources = unmatchedData.sources;
  const candidatePrintings = unmatchedData.candidatePrintings;
  const defaultCardId = unmatchedData.defaultCardId;
  const newModeCardId = newCardId ?? defaultCardId;
  const hasRequiredFields = activeCard.name && activeCard.type && activeCard.domains;

  const { labels: sourceLabels, names: sourceNames } = buildSourceLabels(sources);

  // Build printing groups
  const groups = buildPrintingGroups(unmatchedData.candidatePrintingGroups, candidatePrintings);

  // Card search results for linking
  const cardSearchResults: CardSearchResult[] =
    allCards && linkSearch.length >= 2
      ? allCards
          .filter((c) => c.name.toLowerCase().includes(linkSearch.toLowerCase()))
          .slice(0, 20)
          .map((c) => ({ id: c.id, label: c.name, sublabel: c.slug, detail: c.type }))
      : [];

  function handleAcceptAsNew() {
    if (!hasRequiredFields || !newModeCardId.trim()) {
      return;
    }
    const id = newModeCardId.trim();
    acceptNewCard.mutate(
      {
        name: identifier,
        cardFields: { id, ...activeCard } as AcceptNewCardBody["cardFields"],
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
    const targetSlug = allCards?.find((c) => c.id === targetId)?.slug ?? targetId;
    linkCard.mutate(
      { name: identifier, cardId: targetId },
      {
        onSuccess: () => {
          void navigate({ to: "/admin/cards/$cardSlug", params: { cardSlug: targetSlug } });
        },
      },
    );
  }

  return (
    <div className="space-y-6">
      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div>
        <h2 className="text-lg font-semibold">{unmatchedData.displayName}</h2>
        <p className="text-muted-foreground text-sm">
          Candidate card ({sources.length} source
          {sources.length === 1 ? "" : "s"})
        </p>
      </div>

      {/* ── Link / Accept bar ────────────────────────────────────────────────── */}
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
          <p className="text-muted-foreground">Select name, type, and domains first.</p>
        )}
      </section>

      {/* ── Card Fields ────────────────────────────────────────────────────── */}
      <section className="space-y-2">
        <h3 className="font-medium">Card Fields</h3>
        <p className="text-muted-foreground text-sm">
          Click a cell to select it for the new card. The Active column shows your selections.
        </p>
        <CandidateSpreadsheet
          fields={CANDIDATE_CARD_FIELDS}
          requiredKeys={["shortCode", "name", "type", "domains"]}
          activeRow={Object.keys(activeCard).length > 0 ? activeCard : null}
          candidateRows={sources}
          providerSettings={providerSettings}
          onCellClick={(field, value) => {
            setActiveCard((prev) => ({ ...prev, [field]: value }));
          }}
          onActiveChange={(field, value) => {
            setActiveCard((prev) =>
              value === null || value === undefined
                ? Object.fromEntries(Object.entries(prev).filter(([k]) => k !== field))
                : { ...prev, [field]: value },
            );
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
          )}
        />
      </section>

      {/* ── Printings ──────────────────────────────────────────────────────── */}
      <section className="space-y-3">
        <h3 className="font-medium">Printings</h3>
        {groups.map((group) => {
          const guessedId = group.expectedPrintingId;

          return (
            <div key={group.groupKey} className="rounded-md border border-dashed">
              <div className="flex items-center justify-between px-3 py-2">
                <span className="text-sm font-medium">
                  {guessedId} ({group.candidates.length} source
                  {group.candidates.length === 1 ? "" : "s"})
                </span>
                {groups.length > 1 && (
                  <DropdownMenu>
                    <DropdownMenuTrigger
                      render={<Button variant="ghost" size="icon" className="shrink-0" />}
                    >
                      <EllipsisVerticalIcon className="size-3.5" />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-max">
                      {groups
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
    </div>
  );
}
