import { useNavigate } from "@tanstack/react-router";
import type { Dispatch, ReactNode, SetStateAction } from "react";
import { createContext, use, useState } from "react";

import { CardDetailOverlay } from "@/components/cards/card-detail-overlay";
import { Pressable } from "@/components/ui/pressable";
import { cn } from "@/lib/utils";
import { useDisplayStore } from "@/stores/display-store";

/** A row's detail, and the sequence the overlay's prev/next steps through. */
interface OpenCardDetail {
  printingId: string;
  /**
   * The host list's printing ids, in the order they are listed. Empty for a row
   * opened on its own, which leaves prev/next and the position label out.
   */
  sequence: string[];
}

/**
 * Opens the card detail for a printing. The context carries only this callback
 * — never the open printing itself — so a row subscribing to it re-renders on
 * nothing, and a list of them stays memoized while the detail opens and closes.
 */
const OpenCardDetailContext = createContext<Dispatch<SetStateAction<OpenCardDetail | null>> | null>(
  null,
);

/**
 * The opener from the nearest {@link CardDetailOverlayProvider}, or null when
 * there is none. Null is a normal answer: a row component shared between a
 * wrapped surface and an unwrapped one renders its card name as plain text
 * there rather than as a control that does nothing.
 * @returns The opener, or null outside a provider.
 */
function useOpenCardDetail(): Dispatch<SetStateAction<OpenCardDetail | null>> | null {
  return use(OpenCardDetailContext);
}

/**
 * Mounts a card detail overlay for a surface that has no card grid — a page of
 * rows, where a card is named rather than shown — and hands its opener to every
 * row below through context, so the surface never threads a callback down its
 * component tree.
 *
 * This is deliberately not the global selection store the card browsers use:
 * with no grid there is no docked pane, so `SelectionDetailModal` would stand
 * down for anyone whose pane preference is docked and leave the click dead.
 *
 * Each row names its own prev/next sequence rather than the surface naming one
 * for the whole page: these surfaces stack several lists (a block per member,
 * per lifecycle bucket), so page order is not a sequence anyone would predict,
 * while the rows inside one block are. A row that passes none opens on its own,
 * with no stepping and no position label.
 * @returns The provider tree wrapping `children`, plus the overlay.
 */
export function CardDetailOverlayProvider({ children }: { children: ReactNode }) {
  const [openCard, setOpenCard] = useState<OpenCardDetail | null>(null);
  const showImages = useDisplayStore((state) => state.showImages);
  const navigate = useNavigate();

  // Tag and keyword chips in the detail have nothing to filter on a page of
  // trade rows, so they hand the query to the catalog and close behind
  // themselves.
  const handleSearchAndClose = (query: string) => {
    setOpenCard(null);
    void navigate({ to: "/cards", search: { search: query } });
  };

  // Stepping moves to another row of the same sequence, so the list the detail
  // was opened with survives prev/next. Only closing drops it.
  const handleOpenPrintingIdChange = (printingId: string | null) => {
    setOpenCard((current) =>
      printingId === null || current === null ? null : { ...current, printingId },
    );
  };

  return (
    // The raw setter is the context value on purpose: React guarantees its
    // identity, so opening the detail never invalidates the context for the
    // rows below. A wrapper would be a fresh function each render.
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
 * row's printing is not in the catalog — in both cases there is nothing to
 * open, and a control that does nothing is worse than a label.
 * @returns The card name, as a button or as plain text.
 */
export function CardDetailNameButton({
  printingId,
  sequence,
  className,
  children,
}: {
  /** The printing to open. Undefined when the row's printing is unknown. */
  printingId?: string;
  /**
   * The printing ids of the list this row belongs to, in the order they are
   * listed, which the detail's prev/next then steps through. Leave undefined
   * where a row stands on its own.
   */
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
