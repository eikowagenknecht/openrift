import { sortCards } from "@openrift/shared/filters";
import type { Printing } from "@openrift/shared/types/catalog";
import { useQuery } from "@tanstack/react-query";
import { DownloadIcon, Loader2Icon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Heading } from "@/components/heading";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useCards } from "@/features/cards/hooks/use-cards";
import { useCollections } from "@/features/collections/hooks/use-collections";
import { copiesQueryOptions } from "@/features/collections/lib/copies-query";
import type { CsvExportFormat } from "@/features/collections/lib/csv-export";
import {
  CSV_EXPORT_FORMATS,
  csvExportFilename,
  csvExportLabels,
  downloadCSV,
} from "@/features/collections/lib/csv-export";
import { useEnumOrders } from "@/hooks/use-enums";
import { useRequiredUserId } from "@/lib/auth-session";
import { cn, PAGE_WIDTH } from "@/lib/utils";

export function CollectionExportSection() {
  const userId = useRequiredUserId();
  const { data: collections } = useCollections();
  const { allPrintings, sets } = useCards();
  const { labels } = useEnumOrders();
  const [exportCollectionId, setExportCollectionId] = useState<string>("__all__");
  const [exportFormat, setExportFormat] = useState<CsvExportFormat>("openrift");

  const queryCollectionId = exportCollectionId === "__all__" ? undefined : exportCollectionId;
  const { data: copies, isLoading } = useQuery(copiesQueryOptions(userId, queryCollectionId));

  const handleExport = () => {
    if (!copies) {
      return;
    }

    const printingById = new Map<string, Printing>();
    for (const printing of allPrintings) {
      printingById.set(printing.id, printing);
    }

    const stackMap = new Map<
      string,
      { printingId: string; printing: Printing; copyIds: string[] }
    >();
    for (const copy of copies) {
      const printing = printingById.get(copy.printingId);
      if (!printing) {
        continue;
      }
      const existing = stackMap.get(copy.printingId);
      if (existing) {
        existing.copyIds.push(copy.id);
      } else {
        stackMap.set(copy.printingId, {
          printingId: copy.printingId,
          printing,
          copyIds: [copy.id],
        });
      }
    }

    const stacks = [...stackMap.values()];
    const sortedPrintings = sortCards(
      stacks.map((stack) => stack.printing),
      "id",
      { sets },
    );
    const byPrintingId = new Map(stacks.map((stack) => [stack.printingId, stack]));
    const sortedStacks = sortedPrintings
      .map((printing) => byPrintingId.get(printing.id))
      .filter(
        (stack): stack is { printingId: string; printing: Printing; copyIds: string[] } =>
          stack !== undefined,
      );

    // Each printing exports one row per distinct metadata combination, so
    // conditions and notes survive the round trip.
    const copiesById = new Map(copies.map((copy) => [copy.id, copy]));
    const csv = CSV_EXPORT_FORMATS[exportFormat].generate(
      sortedStacks,
      csvExportLabels(sets, labels),
      copiesById,
    );

    const collectionName =
      exportCollectionId === "__all__"
        ? "all-cards"
        : (collections?.find((col) => col.id === exportCollectionId)?.name ?? "collection");

    downloadCSV(csv, csvExportFilename(exportFormat, collectionName));
    toast.success("Collection exported.");
  };

  const copyCount = copies?.length ?? 0;

  return (
    <div className={cn(PAGE_WIDTH.capped, "space-y-6")}>
      <div>
        <Heading level={2}>Export Collection</Heading>
        <p className="text-muted-foreground text-sm">
          Download your collection as a CSV file, in OpenRift&apos;s own format or another
          tool&apos;s.
        </p>
      </div>

      <div className="space-y-1.5">
        <label className="text-sm font-medium" htmlFor="export-collection">
          Collection
        </label>
        <div className="flex flex-wrap items-center gap-3">
          <Select
            value={exportCollectionId}
            onValueChange={(value) => setExportCollectionId(value ?? "__all__")}
            items={{
              __all__: "All Cards",
              ...Object.fromEntries(collections?.map((col) => [col.id, col.name]) ?? []),
            }}
          >
            <SelectTrigger className="w-[240px]" id="export-collection">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">All Cards</SelectItem>
              <SelectSeparator />
              {collections?.map((col) => (
                <SelectItem key={col.id} value={col.id}>
                  {col.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            value={exportFormat}
            onValueChange={(value) => setExportFormat((value as CsvExportFormat) ?? "openrift")}
            items={Object.fromEntries(
              Object.entries(CSV_EXPORT_FORMATS).map(([key, def]) => [key, def.label]),
            )}
          >
            <SelectTrigger className="w-[200px]" id="export-format">
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

          <Button onClick={handleExport} disabled={isLoading || copyCount === 0}>
            {isLoading ? (
              <>
                <Loader2Icon className="mr-2 size-4 animate-spin" />
                Loading...
              </>
            ) : (
              <>
                <DownloadIcon className="mr-2 size-4" />
                Export {copyCount} {copyCount === 1 ? "copy" : "copies"}
              </>
            )}
          </Button>
        </div>

        {exportFormat !== "openrift" && (
          <p className="text-muted-foreground text-sm">
            OpenRift tracks some printings other tools don&apos;t, so a few cards may not be
            recognized when you import this file there.
          </p>
        )}
      </div>
    </div>
  );
}
