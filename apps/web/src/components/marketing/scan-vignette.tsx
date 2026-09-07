import type { CSSProperties } from "react";

import { CardMiniRow } from "@/components/cards/card-mini-row";
import { formatPriceEur } from "@/lib/format";
import type { LandingThumbnailCard } from "@/lib/landing-thumbnails";
import { cn } from "@/lib/utils";

import { ClipFrame } from "./clip-frame";

// Matches BRACKET_FRACTION in scan-overlay.ts, like the real viewfinder.
const BRACKET_SIZE = "18%";

// RETICLE_COLORS.locked in scan-overlay.ts.
const LOCKED_COLOR = "rgba(74,222,128,0.95)";

const BRACKET_CORNERS = [
  "-top-0.5 -left-0.5 border-t-2 border-l-2",
  "-top-0.5 -right-0.5 border-t-2 border-r-2",
  "-bottom-0.5 -left-0.5 border-b-2 border-l-2",
  "-right-0.5 -bottom-0.5 border-r-2 border-b-2",
] as const;

function Brackets({ className, style }: { className: string; style?: CSSProperties }) {
  return (
    <>
      {BRACKET_CORNERS.map((corner) => (
        <span
          key={corner}
          aria-hidden="true"
          className={cn("absolute", corner, className)}
          style={{ width: BRACKET_SIZE, height: BRACKET_SIZE, ...style }}
        />
      ))}
    </>
  );
}

const OWNED_BEFORE = [0, 2, 0, 1] as const;

// 4.5rem a row, matching the scan-tray-row keyframes.
const VISIBLE_ROWS = "h-54";

const PENDING_CARDS: LandingThumbnailCard[] = OWNED_BEFORE.map(() => ({
  url: "",
  name: "",
  shortCode: "",
  variantLabel: null,
  rarity: "",
  domains: [],
  price: null,
}));

function TrayRow({
  card,
  ownedBefore,
  arriving,
}: {
  card: LandingThumbnailCard;
  ownedBefore: number;
  arriving?: boolean;
}) {
  // PrintingVariantLabel falls back to "Standard" for a null variant; pending
  // rows keep it empty since they name no card.
  const variant = card.name ? (card.variantLabel ?? "Standard") : "";
  return (
    <li
      className={cn(
        "-mx-2 flex items-center gap-3 overflow-hidden rounded-md px-2 py-2",
        arriving && "bg-muted/50 motion-safe:animate-scan-tray-row",
      )}
    >
      {/* No `domainColors`: keeps this a pure component so the landing page
          never suspends on /init to paint a miniature. */}
      <CardMiniRow
        className="self-stretch"
        src={card.url}
        rarity={card.rarity}
        domains={card.domains}
        shortCode={card.shortCode}
        loading="lazy"
        artClassName="h-10"
        hideMetaOnMobile
      />
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate font-medium">{card.name}</span>
        <span className="text-muted-foreground flex min-w-0 items-center gap-1.5 text-sm">
          <span className="font-mono sm:hidden">{card.shortCode}</span>
          <span className="truncate">{variant}</span>
        </span>
      </span>
      {ownedBefore === 0 ? (
        <span className="text-success shrink-0 text-sm" title="None in your collection">
          New
        </span>
      ) : (
        <span
          className="text-muted-foreground shrink-0 text-sm tabular-nums"
          title="Copies already in your collection"
        >
          {ownedBefore} owned
        </span>
      )}
      {card.price !== null && (
        <span className="text-success shrink-0 text-sm tabular-nums">
          {formatPriceEur(card.price)}
        </span>
      )}
    </li>
  );
}

function TrayTotals({
  rows,
  from,
  className,
}: {
  rows: LandingThumbnailCard[];
  from: number;
  className?: string;
}) {
  const counted = rows.slice(from);
  const total = counted.reduce((sum, card) => sum + (card.price ?? 0), 0);
  const newCount = counted.filter((_, index) => OWNED_BEFORE[from + index] === 0).length;
  return (
    <p className={cn("flex flex-wrap items-baseline gap-x-2 text-sm", className)}>
      <span className="font-medium tabular-nums">{counted.length} cards</span>
      {total > 0 && (
        <>
          <span className="text-muted-foreground" aria-hidden="true">
            ·
          </span>
          <span className="tabular-nums">{formatPriceEur(total)}</span>
        </>
      )}
      <span className="text-muted-foreground" aria-hidden="true">
        ·
      </span>
      <span className="text-success" title="Cards you own no copy of">
        {newCount} new
      </span>
    </p>
  );
}

export function ScanVignette({ cards }: { cards: LandingThumbnailCard[] }) {
  const rows = cards.length > 0 ? cards : PENDING_CARDS;
  const scanned = rows[0];
  return (
    <ClipFrame className="flex flex-col p-0">
      {/* Matches ScanStartPanel's dark plate in both themes. */}
      <div className="relative grid aspect-[4/3] place-items-center bg-radial from-neutral-800 to-neutral-950">
        <div className="aspect-card relative h-[74%] overflow-hidden border-2 border-white/15">
          {scanned?.url && (
            <img
              src={scanned.url}
              alt=""
              loading="lazy"
              draggable={false}
              className="absolute inset-0 size-full object-cover"
            />
          )}
          <span
            aria-hidden="true"
            className="via-primary/80 motion-safe:animate-scan-sweep absolute inset-x-0 top-0 h-1/3 bg-linear-to-b from-transparent to-transparent opacity-0"
          />
          <Brackets className="border-white/45" />
          <Brackets
            className="motion-safe:animate-scan-lock opacity-0"
            style={{ borderColor: LOCKED_COLOR }}
          />
        </div>
        {scanned?.url && (
          <img
            src={scanned.url}
            alt=""
            aria-hidden="true"
            loading="lazy"
            draggable={false}
            className="aspect-card motion-safe:animate-scan-flight absolute top-1/2 left-1/2 h-[74%] [translate:-50%_-50%] rounded-md object-cover opacity-0"
          />
        )}
      </div>
      <div className="flex flex-col gap-1 px-4 py-3">
        {/* The landed state is the DOM base so reduced motion and SSR show
            the finished tray, not the pre-scan one. */}
        <div className="grid">
          <TrayTotals
            rows={rows}
            from={1}
            className="motion-safe:animate-scan-count-was col-start-1 row-start-1 opacity-0"
          />
          <TrayTotals
            rows={rows}
            from={0}
            className="motion-safe:animate-scan-count-now col-start-1 row-start-1"
          />
        </div>
        <ul className={cn("overflow-hidden", VISIBLE_ROWS)}>
          {rows.map((card, index) => (
            <TrayRow
              key={card.shortCode || `pending-${index}`}
              card={card}
              ownedBefore={OWNED_BEFORE[index] ?? 0}
              arriving={index === 0}
            />
          ))}
        </ul>
      </div>
    </ClipFrame>
  );
}
