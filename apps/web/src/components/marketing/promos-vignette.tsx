import type { LandingSummaryResponse } from "@openrift/shared";
import { imageUrl } from "@openrift/shared";
import { LinkIcon, PackageIcon } from "lucide-react";

import { CardCountStrip } from "@/components/cards/card-count-strip";
import { CARD_BORDER_RADIUS } from "@/components/cards/card-grid-constants";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { getFilterIconPath } from "@/lib/icons";
import { cn } from "@/lib/utils";

import { ClipFrame } from "./clip-frame";

// Copies of each cell the visitor is supposed to own, by position. The
// printings are real; a collection to count them against is the one thing a
// signed-out visitor has none of, and the animation needs a zero to dim.
const OWNED_BY_POSITION = [1, 0, 2, 1] as const;

// Section breadcrumbs join the same way the promos page joins them.
const BREADCRUMB_SEP = " › ";

type PromoSection = LandingSummaryResponse["promoSections"][number];
type PromoPrinting = PromoSection["printings"][number];

// Holds the layout until the landing summary lands, the same way the card
// tiles have always stood in for their art.
const PENDING_SECTIONS: PromoSection[] = [0, 1].map(() => ({
  path: [],
  printingCount: 0,
  printings: [
    { imageId: "", name: "", shortCode: "", rarity: "", markers: [] },
    { imageId: "", name: "", shortCode: "", rarity: "", markers: [] },
  ],
}));

function SectionDivider({ title, count }: { title: string; count: number }) {
  return (
    <div className="mb-3 flex items-center gap-3">
      <div className="bg-border h-px flex-1" />
      <div className="flex items-baseline gap-2 text-sm">
        {title ? (
          <>
            <span className="font-semibold">{title}</span>
            <span className="text-muted-foreground tabular-nums">({count})</span>
          </>
        ) : (
          <span className="bg-muted h-4 w-32 rounded" />
        )}
        <span aria-hidden="true" className="text-muted-foreground/60 self-center">
          <LinkIcon className="size-3.5" />
        </span>
      </div>
      <div className="bg-border h-px flex-1" />
    </div>
  );
}

function Cell({ printing, owned }: { printing: PromoPrinting; owned: number }) {
  const rarityIcon = getFilterIconPath("rarities", printing.rarity);
  const art = printing.imageId ? imageUrl(printing.imageId, "400w") : "";
  return (
    <div className="flex min-w-0 flex-col">
      <span className="motion-safe:animate-promos-on block opacity-0">
        <CardCountStrip count={owned} />
      </span>
      <span className={cn("block", owned === 0 && "motion-safe:animate-promos-dim")}>
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
          <span className="truncate font-medium">{printing.shortCode}</span>
          {rarityIcon && <img src={rarityIcon} alt="" className="size-3.5 shrink-0" />}
        </div>
        <div className="flex min-h-4 items-center gap-1 text-xs font-medium">
          <span className="min-w-0 flex-1 truncate">{printing.name}</span>
        </div>
      </div>
      <div className="mt-1.5 flex flex-wrap items-center gap-1">
        {printing.markers.map((marker) => (
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
 *
 * The channels and their printings are the real ones, so a cell chipped "Promo"
 * is a printing that channel actually handed out.
 * @returns The promos vignette.
 */
export function PromosVignette({ sections = [] }: { sections?: PromoSection[] }) {
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

      {(sections.length > 0 ? sections : PENDING_SECTIONS).map((section, sectionIndex) => (
        <section key={section.path.join(BREADCRUMB_SEP) || `pending-${sectionIndex}`}>
          <SectionDivider title={section.path.join(BREADCRUMB_SEP)} count={section.printingCount} />
          <div className="grid grid-cols-2 gap-3">
            {section.printings.map((printing, index) => (
              <Cell
                key={printing.shortCode || `pending-${index}`}
                printing={printing}
                owned={OWNED_BY_POSITION[sectionIndex * section.printings.length + index] ?? 0}
              />
            ))}
          </div>
        </section>
      ))}
    </ClipFrame>
  );
}
