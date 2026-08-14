import type { OverlayCorner, OverlayPayload, Printing } from "@openrift/shared";
import { WellKnown, getOrientation, imageUrl, legendDisplayName } from "@openrift/shared";

import { QrCode } from "@/components/ui/qr-code";
import { formatPublicCode } from "@/lib/format";
import { LANDSCAPE_ROTATION_STYLE, needsCssRotation } from "@/lib/images";
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

/** How long the card takes to slide in or out. Slow enough to read as deliberate on video. */
const TRANSITION_MS = 420;

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
  const stats = [
    card.energy !== null && card.energy > 0 ? { label: "Energy", value: card.energy } : null,
    card.power !== null && card.power > 0 ? { label: "Power", value: card.power } : null,
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
        <span className="pb-1 font-mono text-sm tracking-widest text-white/45">openrift.app</span>
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
  const visible = payload.printingId !== null && printing !== undefined;
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
          "flex items-end gap-5 motion-reduce:transition-none",
          visible ? "translate-x-0 opacity-100" : cn(hiddenOffset, "opacity-0"),
        )}
        style={{
          height: `${payload.scale}%`,
          transition: `transform ${TRANSITION_MS}ms cubic-bezier(0.2, 0.9, 0.25, 1), opacity ${Math.round(TRANSITION_MS * 0.7)}ms ease`,
        }}
      >
        {printing && (
          <>
            <OverlayCardArt printing={printing} />
            {payload.showPlate && (
              <OverlayPlate printing={printing} deckShareUrl={payload.deckShareUrl} />
            )}
          </>
        )}
      </div>
    </div>
  );
}
