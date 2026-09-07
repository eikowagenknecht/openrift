import { Accordion as AccordionPrimitive } from "@base-ui/react/accordion";
import type { Printing } from "@openrift/shared/types/catalog";
import type { DeckZone } from "@openrift/shared/types/enums";
import { WellKnown } from "@openrift/shared/well-known";
import {
  AlertTriangleIcon,
  CheckCircle2Icon,
  ChevronRightIcon,
  SearchIcon,
  XCircleIcon,
} from "lucide-react";
import { useState } from "react";

import { AccordionContent, AccordionItem } from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CardSearchDropdown } from "@/features/cards/components/card-search-dropdown";
import { CardThumbnail } from "@/features/cards/components/printing-option-content";
import { useCardSearch } from "@/features/cards/hooks/use-card-search";
import {
  ImportRowRawFields,
  ImportRowShell,
} from "@/features/collections/components/import-row-shell";
import { useResolvedCardIndex } from "@/features/collections/hooks/use-resolved-card-index";
import type { ImportBucket } from "@/features/collections/lib/import-summary";
import { classifyBucket } from "@/features/collections/lib/import-summary";
import type { DeckMatchedEntry, ResolvedCard } from "@/features/decks/lib/deck-import-matcher";
import { deckImportRowId } from "@/features/decks/lib/deck-import-preview";
import { useIsMobile } from "@/hooks/use-is-mobile";
import { cn } from "@/lib/utils";

const BUCKET_CONFIG: Record<ImportBucket, { icon: React.ElementType; className: string }> = {
  ready: { icon: CheckCircle2Icon, className: "text-success" },
  "to-verify": { icon: AlertTriangleIcon, className: "text-warning" },
  "need-attention": { icon: XCircleIcon, className: "text-destructive" },
};

export function DeckImportEntryRow({
  entry,
  allPrintings,
  index,
  zoneOrder,
  zoneLabels,
  isSkipped,
  onResolve,
  onZoneChange,
  onSkip,
  onUnskip,
}: {
  entry: DeckMatchedEntry;
  allPrintings: Printing[];
  index: number;
  zoneOrder: DeckZone[];
  zoneLabels: Record<DeckZone, string>;
  isSkipped: boolean;
  onResolve: (index: number, card: ResolvedCard) => void;
  onZoneChange: (index: number, zone: DeckZone) => void;
  onSkip: (index: number) => void;
  onUnskip: (index: number) => void;
}) {
  const [showSearch, setShowSearch] = useState(false);
  const bucket = classifyBucket(entry.status, entry.resolvedCard !== null);
  const { icon: StatusIcon, className: statusColor } = BUCKET_CONFIG[bucket];
  const rawFieldEntries = Object.entries(entry.entry.rawFields);
  const displayName =
    entry.resolvedCard?.cardName ?? entry.entry.cardName ?? entry.entry.shortCode ?? "Unknown";
  const isMobile = useIsMobile();
  const foldActions = isMobile && bucket === "ready" && !isSkipped;

  const sourceName = entry.entry.cardName?.trim();
  const resolved = entry.resolvedCard;
  const matchedNote =
    resolved && (!sourceName || sourceName.toLowerCase() !== resolved.cardName.toLowerCase()) ? (
      <>
        Matched to <span className="text-foreground font-medium">{resolved.cardName}</span> (
        {resolved.shortCode})
      </>
    ) : null;

  const actions = (
    <>
      {entry.suggestedName && (
        <span className="text-muted-foreground text-xs">
          Did you mean <em>{entry.suggestedName}</em>?
        </span>
      )}
      {showSearch ? (
        <CardSearch
          allPrintings={allPrintings}
          onSelect={(card) => {
            onResolve(index, card);
            setShowSearch(false);
          }}
        />
      ) : null}
      <Button
        variant="ghost"
        size={isMobile ? "icon" : "xs"}
        onClick={() => setShowSearch(!showSearch)}
        aria-label={showSearch ? "Close search" : "Search catalog"}
      >
        {showSearch ? <XCircleIcon className="size-3.5" /> : <SearchIcon className="size-3.5" />}
      </Button>
      <ZonePicker
        zone={entry.zone}
        zoneOrder={zoneOrder}
        zoneLabels={zoneLabels}
        isMobile={isMobile}
        onZoneChange={(zone) => onZoneChange(index, zone)}
      />
      {isSkipped ? (
        <Button variant="ghost" size={isMobile ? "default" : "xs"} onClick={() => onUnskip(index)}>
          Unskip
        </Button>
      ) : (
        <Button variant="ghost" size={isMobile ? "default" : "xs"} onClick={() => onSkip(index)}>
          Skip
        </Button>
      )}
    </>
  );

  const hasDetails = rawFieldEntries.length > 0 || matchedNote !== null;
  const hasPanel = hasDetails || foldActions;

  // `group` sits on whichever element is the accordion trigger, so the
  // chevron's rotation class follows the panel either way.
  const chevronIcon = (
    <ChevronRightIcon className="size-4 shrink-0 transition-transform group-data-[panel-open]:rotate-90" />
  );

  const row = (
    <ImportRowShell
      chevron={
        foldActions ? (
          <span className="text-muted-foreground">{chevronIcon}</span>
        ) : (
          <AccordionPrimitive.Header className="flex">
            <AccordionPrimitive.Trigger
              className="group text-muted-foreground hover:text-foreground -m-2 shrink-0 p-2 outline-none"
              disabled={!hasPanel}
              aria-label="Toggle import details"
            >
              {chevronIcon}
            </AccordionPrimitive.Trigger>
          </AccordionPrimitive.Header>
        )
      }
      statusIcon={<StatusIcon className={cn("size-4 shrink-0", statusColor)} />}
      quantity={entry.entry.quantity}
      code={entry.entry.shortCode}
      name={displayName}
      actions={foldActions ? null : actions}
      trailing={
        // Hidden via CSS, not unmounted: unmounting mid-click inside the row-wide
        // trigger registers as a new open, not a toggle-close.
        foldActions ? (
          <span className="text-muted-foreground text-xs group-data-[panel-open]:hidden">
            {zoneLabels[entry.zone]}
          </span>
        ) : null
      }
    />
  );

  return (
    <AccordionItem
      id={deckImportRowId(index)}
      value={String(index)}
      className={cn("not-last:border-b-0", isSkipped && "opacity-40")}
    >
      {/* Whole row is the trigger only when folded: rows that keep their
          controls can't do this, or the buttons and zone select would end
          up nested inside the trigger. */}
      {foldActions ? (
        <AccordionPrimitive.Header className="flex">
          <AccordionPrimitive.Trigger className="group focus-visible:ring-ring hover:bg-muted w-full cursor-pointer text-left outline-none focus-visible:ring-2 focus-visible:ring-inset">
            {row}
          </AccordionPrimitive.Trigger>
        </AccordionPrimitive.Header>
      ) : (
        row
      )}
      {hasPanel && (
        <AccordionContent className="bg-muted/30 px-4 py-2">
          <div className="space-y-2">
            {foldActions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
            {hasDetails && <ImportRowRawFields entries={rawFieldEntries} matched={matchedNote} />}
          </div>
        </AccordionContent>
      )}
    </AccordionItem>
  );
}

function ZonePicker({
  zone,
  zoneOrder,
  zoneLabels,
  isMobile,
  onZoneChange,
}: {
  zone: DeckZone;
  zoneOrder: DeckZone[];
  zoneLabels: Record<DeckZone, string>;
  isMobile: boolean;
  onZoneChange: (zone: DeckZone) => void;
}) {
  // Overflow is not user-assignable
  const assignableZones = zoneOrder.filter((zoneSlug) => zoneSlug !== WellKnown.deckZone.OVERFLOW);

  return (
    <Select
      value={zone}
      onValueChange={(value) => onZoneChange(value as DeckZone)}
      items={Object.fromEntries(assignableZones.map((zoneKey) => [zoneKey, zoneLabels[zoneKey]]))}
    >
      <SelectTrigger
        size={isMobile ? "default" : "sm"}
        className={cn("w-auto", !isMobile && "h-7 text-xs")}
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent className="w-auto">
        {assignableZones.map((zoneKey) => (
          <SelectItem key={zoneKey} value={zoneKey} className={isMobile ? "py-2.5" : "py-1.5"}>
            {zoneLabels[zoneKey]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

const MAX_SEARCH_RESULTS = 20;

const MIN_QUERY_LENGTH = 1;

function CardSearch({
  allPrintings,
  onSelect,
}: {
  allPrintings: Printing[];
  onSelect: (card: ResolvedCard) => void;
}) {
  const [query, setQuery] = useState("");
  const { rows, codesByCardId } = useResolvedCardIndex(allPrintings);
  const matches = useCardSearch(rows, query, codesByCardId, MAX_SEARCH_RESULTS, MIN_QUERY_LENGTH);
  const results = matches.map((row) => ({
    id: row.id,
    label: row.name,
    sublabel: row.card.shortCode,
    leading: <CardThumbnail cardId={row.id} className="h-8" />,
    card: row.card,
  }));

  return (
    <CardSearchDropdown
      ariaLabel="Search cards"
      placeholder="Search cards..."
      className="h-8 w-full sm:h-7 sm:w-44"
      results={results}
      onSearch={setQuery}
      onSelect={(_id, result) => onSelect(result.card)}
    />
  );
}
