import type { DeskPrintingRow } from "@openrift/shared/contracts/admin/printing-desk";
import type { ImageVariant } from "@openrift/shared/image-url";
import { getOrientation } from "@openrift/shared/utils";

import { Badge } from "@/components/ui/badge";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { deskImageSrc } from "@/features/admin/lib/printing-desk-image";
import { DESK_STATUS_LABELS, deskPrintingStatus } from "@/features/admin/lib/printing-desk-status";
import { CardArtThumb } from "@/features/cards/components/card-art-thumb";

export function DeskStatusBadge({
  row,
}: {
  row: Pick<DeskPrintingRow, "releasedAt" | "releasePrecision">;
}) {
  const status = deskPrintingStatus(row);
  return (
    <Badge variant={status === "released" ? "success" : "warning"}>
      {DESK_STATUS_LABELS[status]}
    </Badge>
  );
}

/** Battlefields are stored landscape, so they get a landscape box. */
export function DeskThumb({
  row,
  className,
  variant = "240w",
}: {
  row: Pick<DeskPrintingRow, "activeImageUrl" | "cardType" | "cardName" | "rarity">;
  className?: string;
  variant?: ImageVariant;
}) {
  return (
    <CardArtThumb
      src={deskImageSrc(row.activeImageUrl, variant)}
      landscape={getOrientation([row.cardType]) === "landscape"}
      rarity={row.rarity}
      alt={row.cardName}
      loading="lazy"
      className={className}
    />
  );
}

export interface DeskSegmentedOption<T extends string> {
  value: T;
  label: string;
}

export function DeskSegmented<T extends string>({
  value,
  onChange,
  options,
  ariaLabel,
  className,
}: {
  value: T;
  onChange: (value: T) => void;
  options: readonly DeskSegmentedOption<T>[];
  ariaLabel: string;
  className?: string;
}) {
  return (
    <ToggleGroup
      aria-label={ariaLabel}
      variant="outline"
      spacing={0}
      className={className}
      value={[value]}
      onValueChange={(next) => {
        const picked = next.at(0);
        if (typeof picked === "string") {
          onChange(picked as T);
        }
      }}
    >
      {options.map((option) => (
        <ToggleGroupItem key={option.value} value={option.value}>
          {option.label}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}
