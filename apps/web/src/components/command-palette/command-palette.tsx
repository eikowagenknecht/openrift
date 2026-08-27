import { CatchBoundary, useNavigate } from "@tanstack/react-router";
import { lazy, Suspense, useState } from "react";

import {
  GlobalPaletteError,
  GlobalPaletteFallback,
} from "@/components/command-palette/global-palette-fallback";
import { PaletteFrame } from "@/components/command-palette/palette-frame";
import type { LockedFeatureKey } from "@/components/layout/nav-items";
import { SignInRequiredDialog } from "@/components/layout/nav-items";
import { useCommandPaletteShortcuts } from "@/hooks/use-command-palette";
import { useCommandPaletteStore } from "@/stores/command-palette-store";
import { useDisplayStore } from "@/stores/display-store";

// Lazy on purpose. This module is imported by value from `routes/_app.tsx`, so
// whatever it pulls in statically lands in the layout chunk every app page
// loads — and the palette's dependencies are cmdk plus the card-browser
// modules, which /rules and /help have no other use for. Both components below
// render nothing until they are wanted, so deferring the code costs one chunk
// fetch on first open and nothing else.
const GlobalPaletteBody = lazy(async () => {
  const m = await import("@/components/command-palette/global-palette-body");
  return { default: m.GlobalPaletteBody };
});
const CardDetailOverlay = lazy(async () => {
  const m = await import("@/components/cards/card-detail-overlay");
  return { default: m.CardDetailOverlay };
});

/** The open card detail, and the result list its prev/next steps through. */
interface OpenCard {
  printingId: string;
  sequence: string[];
}

/**
 * The app-wide command palette, mounted once by the layout.
 *
 * Closed it is a keydown listener and nothing else — no catalog, no search
 * index, and none of their code — which is what lets it live on every route
 * including the ones that never load cards.
 *
 * The card detail and the sign-in prompt are mounted here rather than inside
 * the palette body on purpose: both outlive the palette, which steps aside for
 * either of them. Dismissing a card detail brings the palette back with its
 * query intact, so looking a card up mid-search costs nothing.
 *
 * @returns The palette, its detail overlay, and the locked-feature prompt.
 */
export function CommandPalette() {
  useCommandPaletteShortcuts();
  const open = useCommandPaletteStore((state) => state.open);
  const closePalette = useCommandPaletteStore((state) => state.closePalette);
  const openPalette = useCommandPaletteStore((state) => state.openPalette);
  const navigate = useNavigate();
  const showImages = useDisplayStore((state) => state.showImages);
  const [openCard, setOpenCard] = useState<OpenCard | null>(null);
  const [lockedFeature, setLockedFeature] = useState<LockedFeatureKey | null>(null);

  // Stepping prev/next moves inside the sequence the detail was opened with, so
  // the result list survives; only closing drops it. Closing also brings the
  // palette back, since that is where the detail was opened from and the query
  // that found it is still in the store.
  const handleOpenPrintingIdChange = (printingId: string | null) => {
    if (printingId === null) {
      setOpenCard(null);
      openPalette();
      return;
    }
    setOpenCard((current) => (current === null ? null : { ...current, printingId }));
  };

  // A tag or keyword chip in the detail has nothing to filter here, so it hands
  // the query to the catalog and closes behind itself. This one does not come
  // back to the palette: the chip asked to go somewhere.
  const handleSearchAndClose = (query: string) => {
    setOpenCard(null);
    closePalette();
    void navigate({ to: "/cards", search: { search: query } });
  };

  return (
    <>
      <PaletteFrame
        open={open}
        onOpenChange={(next) => {
          if (!next) {
            closePalette();
          }
        }}
        title="Search OpenRift"
      >
        {/* The catalog read suspends, so a failed fetch throws. Without this it
            escapes to the route's error component, and a bad connection turns
            opening the palette into losing the page. The frame unmounts its
            children on close, so closing and reopening is the retry and the
            reset key never has to change. */}
        <CatchBoundary getResetKey={() => "palette"} errorComponent={GlobalPaletteError}>
          <Suspense fallback={<GlobalPaletteFallback />}>
            <GlobalPaletteBody
              onOpenCard={(printingId, sequence) => setOpenCard({ printingId, sequence })}
              onLockedFeature={setLockedFeature}
            />
          </Suspense>
        </CatchBoundary>
      </PaletteFrame>

      {/* Mounted only once a card has been picked, so the lazy component does
          not fetch its chunk on every page just to render null. */}
      {openCard && (
        <Suspense fallback={null}>
          <CardDetailOverlay
            printingIds={openCard.sequence}
            openPrintingId={openCard.printingId}
            onOpenPrintingIdChange={handleOpenPrintingIdChange}
            showImages={showImages}
            onSearchAndClose={handleSearchAndClose}
            // Its own history flag: the palette is mounted app-wide, so on a
            // surface that already hosts a detail the two would read each
            // other's popstate entry as their own.
            historyKey="paletteCardDetail"
          />
        </Suspense>
      )}

      <SignInRequiredDialog
        featureKey={lockedFeature}
        onOpenChange={(dialogOpen) => {
          if (!dialogOpen) {
            setLockedFeature(null);
          }
        }}
      />
    </>
  );
}
