import { legendDisplayName } from "@openrift/shared/utils";
import { useQuery } from "@tanstack/react-query";
import { DownloadIcon, Loader2Icon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DialogForm } from "@/components/ui/dialog-form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useCards } from "@/features/cards/hooks/use-cards";
import { buildCollectionCsv } from "@/features/collections/lib/collection-csv-export";
import { copiesQueryOptions } from "@/features/collections/lib/copies-query";
import type { CsvExportFormat } from "@/features/collections/lib/csv-export";
import {
  CSV_EXPORT_FORMATS,
  csvExportFilename,
  csvExportLabels,
  downloadCSV,
} from "@/features/collections/lib/csv-export";
import { CardmarketWantsBlock } from "@/features/lists/components/cardmarket-wants-block";
import { useEnumOrders } from "@/hooks/use-enums";
import { useRequiredUserId } from "@/lib/auth-session";

interface CollectionExportDialogProps {
  collectionId?: string;
  collectionName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CollectionExportDialog({
  collectionId,
  collectionName,
  open,
  onOpenChange,
}: CollectionExportDialogProps) {
  const userId = useRequiredUserId();
  const { allPrintings, printingsById, sets } = useCards();
  const { labels } = useEnumOrders();
  const [format, setFormat] = useState<CsvExportFormat>("openrift");

  const { data: copies, isLoading } = useQuery(copiesQueryOptions(userId, collectionId));

  const wantsByName = new Map<string, number>();
  for (const copy of copies ?? []) {
    const printing = printingsById[copy.printingId];
    if (!printing) {
      continue;
    }
    const name = legendDisplayName(printing.card);
    wantsByName.set(name, (wantsByName.get(name) ?? 0) + 1);
  }
  const wants = [...wantsByName.entries()].map(([name, quantity]) => ({ name, quantity }));

  const copyCount = copies?.length ?? 0;

  const handleExport = () => {
    if (!copies) {
      return;
    }
    const csv = buildCollectionCsv(
      copies,
      allPrintings,
      sets,
      csvExportLabels(sets, labels),
      format,
    );
    downloadCSV(csv, csvExportFilename(format, collectionName));
    toast.success("Collection exported.");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogForm onSubmit={handleExport}>
          <DialogHeader>
            <DialogTitle>Export collection</DialogTitle>
          </DialogHeader>

          <div className="flex min-w-0 flex-col gap-3">
            <Select
              value={format}
              onValueChange={(value) => setFormat((value as CsvExportFormat) ?? "openrift")}
              items={Object.fromEntries(
                Object.entries(CSV_EXPORT_FORMATS).map(([key, def]) => [key, def.label]),
              )}
            >
              <SelectTrigger className="w-[220px]" id="collection-export-format">
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
              <Button type="submit" disabled={isLoading || copyCount === 0}>
                {isLoading ? (
                  <>
                    <Loader2Icon className="size-4 animate-spin" />
                    Loading...
                  </>
                ) : (
                  <>
                    <DownloadIcon className="size-4" />
                    Export {copyCount} {copyCount === 1 ? "copy" : "copies"}
                  </>
                )}
              </Button>
            </div>
          </div>
        </DialogForm>

        <CardmarketWantsBlock wants={wants} />
      </DialogContent>
    </Dialog>
  );
}
