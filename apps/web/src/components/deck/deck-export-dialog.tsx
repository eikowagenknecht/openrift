import { CheckIcon, CopyIcon, Loader2Icon, Share2Icon } from "lucide-react";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { useExportDeck } from "@/hooks/use-decks";

type ExportFormat = "piltover" | "text" | "tts";

const FORMAT_DESCRIPTIONS: Record<ExportFormat, string> = {
  piltover: "Copy this code to share your deck or import it into Piltover Archive.",
  text: "Human-readable list grouped by zone, for sharing in chat or forums.",
  tts: "Space-separated short codes for Tabletop Simulator.",
};

interface DeckExportDialogProps {
  deckId: string;
  isDirty: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export function DeckExportDialog({
  deckId,
  isDirty,
  open: controlledOpen,
  onOpenChange: controlledOnOpenChange,
}: DeckExportDialogProps) {
  const [internalOpen, setInternalOpen] = useState(false);
  const open = controlledOpen ?? internalOpen;
  const setOpen = controlledOnOpenChange ?? setInternalOpen;
  const isControlled = controlledOpen !== undefined;
  const exportDeck = useExportDeck();
  const [copied, setCopied] = useState(false);
  const [format, setFormat] = useState<ExportFormat>("piltover");

  useEffect(() => {
    if (open) {
      exportDeck.mutate({ deckId, format });
      setCopied(false);
    }
    if (!open) {
      exportDeck.reset();
      setFormat("piltover");
    }
  }, [open]); // oxlint-disable-line react-hooks/exhaustive-deps -- only trigger on open/close

  const handleFormatChange = (newFormat: ExportFormat) => {
    setFormat(newFormat);
    setCopied(false);
    exportDeck.mutate({ deckId, format: newFormat });
  };

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
      {!isControlled && (
        <DialogTrigger render={<Button variant="outline" size="sm" />}>
          <Share2Icon className="size-4" />
          Export
        </DialogTrigger>
      )}
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Export deck</DialogTitle>
          <DialogDescription>{FORMAT_DESCRIPTIONS[format]}</DialogDescription>
        </DialogHeader>

        {isDirty && (
          <p className="text-muted-foreground text-sm">
            You have unsaved changes. The exported code reflects the last saved state.
          </p>
        )}

        <Tabs
          defaultValue="piltover"
          value={format}
          onValueChange={(value) => handleFormatChange(value as ExportFormat)}
        >
          <TabsList>
            <TabsTrigger value="piltover">Deck Code</TabsTrigger>
            <TabsTrigger value="text">Text</TabsTrigger>
            <TabsTrigger value="tts">TTS</TabsTrigger>
          </TabsList>

          <TabsContent value={format}>
            <div className="flex min-w-0 flex-col gap-3">
              {exportDeck.isPending ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2Icon className="text-muted-foreground size-6 animate-spin" />
                </div>
              ) : exportDeck.isError ? (
                <p className="text-destructive text-sm">Failed to generate export.</p>
              ) : exportDeck.data ? (
                <>
                  <Textarea
                    readOnly
                    value={exportDeck.data.code}
                    className="font-mono text-xs"
                    rows={format === "piltover" ? 3 : 12}
                    onClick={(event) => (event.target as HTMLTextAreaElement).select()}
                  />

                  <Button onClick={handleCopy} className="self-end">
                    {copied ? (
                      <>
                        <CheckIcon className="size-4" />
                        Copied
                      </>
                    ) : (
                      <>
                        <CopyIcon className="size-4" />
                        Copy
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
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
