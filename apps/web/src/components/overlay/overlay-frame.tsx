import type {
  OverlayCorner,
  OverlayPayload,
  OverlayPlateFields,
  OverlayPlatePosition,
  Printing,
} from "@openrift/shared";
import { WellKnown, getOrientation, imageUrl, legendDisplayName } from "@openrift/shared";
import { useEffect, useState } from "react";

import { CardText } from "@/components/cards/card-text";
import { QrCode } from "@/components/ui/qr-code";
import { formatPublicCode } from "@/lib/format";
import { LANDSCAPE_ROTATION_STYLE, needsCssRotation } from "@/lib/images";
import { getSiteUrl } from "@/lib/site-config";
import { cn } from "@/lib/utils";

/** Which edge of the scene the card is parked against. */
const CORNER_JUSTIFY: Record<OverlayCorner, string> = {
  "top-left": "justify-start",
  "top-right": "justify-end",
  "bottom-left": "justify-start",
  "bottom-right": "justify-end",
};

/**
 * Resolves `auto` against the corner: the plate goes on the card's inward side,
 * so it never runs off the edge the card is parked against and it follows the
 * card when the corner changes.
 * @returns The side the plate sits on.
 */
export function resolvePlatePosition(
  position: OverlayPlatePosition,
  corner: OverlayCorner,
): Exclude<OverlayPlatePosition, "auto"> {
  if (position !== "auto") {
    return position;
  }
  return corner.endsWith("left") ? "right" : "left";
}

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
 * says regardless of the source's dimensions. The height sits here rather than
 * on the cluster around it, so a plate above or below the card does not eat
 * into what the creator asked the card to be.
 * @returns The card image, or null when the printing has no art.
 */
function OverlayCardArt({
  printing,
  heightPercent,
}: {
  printing: Printing;
  heightPercent: number;
}) {
  const image = printing.images[0];
  const rotated = needsCssRotation(getOrientation(printing.card.types));
  const style = { height: `${heightPercent}%` };

  if (!image) {
    return (
      <div
        className="aspect-card flex shrink-0 items-center justify-center rounded-[5%/3.6%] bg-black/80 p-4 text-center text-white"
        style={style}
      >
        {legendDisplayName(printing.card)}
      </div>
    );
  }

  return (
    <div
      className="aspect-card relative shrink-0 overflow-hidden rounded-[5%/3.6%] shadow-2xl"
      style={style}
    >
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
 * The card's lines beside the art, each one switchable.
 *
 * Errata wins over the printed wording: a stream showing a card's rules should
 * show the rules as they are played, not as they were misprinted.
 *
 * @returns The plate, or null when every line it would carry is switched off or
 * empty for this card.
 */
function OverlayPlate({ printing, fields }: { printing: Printing; fields: OverlayPlateFields }) {
  const { card } = printing;
  // Only null means "this card has no such stat" — 0 is a real value (0-cost
  // cards exist) and still gets its chip.
  const allStats = [
    card.energy === null ? null : { label: "Energy", value: card.energy },
    card.power === null ? null : { label: "Power", value: card.power },
    card.might === null ? null : { label: "Might", value: card.might },
  ].filter((stat): stat is { label: string; value: number } => stat !== null);

  const stats = fields.stats ? allStats : [];
  const rulesText = fields.rulesText
    ? (card.errata?.correctedRulesText ?? printing.printedRulesText)
    : null;
  const effectText = fields.rulesText
    ? (card.errata?.correctedEffectText ?? printing.printedEffectText)
    : null;
  const flavorText = fields.flavorText ? printing.flavorText : null;

  const hasContent =
    fields.name || fields.code || stats.length > 0 || rulesText || effectText || flavorText;
  if (!hasContent) {
    return null;
  }

  return (
    <div className="flex flex-col gap-1.5 rounded-lg bg-black/85 px-5 py-4 text-white shadow-2xl ring-1 ring-white/10">
      {fields.name && (
        <div className="text-2xl leading-tight font-semibold text-balance">
          {legendDisplayName(card)}
        </div>
      )}
      {fields.code && (
        <div className="font-mono text-sm tracking-wider text-white/50 uppercase">
          {formatPublicCode(printing)}
          {printing.finish === WellKnown.finish.FOIL ? " · Foil" : ""}
        </div>
      )}
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
      {rulesText && (
        <p className="mt-1 text-white/85">
          {/* Keyword chips in their always-light treatment, and inert: the whole
              frame is pointer-events-none, and a hover state on a stream is
              nothing anyone can use. */}
          <CardText text={rulesText} interactive={false} onDark />
        </p>
      )}
      {effectText && (
        <p className="mt-1 text-white/85">
          <CardText text={effectText} interactive={false} onDark />
        </p>
      )}
      {flavorText && <p className="mt-1 text-sm text-white/55 italic">{flavorText}</p>}
    </div>
  );
}

/**
 * The QR and the attribution badge, which sit with the plate but do not belong
 * to it — a bare card with a scannable code beside it is a scene creators ask
 * for, so the code stands on its own switch (its link) rather than on the
 * plate's.
 * @returns The footer row.
 */
function OverlayFooter({ qrUrl }: { qrUrl: string | null }) {
  return (
    <div className="flex items-end gap-3">
      {qrUrl && <QrCode value={qrUrl} size={92} label="QR code for the linked page" />}
      {/* Attribution, deliberately small and beside the art rather than
          across it — a watermark over card art is exactly what we said we
          would not do. */}
      <span className="pb-1 font-mono text-sm tracking-widest text-white/45">
        {new URL(getSiteUrl()).host}
      </span>
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
  const atTop = payload.corner.startsWith("top");
  const atLeft = payload.corner.endsWith("left");
  // Slides out toward the edge it came from, so an exit reads as the card
  // leaving the scene rather than shrinking away in place.
  const hiddenOffset = atLeft ? "-translate-x-[130%]" : "translate-x-[130%]";

  const position = resolvePlatePosition(payload.platePosition, payload.corner);
  const stacked = position === "above" || position === "below";

  const side = displayed && (
    <div className="flex max-w-[26rem] min-w-0 flex-col gap-3">
      {payload.showPlate && <OverlayPlate printing={displayed} fields={payload.plateFields} />}
      <OverlayFooter qrUrl={payload.qrUrl} />
    </div>
  );

  return (
    <div
      className={cn(
        "pointer-events-none flex size-full p-[4%]",
        CORNER_JUSTIFY[payload.corner],
        className,
      )}
    >
      {/* Full height, with the card sized inside it, so `scale` keeps meaning
          "this much of the canvas" whichever side the plate is on. */}
      <div
        className={cn(
          "flex h-full gap-5",
          stacked
            ? cn(
                "flex-col",
                atLeft ? "items-start" : "items-end",
                atTop ? "justify-start" : "justify-end",
              )
            : cn("flex-row", atTop ? "items-start" : "items-end"),
          TRANSITION_CLASS,
          visible ? "translate-x-0 opacity-100" : cn(hiddenOffset, "opacity-0"),
        )}
      >
        {(position === "left" || position === "above") && side}
        {displayed && <OverlayCardArt printing={displayed} heightPercent={payload.scale} />}
        {(position === "right" || position === "below") && side}
      </div>
    </div>
  );
}
