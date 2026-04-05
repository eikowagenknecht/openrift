import { CheckIcon, CopyIcon, FileTextIcon, Loader2Icon, Share2Icon } from "lucide-react";
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
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { useExportDeck } from "@/hooks/use-decks";
import type { RegistrationPageSize } from "@/lib/registration-pdf";
import { generateRegistrationPdf } from "@/lib/registration-pdf";
import type { DeckBuilderCard } from "@/stores/deck-builder-store";
import { useDeckBuilderStore } from "@/stores/deck-builder-store";

type ExportFormat = "piltover" | "text" | "tts";
type ExportTab = ExportFormat | "registration";

const FORMAT_DESCRIPTIONS: Record<ExportTab, string> = {
  piltover: "Copy this code to share your deck or import it into Piltover Archive.",
  text: "Human-readable list grouped by zone, for sharing in chat or forums.",
  tts: "Space-separated short codes for Tabletop Simulator.",
  registration: "Generate a printable tournament deck registration sheet.",
};

const PAGE_SIZE_LABELS: Record<RegistrationPageSize, string> = {
  a4: "A4",
  letter: "US Letter",
};

interface DeckExportDialogProps {
  deckId: string;
  deckName?: string;
  isDirty: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Cards for registration sheet. Falls back to the deck builder store when omitted. */
  cards?: DeckBuilderCard[];
}

export function DeckExportDialog({
  deckId,
  deckName,
  isDirty,
  open: controlledOpen,
  onOpenChange: controlledOnOpenChange,
  cards: cardsProp,
}: DeckExportDialogProps) {
  const [internalOpen, setInternalOpen] = useState(false);
  const open = controlledOpen ?? internalOpen;
  const setOpen = controlledOnOpenChange ?? setInternalOpen;
  const isControlled = controlledOpen !== undefined;
  const exportDeck = useExportDeck();
  const [copied, setCopied] = useState(false);
  const [tab, setTab] = useState<ExportTab>("piltover");
  const [registrationPageSize, setRegistrationPageSize] = useState<RegistrationPageSize>("a4");
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    if (open && tab !== "registration") {
      exportDeck.mutate({ deckId, format: tab });
      setCopied(false);
    }
    if (!open) {
      exportDeck.reset();
      setTab("piltover");
    }
  }, [open]); // oxlint-disable-line react-hooks/exhaustive-deps -- only trigger on open/close

  const handleTabChange = (newTab: ExportTab) => {
    setTab(newTab);
    setCopied(false);
    if (newTab !== "registration") {
      exportDeck.mutate({ deckId, format: newTab });
    }
  };

  const handleCopy = async () => {
    if (!exportDeck.data?.code) {
      return;
    }
    // Use \r\n so line breaks survive iOS Safari's clipboard
    const text = exportDeck.data.code.replaceAll("\n", "\r\n");
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleGenerateRegistration = async () => {
    const cards = cardsProp ?? useDeckBuilderStore.getState().cards;
    if (cards.length === 0) {
      return;
    }
    setGenerating(true);
    try {
      await generateRegistrationPdf(deckName ?? "Untitled Deck", cards, registrationPageSize);
    } finally {
      setGenerating(false);
    }
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
          <DialogDescription>{FORMAT_DESCRIPTIONS[tab]}</DialogDescription>
        </DialogHeader>

        {isDirty && tab !== "registration" && (
          <p className="text-muted-foreground text-sm">
            You have unsaved changes. The exported code reflects the last saved state.
          </p>
        )}

        <Tabs
          defaultValue="piltover"
          value={tab}
          onValueChange={(value) => handleTabChange(value as ExportTab)}
        >
          <TabsList>
            <TabsTrigger value="piltover">Deck Code</TabsTrigger>
            <TabsTrigger value="text">Text</TabsTrigger>
            <TabsTrigger value="tts">TTS</TabsTrigger>
            <TabsTrigger value="registration">Registration</TabsTrigger>
          </TabsList>

          {tab === "registration" ? (
            <TabsContent value="registration">
              <div className="flex flex-col gap-4">
                <div className="flex flex-col gap-2">
                  <Label htmlFor="registration-page-size">Page size</Label>
                  <Select
                    value={registrationPageSize}
                    onValueChange={(value) =>
                      setRegistrationPageSize(value as RegistrationPageSize)
                    }
                  >
                    <SelectTrigger id="registration-page-size">
                      <SelectValue>
                        {(value: string) =>
                          PAGE_SIZE_LABELS[value as RegistrationPageSize] ?? value
                        }
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="a4">A4</SelectItem>
                      <SelectItem value="letter">US Letter</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <Button onClick={handleGenerateRegistration} disabled={generating}>
                  {generating ? (
                    <>
                      <Loader2Icon className="size-4 animate-spin" />
                      Generating…
                    </>
                  ) : (
                    <>
                      <FileTextIcon className="size-4" />
                      Download PDF
                    </>
                  )}
                </Button>
              </div>
            </TabsContent>
          ) : (
            <TabsContent value={tab}>
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
                      className="font-mono text-xs break-all [field-sizing:fixed]"
                      rows={tab === "piltover" ? 3 : 12}
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
          )}
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
