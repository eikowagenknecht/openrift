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

const CORNER_JUSTIFY: Record<OverlayCorner, string> = {
  "top-left": "justify-start",
  "top-right": "justify-end",
  "bottom-left": "justify-start",
  "bottom-right": "justify-end",
};

/** Resolves `auto` to the card's inward side, so the plate never runs off the edge the card is parked against. */
export function resolvePlatePosition(
  position: OverlayPlatePosition,
  corner: OverlayCorner,
): Exclude<OverlayPlatePosition, "auto"> {
  if (position !== "auto") {
    return position;
  }
  return corner.endsWith("left") ? "right" : "left";
}

// A class, not inline `style`: inline styles outrank any class, so
// `motion-reduce:transition-none` needs this to be a class to override it.
const TRANSITION_CLASS =
  "[transition:transform_420ms_cubic-bezier(0.2,0.9,0.25,1),opacity_294ms_ease] motion-reduce:transition-none";

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

// Forces `dark`: neither render site (the OBS browser source or the dashboard
// preview) sits in a dark-forced subtree already.
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

const BOARD_TILE_WIDTH = { min: 44, max: 110 };

/** Maps the scene's `scale` (20-100, a card's height as a percentage) onto a board tile width. */
export function boardTileWidth(scale: number): number {
  const along = (Math.min(Math.max(scale, 20), 100) - 20) / 80;
  return Math.round(BOARD_TILE_WIDTH.min + along * (BOARD_TILE_WIDTH.max - BOARD_TILE_WIDTH.min));
}

// Opaque, not the plate's `bg-black/85`: a translucent panel over a
// transparent OBS source washes the tier list out.
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
      <span className="font-mono text-sm tracking-widest text-white/45">{title}</span>
      <TierBoard
        rows={scene.rows}
        focusCardId={scene.focusCardId}
        spotlight={scene.focusCardId !== null}
        emptyRowLabel=""
        tileWidth={tileWidth}
      />
    </div>
  );
}

function OverlayFooter({ qrUrl }: { qrUrl: string | null }) {
  return (
    <div className="flex items-end gap-3">
      {qrUrl && <QrCode value={qrUrl} size={92} label="QR code for the linked page" />}
      <span className="pb-1 font-mono text-sm tracking-widest text-white/45">
        {new URL(getSiteUrl()).host}
      </span>
    </div>
  );
}

// No backdrop blur on the transparent ground: OBS composites this over live
// video, and a blur would sample the page's own emptiness.
export function OverlayFrame({
  payload,
  printing,
  board,
  className,
}: {
  payload: OverlayPayload;
  printing: Printing | undefined;
  board?: OverlayBoardScene;
  className?: string;
}) {
  const [displayed, setDisplayed] = useState<Printing | undefined>();
  // Not decode-gated: the board fills in tile by tile without waiting on
  // every image, unlike the card art above.
  const [shownBoard, setShownBoard] = useState<{ title: string; scene: OverlayBoardScene }>();

  useEffect(() => {
    if (!printing || printing === displayed) {
      return;
    }
    const image = printing.images[0];
    let cancelled = false;
    const swapWhenDecoded = async () => {
      if (image) {
        const loader = new Image();
        loader.src = imageUrl(image.imageId, "full");
        try {
          await loader.decode();
        } catch {
          // decode() rejects for undecodable images; the swap still has to
          // happen, or the overlay wedges on the previous card.
        }
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
  // Starts null: a frame that mounts with a board already up must paint it
  // immediately, not wait for the next push.
  const [shownFor, setShownFor] = useState<{
    pushedBoard: typeof pushedBoard;
    board: typeof board;
  } | null>(null);
  if (shownFor === null || shownFor.pushedBoard !== pushedBoard || shownFor.board !== board) {
    setShownFor({ pushedBoard, board });
    // A null push or an unresolved scene keeps the last board in place.
    if (pushedBoard !== null && board !== undefined) {
      setShownBoard({ title: pushedBoard.title, scene: board });
    }
  }

  const pushedPrintingId = payload.printingId;
  const [clearedFor, setClearedFor] = useState<{ id: typeof pushedPrintingId } | null>(null);
  if (clearedFor === null || clearedFor.id !== pushedPrintingId) {
    setClearedFor({ id: pushedPrintingId });
    // A card push clears the board server-side; the client must clear its
    // retained board too, or a later clear of that card revives it.
    if (pushedPrintingId !== null) {
      setShownBoard(undefined);
    }
  }

  const boardMode = shownBoard !== undefined;
  // `payload.hidden` doesn't affect any retained state: unhiding replays the
  // same card or board with no refetch or decode.
  const visible =
    !payload.hidden &&
    (boardMode
      ? pushedBoard !== null
      : payload.printingId !== null && printing !== undefined && displayed !== undefined);
  const atTop = payload.corner.startsWith("top");
  const atLeft = payload.corner.endsWith("left");
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
