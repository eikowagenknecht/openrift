import type { ListEntryDetailResponse, ListKind } from "@openrift/shared/types/api/list";
import { DownloadIcon } from "lucide-react";
import type { ReactNode } from "react";
import { useState } from "react";
import { toast } from "sonner";

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
import { useCards } from "@/features/cards/hooks/use-cards";
import type { CsvExportFormat } from "@/features/collections/lib/csv-export";
import {
  CSV_EXPORT_FORMATS,
  csvExportFilename,
  csvExportLabels,
  downloadCSV,
} from "@/features/collections/lib/csv-export";
import { CopyTextButton } from "@/features/groups/components/copy-text-button";
import { CardmarketWantsBlock } from "@/features/lists/components/cardmarket-wants-block";
import { useFilteredListEntries } from "@/features/lists/hooks/use-filtered-list-entries";
import {
  formatCardListAsDeckText,
  hasReservedCopies,
  stacksFromListEntries,
  withoutReservedCopies,
} from "@/features/lists/lib/list-export";
import { useEnumOrders } from "@/hooks/use-enums";

interface ListExportDialogProps {
  listName: string;
  kind: ListKind;
  entries: readonly ListEntryDetailResponse[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

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
        <CardmarketWantsBlock
          wants={exportEntries.map((entry) => ({ name: entry.cardName, quantity: entry.quantity }))}
        />
      </DialogContent>
    </Dialog>
  );
}

function TextExport({
  entries,
  options,
}: {
  entries: readonly ListEntryDetailResponse[];
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
  options?: ReactNode;
}) {
  const { printingsById, sets } = useCards();
  const { labels } = useEnumOrders();
  const [format, setFormat] = useState<CsvExportFormat>("openrift");

  const stacks = stacksFromListEntries(entries, printingsById, sets);
  const cardCount = stacks.reduce((sum, stack) => sum + stack.copyIds.length, 0);

  const handleDownload = () => {
    const csv = CSV_EXPORT_FORMATS[format].generate(stacks, csvExportLabels(sets, labels));
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
