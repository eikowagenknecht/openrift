import { LinkIcon, PackageIcon } from "lucide-react";

import { CardCountStrip } from "@/components/cards/card-count-strip";
import { CARD_BORDER_RADIUS } from "@/components/cards/card-grid-constants";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { getFilterIconPath } from "@/lib/icons";
import { cn } from "@/lib/utils";

import { ClipFrame } from "./clip-frame";

interface PromoCell {
  name: string;
  shortCode: string;
  rarity: string;
  markers: string[];
  /** Copies owned, revealed by the owned-counts toggle. */
  owned: number;
}

const ARCANE_BOX_SET: PromoCell[] = [
  {
    name: "Vi, Destructive",
    shortCode: "OGN-036a",
    rarity: "showcase",
    markers: ["Promo"],
    owned: 1,
  },
  {
    name: "Jinx, Rebel",
    shortCode: "OGN-202b",
    rarity: "showcase",
    markers: ["Promo"],
    owned: 0,
  },
];

const RELEASE_EVENT: PromoCell[] = [
  {
    name: "Lee Sin, Ascetic",
    shortCode: "OGN-078",
    rarity: "rare",
    markers: ["Promo", "Origins"],
    owned: 2,
  },
  {
    name: "Viktor, Leader",
    shortCode: "OGN-246",
    rarity: "rare",
    markers: ["Promo", "Origins"],
    owned: 1,
  },
];

function SectionDivider({ title, count }: { title: string; count: number }) {
  return (
    <div className="mb-3 flex items-center gap-3">
      <div className="bg-border h-px flex-1" />
      <div className="flex items-baseline gap-2 text-sm">
        <span className="font-semibold">{title}</span>
        <span className="text-muted-foreground tabular-nums">({count})</span>
        <span aria-hidden="true" className="text-muted-foreground/60 self-center">
          <LinkIcon className="size-3.5" />
        </span>
      </div>
      <div className="bg-border h-px flex-1" />
    </div>
  );
}

function Cell({ cell, art }: { cell: PromoCell; art?: string }) {
  const rarityIcon = getFilterIconPath("rarities", cell.rarity);
  return (
    <div className="flex min-w-0 flex-col">
      <span className="motion-safe:animate-promos-on block opacity-0">
        <CardCountStrip count={cell.owned} />
      </span>
      <span className={cn("block", cell.owned === 0 && "motion-safe:animate-promos-dim")}>
        {art ? (
          <img
            src={art}
            alt=""
            loading="lazy"
            draggable={false}
            className="aspect-card w-full object-cover"
            style={{ borderRadius: CARD_BORDER_RADIUS }}
          />
        ) : (
          <span
            className="bg-muted aspect-card block w-full"
            style={{ borderRadius: CARD_BORDER_RADIUS }}
          />
        )}
      </span>
      <div className="bg-background mt-2.5 space-y-0.5 rounded-md px-1.5 py-0.5">
        <div className="text-muted-foreground flex min-h-4 items-center justify-between gap-1 text-xs">
          <span className="truncate font-medium">{cell.shortCode}</span>
          {rarityIcon && <img src={rarityIcon} alt="" className="size-3.5 shrink-0" />}
        </div>
        <div className="flex min-h-4 items-center gap-1 text-xs font-medium">
          <span className="min-w-0 flex-1 truncate">{cell.name}</span>
        </div>
      </div>
      <div className="mt-1.5 flex flex-wrap items-center gap-1">
        {cell.markers.map((marker) => (
          <Badge key={marker} variant="secondary">
            {marker}
          </Badge>
        ))}
      </div>
    </div>
  );
}

/**
 * The promos browser: flat breadcrumb sections, one per distribution channel,
 * with each printing's marker chips under it. The animation turns on the owned
 * counts, which is what the toolbar's package button does.
 */
export function PromosVignette({ thumbnailUrls = [] }: { thumbnailUrls?: string[] }) {
  return (
    <ClipFrame className="flex flex-col gap-6 p-5">
      <div className="flex justify-end">
        <span className="grid">
          <span
            aria-hidden="true"
            className={cn(
              buttonVariants({ variant: "outline", size: "icon" }),
              "motion-safe:animate-promos-off col-start-1 row-start-1",
            )}
          >
            <PackageIcon />
          </span>
          <span
            aria-hidden="true"
            className={cn(
              buttonVariants({ variant: "default", size: "icon" }),
              "motion-safe:animate-promos-on col-start-1 row-start-1 opacity-0",
            )}
          >
            <PackageIcon />
          </span>
        </span>
      </div>

      <section>
        <SectionDivider title="Arcane Box Set" count={6} />
        <div className="grid grid-cols-2 gap-3">
          {ARCANE_BOX_SET.map((cell, index) => (
            <Cell key={cell.shortCode} cell={cell} art={thumbnailUrls[index]} />
          ))}
        </div>
      </section>

      <section>
        <SectionDivider title="Release Event › Origins" count={15} />
        <div className="grid grid-cols-2 gap-3">
          {RELEASE_EVENT.map((cell, index) => (
            <Cell key={cell.shortCode} cell={cell} art={thumbnailUrls[index + 2]} />
          ))}
        </div>
      </section>
    </ClipFrame>
  );
}
