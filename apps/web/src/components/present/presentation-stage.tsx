import { legendDisplayName } from "@openrift/shared";
import { XIcon } from "lucide-react";
import { useEffect } from "react";

import type { CardViewerItem } from "@/components/card-viewer-types";
import { CardDetailArt } from "@/components/cards/card-detail/card-detail-art";
import { CardDetailStats } from "@/components/cards/card-detail/card-detail-stats";
import { CardDetailText } from "@/components/cards/card-detail/card-detail-text";
import { PresentationFilmstrip } from "@/components/present/presentation-filmstrip";
import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/kbd";
import { useZoneOrder } from "@/hooks/use-enums";
import { useIdle } from "@/hooks/use-idle";
import { formatPublicCode } from "@/lib/format";
import { isTypingTarget, ownsSpaceKey, resolvePresentationKey } from "@/lib/presentation-keys";
import { stepIndex } from "@/lib/presentation-queue";
import { cn } from "@/lib/utils";
import { usePresentationStore } from "@/stores/presentation-store";

/** How long the stage waits before fading its own chrome out of the capture. */
const IDLE_DELAY_MS = 2500;

const KEY_HELP: { keys: string[]; what: string }[] = [
  { keys: ["←", "→"], what: "Step through the queue" },
  { keys: ["Space"], what: "Next card" },
  { keys: ["Home", "End"], what: "First / last card" },
  { keys: ["T"], what: "Rules text panel" },
  { keys: ["F"], what: "Thumbnail strip" },
  { keys: ["?"], what: "This help" },
  { keys: ["Esc"], what: "Leave presentation mode" },
];

/**
 * The chrome-free card display: one card filling the frame on a near-black
 * ground, with the rules panel and thumbnail strip as keyboard-toggled layers
 * over it.
 *
 * Forced into the dark palette regardless of the viewer's theme (the `dark`
 * class on the root) — the shared `CardDetail` parts style themselves from the
 * theme tokens, and a light-theme text panel on a black stage is unreadable.
 *
 * @returns The presentation stage.
 */
export function PresentationStage({
  items,
  index,
  onIndexChange,
  onExit,
  title,
}: {
  items: CardViewerItem[];
  index: number;
  onIndexChange: (index: number) => void;
  onExit: () => void;
  /** Context line in the corner marker, e.g. the deck's name. */
  title?: string;
}) {
  const idle = useIdle(IDLE_DELAY_MS);
  const { zoneLabels } = useZoneOrder();
  const showText = usePresentationStore((state) => state.showText);
  const showStrip = usePresentationStore((state) => state.showStrip);
  const showHelp = usePresentationStore((state) => state.showHelp);

  const current = items[index];

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (isTypingTarget(event.target)) {
        return;
      }
      if (event.key === " " && ownsSpaceKey(event.target)) {
        return;
      }
      const action = resolvePresentationKey(event);
      if (action === null) {
        return;
      }
      event.preventDefault();
      const store = usePresentationStore.getState();
      switch (action) {
        case "next": {
          onIndexChange(stepIndex(index, items.length, 1));
          break;
        }
        case "prev": {
          onIndexChange(stepIndex(index, items.length, -1));
          break;
        }
        case "first": {
          onIndexChange(0);
          break;
        }
        case "last": {
          onIndexChange(Math.max(items.length - 1, 0));
          break;
        }
        case "toggleText": {
          store.toggleText();
          break;
        }
        case "toggleStrip": {
          store.toggleStrip();
          break;
        }
        case "toggleHelp": {
          store.toggleHelp();
          break;
        }
        case "exit": {
          // Escape closes the help sheet first, so it never takes the creator
          // out of the show when they only wanted the key list gone.
          if (store.showHelp) {
            store.closeHelp();
          } else {
            onExit();
          }
          break;
        }
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [index, items.length, onExit, onIndexChange]);

  if (!current) {
    return null;
  }

  const zoneLabel = current.zone ? zoneLabels[current.zone] : null;
  const chrome = cn(
    "absolute z-10 transition-opacity duration-700",
    idle ? "opacity-0" : "opacity-100",
  );

  return (
    <div className="dark fixed inset-0 z-50 flex flex-col bg-[#08090c] text-white">
      <Button
        variant="ghost"
        size="icon"
        onClick={onExit}
        aria-label="Leave presentation mode"
        className={cn(chrome, "top-4 left-4 text-white/70 hover:bg-white/10 hover:text-white")}
      >
        <XIcon className="size-5" />
      </Button>

      <div className={cn(chrome, "top-4 right-4 text-right")}>
        {title && <div className="text-sm text-white/50">{title}</div>}
        <div className="font-mono text-sm tracking-widest text-white/70 uppercase tabular-nums">
          {zoneLabel ? `${zoneLabel} · ` : ""}
          {index + 1} / {items.length}
        </div>
      </div>

      <div className="flex min-h-0 flex-1 items-center justify-center gap-[4vw] p-[4vh]">
        <div className="aspect-card h-full max-w-full shrink">
          <CardDetailArt printing={current.printing} showImages />
        </div>

        {showText && (
          <div className="flex max-w-lg min-w-0 flex-col gap-4 self-center">
            <h1 className="text-3xl font-semibold text-balance">
              {legendDisplayName(current.printing.card)}
            </h1>
            <div className="font-mono text-sm tracking-wider text-white/50 uppercase">
              {formatPublicCode(current.printing)}
            </div>
            <CardDetailStats printing={current.printing} />
            <CardDetailText printing={current.printing} />
          </div>
        )}
      </div>

      {showStrip && <PresentationFilmstrip items={items} index={index} onSelect={onIndexChange} />}

      {showHelp ? (
        <div className="absolute inset-x-0 bottom-0 z-20 flex justify-center pb-8">
          <dl className="grid grid-cols-[auto_1fr] items-center gap-x-5 gap-y-2 rounded-lg bg-black/80 px-6 py-5 backdrop-blur-sm">
            {KEY_HELP.map((row) => (
              <div key={row.what} className="contents">
                <dt className="flex justify-end gap-1">
                  {row.keys.map((key) => (
                    <Kbd key={key}>{key}</Kbd>
                  ))}
                </dt>
                <dd className="text-sm text-white/70">{row.what}</dd>
              </div>
            ))}
          </dl>
        </div>
      ) : (
        <div
          className={cn(
            chrome,
            "text-2xs inset-x-0 bottom-4 text-center font-mono tracking-widest text-white/25 uppercase",
          )}
        >
          Press ? for keys
        </div>
      )}
    </div>
  );
}
