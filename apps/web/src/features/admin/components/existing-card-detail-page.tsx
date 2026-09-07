import { earliestRelease } from "@openrift/shared/set-release";
import type {
  AdminCardDetailResponse,
  AdminMarketplaceName,
  AdminPrintingResponse,
} from "@openrift/shared/types/api/admin";
import { ArrowRightIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { Heading } from "@/components/heading";
import { Button } from "@/components/ui/button";
import { ExpandToggle } from "@/components/ui/expand-toggle";
import { Skeleton } from "@/components/ui/skeleton";
import { AdminCardMarketplaceSection } from "@/features/admin/components/admin-card-marketplace-section";
import { CardDetailHeader } from "@/features/admin/components/card-detail-header";
import {
  buildSourceLabels,
  useCardDetailData,
} from "@/features/admin/components/card-detail-shared";
import { CardFieldsSection } from "@/features/admin/components/card-fields-section";
import { NewPrintingGroupCard } from "@/features/admin/components/new-printing-group-card";
import {
  PrintingFilterBar,
  usePrintingFilters,
} from "@/features/admin/components/printing-filter-bar";
import { PrintingReviewCard } from "@/features/admin/components/printing-review-card";
import { useAdminAccess } from "@/features/admin/hooks/use-admin";
import {
  useAcceptPrintingGroup,
  useCopyCandidatePrinting,
  useDeleteCandidatePrinting,
  useLinkCandidatePrintings,
} from "@/features/admin/hooks/use-admin-card-mutations";
import type { AcceptPrintingBody } from "@/features/admin/hooks/use-admin-card-mutations";
import { useAdminCardDetail } from "@/features/admin/hooks/use-admin-card-queries";
import { useCardReviewNavigation } from "@/features/admin/hooks/use-card-review-navigation";
import type { AdminCardListStatus } from "@/features/admin/hooks/use-card-review-navigation";
import { buildPrintingGroups } from "@/features/admin/lib/candidate-printing-groups";
import {
  getCollapsedSections,
  getStoredCollapsedPrintings,
  useAdminCardFoldStore,
} from "@/features/admin/stores/admin-card-fold-store";
import { useSets } from "@/features/cards/hooks/use-sets";
import { useKeywordStyles } from "@/hooks/use-keyword-styles";
import { queryKeys } from "@/lib/query-keys";

/** Stable placeholder so the filter hook can run before the detail lands. */
const NO_PRINTINGS: AdminPrintingResponse[] = [];

/** Every printing and ambiguous-source group except the first printing, which stays open. */
function defaultCollapsedKeys(detail: AdminCardDetailResponse): string[] {
  const groups = buildPrintingGroups(detail.candidatePrintingGroups, detail.candidatePrintings);
  return [...detail.printings.slice(1).map((p) => p.id), ...groups.map((g) => g.groupKey)];
}

export function ExistingCardDetailPage({
  identifier,
  focusMarketplace,
  focusFinish,
  focusLanguage,
  setSlug,
  listStatus,
  priceScope,
}: {
  identifier: string;
  focusMarketplace?: AdminMarketplaceName;
  focusFinish?: string;
  focusLanguage?: string;
  setSlug?: string;
  listStatus?: AdminCardListStatus;
  priceScope?: string;
}) {
  const cardId = identifier;
  const { data: access } = useAdminAccess();
  // card-review grant holders keep the per-field accept flow and image finishing;
  // triage, printing create/delete, rename, bans, errata, and marketplace stay full-admin.
  const isAdmin = access?.isAdmin === true;

  // Only refetches this card's detail and the admin card list, not every query under `admin.cards`.
  const invalidateScope = [queryKeys.admin.cards.detail(cardId), queryKeys.admin.cards.list];

  const {
    data: existingData,
    isLoading,
    isError,
  } = useAdminCardDetail(identifier) as {
    data: AdminCardDetailResponse | undefined;
    isLoading: boolean;
    isError: boolean;
  };

  const { providerSettings, candidateCardFields, printingSourceFields, ignorePrintingSource } =
    useCardDetailData(invalidateScope);

  const acceptPrintingGroup = useAcceptPrintingGroup(invalidateScope);
  const copyPrintingSource = useCopyCandidatePrinting(invalidateScope);
  const deletePrintingSource = useDeleteCandidatePrinting(invalidateScope);
  const linkPrintingSources = useLinkCandidatePrintings(invalidateScope);
  const { data: setsData } = useSets();
  const keywordStyles = useKeywordStyles();

  const { prevNextCards, isCheckingAll, checkAllAndNext, goToCard, goToList, checkAllCardSources } =
    useCardReviewNavigation({
      identifier,
      detail: existingData,
      setSlug,
      listStatus,
      priceScope,
      isAdmin,
      invalidates: invalidateScope,
    });

  const storedCollapsedPrintings = useAdminCardFoldStore((state) =>
    getStoredCollapsedPrintings(state, cardId),
  );
  const collapsedSections = useAdminCardFoldStore((state) => getCollapsedSections(state));
  const togglePrintingFold = useAdminCardFoldStore((state) => state.togglePrinting);
  const expandPrintingFold = useAdminCardFoldStore((state) => state.expandPrinting);
  const setCollapsedForCard = useAdminCardFoldStore((state) => state.setCollapsedForCard);
  const initCollapsedForCard = useAdminCardFoldStore((state) => state.initCollapsedForCard);
  const toggleSection = useAdminCardFoldStore((state) => state.toggleSection);
  const cardFieldsExpanded = !collapsedSections.has("cardFields");
  const marketplaceExpanded = !collapsedSections.has("marketplace");
  const printingsExpanded = !collapsedSections.has("printings");
  const [showBanForm, setShowBanForm] = useState(false);
  const [showErrataForm, setShowErrataForm] = useState(false);
  // The ban and errata forms live inside the Card Fields section, so opening
  // one from the header menu has to unfold that section first.
  function expandCardFields() {
    if (!cardFieldsExpanded) {
      toggleSection("cardFields");
    }
  }
  const { filteredPrintings, filters } = usePrintingFilters(
    existingData?.printings ?? NO_PRINTINGS,
  );
  const pendingScrollTarget = useRef<string | null>(null);
  const focusHandledRef = useRef(false);

  // Seeding runs before the focus effects below, which reach into a seeded card
  // to open one row.
  useEffect(() => {
    if (!existingData) {
      return;
    }
    initCollapsedForCard(cardId, new Set(defaultCollapsedKeys(existingData)));
  }, [existingData, cardId, initCollapsedForCard]);

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
    expandPrintingFold(cardId, id);
    requestAnimationFrame(() => {
      document
        .querySelector(`[data-printing-id="${id}"]`)
        ?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  }, [existingData, cardId, expandPrintingFold]);

  // Cardmarket rows apply to all siblings, so any matching finish works there;
  // other marketplaces also require a language match.
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
    expandPrintingFold(cardId, match.id);
    requestAnimationFrame(() => {
      document
        .querySelector(`[data-printing-id="${match.id}"]`)
        ?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  }, [existingData, focusMarketplace, focusFinish, focusLanguage, cardId, expandPrintingFold]);

  if (isError) {
    return (
      <div className="space-y-2">
        <Heading level={2}>Card not found</Heading>
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

  const sources = existingData.sources;
  const candidatePrintings = existingData.candidatePrintings;
  const printings = existingData.printings;
  const printingImages = existingData.printingImages;
  const setTotals = existingData.setTotals ?? {};
  // Keyed both by set slug (earliest release, as a fallback) and by
  // `slug|LANGUAGE`, since a set reaches each language in its own year.
  const setReleaseYears: Record<string, number> = {};
  for (const set of setsData.sets) {
    for (const [language, release] of Object.entries(set.releases)) {
      if (release.releasedAt) {
        setReleaseYears[`${set.slug}|${language}`] = Number(release.releasedAt.slice(0, 4));
      }
    }
    const earliest = earliestRelease(set.releases);
    if (earliest?.releasedAt) {
      setReleaseYears[set.slug] = Number(earliest.releasedAt.slice(0, 4));
    }
  }
  const costKeywords = Object.entries(keywordStyles)
    .filter(([, entry]) => entry.costKeyword)
    .map(([name]) => name);
  const marketplaceMappings = existingData.marketplaceMappings ?? [];
  const expectedCardId = existingData.expectedCardId;
  const card = existingData.card;
  if (!card) {
    return (
      <div className="space-y-2">
        <Heading level={2}>Card not found</Heading>
        <p className="text-muted-foreground text-sm">
          No card data for &ldquo;{identifier}&rdquo;.
        </p>
      </div>
    );
  }
  const canonicalName = card.name;

  const {
    labels: sourceLabels,
    names: sourceNames,
    submitters: sourceSubmitters,
  } = buildSourceLabels(sources, canonicalName);

  const ambiguousGroups = buildPrintingGroups(
    existingData.candidatePrintingGroups,
    candidatePrintings,
  );

  const hasUnchecked =
    sources.some((s) => !s.checkedAt) || candidatePrintings.some((ps) => !ps.checkedAt);

  const allPrintingKeys = [
    ...printings.map((p) => p.id),
    ...ambiguousGroups.map((g) => g.groupKey),
  ];
  // Until the seeding effect lands, read the folds the card is about to get.
  const collapsedPrintings =
    storedCollapsedPrintings ?? new Set(defaultCollapsedKeys(existingData));
  const allExpanded =
    allPrintingKeys.length > 0 && allPrintingKeys.every((k) => !collapsedPrintings.has(k));

  return (
    <div className="space-y-6">
      <CardDetailHeader
        card={card}
        cardId={cardId}
        expectedCardId={expectedCardId}
        sourceCount={sources.length}
        hasUnchecked={hasUnchecked}
        prevNextCards={prevNextCards}
        isCheckingAll={isCheckingAll}
        onCheckAllAndNext={() => void checkAllAndNext()}
        goToCard={goToCard}
        goToList={goToList}
        onAddBan={() => {
          expandCardFields();
          setShowBanForm(true);
        }}
        onAddErrata={() => {
          expandCardFields();
          setShowErrataForm(true);
        }}
        isAdmin={isAdmin}
      />

      <CardFieldsSection
        card={card}
        sources={sources}
        candidateCardFields={candidateCardFields}
        providerSettings={providerSettings}
        expanded={cardFieldsExpanded}
        onToggleExpanded={() => toggleSection("cardFields")}
        onCheckAllSources={() => checkAllCardSources.mutate(card.id)}
        isCheckingAllSources={checkAllCardSources.isPending}
        showBanForm={showBanForm}
        onShowBanFormChange={setShowBanForm}
        showErrataForm={showErrataForm}
        onShowErrataFormChange={setShowErrataForm}
        invalidates={invalidateScope}
        isAdmin={isAdmin}
      />

      {/* The endpoint 403s for grant holders. */}
      {isAdmin && (
        <section className="space-y-3">
          <ExpandToggle
            expanded={marketplaceExpanded}
            className="hover:opacity-80"
            onClick={() => toggleSection("marketplace")}
          >
            <Heading level={3}>Marketplace</Heading>
          </ExpandToggle>
          {marketplaceExpanded && <AdminCardMarketplaceSection cardId={identifier} />}
        </section>
      )}

      <section className="space-y-3">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <ExpandToggle
            expanded={printingsExpanded}
            className="hover:opacity-80"
            onClick={() => toggleSection("printings")}
          >
            <Heading level={3}>Printings</Heading>
          </ExpandToggle>
          {printingsExpanded && (
            <Button
              variant="outline"
              onClick={() => {
                setCollapsedForCard(cardId, allExpanded ? new Set(allPrintingKeys) : new Set());
              }}
            >
              {allExpanded ? "Collapse all" : "Expand all"}
            </Button>
          )}
          {printingsExpanded && <PrintingFilterBar {...filters} />}
        </div>
        {printingsExpanded &&
          filteredPrintings.map((printing) => (
            <PrintingReviewCard
              key={printing.id}
              printing={printing}
              cardId={cardId}
              printings={printings}
              candidatePrintings={candidatePrintings}
              printingImages={printingImages}
              marketplaceMappings={marketplaceMappings}
              sourceLabels={sourceLabels}
              sourceNames={sourceNames}
              sourceSubmitters={sourceSubmitters}
              providerSettings={providerSettings}
              printingSourceFields={printingSourceFields}
              setTotals={setTotals}
              costKeywords={costKeywords}
              invalidates={invalidateScope}
              defaultExpanded={printing.id === printings[0]?.id}
              isAdmin={isAdmin}
            />
          ))}

        {isAdmin &&
          printingsExpanded &&
          ambiguousGroups.length > 0 &&
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

        {printingsExpanded &&
          ambiguousGroups.map((group) => (
            <NewPrintingGroupCard
              key={group.groupKey}
              group={group}
              existingPrintings={printings}
              providerLabels={sourceLabels}
              providerNames={sourceNames}
              providerSubmitters={sourceSubmitters}
              providerSettings={providerSettings}
              setTotals={setTotals}
              setReleaseYears={setReleaseYears}
              isExpanded={!collapsedPrintings.has(group.groupKey)}
              onToggle={() => togglePrintingFold(cardId, group.groupKey)}
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
              costKeywords={costKeywords}
              invalidates={invalidateScope}
              isAdmin={isAdmin}
            />
          ))}
      </section>
    </div>
  );
}
