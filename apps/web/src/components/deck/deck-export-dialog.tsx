import { Check, Copy, Loader2, Share2 } from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { useExportDeck } from "@/hooks/use-decks";

interface DeckExportDialogProps {
  deckId: string;
  isDirty: boolean;
}

export function DeckExportDialog({ deckId, isDirty }: DeckExportDialogProps) {
  const [open, setOpen] = useState(false);
  const exportDeck = useExportDeck();
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (open) {
      exportDeck.mutate(deckId);
      setCopied(false);
    }
    // Reset on close
    if (!open) {
      exportDeck.reset();
    }
  }, [open]); // oxlint-disable-line react-hooks/exhaustive-deps -- only trigger on open/close

  const handleCopy = async () => {
    if (!exportDeck.data?.code) {
      return;
    }
    await navigator.clipboard.writeText(exportDeck.data.code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="outline" size="sm" />}>
        <Share2 className="size-4" />
        Export
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Export deck code</DialogTitle>
          <DialogDescription>
            Copy this code to share your deck or import it into Piltover Archive.
          </DialogDescription>
        </DialogHeader>

        {isDirty && (
          <p className="text-muted-foreground text-sm">
            You have unsaved changes. The exported code reflects the last saved state.
          </p>
        )}

        <div className="flex flex-col gap-3">
          {exportDeck.isPending ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="text-muted-foreground size-6 animate-spin" />
            </div>
          ) : exportDeck.isError ? (
            <p className="text-destructive text-sm">Failed to generate deck code.</p>
          ) : exportDeck.data ? (
            <>
              <Textarea
                readOnly
                value={exportDeck.data.code}
                className="font-mono text-xs"
                rows={3}
                onClick={(event) => (event.target as HTMLTextAreaElement).select()}
              />

              <Button onClick={handleCopy} className="self-end">
                {copied ? (
                  <>
                    <Check className="size-4" />
                    Copied
                  </>
                ) : (
                  <>
                    <Copy className="size-4" />
                    Copy code
                  </>
                )}
              </Button>

              {exportDeck.data.warnings.length > 0 && (
                <div className="text-muted-foreground text-xs">
                  <p className="font-medium">Warnings:</p>
                  <ul className="mt-1 list-inside list-disc">
                    {exportDeck.data.warnings.map((warning) => (
                      <li key={warning}>{warning}</li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
