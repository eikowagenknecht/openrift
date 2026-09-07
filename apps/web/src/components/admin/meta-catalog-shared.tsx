import { META_CATALOG_PROVIDERS } from "@openrift/shared";
import type {
  MetaCatalogRow,
  MetaSource,
  MetaSyncTriggerResult,
} from "@openrift/shared/contracts/admin/meta-catalog";
import { useState } from "react";
import { toast } from "sonner";

import { AdminFilterSelect } from "@/components/admin/admin-filters";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useDeckFormatList } from "@/hooks/use-enums";
import type { MetaSearch } from "@/lib/admin-meta-search";
import { META_SOURCE_LABELS, syncTriggerAnnouncement } from "@/lib/meta-catalog-display";

export function announceSyncTrigger(label: string, result: MetaSyncTriggerResult): void {
  const announcement = syncTriggerAnnouncement(label, result);
  const options =
    announcement.description === "" ? undefined : { description: announcement.description };
  if (announcement.ok) {
    toast.success(announcement.title, options);
    return;
  }
  toast.error(announcement.title, options);
}

const SOURCE_OPTIONS = META_CATALOG_PROVIDERS.map((provider) => ({
  value: provider,
  label: META_SOURCE_LABELS[provider],
}));

export function CatalogSourceSelect({
  source,
  applyFilter,
}: {
  source: MetaSource;
  applyFilter: (next: Partial<MetaSearch>) => void;
}) {
  return (
    <AdminFilterSelect
      value={source}
      onChange={(value) => {
        const next = META_CATALOG_PROVIDERS.find((provider) => provider === value);
        if (next === undefined) {
          return;
        }
        applyFilter({
          source: next === "uvsgames" ? undefined : next,
          eventStatus: undefined,
          plStatus: undefined,
          tdFormat: undefined,
          decklists: undefined,
          awaitingResults: undefined,
        });
      }}
      options={SOURCE_OPTIONS}
      className="w-40"
      label="Source"
    />
  );
}

export function MetaCatalogAcceptDialog({
  row,
  pending,
  onCancel,
  onConfirm,
}: {
  row: MetaCatalogRow | null;
  pending: boolean;
  onCancel: () => void;
  onConfirm: (format: string) => void;
}) {
  const { formats } = useDeckFormatList();
  const [format, setFormat] = useState("");

  if (row === null) {
    return null;
  }

  return (
    <AlertDialog open onOpenChange={(open) => !open && onCancel()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Which format is &ldquo;{row.name}&rdquo;?</AlertDialogTitle>
          <AlertDialogDescription>
            {row.eventFormat === null
              ? "The source published no format for this event, so the archive has nothing to file it under."
              : `The source calls this "${row.eventFormat}", which maps to none of our formats.`}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="space-y-2">
          <Label htmlFor="meta-catalog-accept-format">Format</Label>
          <Select
            items={formats.map((entry) => ({ value: entry.slug, label: entry.label }))}
            value={format}
            onValueChange={(next) => setFormat(next ?? "")}
          >
            <SelectTrigger id="meta-catalog-accept-format" className="w-full">
              <SelectValue placeholder="Pick a format" />
            </SelectTrigger>
            <SelectContent>
              {formats.map((entry) => (
                <SelectItem key={entry.slug} value={entry.slug}>
                  {entry.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <Button disabled={format === "" || pending} onClick={() => onConfirm(format)}>
            Accept
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
