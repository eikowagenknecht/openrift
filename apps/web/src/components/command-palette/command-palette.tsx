import { CatchBoundary, useNavigate } from "@tanstack/react-router";
import { lazy, Suspense, useState } from "react";

import {
  GlobalPaletteError,
  GlobalPaletteFallback,
} from "@/components/command-palette/global-palette-fallback";
import { PaletteFrame } from "@/components/command-palette/palette-frame";
import { SignInRequiredDialog } from "@/components/layout/nav-items";
import { useCommandPaletteShortcuts } from "@/hooks/use-command-palette";
import type { LockedFeatureKey } from "@/lib/nav-items";
import { useCommandPaletteStore } from "@/stores/command-palette-store";
import { useDisplayStore } from "@/stores/display-store";

// Imported by value from routes/_app.tsx, so anything pulled in statically
// here lands in every app page's layout chunk. Keep lazy.
const GlobalPaletteBody = lazy(async () => {
  const m = await import("@/components/command-palette/global-palette-body");
  return { default: m.GlobalPaletteBody };
});
const CardDetailOverlay = lazy(async () => {
  const m = await import("@/features/cards/components/card-detail-overlay");
  return { default: m.CardDetailOverlay };
});

interface OpenCard {
  printingId: string;
  sequence: string[];
}

export function CommandPalette() {
  useCommandPaletteShortcuts();
  const open = useCommandPaletteStore((state) => state.open);
  const closePalette = useCommandPaletteStore((state) => state.closePalette);
  const openPalette = useCommandPaletteStore((state) => state.openPalette);
  const navigate = useNavigate();
  const showImages = useDisplayStore((state) => state.showImages);
  const [openCard, setOpenCard] = useState<OpenCard | null>(null);
  const [lockedFeature, setLockedFeature] = useState<LockedFeatureKey | null>(null);

  const handleOpenPrintingIdChange = (printingId: string | null) => {
    if (printingId === null) {
      setOpenCard(null);
      openPalette();
      return;
    }
    setOpenCard((current) => (current === null ? null : { ...current, printingId }));
  };

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
        {/* Catches the suspended catalog read's throw on a failed fetch, or it
            escapes to the route's error component. */}
        <CatchBoundary getResetKey={() => "palette"} errorComponent={GlobalPaletteError}>
          <Suspense fallback={<GlobalPaletteFallback />}>
            <GlobalPaletteBody
              onOpenCard={(printingId, sequence) => setOpenCard({ printingId, sequence })}
              onLockedFeature={setLockedFeature}
            />
          </Suspense>
        </CatchBoundary>
      </PaletteFrame>

      {openCard && (
        <Suspense fallback={null}>
          <CardDetailOverlay
            printingIds={openCard.sequence}
            openPrintingId={openCard.printingId}
            onOpenPrintingIdChange={handleOpenPrintingIdChange}
            showImages={showImages}
            onSearchAndClose={handleSearchAndClose}
            // historyKey must be unique across detail overlays: two overlays sharing one collide on the same popstate entry.
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
