import { useNavigate } from "@tanstack/react-router";
import type { Dispatch, ReactNode, SetStateAction } from "react";
import { createContext, use, useEffect, useRef, useState } from "react";

import { Pressable } from "@/components/ui/pressable";
import { CardDetailOverlay } from "@/features/cards/components/card-detail-overlay";
import { cn } from "@/lib/utils";
import { useDisplayStore } from "@/stores/display-store";

interface OpenCardDetail {
  printingId: string;
  sequence: string[];
}

/** Carries only the setter, never the open state. */
const OpenCardDetailContext = createContext<Dispatch<SetStateAction<OpenCardDetail | null>> | null>(
  null,
);

/**
 * The opener from the nearest {@link CardDetailOverlayProvider}, or null when
 * there is none.
 */
export function useOpenCardDetail(): Dispatch<SetStateAction<OpenCardDetail | null>> | null {
  return use(OpenCardDetailContext);
}

/**
 * Mounts a card detail overlay for a surface that has no card grid, and hands
 * its opener to every row below through context.
 */
export function CardDetailOverlayProvider({
  children,
  onOpenChange,
}: {
  children: ReactNode;
  /** Reported on the open/close edge only; stepping prev/next is not a close and reopen. */
  onOpenChange?: (open: boolean) => void;
}) {
  const [openCard, setOpenCard] = useState<OpenCardDetail | null>(null);
  const showImages = useDisplayStore((state) => state.showImages);
  const navigate = useNavigate();

  const detailOpen = openCard !== null;
  const reportedOpenRef = useRef(detailOpen);
  useEffect(() => {
    if (reportedOpenRef.current === detailOpen) {
      return;
    }
    reportedOpenRef.current = detailOpen;
    onOpenChange?.(detailOpen);
  }, [detailOpen, onOpenChange]);

  const handleSearchAndClose = (query: string) => {
    setOpenCard(null);
    void navigate({ to: "/cards", search: { search: query } });
  };

  const handleOpenPrintingIdChange = (printingId: string | null) => {
    setOpenCard((current) =>
      printingId === null || current === null ? null : { ...current, printingId },
    );
  };

  return (
    // setOpenCard's identity is stable; wrapping it would invalidate the context on every render.
    <OpenCardDetailContext value={setOpenCard}>
      {children}
      <CardDetailOverlay
        printingIds={openCard?.sequence ?? []}
        openPrintingId={openCard?.printingId ?? null}
        onOpenPrintingIdChange={handleOpenPrintingIdChange}
        showImages={showImages}
        onSearchAndClose={handleSearchAndClose}
        historyKey="cardDetail"
      />
    </OpenCardDetailContext>
  );
}

/**
 * A card's name on a row, opening its detail when clicked. Falls back to plain
 * text when there is no {@link CardDetailOverlayProvider} above it, or when the
 * row's printing is not in the catalog.
 */
export function CardDetailNameButton({
  printingId,
  sequence,
  className,
  children,
}: {
  printingId?: string;
  sequence?: string[];
  className?: string;
  children: ReactNode;
}) {
  const openCardDetail = useOpenCardDetail();

  if (!openCardDetail || printingId === undefined) {
    return <span className={className}>{children}</span>;
  }

  return (
    <Pressable
      className={cn("hover:text-primary transition-colors", className)}
      onClick={() => openCardDetail({ printingId, sequence: sequence ?? [] })}
    >
      {children}
    </Pressable>
  );
}
