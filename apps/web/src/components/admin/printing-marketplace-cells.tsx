import type {
  AdminMarketplaceName,
  AdminMarketplaceStagingCandidateResponse,
  AdminPrintingMarketplaceMappingResponse,
  AdminPrintingResponse,
} from "@openrift/shared";
import { CheckIcon, ExternalLinkIcon, LinkIcon, XIcon } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  useSaveMarketplaceMapping,
  useUnmapMarketplacePrinting,
} from "@/hooks/use-admin-card-mutations";
import { cn } from "@/lib/utils";

import { formatCents, ProductLink } from "./price-mappings-utils";
import { CM_CONFIG, CT_CONFIG, TCG_CONFIG } from "./source-configs";

const MARKETPLACES: AdminMarketplaceName[] = ["tcgplayer", "cardmarket", "cardtrader"];
const CONFIG_BY_MARKETPLACE = {
  tcgplayer: TCG_CONFIG,
  cardmarket: CM_CONFIG,
  cardtrader: CT_CONFIG,
} as const;

/**
 * Cardmarket is a cross-language aggregate (`variantLanguage = null`); other
 * marketplaces pin the variant to a specific language.
 *
 * @returns True when the given marketplace stores variants with `language = NULL`.
 */
function isLanguageAggregate(marketplace: AdminMarketplaceName): boolean {
  return marketplace === "cardmarket";
}

/**
 * TCGplayer's staging uses an "EN" placeholder — in practice it's English-only
 * for Riftbound, so non-EN printings can't be assigned to a TCG product.
 *
 * @returns True when the given marketplace only maps English printings.
 */
function isEnglishOnly(marketplace: AdminMarketplaceName): boolean {
  return marketplace === "tcgplayer";
}

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

// ── Header badges (collapsed state) ──────────────────────────────────────────

/**
 * Compact three-marketplace status badges shown in the collapsed printing
 * header. Each badge reports whether the printing has its own mapping, an
 * inherited sibling mapping, or nothing yet.
 *
 * @returns A row of three small badges, one per marketplace.
 */
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
            <Badge
              key={marketplace}
              className="border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
            >
              <CheckIcon className="size-3" />
              {config.shortName}
            </Badge>
          );
        }
        if (state.inherited) {
          return (
            <Badge
              key={marketplace}
              className="border-sky-500/30 bg-sky-500/10 text-sky-600 dark:text-sky-400"
            >
              <LinkIcon className="size-3" />
              {config.shortName}
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

// ── Expanded-panel cells ─────────────────────────────────────────────────────

/**
 * Per-printing marketplace mapping UI for the expanded card-detail panel.
 * Renders one row per marketplace with state (mapped owner / mapped inherited /
 * unmapped) and the corresponding actions. Reuses the existing save / unmap
 * endpoints that the old unified-mappings page used.
 *
 * @returns A stacked list of three marketplace rows (TCG / CM / CT).
 */
export function PrintingMarketplaceCells({
  printing,
  mappings,
  stagingCandidates,
  allPrintings,
}: {
  printing: AdminPrintingResponse;
  mappings: AdminPrintingMarketplaceMappingResponse[];
  stagingCandidates: AdminMarketplaceStagingCandidateResponse[];
  allPrintings: AdminPrintingResponse[];
}) {
  const saveMapping = useSaveMarketplaceMapping();
  const unmapPrinting = useUnmapMarketplacePrinting();
  const cells = buildCellState(mappings, printing.id);

  return (
    <div className="space-y-1">
      <h4 className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
        Marketplace mappings
      </h4>
      <div className="divide-y rounded-md border">
        {MARKETPLACES.map((marketplace) => (
          <MarketplaceCellRow
            key={marketplace}
            marketplace={marketplace}
            printing={printing}
            state={cells[marketplace]}
            stagingCandidates={stagingCandidates.filter((s) => s.marketplace === marketplace)}
            allMappings={mappings}
            allPrintings={allPrintings}
            onAssign={(externalId) =>
              saveMapping.mutate(
                { marketplace, printingId: printing.id, externalId },
                {
                  onSuccess: (result) => {
                    if (result.skipped.length > 0) {
                      for (const s of result.skipped) {
                        toast.error(`#${s.externalId}: ${s.reason}`);
                      }
                    }
                  },
                },
              )
            }
            onUnmap={() => unmapPrinting.mutate({ marketplace, printingId: printing.id })}
            isSaving={saveMapping.isPending}
            isUnmapping={unmapPrinting.isPending}
          />
        ))}
      </div>
    </div>
  );
}

// ── Single row ───────────────────────────────────────────────────────────────

function MarketplaceCellRow({
  marketplace,
  printing,
  state,
  stagingCandidates,
  allMappings,
  allPrintings,
  onAssign,
  onUnmap,
  isSaving,
  isUnmapping,
}: {
  marketplace: AdminMarketplaceName;
  printing: AdminPrintingResponse;
  state: PrintingCellState;
  stagingCandidates: AdminMarketplaceStagingCandidateResponse[];
  allMappings: AdminPrintingMarketplaceMappingResponse[];
  allPrintings: AdminPrintingResponse[];
  onAssign: (externalId: number) => void;
  onUnmap: () => void;
  isSaving: boolean;
  isUnmapping: boolean;
}) {
  const config = CONFIG_BY_MARKETPLACE[marketplace];

  if (state.owner) {
    const mapping = state.owner;
    return (
      <RowShell marketplace={marketplace}>
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <ProductLink config={config} externalId={mapping.externalId} language={printing.language}>
            #{mapping.externalId}
          </ProductLink>
          <span className="text-muted-foreground truncate text-xs">{mapping.productName}</span>
          <ExternalLinkIcon className="text-muted-foreground size-3 shrink-0" />
        </div>
        <Button
          variant="ghost"
          className="text-destructive hover:text-destructive"
          disabled={isUnmapping}
          onClick={onUnmap}
        >
          <XIcon />
          Unmap
        </Button>
      </RowShell>
    );
  }

  if (state.inherited) {
    const mapping = state.inherited;
    const ownerLabel =
      allPrintings.find((p) => p.id === mapping.ownerPrintingId)?.expectedPrintingId ??
      mapping.ownerLanguage;
    return (
      <RowShell marketplace={marketplace}>
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <Tooltip>
            <TooltipTrigger
              render={
                <span className="text-muted-foreground flex items-center gap-1 text-xs italic">
                  <LinkIcon className="size-3" />
                  <ProductLink
                    config={config}
                    externalId={mapping.externalId}
                    language={printing.language}
                  >
                    #{mapping.externalId}
                  </ProductLink>
                  <span className="truncate">{mapping.productName}</span>
                </span>
              }
            />
            <TooltipContent>Inherited via printing {ownerLabel}</TooltipContent>
          </Tooltip>
        </div>
      </RowShell>
    );
  }

  // Unmapped state
  if (isEnglishOnly(marketplace) && printing.language !== "EN") {
    return (
      <RowShell marketplace={marketplace}>
        <Tooltip>
          <TooltipTrigger
            render={<span className="text-muted-foreground text-xs">— not assignable</span>}
          />
          <TooltipContent>TCGplayer is English-only for Riftbound.</TooltipContent>
        </Tooltip>
      </RowShell>
    );
  }

  // For Cardmarket: if a sibling printing already owns a CM variant, this
  // printing can't claim its own — the unique constraint on (product, finish,
  // language=NULL) would reject the insert. Surface it up-front instead.
  if (isLanguageAggregate(marketplace)) {
    const siblingOwner = allMappings.find(
      (m) =>
        m.marketplace === marketplace &&
        m.ownerPrintingId !== printing.id &&
        allPrintings.some(
          (p) =>
            p.id === m.ownerPrintingId &&
            p.shortCode === printing.shortCode &&
            p.finish === printing.finish &&
            p.artVariant === printing.artVariant &&
            p.isSigned === printing.isSigned &&
            p.promoTypeId === printing.promoTypeId,
        ),
    );
    if (siblingOwner) {
      const ownerLabel =
        allPrintings.find((p) => p.id === siblingOwner.ownerPrintingId)?.expectedPrintingId ??
        siblingOwner.ownerLanguage;
      return (
        <RowShell marketplace={marketplace}>
          <Tooltip>
            <TooltipTrigger
              render={
                <span className="text-muted-foreground text-xs">
                  — already mapped via {ownerLabel}
                </span>
              }
            />
            <TooltipContent>
              Cardmarket stores one variant per product across all languages. Unmap the owning
              printing first.
            </TooltipContent>
          </Tooltip>
        </RowShell>
      );
    }
  }

  // Filter staging candidates to ones that match this printing's finish. For
  // non-aggregate marketplaces we also match on language (except TCG where the
  // scraper always writes "EN" placeholder — handled above).
  const matching = stagingCandidates.filter((sc) => {
    if (sc.finish !== printing.finish) {
      return false;
    }
    if (isLanguageAggregate(marketplace)) {
      return true;
    }
    if (isEnglishOnly(marketplace)) {
      return sc.language === "EN";
    }
    return sc.language === printing.language;
  });

  if (matching.length === 0) {
    return (
      <RowShell marketplace={marketplace}>
        <span className="text-muted-foreground text-xs">No candidates.</span>
      </RowShell>
    );
  }

  return (
    <RowShell marketplace={marketplace}>
      <Select
        value=""
        disabled={isSaving}
        onValueChange={(val) => {
          if (val) {
            onAssign(Number(val.split("::")[0]));
          }
        }}
      >
        <SelectTrigger
          className="h-7 w-full text-xs"
          aria-label={`Assign ${config.shortName} product to ${printing.expectedPrintingId}`}
        >
          <SelectValue placeholder="Assign…" />
        </SelectTrigger>
        <SelectContent className="w-auto min-w-[var(--anchor-width)]">
          <SelectGroup>
            <SelectLabel>
              {matching.length} candidate{matching.length === 1 ? "" : "s"}
            </SelectLabel>
            {matching.map((sc, index) => (
              <SelectItem
                key={`${sc.externalId}::${sc.finish}::${sc.language}::${index}`}
                value={`${sc.externalId}::${index}`}
              >
                {sc.productName.length > 40 ? `${sc.productName.slice(0, 40)}…` : sc.productName} ·
                #{sc.externalId} · {sc.finish}
                {sc.groupName ? ` · ${sc.groupName}` : ""} ·{" "}
                {formatCents(
                  sc.marketCents ?? sc.lowCents,
                  config.source === "tcgplayer" ? "USD" : "EUR",
                )}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
    </RowShell>
  );
}

function RowShell({
  marketplace,
  children,
}: {
  marketplace: AdminMarketplaceName;
  children: React.ReactNode;
}) {
  const config = CONFIG_BY_MARKETPLACE[marketplace];
  return (
    <div className={cn("flex items-center gap-3 px-2 py-1.5 text-sm")}>
      <span className="text-muted-foreground w-8 shrink-0 text-xs font-semibold tracking-wide uppercase">
        {config.shortName}
      </span>
      {children}
    </div>
  );
}
