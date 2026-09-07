import { createLazyFileRoute } from "@tanstack/react-router";

import { useCards } from "@/features/cards/hooks/use-cards";
import { OverlayFrame } from "@/features/stage/components/overlay-frame";
import { useOverlayState } from "@/features/stage/hooks/use-overlay";
import { deriveOverlayBoardScene } from "@/features/stage/lib/overlay-board-scene";
import { useHydrated } from "@/hooks/use-hydrated";

export const Route = createLazyFileRoute("/stage_/source/$token")({
  component: OverlaySourcePage,
});

// No backdrop-filter anywhere in this route: it would frost the transparent page into a visible grey box.
const TRANSPARENT_PAGE_CSS = `
  html, body { background: transparent !important; }
  body > * { background: transparent !important; }
`;

function OverlaySourcePage() {
  const { token } = Route.useParams();
  const { preset } = Route.useSearch();
  const hydrated = useHydrated();

  return (
    <>
      {/* oxlint-disable-next-line react/no-danger -- static constant above, no interpolation */}
      <style dangerouslySetInnerHTML={{ __html: TRANSPARENT_PAGE_CSS }} />
      {hydrated && <OverlaySourceCanvas token={token} presetId={preset} />}
    </>
  );
}

// Mounted only after hydration: the poll is a browser-direct fetch, so SSR
// would just produce a frame hydration immediately replaces.
function OverlaySourceCanvas({ token, presetId }: { token: string; presetId?: string }) {
  const { data } = useOverlayState(token, presetId);
  const { cardsById, printingsById, printingsByCardId } = useCards();

  if (!data) {
    return null;
  }

  const printingId = data.payload.printingId;
  const pushedBoard = data.payload.board;
  return (
    <div className="fixed inset-0">
      <OverlayFrame
        payload={data.payload}
        printing={printingId === null ? undefined : printingsById[printingId]}
        board={
          pushedBoard === null
            ? undefined
            : deriveOverlayBoardScene(pushedBoard, cardsById, printingsByCardId)
        }
      />
    </div>
  );
}
