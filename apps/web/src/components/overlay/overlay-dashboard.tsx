import type { Printing } from "@openrift/shared";
import { legendDisplayName } from "@openrift/shared";
import { getRouteApi, useNavigate } from "@tanstack/react-router";
import { EyeOffIcon, PlayIcon } from "lucide-react";
import { useState } from "react";

import {
  PageDescription,
  PageTopBar,
  PageTopBarActions,
  PageTopBarButton,
  PageTopBarSticky,
  PageTopBarTitle,
} from "@/components/layout/page-top-bar";
import { OverlayFrame } from "@/components/overlay/overlay-frame";
import { OverlaySettingsPanel } from "@/components/overlay/overlay-settings-panel";
import { CardQueueEditor } from "@/components/present/card-queue-editor";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useCards } from "@/hooks/use-cards";
import { useMeasuredWidth } from "@/hooks/use-measured-width";
import { useClearOverlay, useOverlayChannel, usePushOverlayCard } from "@/hooks/use-overlay";
import { cn, CONTAINER_WIDTH, PAGE_PADDING } from "@/lib/utils";

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
}: {
  payload: Parameters<typeof OverlayFrame>[0]["payload"];
  printing: Printing | undefined;
}) {
  const [box, setBox] = useState<HTMLDivElement | null>(null);
  const boxWidth = useMeasuredWidth(box);
  const live = payload.printingId !== null && printing !== undefined;
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
          <OverlayFrame payload={payload} printing={printing} />
        </div>
      </div>
      <p className="text-muted-foreground truncate text-sm">
        {live ? legendDisplayName(printing.card) : "Push a card to put it on screen."}
      </p>
    </section>
  );
}

/**
 * The control surface a creator drives mid-stream: search a card and push it
 * live, work through a queue prepared beforehand, clear the screen, and set up
 * where the overlay sits.
 *
 * One column on a phone (which is where it gets used during a stream) widening
 * into search-left / stage-right on a second monitor. Clear lives in the sticky
 * top bar rather than inline, so it is one tap away from wherever the page has
 * been scrolled to.
 *
 * @returns The overlay dashboard.
 */
const route = getRouteApi("/_app/_authenticated/overlay");

/** The stable empty queue, so an absent `cards` param isn't a fresh array per render. */
const NO_QUEUE: string[] = [];

export function OverlayDashboard() {
  const { data: channel } = useOverlayChannel();
  const { printingsById } = useCards();
  const pushCard = usePushOverlayCard();
  const clearOverlay = useClearOverlay();
  const { cards } = route.useSearch();
  const navigate = useNavigate();

  // The card size being dragged in the settings panel, or null when the thumb
  // is at rest. It lives here rather than in the panel so the preview above can
  // resize along with the drag, while the write to the channel still waits for
  // the release.
  const [draftScale, setDraftScale] = useState<number | null>(null);

  const queue = cards ?? NO_QUEUE;
  const setQueue = (ids: string[]) => {
    // The queue lives in the URL (see the route's search schema) so it
    // survives reloads; `replace` keeps edits from stacking history entries.
    void navigate({
      to: "/overlay",
      search: (prev) => ({ ...prev, cards: ids.length > 0 ? ids : undefined }),
      replace: true,
    });
  };

  const pushButton = (printing: Printing) => (
    <Button
      size="sm"
      onClick={() => pushCard.mutate({ printingId: printing.id })}
      disabled={pushCard.isPending}
      aria-label={`Push ${printing.card.name} to the stream`}
    >
      <PlayIcon className="size-4" />
      Push
    </Button>
  );

  const livePrintingId = channel?.payload.printingId ?? null;

  return (
    <>
      <PageTopBarSticky>
        <PageTopBar>
          <PageTopBarTitle>Stream overlay</PageTopBarTitle>
          <PageTopBarActions>
            <PageTopBarButton
              onClick={() => clearOverlay.mutate()}
              disabled={clearOverlay.isPending || livePrintingId === null}
            >
              <EyeOffIcon className="size-4" />
              Clear
            </PageTopBarButton>
          </PageTopBarActions>
        </PageTopBar>
      </PageTopBarSticky>

      <div className={cn(PAGE_PADDING, CONTAINER_WIDTH, "flex flex-col gap-6 pt-3 pb-8")}>
        <PageDescription>
          Push cards to a transparent browser source in OBS. Search for anything mid-stream, or line
          a queue up beforehand and work through it.
        </PageDescription>

        {channel === undefined ? (
          <Skeleton className="h-96" />
        ) : (
          <div className="grid gap-8 lg:grid-cols-[1.25fr_0.85fr]">
            <CardQueueEditor
              ids={queue}
              onChange={setQueue}
              resultAction={pushButton}
              rowAction={pushButton}
            />

            <div className="flex flex-col gap-8">
              <LivePreview
                payload={
                  draftScale === null ? channel.payload : { ...channel.payload, scale: draftScale }
                }
                printing={livePrintingId === null ? undefined : printingsById[livePrintingId]}
              />
              <OverlaySettingsPanel
                channel={channel}
                draftScale={draftScale}
                onDraftScaleChange={setDraftScale}
              />
            </div>
          </div>
        )}
      </div>
    </>
  );
}
