import type {
  OverlayCorner,
  OverlayPayload,
  OverlayPlateFields,
  OverlayPlatePosition,
  Printing,
} from "@openrift/shared";
import { getOrientation, imageUrl, legendDisplayName } from "@openrift/shared";
import { useEffect, useState } from "react";

import { CardPlateContent, hasCardPlateContent } from "@/components/cards/card-plate";
import { TierBoard } from "@/components/tier-lists/tier-board";
import { QrCode } from "@/components/ui/qr-code";
import { LANDSCAPE_ROTATION_STYLE, needsCssRotation } from "@/lib/images";
import type { OverlayBoardScene } from "@/lib/overlay-board-scene";
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
 * The card's lines beside the art, on the black plate the scene needs to keep
 * them readable over live video. The lines themselves are the shared
 * {@link CardPlateContent}, so the overlay and the presentation stage dress a
 * card the same way.
 *
 * Forced into the dark palette (`dark` on the plate), because the parts inside
 * style themselves from the theme tokens and neither surface that renders this
 * one — the OBS browser source or the dashboard's live preview — sits in a
 * dark-forced subtree. Without it, a creator on the light theme gets dark text
 * on a black plate.
 *
 * @returns The plate, or null when every line it would carry is switched off or
 * empty for this card.
 */
function OverlayPlate({ printing, fields }: { printing: Printing; fields: OverlayPlateFields }) {
  if (!hasCardPlateContent(printing, fields)) {
    return null;
  }

  return (
    <div className="dark rounded-lg bg-black/85 px-5 py-4 text-white shadow-2xl ring-1 ring-white/10">
      <CardPlateContent printing={printing} fields={fields} size="overlay" />
    </div>
  );
}

/**
 * The tile sizes the scene's size slider spans for a board.
 *
 * Narrower than the range a card gets, and for the same reason it exists at
 * all: a board is a grid of dozens of tiles, so the useful span runs from
 * "a full set review still fits the scene" to "a five-card ladder reads from
 * the back of the room", not from thumbnail to half the canvas.
 */
const BOARD_TILE_WIDTH = { min: 44, max: 110 };

/**
 * Maps the scene's `scale` (20–100, a card's height as a percentage) onto a
 * board tile width, so the one slider means something on both scenes.
 *
 * @returns The tile width in pixels.
 */
export function boardTileWidth(scale: number): number {
  const along = (Math.min(Math.max(scale, 20), 100) - 20) / 80;
  return Math.round(BOARD_TILE_WIDTH.min + along * (BOARD_TILE_WIDTH.max - BOARD_TILE_WIDTH.min));
}

/**
 * The ranking on screen: the board on an opaque panel, titled.
 *
 * Opaque rather than the plate's `bg-black/85`, because the rows draw
 * themselves on a translucent card colour — over a transparent browser source
 * that would composite straight onto live video and turn the ladder to mud.
 * Forced `dark` for the same reason the plate is: nothing above this sits in a
 * dark-forced subtree, so a creator on the light theme would otherwise get dark
 * rows under white text.
 *
 * @returns The board panel.
 */
function OverlayBoardPanel({
  title,
  scene,
  tileWidth,
}: {
  title: string;
  scene: OverlayBoardScene;
  tileWidth: number;
}) {
  return (
    <div className="dark flex max-w-[92%] flex-col gap-2 rounded-lg bg-[#08090c] p-4 shadow-2xl ring-1 ring-white/10">
      {/* Same treatment as the attribution badge and the stage's corner text:
          small, mono, quiet enough that it labels the board without competing
          with it. */}
      <span className="font-mono text-sm tracking-widest text-white/45">{title}</span>
      <TierBoard
        rows={scene.rows}
        focusCardId={scene.focusCardId}
        // No focus means the reveal is over (or hasn't started), and a finished
        // board is shown whole rather than with everything but one tile dimmed.
        spotlight={scene.focusCardId !== null}
        // Blank, not "Nothing here": a tier the run hasn't reached yet is
        // waiting, and captioning it would put filler text on the stream.
        emptyRowLabel=""
        tileWidth={tileWidth}
      />
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
 * What the OBS browser source paints: whatever was pushed, sliding in from the
 * scene's edge. A single card (optionally with a plate and a QR beside it), or
 * a tier board — never both, since the payload's two slots displace each other.
 *
 * Rendered on a transparent ground with no backdrop blur — OBS composites this
 * over live video, and a blur would sample the page's own emptiness rather than
 * the scene behind it.
 *
 * Catalogue-free on purpose: the card arrives resolved as `printing`, and the
 * board arrives worked out as `board`. Both call sites (the browser source and
 * the dashboard's live preview) already hold the catalogue, and keeping the
 * lookups out of here is what lets the preview be literally the same component
 * the audience sees.
 *
 * @returns The overlay frame.
 */
export function OverlayFrame({
  payload,
  printing,
  board,
  className,
}: {
  payload: OverlayPayload;
  /** The pushed card, or undefined when nothing is up or the id is unknown. */
  printing: Printing | undefined;
  /**
   * The pushed board resolved against the catalogue (see
   * `deriveOverlayBoardScene`), or undefined when no board is up.
   */
  board?: OverlayBoardScene;
  className?: string;
}) {
  // What the frame actually paints. It lags `printing` on purpose, twice over:
  // on a swap it keeps the previous card up until the next card's art has
  // decoded (so a live stream never shows an empty slot mid-download), and on
  // a clear it keeps the last card so the slide-out animates a card rather
  // than an empty box.
  const [displayed, setDisplayed] = useState<Printing | undefined>();
  // The board the frame paints, retained past a hide the same way `displayed`
  // is, so taking a board down slides it out rather than blinking it away.
  //
  // Deliberately not decode-gated the way the card above is: a ladder is dozens
  // of thumbnails and most are already cached from the list the creator built,
  // so waiting on all of them would hold the whole board off the scene for the
  // slowest one — and unlike a single card, a board that fills in tile by tile
  // still reads.
  const [shownBoard, setShownBoard] = useState<{ title: string; scene: OverlayBoardScene }>();

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

  const pushedBoard = payload.board;
  useEffect(() => {
    if (pushedBoard === null || board === undefined) {
      // Nothing up, or the caller hasn't resolved it yet — either way the last
      // board stays put and slides out.
      return;
    }
    setShownBoard({ title: pushedBoard.title, scene: board });
  }, [pushedBoard, board]);

  const pushedPrintingId = payload.printingId;
  useEffect(() => {
    if (pushedPrintingId === null) {
      return;
    }
    // A card push clears the board server-side, so the retained one has to go
    // as well. Without this, clearing that card afterwards would slide a board
    // the creator already moved on from back into the scene.
    setShownBoard(undefined);
  }, [pushedPrintingId]);

  // Which of the two the frame is painting. The board wins while one is
  // retained, since a card push is what drops the retained board.
  const boardMode = shownBoard !== undefined;
  // Hidden until the pushed card is ready (so the slide-in starts with art in
  // hand), and hidden again the moment the push is cleared or unresolvable
  // (the retained `displayed` card is what slides out). The board's own
  // visibility is the push alone, for want of anything to wait on.
  const visible = boardMode
    ? pushedBoard !== null
    : payload.printingId !== null && printing !== undefined && displayed !== undefined;
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
          boardMode || stacked
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
        {shownBoard ? (
          <OverlayBoardPanel
            title={shownBoard.title}
            scene={shownBoard.scene}
            tileWidth={boardTileWidth(payload.scale)}
          />
        ) : (
          <>
            {(position === "left" || position === "above") && side}
            {displayed && <OverlayCardArt printing={displayed} heightPercent={payload.scale} />}
            {(position === "right" || position === "below") && side}
          </>
        )}
      </div>
    </div>
  );
}
