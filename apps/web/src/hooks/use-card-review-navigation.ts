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
  /** At least one card-level source is still unchecked. */
  cardSources: boolean;
  /** Accepted printings that still have an unchecked source. */
  printingIds: string[];
  /** Unchecked candidate ids, one entry per ambiguous group that has any. */
  extraCandidateIds: string[][];
}

/**
 * Collect the check-all targets for a review run: the card's own sources, the
 * sources under each accepted printing, and the candidates in each ambiguous
 * group. Groups stay separate from printings because they are checked by id
 * list rather than by printing id.
 *
 * @returns The targets, with empty collections when nothing is unchecked.
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
 * Search params carried through every navigation off the card detail page, so a
 * review run keeps its filters and the list page shows the same view on the way
 * back. Both `/admin/cards` and `/admin/cards/$cardSlug` accept all three.
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
  /** Card slug from the route, which is also the current review-run position. */
  identifier: string;
  /** The card detail payload; undefined while it loads. */
  detail?: AdminCardDetailResponse;
  /** Active set filter carried over from the list page. */
  setSlug?: string;
  /** The list page's status filter, when the visit started from one. */
  listStatus?: AdminCardListStatus;
  /** Source+language scope for the price filter; absent means all assignable buckets. */
  priceScope?: string;
  /** Triage is full-admin, so the run and its hotkey are gated on it. */
  isAdmin: boolean;
  /** Query keys the check-all mutations invalidate. */
  invalidates: readonly (readonly unknown[])[];
}

/**
 * Owns the review run on the admin card detail page: which card comes next,
 * the prev/next neighbours, the keyboard shortcuts that drive both, and the
 * check-all-then-advance orchestration.
 *
 * `checkAllCardSources` is returned rather than created again at the call site
 * so the Card Fields section button and a full run share one pending state.
 *
 * @returns Navigation callbacks, the neighbouring slugs, and the run state.
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

  // When a set filter is active, scope prev/next + check-all-and-next to cards
  // that have at least one accepted printing in that set — matching the list
  // page's filter so the navigation stays inside the set.
  const scopedCards = setSlug ? allCards.filter((c) => c.setSlugs.includes(setSlug)) : allCards;
  const scopedSlugs = setSlug ? new Set(scopedCards.map((c) => c.slug)) : null;
  const { fetchNext } = useNextUncheckedCard(identifier, scopedSlugs);

  // The prices-to-assign filter composes with the set scope: prev/next then
  // only visits cards that still have unassigned products in the active scope.
  // The corpus query stays subscribed rather than read once, and the
  // marketplace section invalidates it after every assignment, so a card drops
  // out of the run the moment its last staged product is bound.
  const priceFilterActive = listStatus === "prices-to-assign";
  const { data: unifiedMappings } = useUnifiedMappingsWhen(isAdmin && priceFilterActive);
  const activePriceScope = priceFilterActive ? (priceScope ?? ALL_ASSIGNABLE_SCOPE) : null;
  const assignBucketsBySlug = unifiedMappings
    ? buildPriceAssignBucketsBySlug(unifiedMappings.groups)
    : null;

  // Same idea for the new-printings filter, over the list corpus rather than
  // the marketplace one. The query stays subscribed, so accepting a card's last
  // candidate printing drops it from the run once the list is invalidated.
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

  // Position is resolved in the full set-scoped ordering, then the nearest
  // matching card is found by scanning outward — so the buttons keep working
  // after this card itself falls out of the filter. Until the corpus data
  // lands, the filter's slug set is null and this falls back to plain
  // neighbours instead of flickering the buttons disabled.
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
