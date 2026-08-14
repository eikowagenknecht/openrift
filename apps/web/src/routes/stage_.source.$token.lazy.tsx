import { createLazyFileRoute } from "@tanstack/react-router";

import { OverlayFrame } from "@/components/overlay/overlay-frame";
import { useCards } from "@/hooks/use-cards";
import { useHydrated } from "@/hooks/use-hydrated";
import { useOverlayState } from "@/hooks/use-overlay";
import { deriveOverlayBoardScene } from "@/lib/overlay-board-scene";

export const Route = createLazyFileRoute("/stage_/source/$token")({
  component: OverlaySourcePage,
});

/**
 * Makes the whole document transparent so OBS composites the card straight
 * over the scene behind it.
 *
 * The app paints a background on `html`, on `body`, and on the root shell div,
 * and this route renders inside all three — so the override has to reach every
 * one of them. `body > *` catches the shell without depending on the class
 * names it happens to carry today. Deliberately no `backdrop-filter` anywhere
 * in this route: a browser source has no scene to sample, so a blur would
 * frost the page's own emptiness into a visible grey box.
 */
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

/**
 * The polling half, mounted only after hydration. The poll is a browser-direct
 * fetch, so there is nothing for the server to render and a client-only mount
 * keeps SSR from producing a frame that hydration immediately replaces.
 *
 * @returns The overlay canvas.
 */
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
        // Resolved here rather than inside the frame: the catalogue lives on
        // this side of the boundary, and the frame paints what it is handed.
        board={
          pushedBoard === null
            ? undefined
            : deriveOverlayBoardScene(pushedBoard, cardsById, printingsByCardId)
        }
      />
    </div>
  );
}
