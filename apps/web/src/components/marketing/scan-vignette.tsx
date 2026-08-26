import type { CSSProperties } from "react";

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

// How many copies of each row's card the visitor is supposed to already own.
// The card identities come from the live sample, but a collection to compare
// them against is the one thing a signed-out visitor has none of.
const OWNED_BEFORE = [0, 2, 0] as const;

// Stands in until the landing summary lands, so the tray keeps its height
// instead of growing three rows under the visitor mid-scroll.
const PENDING_CARDS: LandingThumbnailCard[] = OWNED_BEFORE.map(() => ({
  url: "",
  name: "",
  shortCode: "",
  variantLabel: null,
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
  return (
    <li
      className={cn(
        "-mx-2 flex items-center gap-2 rounded-md px-2 py-2",
        arriving && "bg-muted/50 motion-safe:animate-scan-tray-row",
      )}
    >
      {card.url ? (
        <img
          src={card.url}
          alt=""
          loading="lazy"
          draggable={false}
          className="h-14 w-10 shrink-0 overflow-hidden rounded object-cover"
        />
      ) : (
        <span className="bg-muted h-14 w-10 shrink-0 rounded" />
      )}
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate font-medium">{card.name}</span>
        <span className="text-muted-foreground flex items-center gap-1.5 text-sm">
          <span className="font-mono">{card.shortCode}</span>
          {card.variantLabel && <span className="truncate">{card.variantLabel}</span>}
          {ownedBefore === 0 ? (
            <span
              className="text-emerald-600 dark:text-emerald-400"
              title="None in your collection before this session"
            >
              New
            </span>
          ) : (
            <span title="Copies in your collection before this session">owned {ownedBefore}</span>
          )}
        </span>
      </span>
      {card.price !== null && (
        <span className="shrink-0 text-emerald-600 tabular-nums dark:text-emerald-400">
          {formatPriceEur(card.price)}
        </span>
      )}
    </li>
  );
}

/**
 * The scanner: a card under the viewfinder, swept, locked, and flown into the
 * session tray as a row. That flight is the app's entire "added" feedback —
 * there is no success toast and no confirmation pill anywhere in the flow.
 *
 * The three cards are real printings from the landing sample, so the row the
 * scan produces names the card the viewfinder is holding.
 * @returns The scanner vignette.
 */
export function ScanVignette({ cards }: { cards: LandingThumbnailCard[] }) {
  const rows = cards.length > 0 ? cards : PENDING_CARDS;
  const scanned = rows[0];
  const total = rows.reduce((sum, card) => sum + (card.price ?? 0), 0);
  const newCount = rows.filter((_, index) => OWNED_BEFORE[index] === 0).length;
  return (
    <ClipFrame className="flex flex-col p-0">
      {/* Dark in both themes: the plate stands in for the camera picture,
          exactly like ScanStartPanel's. */}
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
            className="via-primary/80 motion-safe:animate-scan-sweep absolute inset-x-0 top-0 h-1/3 bg-gradient-to-b from-transparent to-transparent opacity-0"
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
            className="aspect-card motion-safe:animate-scan-flight absolute top-1/2 left-1/2 h-[74%] [translate:-50%_-50%] rounded object-cover opacity-0"
          />
        )}
      </div>
      <div className="flex flex-col gap-1 px-4 py-3">
        <p className="flex flex-wrap items-baseline gap-x-2 text-sm">
          <span className="font-medium tabular-nums">{rows.length} cards</span>
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
          <span
            className="text-emerald-600 dark:text-emerald-400"
            title="Cards with no copy in your collection before this session"
          >
            {newCount} new
          </span>
        </p>
        <ul className="flex flex-col">
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
