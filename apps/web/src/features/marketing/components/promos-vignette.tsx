import { imageUrl } from "@openrift/shared/image-url";
import type { LandingSummaryResponse } from "@openrift/shared/types/api/catalog";
import { LinkIcon } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { CARD_BORDER_RADIUS } from "@/features/cards/lib/card-grid-constants";
import { getFilterIconPath } from "@/lib/icons";

import { ClipFrame } from "./clip-frame";

const BREADCRUMB_SEP = " › ";

type PromoSection = LandingSummaryResponse["promoSections"][number];
type PromoPrinting = PromoSection["printings"][number];

const PENDING_SECTION: PromoSection = {
  path: [],
  printingCount: 0,
  printings: [
    { imageId: "", name: "", shortCode: "", rarity: "", markers: [] },
    { imageId: "", name: "", shortCode: "", rarity: "", markers: [] },
  ],
};

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
          <span className="bg-muted h-4 w-32 rounded-md" />
        )}
        <span aria-hidden="true" className="text-muted-foreground/60 self-center">
          <LinkIcon className="size-3.5" />
        </span>
      </div>
      <div className="bg-border h-px flex-1" />
    </div>
  );
}

function Cell({ printing }: { printing: PromoPrinting }) {
  const rarityIcon = getFilterIconPath("rarities", printing.rarity);
  const art = printing.imageId ? imageUrl(printing.imageId, "400w") : "";
  return (
    <div className="flex min-w-0 flex-col">
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

export function PromosVignette({ sections = [] }: { sections?: PromoSection[] }) {
  const section = sections[0] ?? PENDING_SECTION;
  return (
    <ClipFrame className="flex flex-col gap-6 p-5">
      <section>
        <SectionDivider title={section.path.join(BREADCRUMB_SEP)} count={section.printingCount} />
        <div className="grid grid-cols-2 gap-3">
          {section.printings.map((printing, index) => (
            <Cell key={printing.shortCode || `pending-${index}`} printing={printing} />
          ))}
        </div>
      </section>
    </ClipFrame>
  );
}
