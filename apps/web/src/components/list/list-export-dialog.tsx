import type { ListEntryDetailResponse, ListKind } from "@openrift/shared";
import { DownloadIcon } from "lucide-react";
import type { ReactNode } from "react";
import { useState } from "react";
import { toast } from "sonner";

import { CopyTextButton } from "@/components/share/copy-text-button";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DialogForm } from "@/components/ui/dialog-form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useCards } from "@/hooks/use-cards";
import { useFilteredListEntries } from "@/hooks/use-filtered-list-entries";
import type { CsvExportFormat } from "@/lib/csv-export";
import { CSV_EXPORT_FORMATS, csvExportFilename, downloadCSV } from "@/lib/csv-export";
import {
  formatCardListAsDeckText,
  formatCardmarketWants,
  hasReservedCopies,
  stacksFromListEntries,
  withoutReservedCopies,
} from "@/lib/list-export";

interface ListExportDialogProps {
  listName: string;
  kind: ListKind;
  entries: readonly ListEntryDetailResponse[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Card-kind lists export as a plain-text deck list (one `<quantity> <name>`
 * per line); printing- and copy-kind lists export as a CSV download in any of
 * the supported formats, reusing the collection export writers. Card- and
 * printing-kind lists additionally get a Cardmarket-ready wants block —
 * copy-kind lists hold owned copies, not wants, so they don't.
 *
 * Copies pinned to a live trade are dropped by default, because an export is
 * where a user promises cards without checking a badge. The filter runs once
 * here so no format below can miss it, and the toggle only appears when the
 * list actually holds a reserved copy.
 *
 * The same goes for the grid's own filters: with any active, the export
 * defaults to what the user is looking at rather than the whole list, since
 * narrowing the grid and then exporting is the whole reason to filter before
 * exporting. Both scoping steps run before any format sees the entries.
 * @returns The export dialog.
 */
export function ListExportDialog({
  listName,
  kind,
  entries,
  open,
  onOpenChange,
}: ListExportDialogProps) {
  const [applyFilters, setApplyFilters] = useState(true);
  const [excludeReserved, setExcludeReserved] = useState(true);

  const { hasActiveFilters, filteredEntries } = useFilteredListEntries(entries);
  const scopedEntries = hasActiveFilters && applyFilters ? filteredEntries : entries;

  const hasReserved = hasReservedCopies(scopedEntries);
  const exportEntries =
    hasReserved && excludeReserved ? withoutReservedCopies(scopedEntries) : scopedEntries;

  const options = (
    <>
      {hasActiveFilters && (
        <div className="flex items-center gap-2">
          <Checkbox
            id="list-export-apply-filters"
            checked={applyFilters}
            onCheckedChange={(checked) => setApplyFilters(checked === true)}
          />
          <label htmlFor="list-export-apply-filters" className="cursor-pointer text-sm">
            Only cards matching the current filters ({filteredEntries.length} of {entries.length})
          </label>
        </div>
      )}
      {hasReserved && (
        <div className="flex items-center gap-2">
          <Checkbox
            id="list-export-exclude-reserved"
            checked={excludeReserved}
            onCheckedChange={(checked) => setExcludeReserved(checked === true)}
          />
          <label htmlFor="list-export-exclude-reserved" className="cursor-pointer text-sm">
            Exclude cards reserved in a trade
          </label>
        </div>
      )}
    </>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        {kind === "card" ? (
          <TextExport entries={exportEntries} options={options} />
        ) : (
          <CsvExport listName={listName} entries={exportEntries} options={options} />
        )}
        {kind !== "copy" && <CardmarketBlock entries={exportEntries} />}
      </DialogContent>
    </Dialog>
  );
}

function TextExport({
  entries,
  options,
}: {
  entries: readonly ListEntryDetailResponse[];
  /** Extra export options, rendered between the text area and the button. */
  options?: ReactNode;
}) {
  const code = formatCardListAsDeckText(entries);

  return (
    <>
      <DialogHeader>
        <DialogTitle>Export list</DialogTitle>
      </DialogHeader>

      <div className="flex min-w-0 flex-col gap-3">
        <Textarea
          readOnly
          value={code}
          className="field-sizing-fixed font-mono text-xs"
          rows={12}
          onClick={(event) => (event.target as HTMLTextAreaElement).select()}
        />
        {options}
        {/* Nothing to copy once the scope filters leave the list empty, so the
            button steps aside rather than sitting there dead. */}
        {code.length > 0 && (
          <div className="flex justify-end">
            <CopyTextButton label="Copy" getText={() => code} />
          </div>
        )}
      </div>
    </>
  );
}

function CsvExport({
  listName,
  entries,
  options,
}: {
  listName: string;
  entries: readonly ListEntryDetailResponse[];
  /** Extra export options, rendered between the format select and the button. */
  options?: ReactNode;
}) {
  const { printingsById, sets } = useCards();
  const [format, setFormat] = useState<CsvExportFormat>("openrift");

  const stacks = stacksFromListEntries(entries, printingsById, sets);
  const cardCount = stacks.reduce((sum, stack) => sum + stack.copyIds.length, 0);

  const handleDownload = () => {
    const csv = CSV_EXPORT_FORMATS[format].generate(stacks);
    downloadCSV(csv, csvExportFilename(format, listName));
    toast.success("List exported.");
  };

  return (
    <DialogForm onSubmit={handleDownload}>
      <DialogHeader>
        <DialogTitle>Export list</DialogTitle>
      </DialogHeader>

      <div className="flex min-w-0 flex-col gap-3">
        <Select
          value={format}
          onValueChange={(value) => setFormat((value as CsvExportFormat) ?? "openrift")}
          items={Object.fromEntries(
            Object.entries(CSV_EXPORT_FORMATS).map(([key, def]) => [key, def.label]),
          )}
        >
          <SelectTrigger className="w-[220px]" id="list-export-format">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(CSV_EXPORT_FORMATS).map(([key, def]) => (
              <SelectItem key={key} value={key}>
                {def.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {options}
        <div className="flex justify-end">
          <Button type="submit" disabled={cardCount === 0}>
            <DownloadIcon className="size-4" />
            Export {cardCount} {cardCount === 1 ? "card" : "cards"}
          </Button>
        </div>
      </div>
    </DialogForm>
  );
}

/**
 * Cardmarket-ready wants block: pure `Nx Name` lines with its own copy button,
 * because Cardmarket's shopping wizard matches lines by card name and any
 * extra text (short codes, prices, CSV columns) breaks the match.
 * @returns The wants block, or null when the list has no entries.
 */
function CardmarketBlock({ entries }: { entries: readonly ListEntryDetailResponse[] }) {
  const text = formatCardmarketWants(
    entries.map((entry) => ({ name: entry.cardName, quantity: entry.quantity })),
  );

  if (text.length === 0) {
    return null;
  }

  const lineCount = text.split("\n").length;

  return (
    <div className="flex min-w-0 flex-col gap-1.5 border-t pt-4">
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-medium">Cardmarket wants</h3>
        <CopyTextButton label="Copy" getText={() => text} size="sm" />
      </div>
      <p className="text-muted-foreground text-sm">
        Paste into Cardmarket&apos;s shopping wizard to price the list with your own filters.
      </p>
      <Textarea
        readOnly
        value={text}
        className="field-sizing-fixed font-mono text-xs"
        rows={Math.min(Math.max(lineCount, 2), 8)}
        onClick={(event) => (event.target as HTMLTextAreaElement).select()}
      />
    </div>
  );
}
