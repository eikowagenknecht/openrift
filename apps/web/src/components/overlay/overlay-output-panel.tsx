import type { Printing } from "@openrift/shared";
import { legendDisplayName } from "@openrift/shared";
import { ChevronLeftIcon, ChevronRightIcon, EyeOffIcon } from "lucide-react";
import type { ReactNode } from "react";
import { useState } from "react";

import { OverlayBoardSection } from "@/components/overlay/overlay-board-section";
import { OverlayFrame } from "@/components/overlay/overlay-frame";
import { OverlaySettingsPanel } from "@/components/overlay/overlay-settings-panel";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useCards } from "@/hooks/use-cards";
import { useMeasuredWidth } from "@/hooks/use-measured-width";
import { useClearOverlay, useOverlayChannel, usePushOverlayCard } from "@/hooks/use-overlay";
import type { OverlayBoardScene } from "@/lib/overlay-board-scene";
import { deriveOverlayBoardScene } from "@/lib/overlay-board-scene";
import { deriveOverlayWalk } from "@/lib/overlay-walk";
import { cn } from "@/lib/utils";
import { usePresentQueueStore } from "@/stores/present-queue-store";

/**
 * The canvas the preview paints at. 1080p is what an OBS browser source is set
 * to in practice, and the number only has to be a plausible stage — everything
 * in the frame is sized relative to it, so a source set to another size scales
 * the same way.
 */
const OBS_CANVAS = { width: 1920, height: 1080 };

/**
 * What the audience is seeing right now, rendered with the very component the
 * browser source uses — so the check before pushing is the real thing rather
 * than an approximation of it.
 *
 * @returns The live preview panel.
 */
function LivePreview({
  payload,
  printing,
  board,
  controls,
}: {
  payload: Parameters<typeof OverlayFrame>[0]["payload"];
  printing: Printing | undefined;
  /** The live board resolved for the frame, or undefined when none is up. */
  board?: OverlayBoardScene;
  /** Walk and clear controls, sat under the preview beside the live card's name. */
  controls?: ReactNode;
}) {
  const [box, setBox] = useState<HTMLDivElement | null>(null);
  const boxWidth = useMeasuredWidth(box);
  const liveCard = payload.printingId !== null && printing !== undefined;
  const live = liveCard || payload.board !== null;
  // Whatever is up, named: the board's own title, or the card's.
  let caption = "Push a card or a tier list to put it on screen.";
  if (payload.board !== null) {
    caption = payload.board.title;
  } else if (liveCard) {
    caption = legendDisplayName(printing.card);
  }
  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="font-semibold">On stream</h2>
        <span
          className={cn(
            "font-mono text-sm tracking-widest uppercase",
            live ? "text-primary" : "text-muted-foreground",
          )}
        >
          {live ? "● Live" : "Nothing up"}
        </span>
      </div>
      {/* The checkerboard stands for the transparency OBS composites through.
          Literal colors, not theme tokens: it represents "no background at
          all", so it must read the same in either theme. */}
      <div
        ref={setBox}
        className="ring-border aspect-video overflow-hidden rounded-lg ring-1"
        style={{
          background: "repeating-conic-gradient(#20242e 0% 25%, #171a22 0% 50%) 50% / 20px 20px",
        }}
      >
        {/* Painted at the canvas size a browser source actually runs at, then
            scaled down to fit. The plate's type is sized in px, so rendering it
            straight into a 400px-wide box would show a plate several times the
            size it takes on stream — and the whole point of this panel is that
            what is checked here is what goes out. */}
        <div
          className="origin-top-left"
          style={{
            width: OBS_CANVAS.width,
            height: OBS_CANVAS.height,
            transform: `scale(${boxWidth / OBS_CANVAS.width})`,
          }}
        >
          <OverlayFrame payload={payload} printing={printing} board={board} />
        </div>
      </div>
      <div className="flex items-center justify-between gap-3">
        <p className="text-muted-foreground min-w-0 flex-1 truncate text-sm">{caption}</p>
        {controls}
      </div>
    </section>
  );
}

/**
 * Prev / next through the queue, so the creator's phone works as a clicker
 * while their hands are on the game rather than on the queue list.
 *
 * Hidden with no queue: the buttons would have nothing to step through, and an
 * empty pair of disabled arrows under the preview reads as something broken.
 *
 * @returns The walk controls, or nothing when the queue is empty.
 */
function WalkControls({
  queue,
  livePrintingId,
  onPush,
  isPending,
}: {
  queue: readonly string[];
  livePrintingId: string | null;
  onPush: (printingId: string) => void;
  isPending: boolean;
}) {
  const walk = deriveOverlayWalk(queue, livePrintingId);
  if (walk.total === 0) {
    return null;
  }

  const previousId = walk.previousPrintingId;
  const nextId = walk.nextPrintingId;

  return (
    <div className="flex shrink-0 items-center gap-1">
      <Button
        variant="outline"
        size="icon-sm"
        onClick={() => {
          if (previousId !== null) {
            onPush(previousId);
          }
        }}
        disabled={previousId === null || isPending}
        aria-label="Push the previous queued card"
      >
        <ChevronLeftIcon className="size-4" />
      </Button>
      {/* A dash for the position while something off-queue is live: the walk
          has no place in the queue to report, and inventing one would make the
          next press jump somewhere the creator didn't ask for. */}
      <span className="text-muted-foreground w-14 text-center font-mono text-sm tabular-nums">
        {`${walk.position ?? "–"} / ${walk.total}`}
      </span>
      <Button
        variant="outline"
        size="icon-sm"
        onClick={() => {
          if (nextId !== null) {
            onPush(nextId);
          }
        }}
        disabled={nextId === null || isPending}
        aria-label="Push the next queued card"
      >
        <ChevronRightIcon className="size-4" />
      </Button>
    </div>
  );
}

/**
 * The OBS half of the stage: what the browser source is showing, the clicker
 * that walks the queue through it, the tier board controls, and the scene
 * setup with its saved presets.
 *
 * It steps the very queue the builder beside it is editing, rather than a
 * second list of its own — one queue, two ways of putting it on screen. That
 * queue is the draft in {@link usePresentQueueStore}, which the page seeds from
 * `?cards=` on arrival, so a bookmarked set still opens ready to push.
 *
 * Mounted only while signed in: every channel hook here needs a session.
 *
 * @returns The OBS output panel.
 */
export function OverlayOutputPanel() {
  const { data: channel } = useOverlayChannel();
  const { cardsById, printingsById, printingsByCardId } = useCards();
  const pushCard = usePushOverlayCard();
  const clearOverlay = useClearOverlay();
  const queue = usePresentQueueStore((state) => state.ids);

  // The card size being dragged in the settings panel, or null when the thumb
  // is at rest. It lives here rather than in the panel so the preview above can
  // resize along with the drag, while the write to the channel still waits for
  // the release.
  const [draftScale, setDraftScale] = useState<number | null>(null);

  if (channel === undefined) {
    return <Skeleton className="h-96" />;
  }

  const livePrintingId = channel.payload.printingId;
  const liveBoard = channel.payload.board;
  // Resolved once here and handed to both the preview and the reveal controls,
  // so the `n / total` readout counts the same steps the frame is painting.
  const boardScene =
    liveBoard === null
      ? undefined
      : deriveOverlayBoardScene(liveBoard, cardsById, printingsByCardId);

  return (
    <div className="flex flex-col gap-6">
      <LivePreview
        payload={draftScale === null ? channel.payload : { ...channel.payload, scale: draftScale }}
        printing={livePrintingId === null ? undefined : printingsById[livePrintingId]}
        board={boardScene}
        controls={
          <div className="flex shrink-0 items-center gap-2">
            <WalkControls
              queue={queue}
              livePrintingId={livePrintingId}
              onPush={(printingId) => pushCard.mutate({ printingId })}
              isPending={pushCard.isPending}
            />
            <Button
              variant="outline"
              size="sm"
              onClick={() => clearOverlay.mutate()}
              disabled={clearOverlay.isPending || (livePrintingId === null && liveBoard === null)}
            >
              <EyeOffIcon className="size-4" />
              Clear
            </Button>
          </div>
        }
      />
      {/* Directly under the preview: stepping a reveal is something a creator
          does while watching the board fill. */}
      <OverlayBoardSection board={liveBoard} revealTotal={boardScene?.total ?? 0} />
      <OverlaySettingsPanel
        channel={channel}
        draftScale={draftScale}
        onDraftScaleChange={setDraftScale}
      />
    </div>
  );
}
