import type {
  AdminCardDetailResponse,
  AdminPrintingResponse,
  CandidateCardResponse,
  CandidatePrintingResponse,
} from "@openrift/shared";
import { useHotkey } from "@tanstack/react-hotkeys";
import { useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { buildPrintingGroups } from "@/components/admin/card-detail-shared";
import {
  useCheckAllCandidateCards,
  useCheckAllCandidatePrintings,
} from "@/hooks/use-admin-card-mutations";
import {
  useAdminCardListWhen,
  useAllCards,
  useNextUncheckedCard,
} from "@/hooks/use-admin-card-queries";
import { useUnifiedMappingsWhen } from "@/hooks/use-unified-mappings";
import { selectAdminCardPrevNext } from "@/lib/admin-card-nav";
import type { PrevNextSlugs } from "@/lib/admin-card-nav";
import { ALL_ASSIGNABLE_SCOPE, buildPriceAssignBucketsBySlug } from "@/lib/marketplace-coverage";

/** Everything one "Check all & next" run has to mark as checked. */
export interface ReviewCheckTargets {
  cardSources: boolean;
  printingIds: string[];
  extraCandidateIds: string[][];
}

/**
 * Collect the check-all targets for a review run. Groups stay separate from
 * printings because they are checked by id list, not by printing id.
 */
export function collectReviewCheckTargets(
  sources: readonly CandidateCardResponse[],
  printings: readonly AdminPrintingResponse[],
  candidatePrintings: readonly CandidatePrintingResponse[],
  ambiguousGroups: readonly { candidates: readonly CandidatePrintingResponse[] }[],
): ReviewCheckTargets {
  const printingIds: string[] = [];
  for (const printing of printings) {
    const relatedSources = candidatePrintings.filter((ps) => ps.printingId === printing.id);
    if (relatedSources.some((ps) => !ps.checkedAt)) {
      printingIds.push(printing.id);
    }
  }

  const extraCandidateIds: string[][] = [];
  for (const group of ambiguousGroups) {
    const uncheckedIds = group.candidates.filter((s) => !s.checkedAt).map((s) => s.id);
    if (uncheckedIds.length > 0) {
      extraCandidateIds.push(uncheckedIds);
    }
  }

  return {
    cardSources: sources.some((s) => !s.checkedAt),
    printingIds,
    extraCandidateIds,
  };
}

/**
 * Search params carried through every navigation off the card detail page, so
 * a review run keeps its filters and the list page matches on the way back.
 */
interface CardReviewNavSearch {
  set?: string;
  status?: AdminCardListStatus;
  priceScope?: string;
}

/**
 * List-page status filters that also narrow prev/next here. "unchecked" is not
 * one of them — it has its own flow through "Check all & next".
 */
export type AdminCardListStatus = "prices-to-assign" | "new-printings";

interface UseCardReviewNavigationOptions {
  identifier: string;
  detail?: AdminCardDetailResponse;
  setSlug?: string;
  listStatus?: AdminCardListStatus;
  priceScope?: string;
  isAdmin: boolean;
  invalidates: readonly (readonly unknown[])[];
}

/**
 * The Card Fields section button and a full run must share the same
 * `checkAllCardSources` instance to share one pending state.
 */
export function useCardReviewNavigation({
  identifier,
  detail,
  setSlug,
  listStatus,
  priceScope,
  isAdmin,
  invalidates,
}: UseCardReviewNavigationOptions) {
  const navigate = useNavigate();
  const { data: allCards } = useAllCards();
  const checkAllCardSources = useCheckAllCandidateCards();
  const checkAllCandidatePrintings = useCheckAllCandidatePrintings(invalidates);

  // Scoped to match the list page's set filter, so navigation stays inside the set.
  const scopedCards = setSlug ? allCards.filter((c) => c.setSlugs.includes(setSlug)) : allCards;
  const scopedSlugs = setSlug ? new Set(scopedCards.map((c) => c.slug)) : null;
  const { fetchNext } = useNextUncheckedCard(identifier, scopedSlugs);

  // Stays subscribed (not read once): the marketplace section invalidates this
  // query after every assignment, dropping a card once its last product is bound.
  const priceFilterActive = listStatus === "prices-to-assign";
  const { data: unifiedMappings } = useUnifiedMappingsWhen(isAdmin && priceFilterActive);
  const activePriceScope = priceFilterActive ? (priceScope ?? ALL_ASSIGNABLE_SCOPE) : null;
  const assignBucketsBySlug = unifiedMappings
    ? buildPriceAssignBucketsBySlug(unifiedMappings.groups)
    : null;

  // Same idea over the list corpus: stays subscribed, so accepting a card's
  // last candidate printing drops it once the list is invalidated.
  const newPrintingsFilterActive = listStatus === "new-printings";
  const { data: cardList } = useAdminCardListWhen(newPrintingsFilterActive);
  const newPrintingSlugs =
    newPrintingsFilterActive && cardList
      ? new Set(
          cardList
            .filter((row) => row.cardSlug !== null && row.unlinkedPrintingCount > 0)
            .map((row) => row.cardSlug as string),
        )
      : null;

  // Nearest matching card is found by scanning outward from the full ordering,
  // so the buttons keep working after this card itself falls out of the filter.
  const prevNextCards: PrevNextSlugs = selectAdminCardPrevNext(
    scopedCards.map((c) => c.slug),
    identifier,
    { priceScope: activePriceScope, assignBucketsBySlug, newPrintingSlugs },
  );

  const navSearch: CardReviewNavSearch = {
    ...(setSlug ? { set: setSlug } : {}),
    ...(listStatus ? { status: listStatus } : {}),
    ...(priceFilterActive && priceScope ? { priceScope } : {}),
  };

  function goToCard(cardSlug: string) {
    void navigate({ to: "/admin/cards/$cardSlug", params: { cardSlug }, search: navSearch });
  }

  function goToList() {
    void navigate({ to: "/admin/cards", search: navSearch });
  }

  const [isCheckingAll, setIsCheckingAll] = useState(false);

  async function runCheckAllAndNext() {
    if (isCheckingAll || !detail) {
      return;
    }
    const card = detail.card;
    if (!card) {
      return;
    }
    const targets = collectReviewCheckTargets(
      detail.sources,
      detail.printings,
      detail.candidatePrintings,
      buildPrintingGroups(detail.candidatePrintingGroups, detail.candidatePrintings),
    );

    // Kick off the mutations outside the try so react-compiler doesn't flag the
    // for-of value blocks inside a try/catch statement.
    const promises: Promise<unknown>[] = [];
    if (targets.cardSources) {
      promises.push(checkAllCardSources.mutateAsync(card.id));
    }
    for (const printingId of targets.printingIds) {
      promises.push(checkAllCandidatePrintings.mutateAsync({ printingId }));
    }
    for (const extraIds of targets.extraCandidateIds) {
      promises.push(checkAllCandidatePrintings.mutateAsync({ extraIds }));
    }

    setIsCheckingAll(true);
    try {
      await Promise.all(promises);

      const nextSlug = await fetchNext();
      if (nextSlug) {
        goToCard(nextSlug);
      } else {
        toast.success("All cards reviewed!");
        goToList();
      }
    } catch (error) {
      setIsCheckingAll(false);
      throw error;
    }
    setIsCheckingAll(false);
  }

  // oxlint-disable-next-line no-empty-function -- default no-op until the effect below installs the real handler
  const checkAllAndNextRef = useRef<() => void>(() => {});
  // oxlint-disable-next-line no-empty-function -- default no-op until the effect below installs the real handler
  const prevNextRef = useRef<(dir: "prev" | "next") => void>(() => {});
  useHotkey("Mod+Shift+Enter", () => checkAllAndNextRef.current(), {
    enabled: !isCheckingAll && isAdmin,
  });
  useHotkey("Mod+ArrowLeft", () => prevNextRef.current("prev"));
  useHotkey("Mod+ArrowRight", () => prevNextRef.current("next"));

  // Re-point the ref-backed hotkey handlers every render, in effects (react-compiler
  // forbids ref mutation during render).
  useEffect(() => {
    checkAllAndNextRef.current = () => void runCheckAllAndNext();
  });
  // Same selection as the < / > buttons — both read `prevNextCards`, so the
  // hotkeys can never drift from what the buttons do.
  useEffect(() => {
    prevNextRef.current = (dir) => {
      const slug = dir === "prev" ? prevNextCards.prev : prevNextCards.next;
      if (!slug) {
        return;
      }
      goToCard(slug);
    };
  });

  return {
    prevNextCards,
    isCheckingAll,
    /** Rejects if a check mutation fails, after clearing the run state. */
    checkAllAndNext: runCheckAllAndNext,
    goToCard,
    goToList,
    checkAllCardSources,
  };
}
