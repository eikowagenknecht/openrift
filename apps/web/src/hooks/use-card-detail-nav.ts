import type { Printing } from "@openrift/shared";
import { useEffect, useState } from "react";

import { useIsMobile } from "@/hooks/use-is-mobile";

export function useCardDetailNav(sortedCards: Printing[], view: string) {
  const [selectedCard, setSelectedCard] = useState<Printing | null>(null);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [detailOpen, setDetailOpen] = useState(false);
  const isMobile = useIsMobile();

  // Lock body scroll when mobile overlay is active
  useEffect(() => {
    if (!detailOpen || !isMobile) {
      return;
    }
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, [detailOpen, isMobile]);

  const closeDetail = () => {
    setSelectedCard(null);
    setSelectedIndex(-1);
    setDetailOpen(false);
  };

  // Close card detail when the user presses the browser back button on mobile
  useEffect(() => {
    if (!detailOpen || !isMobile) {
      return;
    }

    history.pushState({ cardDetail: true }, "");

    globalThis.addEventListener("popstate", closeDetail);
    return () => globalThis.removeEventListener("popstate", closeDetail);
  }, [detailOpen, isMobile]);

  const handleCardClick = (printing: Printing) => {
    const index =
      view === "cards"
        ? sortedCards.findIndex((c) => c.card.id === printing.card.id)
        : sortedCards.findIndex((c) => c.id === printing.id);
    setSelectedCard(printing);
    setSelectedIndex(index);
    setDetailOpen(true);
  };

  const handleDetailClose = () => {
    // If we pushed a history entry for mobile, pop it instead of leaving a
    // stale entry in the stack.
    if (history.state?.cardDetail) {
      history.back();
    } else {
      closeDetail();
    }
  };

  const handlePrevCard =
    selectedIndex > 0
      ? () => {
          const prev = sortedCards[selectedIndex - 1];
          setSelectedCard(prev);
          setSelectedIndex(selectedIndex - 1);
        }
      : undefined;

  const handleNextCard =
    selectedIndex >= 0 && selectedIndex < sortedCards.length - 1
      ? () => {
          const next = sortedCards[selectedIndex + 1];
          setSelectedCard(next);
          setSelectedIndex(selectedIndex + 1);
        }
      : undefined;

  return {
    selectedCard,
    setSelectedCard,
    detailOpen,
    handleCardClick,
    handleDetailClose,
    handlePrevCard,
    handleNextCard,
  };
}
