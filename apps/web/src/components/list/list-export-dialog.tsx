import type { ListEntryDetailResponse } from "@openrift/shared";
import { CheckIcon, CopyIcon } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { formatCardListAsDeckText } from "@/lib/list-export";

interface ListExportDialogProps {
  entries: readonly ListEntryDetailResponse[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ListExportDialog({ entries, open, onOpenChange }: ListExportDialogProps) {
  const [copied, setCopied] = useState(false);

  const code = formatCardListAsDeckText(entries);

  const handleCopy = async () => {
    // Use \r\n so line breaks survive iOS Safari's clipboard.
    const text = code.replaceAll("\n", "\r\n");
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      globalThis.setTimeout(() => setCopied(false), 1500);
    } catch {
      // Ignore clipboard errors — user can still select the text manually.
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
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
            <Button onClick={handleCopy} disabled={code.length === 0}>
              {copied ? <CheckIcon className="size-4" /> : <CopyIcon className="size-4" />}
              {copied ? "Copied" : "Copy"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
