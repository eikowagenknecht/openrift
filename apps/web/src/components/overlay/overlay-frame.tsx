import type { OverlayCorner, OverlayPayload, Printing } from "@openrift/shared";
import { WellKnown, getOrientation, imageUrl, legendDisplayName } from "@openrift/shared";
import { useEffect, useState } from "react";

import { QrCode } from "@/components/ui/qr-code";
import { formatPublicCode } from "@/lib/format";
import { LANDSCAPE_ROTATION_STYLE, needsCssRotation } from "@/lib/images";
import { getSiteUrl } from "@/lib/site-config";
import { cn } from "@/lib/utils";

/**
 * Flex placement per corner. The card and its plate sit side by side, with the
 * plate on the inward side so it never runs off the edge of the scene.
 */
const CORNER_CLASSES: Record<OverlayCorner, string> = {
  "top-left": "items-start justify-start flex-row-reverse",
  "top-right": "items-start justify-end",
  "bottom-left": "items-end justify-start flex-row-reverse",
  "bottom-right": "items-end justify-end",
};

/**
 * The slide's transform/opacity transition — 420ms, slow enough to read as
 * deliberate on video. A class rather than an inline `style` so that
 * `motion-reduce:transition-none` can actually override it (inline styles
 * outrank any class).
 */
const TRANSITION_CLASS =
  "[transition:transform_420ms_cubic-bezier(0.2,0.9,0.25,1),opacity_294ms_ease] motion-reduce:transition-none";

/**
 * The card art, sized by height so the frame's `scale` setting means what it
 * says regardless of the source's dimensions.
 * @returns The card image, or null when the printing has no art.
 */
function OverlayCardArt({ printing }: { printing: Printing }) {
  const image = printing.images[0];
  const rotated = needsCssRotation(getOrientation(printing.card.types));

  if (!image) {
    return (
      <div className="aspect-card flex h-full items-center justify-center rounded-[5%/3.6%] bg-black/80 p-4 text-center text-white">
        {legendDisplayName(printing.card)}
      </div>
    );
  }

  return (
    <div className="aspect-card relative h-full overflow-hidden rounded-[5%/3.6%] shadow-2xl">
      {rotated ? (
        <div className="absolute top-1/2 left-1/2 overflow-hidden" style={LANDSCAPE_ROTATION_STYLE}>
          <img
            src={imageUrl(image.imageId, "full")}
            alt={legendDisplayName(printing.card)}
            className="size-full object-cover"
          />
        </div>
      ) : (
        <img
          src={imageUrl(image.imageId, "full")}
          alt={legendDisplayName(printing.card)}
          className="absolute inset-0 size-full object-cover"
        />
      )}
    </div>
  );
}

/**
 * Name, set code and stats beside the card, with the deck QR and the
 * attribution badge under it.
 * @returns The plate.
 */
function OverlayPlate({
  printing,
  deckShareUrl,
}: {
  printing: Printing;
  deckShareUrl: string | null;
}) {
  const { card } = printing;
  // Only null means "this card has no such stat" — 0 is a real value (0-cost
  // cards exist) and still gets its chip.
  const stats = [
    card.energy === null ? null : { label: "Energy", value: card.energy },
    card.power === null ? null : { label: "Power", value: card.power },
    card.might === null ? null : { label: "Might", value: card.might },
  ].filter((stat): stat is { label: string; value: number } => stat !== null);

  return (
    <div className="flex max-w-[26rem] min-w-0 flex-col gap-3">
      <div className="flex flex-col gap-1.5 rounded-lg bg-black/85 px-5 py-4 text-white shadow-2xl ring-1 ring-white/10">
        <div className="text-2xl leading-tight font-semibold text-balance">
          {legendDisplayName(card)}
        </div>
        <div className="font-mono text-sm tracking-wider text-white/50 uppercase">
          {formatPublicCode(printing)}
          {printing.finish === WellKnown.finish.FOIL ? " · Foil" : ""}
        </div>
        {stats.length > 0 && (
          <div className="mt-1 flex flex-wrap gap-2">
            {stats.map((stat) => (
              <span
                key={stat.label}
                className="rounded bg-white/10 px-2 py-0.5 font-mono text-sm tabular-nums"
              >
                {stat.value} {stat.label}
              </span>
            ))}
          </div>
        )}
      </div>

      <div className="flex items-end gap-3">
        {deckShareUrl && (
          <QrCode value={deckShareUrl} size={92} label="QR code for the deck list" />
        )}
        {/* Attribution, deliberately small and beside the art rather than
            across it — a watermark over card art is exactly what we said we
            would not do. */}
        <span className="pb-1 font-mono text-sm tracking-widest text-white/45">
          {new URL(getSiteUrl()).host}
        </span>
      </div>
    </div>
  );
}

/**
 * What the OBS browser source paints: the pushed card sliding in from the
 * scene's edge, optionally with a plate and a deck QR beside it.
 *
 * Rendered on a transparent ground with no backdrop blur — OBS composites this
 * over live video, and a blur would sample the page's own emptiness rather than
 * the scene behind it.
 *
 * Shared with the dashboard's live preview, so what the creator checks before
 * pushing is the same component their audience sees.
 *
 * @returns The overlay frame.
 */
export function OverlayFrame({
  payload,
  printing,
  className,
}: {
  payload: OverlayPayload;
  /** The pushed card, or undefined when nothing is up or the id is unknown. */
  printing: Printing | undefined;
  className?: string;
}) {
  // What the frame actually paints. It lags `printing` on purpose, twice over:
  // on a swap it keeps the previous card up until the next card's art has
  // decoded (so a live stream never shows an empty slot mid-download), and on
  // a clear it keeps the last card so the slide-out animates a card rather
  // than an empty box.
  const [displayed, setDisplayed] = useState<Printing | undefined>();

  useEffect(() => {
    if (!printing || printing === displayed) {
      return;
    }
    const image = printing.images[0];
    if (!image) {
      // No art to wait for — the text fallback renders immediately.
      setDisplayed(printing);
      return;
    }
    let cancelled = false;
    const loader = new Image();
    loader.src = imageUrl(image.imageId, "full");
    const swapWhenDecoded = async () => {
      try {
        await loader.decode();
      } catch {
        // decode() rejects for undecodable images; the swap still has to
        // happen, or the overlay wedges on the previous card.
      }
      if (!cancelled) {
        setDisplayed(printing);
      }
    };
    void swapWhenDecoded();
    return () => {
      cancelled = true;
    };
  }, [printing, displayed]);

  // Hidden until the pushed card is ready (so the slide-in starts with art in
  // hand), and hidden again the moment the push is cleared or unresolvable
  // (the retained `displayed` card is what slides out).
  const visible = payload.printingId !== null && printing !== undefined && displayed !== undefined;
  // Slides out toward the edge it came from, so an exit reads as the card
  // leaving the scene rather than shrinking away in place.
  const hiddenOffset = payload.corner.endsWith("left")
    ? "-translate-x-[130%]"
    : "translate-x-[130%]";

  return (
    <div
      className={cn(
        "pointer-events-none flex size-full p-[4%]",
        CORNER_CLASSES[payload.corner],
        className,
      )}
    >
      <div
        className={cn(
          "flex items-end gap-5",
          TRANSITION_CLASS,
          visible ? "translate-x-0 opacity-100" : cn(hiddenOffset, "opacity-0"),
        )}
        style={{ height: `${payload.scale}%` }}
      >
        {displayed && (
          <>
            <OverlayCardArt printing={displayed} />
            {payload.showPlate && (
              <OverlayPlate printing={displayed} deckShareUrl={payload.deckShareUrl} />
            )}
          </>
        )}
      </div>
    </div>
  );
}
