import type { ListEntryDetailResponse, ListKind } from "@openrift/shared";
import { CheckIcon, CopyIcon, DownloadIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { useCopyToClipboard } from "@/hooks/use-copy-to-clipboard";
import type { CsvExportFormat } from "@/lib/csv-export";
import { CSV_EXPORT_FORMATS, csvExportFilename, downloadCSV } from "@/lib/csv-export";
import {
  formatCardListAsDeckText,
  formatCardmarketWants,
  stacksFromListEntries,
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
 * @returns The export dialog.
 */
export function ListExportDialog({
  listName,
  kind,
  entries,
  open,
  onOpenChange,
}: ListExportDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        {kind === "card" ? (
          <TextExport entries={entries} />
        ) : (
          <CsvExport listName={listName} entries={entries} />
        )}
        {kind !== "copy" && <CardmarketBlock entries={entries} />}
      </DialogContent>
    </Dialog>
  );
}

function TextExport({ entries }: { entries: readonly ListEntryDetailResponse[] }) {
  const { copied, copy } = useCopyToClipboard();

  const code = formatCardListAsDeckText(entries);

  // Use \r\n so line breaks survive iOS Safari's clipboard.
  const handleCopy = () => void copy(code.replaceAll("\n", "\r\n"));

  return (
    <DialogForm onSubmit={handleCopy}>
      <DialogHeader>
        <DialogTitle>Export list</DialogTitle>
        <DialogDescription>
          A plain-text list with one card per line, ready to paste into deck-building tools.
        </DialogDescription>
      </DialogHeader>

      <div className="flex min-w-0 flex-col gap-3">
        <Textarea
          readOnly
          value={code}
          className="field-sizing-fixed font-mono text-xs"
          rows={12}
          onClick={(event) => (event.target as HTMLTextAreaElement).select()}
        />
        <div className="flex justify-end">
          <Button type="submit" disabled={code.length === 0}>
            {copied ? <CheckIcon className="size-4" /> : <CopyIcon className="size-4" />}
            {copied ? "Copied" : "Copy"}
          </Button>
        </div>
      </div>
    </DialogForm>
  );
}

function CsvExport({
  listName,
  entries,
}: {
  listName: string;
  entries: readonly ListEntryDetailResponse[];
}) {
  const { printingsById } = useCards();
  const [format, setFormat] = useState<CsvExportFormat>("openrift");

  const stacks = stacksFromListEntries(entries, printingsById);
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
        <DialogDescription>
          Download this list as a CSV file, in OpenRift&apos;s own format or another tool&apos;s.
        </DialogDescription>
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
  const { copied, copy } = useCopyToClipboard();

  const text = formatCardmarketWants(
    entries.map((entry) => ({ name: entry.cardName, quantity: entry.quantity })),
  );

  if (text.length === 0) {
    return null;
  }

  // Use \r\n so line breaks survive iOS Safari's clipboard.
  const handleCopy = () => void copy(text.replaceAll("\n", "\r\n"));

  const lineCount = text.split("\n").length;

  return (
    <div className="flex min-w-0 flex-col gap-1.5 border-t pt-4">
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-medium">Cardmarket wants</h3>
        <Button size="sm" variant="outline" onClick={handleCopy}>
          {copied ? <CheckIcon /> : <CopyIcon />}
          {copied ? "Copied" : "Copy"}
        </Button>
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
