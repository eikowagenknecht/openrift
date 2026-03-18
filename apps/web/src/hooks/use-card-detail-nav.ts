import type { Printing } from "@openrift/shared";
import { useEffect, useState } from "react";

export function useCardDetailNav(sortedCards: Printing[], view: string) {
  const [selectedCard, setSelectedCard] = useState<Printing | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  // Lock body scroll when mobile overlay is active
  useEffect(() => {
    if (!detailOpen) {
      return;
    }
    const mq = globalThis.matchMedia("(max-width: 767px)");
    if (!mq.matches) {
      return;
    }
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, [detailOpen]);

  const closeDetail = () => {
    setSelectedCard(null);
    setDetailOpen(false);
  };

  // Close card detail when the user presses the browser back button on mobile
  useEffect(() => {
    if (!detailOpen) {
      return;
    }
    const mq = globalThis.matchMedia("(max-width: 767px)");
    if (!mq.matches) {
      return;
    }

    history.pushState({ cardDetail: true }, "");

    globalThis.addEventListener("popstate", closeDetail);
    return () => globalThis.removeEventListener("popstate", closeDetail);
  }, [detailOpen]);

  const handleCardClick = (printing: Printing) => {
    setSelectedCard(printing);
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

  const selectedIndex = selectedCard
    ? view === "cards"
      ? sortedCards.findIndex((c) => c.card.id === selectedCard.card.id)
      : sortedCards.findIndex((c) => c.id === selectedCard.id)
    : -1;

  const handlePrevCard =
    selectedIndex > 0 ? () => setSelectedCard(sortedCards[selectedIndex - 1]) : undefined;

  const handleNextCard =
    selectedIndex >= 0 && selectedIndex < sortedCards.length - 1
      ? () => setSelectedCard(sortedCards[selectedIndex + 1])
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
