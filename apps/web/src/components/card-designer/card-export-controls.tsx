import { CopyIcon, DownloadIcon } from "lucide-react";

import { Button } from "@/components/ui/button";

/**
 * Presentational export buttons (Download PNG / Copy) plus a status line. The
 * actual capture lives in the page so it can drive the off-screen render clone.
 *
 * @returns The export controls element.
 */
export function CardExportControls({
  onDownload,
  onCopy,
  busy,
  status,
}: {
  onDownload: () => void;
  onCopy: () => void;
  busy: boolean;
  status: string | null;
}) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-2">
        <Button type="button" className="flex-1" disabled={busy} onClick={onDownload}>
          <DownloadIcon className="size-4" />
          Download PNG
        </Button>
        <Button type="button" variant="outline" disabled={busy} onClick={onCopy}>
          <CopyIcon className="size-4" />
          Copy
        </Button>
      </div>
      {status && (
        <p className="text-muted-foreground text-sm" role="status">
          {status}
        </p>
      )}
    </div>
  );
}
