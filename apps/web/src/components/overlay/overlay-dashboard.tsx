import type { Printing } from "@openrift/shared";
import { legendDisplayName } from "@openrift/shared";
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
import { useClearOverlay, useOverlayChannel, usePushOverlayCard } from "@/hooks/use-overlay";
import { cn, CONTAINER_WIDTH, PAGE_PADDING } from "@/lib/utils";

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
        className="ring-border aspect-video overflow-hidden rounded-lg ring-1"
        style={{
          background: "repeating-conic-gradient(#20242e 0% 25%, #171a22 0% 50%) 50% / 20px 20px",
        }}
      >
        <OverlayFrame payload={payload} printing={printing} />
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
export function OverlayDashboard() {
  const { data: channel } = useOverlayChannel();
  const { printingsById } = useCards();
  const pushCard = usePushOverlayCard();
  const clearOverlay = useClearOverlay();
  const [queue, setQueue] = useState<string[]>([]);

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
                payload={channel.payload}
                printing={livePrintingId === null ? undefined : printingsById[livePrintingId]}
              />
              <OverlaySettingsPanel channel={channel} />
            </div>
          </div>
        )}
      </div>
    </>
  );
}
