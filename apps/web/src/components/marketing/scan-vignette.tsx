import type { CSSProperties } from "react";

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

// The three rows the session tray is left holding. Codes are the printings'
// short codes, which is what the tray line carries — never a set name or a
// collector-number fraction.
const TRAY_ROWS = [
  { name: "Jinx, Rebel", code: "OGN-202", variant: "Standard", state: "new", price: "4,20 €" },
  { name: "Hidden Blade", code: "OGN-213", variant: "Foil", state: "owned 2", price: "0,80 €" },
  { name: "Guards!", code: "SFD-154", variant: "Standard", state: "new", price: "0,30 €" },
] as const;

function TrayRow({
  row,
  url,
  arriving,
}: {
  row: (typeof TRAY_ROWS)[number];
  url?: string;
  arriving?: boolean;
}) {
  return (
    <li
      className={cn(
        "-mx-2 flex items-center gap-2 rounded-md px-2 py-2",
        arriving && "bg-muted/50 motion-safe:animate-scan-tray-row",
      )}
    >
      {url ? (
        <img
          src={url}
          alt=""
          loading="lazy"
          draggable={false}
          className="h-14 w-10 shrink-0 overflow-hidden rounded object-cover"
        />
      ) : (
        <span className="bg-muted h-14 w-10 shrink-0 rounded" />
      )}
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate font-medium">{row.name}</span>
        <span className="text-muted-foreground flex items-center gap-1.5 text-sm">
          <span className="font-mono">{row.code}</span>
          <span className="truncate">{row.variant}</span>
          {row.state === "new" ? (
            <span
              className="text-emerald-600 dark:text-emerald-400"
              title="None in your collection before this session"
            >
              New
            </span>
          ) : (
            <span title="Copies in your collection before this session">{row.state}</span>
          )}
        </span>
      </span>
      <span className="shrink-0 text-emerald-600 tabular-nums dark:text-emerald-400">
        {row.price}
      </span>
    </li>
  );
}

/**
 * The scanner: a card under the viewfinder, swept, locked, and flown into the
 * session tray as a row. That flight is the app's entire "added" feedback —
 * there is no success toast and no confirmation pill anywhere in the flow.
 * @returns The scanner vignette.
 */
export function ScanVignette({ thumbnailUrls }: { thumbnailUrls: string[] }) {
  const [scanned, ...rest] = thumbnailUrls;
  return (
    <ClipFrame className="flex flex-col p-0">
      {/* Dark in both themes: the plate stands in for the camera picture,
          exactly like ScanStartPanel's. */}
      <div className="relative grid aspect-[4/3] place-items-center bg-radial from-neutral-800 to-neutral-950">
        <div className="aspect-card relative h-[74%] overflow-hidden border-2 border-white/15">
          {scanned && (
            <img
              src={scanned}
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
        {scanned && (
          <img
            src={scanned}
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
          <span className="font-medium tabular-nums">3 cards</span>
          <span className="text-muted-foreground" aria-hidden="true">
            ·
          </span>
          <span className="tabular-nums">5,30 €</span>
          <span className="text-muted-foreground" aria-hidden="true">
            ·
          </span>
          <span
            className="text-emerald-600 dark:text-emerald-400"
            title="Cards with no copy in your collection before this session"
          >
            2 new
          </span>
        </p>
        <ul className="flex flex-col">
          {TRAY_ROWS.map((row, index) => (
            <TrayRow
              key={row.code}
              row={row}
              url={index === 0 ? scanned : rest[index - 1]}
              arriving={index === 0}
            />
          ))}
        </ul>
      </div>
    </ClipFrame>
  );
}
