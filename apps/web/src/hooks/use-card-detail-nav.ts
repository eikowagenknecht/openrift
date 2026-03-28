import type { Printing } from "@openrift/shared";
import { useEffect, useState } from "react";

import type { CardViewerItem } from "@/components/card-viewer-types";
import { useIsMobile } from "@/hooks/use-is-mobile";

/**
 * Manages detail-pane navigation state for a list of card viewer items.
 * @returns Selected card, detail open/close handlers, and prev/next navigation.
 */
export function useCardDetailNav(
  items: CardViewerItem[],
  findBy: "card" | "printing" = "printing",
) {
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
      findBy === "card"
        ? items.findIndex((item) => item.printing.card.id === printing.card.id)
        : items.findIndex((item) => item.printing.id === printing.id);
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
          const prev = items[selectedIndex - 1].printing;
          setSelectedCard(prev);
          setSelectedIndex(selectedIndex - 1);
        }
      : undefined;

  const handleNextCard =
    selectedIndex >= 0 && selectedIndex < items.length - 1
      ? () => {
          const next = items[selectedIndex + 1].printing;
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
