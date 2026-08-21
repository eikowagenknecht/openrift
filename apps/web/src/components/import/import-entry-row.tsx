import type { Printing } from "@openrift/shared";
import { WellKnown } from "@openrift/shared";
import { AlertTriangleIcon, CheckCircle2Icon, SearchIcon, XCircleIcon } from "lucide-react";
import { useState } from "react";

import {
  PrintingChoicePreview,
  usePrintingChoiceHover,
} from "@/components/cards/printing-choice-menu";
import { PrintingRowContent } from "@/components/cards/printing-row";
import { ImportRowRawFields, ImportRowShell } from "@/components/import/import-row-shell";
import { PrintingSearch } from "@/components/printing-search";
import { Button } from "@/components/ui/button";
import { ExpandToggle } from "@/components/ui/expand-toggle";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useEnumOrders } from "@/hooks/use-enums";
import { formatImportPrintingLabel } from "@/lib/format";
import type { MatchedEntry } from "@/lib/import-matcher";
import type { ImportBucket } from "@/lib/import-summary";
import { getImportBucket } from "@/lib/import-summary";
import { cn } from "@/lib/utils";

const BUCKET_CONFIG: Record<ImportBucket, { icon: React.ElementType; className: string }> = {
  ready: { icon: CheckCircle2Icon, className: "text-emerald-600 dark:text-emerald-400" },
  "to-verify": { icon: AlertTriangleIcon, className: "text-amber-600 dark:text-amber-400" },
  "need-attention": { icon: XCircleIcon, className: "text-red-600 dark:text-red-400" },
};

interface ImportEntryRowProps {
  entry: MatchedEntry;
  allPrintings: Printing[];
  index: number;
  isSkipped: boolean;
  isExpanded: boolean;
  onResolve: (index: number, printing: Printing) => void;
  onSkip: (index: number) => void;
  onUnskip: (index: number) => void;
  onToggleExpand: (index: number) => void;
}

export function ImportEntryRow({
  entry,
  allPrintings,
  index,
  isSkipped,
  isExpanded,
  onResolve,
  onSkip,
  onUnskip,
  onToggleExpand,
}: ImportEntryRowProps) {
  const [showSearch, setShowSearch] = useState(false);
  const { icon: StatusIcon, className: statusColor } = BUCKET_CONFIG[getImportBucket(entry)];
  const rawFieldEntries = Object.entries(entry.entry.rawFields);
  const hasCandidates = entry.candidates.length > 0;
  const { labels } = useEnumOrders();
  const specialties = formatEntrySpecialties(entry, labels.finishes);

  return (
    <div className={cn(isSkipped && "opacity-40")}>
      <ImportRowShell
        chevron={
          <ExpandToggle
            expanded={isExpanded}
            className="text-muted-foreground hover:text-foreground shrink-0"
            chevronClassName="text-inherit"
            onClick={() => onToggleExpand(index)}
            aria-label={isExpanded ? "Collapse import details" : "Expand import details"}
          />
        }
        statusIcon={<StatusIcon className={cn("size-4 shrink-0", statusColor)} />}
        quantity={entry.entry.quantity}
        code={entry.entry.sourceCode}
        name={entry.entry.cardName}
        nameSuffix={specialties}
        actions={
          <>
            {entry.suggestedName && (
              <span className="text-muted-foreground text-xs">
                Did you mean <em>{entry.suggestedName}</em>?
              </span>
            )}
            {showSearch ? (
              <PrintingSearch
                allPrintings={allPrintings}
                onSelect={(printing) => {
                  onResolve(index, printing);
                  setShowSearch(false);
                }}
              />
            ) : hasCandidates ? (
              <VariantPicker
                candidates={entry.candidates}
                resolved={entry.resolvedPrinting}
                onSelect={(printing) => onResolve(index, printing)}
              />
            ) : null}
            <Button
              variant="ghost"
              size="xs"
              onClick={() => setShowSearch(!showSearch)}
              aria-label={showSearch ? "Close search" : "Search catalog"}
            >
              {showSearch ? (
                <XCircleIcon className="size-3.5" />
              ) : (
                <SearchIcon className="size-3.5" />
              )}
            </Button>
            {isSkipped ? (
              <Button variant="ghost" size="xs" onClick={() => onUnskip(index)}>
                Unskip
              </Button>
            ) : (
              <Button variant="ghost" size="xs" onClick={() => onSkip(index)}>
                Skip
              </Button>
            )}
          </>
        }
      />
      {isExpanded && rawFieldEntries.length > 0 && (
        <div className="bg-muted/30 px-4 py-2">
          <ImportRowRawFields entries={rawFieldEntries} />
        </div>
      )}
    </div>
  );
}

/** @returns A "Foil · Alt Art" style suffix, or null when there's nothing notable. */
function formatEntrySpecialties(
  entry: MatchedEntry,
  finishLabels: Record<string, string>,
): string | null {
  const parts: string[] = [];
  if (entry.entry.finish !== WellKnown.finish.NORMAL) {
    parts.push(finishLabels[entry.entry.finish] ?? entry.entry.finish);
  }
  if (entry.entry.artVariant === WellKnown.artVariant.ALTART) {
    parts.push("Alt Art");
  }
  if (entry.entry.artVariant === WellKnown.artVariant.OVERNUMBERED) {
    parts.push("Overnumbered");
  }
  return parts.length > 0 ? parts.join(" · ") : null;
}

function VariantPicker({
  candidates,
  resolved,
  onSelect,
}: {
  candidates: Printing[];
  resolved: Printing | null;
  onSelect: (printing: Printing) => void;
}) {
  const { labels } = useEnumOrders();
  const { hoveredId, popupRef, hoverProps, reset } = usePrintingChoiceHover();
  return (
    <Select
      value={resolved?.id ?? ""}
      onOpenChange={(open) => !open && reset()}
      onValueChange={(value) => {
        const printing = candidates.find((candidate) => candidate.id === value);
        if (printing) {
          onSelect(printing);
        }
      }}
      items={Object.fromEntries(
        candidates.map((printing) => [printing.id, formatImportPrintingLabel(printing, labels)]),
      )}
    >
      <SelectTrigger size="sm" className="h-7 w-auto text-xs">
        <SelectValue placeholder="Pick printing..." />
      </SelectTrigger>
      <SelectContent ref={popupRef} className="w-auto">
        {candidates.map((printing) => (
          <SelectItem
            key={printing.id}
            value={printing.id}
            className="py-1.5"
            {...hoverProps(printing.id)}
          >
            <PrintingRowContent printing={printing} siblings={candidates} />
          </SelectItem>
        ))}
      </SelectContent>
      <PrintingChoicePreview hoveredId={hoveredId} printings={candidates} anchorRef={popupRef} />
    </Select>
  );
}
