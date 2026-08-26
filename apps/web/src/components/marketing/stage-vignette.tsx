import { ChevronLeftIcon, ChevronRightIcon, CopyIcon, RefreshCwIcon } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import { ClipFrame } from "./clip-frame";

const CHECKERBOARD = {
  background: "repeating-conic-gradient(#20242e 0% 25%, #171a22 0% 50%) 50% / 20px 20px",
};

const INPUT_CHROME =
  "border-input flex h-8 min-w-0 flex-1 items-center rounded-lg border bg-transparent px-2.5 py-1 text-sm dark:bg-input/30";

/**
 * The Stage's OBS panel: the browser source's live preview over the
 * transparency checkerboard, and the URL you paste into OBS. The overlay's own
 * type is sized for this miniature rather than the 1920-wide canvas it runs at,
 * which is the one thing here drawn out of scale.
 */
export function StageVignette({ thumbnailUrls = [] }: { thumbnailUrls?: string[] }) {
  const art = thumbnailUrls[0];
  return (
    <ClipFrame className="flex flex-col gap-6 p-5">
      <section className="flex flex-col gap-2">
        <div className="flex items-baseline justify-between gap-2">
          <span className="font-semibold">On stream</span>
          <span className="grid justify-items-end font-mono text-sm tracking-widest uppercase">
            <span className="text-muted-foreground motion-safe:animate-stage-idle col-start-1 row-start-1 opacity-0">
              Nothing up
            </span>
            <span className="text-primary motion-safe:animate-stage-live col-start-1 row-start-1">
              ● Live
            </span>
          </span>
        </div>

        <div
          className="ring-border aspect-video overflow-hidden rounded-lg ring-1"
          style={CHECKERBOARD}
        >
          <div className="motion-safe:animate-stage-push flex size-full justify-end p-[4%]">
            <div className="flex h-full flex-row items-end gap-2.5">
              <div className="flex min-w-0 flex-col gap-1.5">
                <div className="dark min-w-0 rounded-md bg-black/85 px-2.5 py-2 text-white shadow-2xl ring-1 ring-white/10">
                  <div className="text-xs leading-tight font-semibold text-balance">
                    Azir, Sovereign
                  </div>
                  <div className="text-2xs mt-1 font-mono tracking-wider text-white/50 uppercase">
                    SFD-177a/221 · Foil
                  </div>
                </div>
                <span className="text-2xs pb-0.5 font-mono tracking-widest text-white/45">
                  openrift.app
                </span>
              </div>
              {art ? (
                <img
                  src={art}
                  alt=""
                  loading="lazy"
                  draggable={false}
                  className="aspect-card h-[70%] shrink-0 rounded-[5%/3.6%] object-cover shadow-2xl"
                />
              ) : (
                <span className="aspect-card h-[70%] shrink-0 rounded-[5%/3.6%] bg-black/80 shadow-2xl" />
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between gap-3">
          <span className="text-muted-foreground grid min-w-0 flex-1 justify-items-start text-sm">
            <span className="motion-safe:animate-stage-idle col-start-1 row-start-1 truncate opacity-0">
              Push a card or a tier list to put it on screen.
            </span>
            <span className="motion-safe:animate-stage-live col-start-1 row-start-1 truncate">
              Azir, Sovereign
            </span>
          </span>
          <span className="flex shrink-0 items-center gap-1">
            <span
              aria-hidden="true"
              className={cn(buttonVariants({ variant: "outline", size: "icon-sm" }))}
            >
              <ChevronLeftIcon className="size-4" />
            </span>
            <span className="text-muted-foreground w-14 text-center font-mono text-sm tabular-nums">
              2 / 6
            </span>
            <span
              aria-hidden="true"
              className={cn(buttonVariants({ variant: "outline", size: "icon-sm" }))}
            >
              <ChevronRightIcon className="size-4" />
            </span>
          </span>
        </div>
      </section>

      <section className="flex flex-col gap-2">
        <span className="font-semibold">Browser source</span>
        <p className="text-muted-foreground text-sm">
          Add a Browser source in OBS and paste this URL. Anyone with the link sees what you push.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <span className={cn(INPUT_CHROME, "truncate")}>
            https://openrift.app/stage/source/Kf3nQ7ZaVb2p
          </span>
          <span aria-hidden="true" className={cn(buttonVariants({ variant: "outline" }))}>
            <CopyIcon />
            Copy
          </span>
          <span aria-hidden="true" className={cn(buttonVariants({ variant: "outline" }))}>
            <RefreshCwIcon />
            New link
          </span>
        </div>
      </section>
    </ClipFrame>
  );
}
