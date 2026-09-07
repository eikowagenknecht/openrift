import { CheckIcon, CopyIcon, QrCodeIcon } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import { QrCode } from "@/components/ui/qr-code";
import { cn } from "@/lib/utils";

import { ClipFrame } from "./clip-frame";

const SHARE_URL = "https://openrift.app/decks/share/AbCdEf123456";

// The share image's own palette, which satori bakes in because it cannot read
// the app's oklch tokens. See the og-image pipeline in apps/api.
const OG = {
  background: "#14161d",
  surface: "#21242b",
  surfaceBorder: "#2d313a",
  text: "#f2f2f2",
  muted: "#9aa0ab",
  gold: "#cdac6e",
};

function OgTile({ quantity }: { quantity?: number }) {
  return (
    <span
      className="relative block aspect-[0.715] rounded-[3px]"
      style={{ background: OG.surface, border: `1px solid ${OG.surfaceBorder}` }}
    >
      {quantity !== undefined && (
        <span
          className="text-2xs absolute right-0.5 bottom-0.5 rounded-sm px-1 leading-tight tabular-nums"
          style={{ background: "rgba(8,9,12,0.82)", color: OG.text }}
        >
          ×{quantity}
        </span>
      )}
    </span>
  );
}

function OgImage() {
  return (
    <div
      className="flex aspect-[1200/630] flex-col gap-2 p-3"
      style={{ background: OG.background }}
    >
      <div className="flex items-baseline gap-2">
        <span className="truncate text-sm font-bold" style={{ color: OG.text }}>
          Yasuo Aggro
        </span>
        <span className="text-2xs shrink-0 font-semibold" style={{ color: OG.gold }}>
          by Mira
        </span>
        <span className="text-2xs ml-auto shrink-0" style={{ color: OG.muted }}>
          Constructed · 30 + 2 cards
        </span>
      </div>
      <div className="flex min-h-0 flex-1 gap-2">
        <span
          className="aspect-[0.715] h-full rounded-[3px]"
          style={{ background: OG.surface, border: `1px solid ${OG.surfaceBorder}` }}
        />
        <div className="grid min-w-0 flex-1 grid-cols-6 gap-1">
          <OgTile quantity={3} />
          <OgTile />
          <OgTile quantity={2} />
          <OgTile />
          <OgTile />
          <OgTile quantity={3} />
        </div>
      </div>
      <span className="text-2xs shrink-0 font-semibold" style={{ color: OG.muted }}>
        openrift.app
      </span>
    </div>
  );
}

export function ShareVignette() {
  return (
    <ClipFrame className="flex flex-col gap-4 p-5">
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="border-input dark:bg-input/30 flex h-8 min-w-48 flex-1 items-center truncate rounded-lg border bg-transparent px-2.5 py-1 text-sm">
            {SHARE_URL}
          </span>
          <span
            aria-hidden="true"
            className={cn(buttonVariants({ variant: "outline" }), "relative")}
          >
            <span className="motion-safe:animate-share-before flex items-center gap-1.5">
              <CopyIcon className="size-4" />
              Copy
            </span>
            <span className="motion-safe:animate-share-after absolute inset-0 flex items-center justify-center gap-1.5 opacity-0">
              <CheckIcon className="size-4" />
              Copied
            </span>
          </span>
          <span
            aria-hidden="true"
            className={cn(buttonVariants({ variant: "outline", size: "icon" }))}
          >
            <QrCodeIcon />
          </span>
        </div>
        <QrCode value={SHARE_URL} size={96} label="QR code for the deck share link" />
      </div>

      <div className="border-border/60 motion-safe:animate-share-unfurl overflow-hidden rounded-lg border">
        <OgImage />
        <div className="flex flex-col gap-0.5 px-3 py-2">
          <span className="text-muted-foreground text-2xs">OpenRift</span>
          <span className="truncate text-sm font-medium">Yasuo Aggro (Constructed deck)</span>
          <span className="text-muted-foreground text-xs">
            A Constructed Riftbound deck shared by Mira.
          </span>
        </div>
      </div>
    </ClipFrame>
  );
}
