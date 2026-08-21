import type { ReactNode } from "react";

import { CardArtThumb } from "@/components/cards/card-art-thumb";
import { Pressable } from "@/components/ui/pressable";

/**
 * One tappable candidate in a scan sheet: art, the card's name, and whatever
 * tells this candidate apart from the others. Both scan sheets (the printing
 * picker and the identify shortlist) offer the same choice, so they render the
 * same row rather than each keeping a near-identical copy.
 *
 * @returns The pressable candidate row.
 */
export function ScanCandidateRow({
  imageId,
  landscape,
  rarity,
  domains,
  title,
  detail,
  onClick,
}: {
  imageId?: string | null;
  /** Battlefield art, stored landscape, so the thumbnail keeps it upright. */
  landscape?: boolean;
  rarity?: string | null;
  domains?: string[];
  title: string;
  /** The distinguishing line — a variant label, or the bank's own detail text. */
  detail: ReactNode;
  onClick: () => void;
}) {
  return (
    <Pressable
      className="hover:bg-muted flex w-full items-center gap-3 rounded-md px-2 py-1.5 text-left"
      onClick={onClick}
    >
      <CardArtThumb
        shape="strip"
        imageId={imageId}
        variant="120w"
        className="h-10"
        rarity={rarity}
        domains={domains}
        landscape={landscape}
      />
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium">{title}</span>
        <span className="text-muted-foreground block truncate text-sm">{detail}</span>
      </span>
    </Pressable>
  );
}
