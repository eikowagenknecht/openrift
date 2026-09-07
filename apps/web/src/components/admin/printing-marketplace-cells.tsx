import type {
  AdminMarketplaceName,
  AdminPrintingMarketplaceMappingResponse,
} from "@openrift/shared";
import { CheckIcon, LinkIcon } from "lucide-react";

import { Badge } from "@/components/ui/badge";

import { CM_CONFIG, CT_CONFIG, TCG_CONFIG } from "./source-configs";

const MARKETPLACES: AdminMarketplaceName[] = ["tcgplayer", "cardmarket", "cardtrader"];
const CONFIG_BY_MARKETPLACE = {
  tcgplayer: TCG_CONFIG,
  cardmarket: CM_CONFIG,
  cardtrader: CT_CONFIG,
} as const;

interface PrintingCellState {
  owner: AdminPrintingMarketplaceMappingResponse | null;
  inherited: AdminPrintingMarketplaceMappingResponse | null;
}

function buildCellState(
  mappings: AdminPrintingMarketplaceMappingResponse[],
  printingId: string,
): Record<AdminMarketplaceName, PrintingCellState> {
  const initial: Record<AdminMarketplaceName, PrintingCellState> = {
    tcgplayer: { owner: null, inherited: null },
    cardmarket: { owner: null, inherited: null },
    cardtrader: { owner: null, inherited: null },
  };
  for (const mapping of mappings) {
    if (mapping.targetPrintingId !== printingId) {
      continue;
    }
    const slot = initial[mapping.marketplace];
    if (mapping.ownerPrintingId === printingId) {
      slot.owner = mapping;
    } else {
      slot.inherited = mapping;
    }
  }
  return initial;
}

export function PrintingMarketplaceBadges({
  printingId,
  mappings,
}: {
  printingId: string;
  mappings: AdminPrintingMarketplaceMappingResponse[];
}) {
  const cells = buildCellState(mappings, printingId);
  return (
    <div className="flex items-center gap-1">
      {MARKETPLACES.map((marketplace) => {
        const config = CONFIG_BY_MARKETPLACE[marketplace];
        const state = cells[marketplace];
        if (state.owner) {
          return (
            <Badge key={marketplace} className="border-success/30 bg-success-soft text-success">
              <CheckIcon className="size-3" />
              {config.shortName} #{state.owner.externalId}
            </Badge>
          );
        }
        if (state.inherited) {
          return (
            <Badge key={marketplace} className="border-info/30 bg-info-soft text-info">
              <LinkIcon className="size-3" />
              {config.shortName} #{state.inherited.externalId}
            </Badge>
          );
        }
        return (
          <Badge key={marketplace} variant="outline" className="text-muted-foreground">
            {config.shortName}
          </Badge>
        );
      })}
    </div>
  );
}
