import type { Printing } from "@openrift/shared";
import { legendDisplayName } from "@openrift/shared";
import { Link } from "@tanstack/react-router";
import { ChevronLeftIcon, ChevronRightIcon, EyeIcon, EyeOffIcon, XIcon } from "lucide-react";
import type { ReactNode } from "react";
import { useState } from "react";

import { OverlayFrame } from "@/components/overlay/overlay-frame";
import { OverlaySettingsPanel } from "@/components/overlay/overlay-settings-panel";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useCards } from "@/hooks/use-cards";
import { useMeasuredWidth } from "@/hooks/use-measured-width";
import {
  useClearOverlay,
  useOverlayChannel,
  usePushOverlayCard,
  useSetOverlayHidden,
} from "@/hooks/use-overlay";
import type { OverlayBoardScene } from "@/lib/overlay-board-scene";
import { deriveOverlayBoardScene } from "@/lib/overlay-board-scene";
import { deriveOverlayWalk } from "@/lib/overlay-walk";
import { cn } from "@/lib/utils";
import { usePresentQueueStore } from "@/stores/present-queue-store";

const OBS_CANVAS = { width: 1920, height: 1080 };

// Must use the real OverlayFrame component: the preview has to match what
// the browser source actually renders.
function LivePreview({
  payload,
  printing,
  board,
  controls,
}: {
  payload: Parameters<typeof OverlayFrame>[0]["payload"];
  printing: Printing | undefined;
  board?: OverlayBoardScene;
  controls?: ReactNode;
}) {
  const [box, setBox] = useState<HTMLDivElement | null>(null);
  const boxWidth = useMeasuredWidth(box);
  const liveCard = payload.printingId !== null && printing !== undefined;
  const holding = liveCard || payload.board !== null;
  const live = holding && !payload.hidden;
  let caption = "Push a card or a tier list to put it on screen.";
  if (payload.board !== null) {
    caption = payload.board.title;
  } else if (liveCard) {
    caption = legendDisplayName(printing.card);
  }
  // Append "(hidden)": without it, a named caption over an empty preview
  // looks like a failed push.
  if (payload.hidden && holding) {
    caption = `${caption} (hidden)`;
  }
  let status = "Nothing up";
  if (live) {
    status = "● Live";
  } else if (holding) {
    status = "Hidden";
  }
  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="font-semibold">On stream</h2>
        <span
          className={cn(
            "font-mono text-sm tracking-wide uppercase",
            live ? "text-primary" : "text-muted-foreground",
          )}
        >
          {status}
        </span>
      </div>
      {/* Literal colors, not theme tokens: the checkerboard stands for "no
          background at all" and must read the same in either theme. */}
      <div
        ref={setBox}
        className="ring-border aspect-video overflow-hidden rounded-lg ring-1"
        style={{
          background: "repeating-conic-gradient(#20242e 0% 25%, #171a22 0% 50%) 50% / 20px 20px",
        }}
      >
        {/* Painted at the canvas size a browser source runs at, then scaled
            down to fit: the plate's type is sized in px, so a straight render
            into this box would show it several times the size it takes on stream. */}
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

// Kept visible but disabled when the queue is empty, not hidden.
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

// Mounted only while signed in: every channel hook here needs a session.
export function OverlayOutputPanel() {
  const { data: channel } = useOverlayChannel();
  const { cardsById, printingsById, printingsByCardId } = useCards();
  const pushCard = usePushOverlayCard();
  const clearOverlay = useClearOverlay();
  const setHidden = useSetOverlayHidden();
  const queue = usePresentQueueStore((state) => state.ids);

  // Kept here, not in the settings panel: the preview must resize during the
  // drag while the channel write waits for release.
  const [draftScale, setDraftScale] = useState<number | null>(null);

  if (channel === undefined) {
    return <Skeleton className="h-96" />;
  }

  const livePrintingId = channel.payload.printingId;
  const liveBoard = channel.payload.board;
  const hidden = channel.payload.hidden;
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
              onClick={() => setHidden.mutate({ hidden: !hidden })}
              disabled={setHidden.isPending}
            >
              {hidden ? <EyeIcon className="size-4" /> : <EyeOffIcon className="size-4" />}
              {hidden ? "Show" : "Hide"}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => clearOverlay.mutate()}
              disabled={clearOverlay.isPending || (livePrintingId === null && liveBoard === null)}
            >
              <XIcon className="size-4" />
              Clear
            </Button>
          </div>
        }
      />
      <p className="text-muted-foreground text-sm">
        Open a{" "}
        <Link to="/tier-lists" className="underline underline-offset-2">
          tier list
        </Link>
        , press Present, and turn on &ldquo;Board on OBS&rdquo;.
      </p>
      <OverlaySettingsPanel
        channel={channel}
        draftScale={draftScale}
        onDraftScaleChange={setDraftScale}
      />
    </div>
  );
}
