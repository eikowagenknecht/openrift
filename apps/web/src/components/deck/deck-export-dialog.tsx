import type { DeckExportResponse } from "@openrift/shared";
import { CheckIcon, CopyIcon, Loader2Icon } from "lucide-react";
import { useEffect, useEffectEvent, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { useCopyToClipboard } from "@/hooks/use-copy-to-clipboard";
import { useDeckCards } from "@/hooks/use-deck-builder";
import { useEncodeDeckCards, useExportDeck } from "@/hooks/use-decks";
import type { DeckBuilderCard } from "@/lib/deck-builder-card";
import { toEncodeDeckCards } from "@/lib/deck-encode-input";
import type { PublicDeckSource } from "@/lib/public-deck-source";
import { isLocalDeckId } from "@/stores/local-decks-store";

type ExportFormat = "piltover" | "text" | "tts";

const FORMAT_DESCRIPTIONS: Record<ExportFormat, React.ReactNode> = {
  piltover: (
    <>
      A compact code that can be imported into{" "}
      <a
        href="https://piltoverarchive.com"
        target="_blank"
        rel="noreferrer"
        className="text-foreground underline"
      >
        Piltover Archive
      </a>
      .
    </>
  ),
  text: (
    <>
      A human-readable list grouped by zone. Used by many deck builders, including{" "}
      <a
        href="https://piltoverarchive.com"
        target="_blank"
        rel="noreferrer"
        className="text-foreground underline"
      >
        Piltover Archive
      </a>{" "}
      and{" "}
      <a
        href="https://tcg-arena.fr/decks"
        target="_blank"
        rel="noreferrer"
        className="text-foreground underline"
      >
        TCG Arena
      </a>
      .
    </>
  ),
  tts: (
    <>
      Space-separated short codes for the{" "}
      <a
        href="https://steamcommunity.com/sharedfiles/filedetails/?id=3606647746"
        target="_blank"
        rel="noreferrer"
        className="text-foreground underline"
      >
        Tabletop Simulator mod
      </a>
      .
    </>
  ),
};

interface DeckExportDialogProps {
  deckId: string;
  isDirty: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Cards for a browser-local deck. Falls back to the live editor draft. */
  cards?: DeckBuilderCard[];
  /** Set when the deck is only reachable by share token, never owned. */
  publicSource?: PublicDeckSource;
}

/**
 * Export dialog for the machine-readable deck data: the plain text list, the
 * Piltover deck code, and the Tabletop Simulator codes. The share image lives
 * in the share dialog and every PDF in the print dialog.
 *
 * @returns The export dialog element.
 */
export function DeckExportDialog({
  deckId,
  isDirty,
  open,
  onOpenChange,
  cards: cardsProp,
  publicSource,
}: DeckExportDialogProps) {
  const exportDeck = useExportDeck();
  // A browser-local deck (ADR-035) or one reached by share token has no server
  // row to export by id; encode its cards through the public endpoint instead.
  const encodeDeck = useEncodeDeckCards();
  const fromCards = publicSource !== undefined || isLocalDeckId(deckId);
  // Subscribing the draft of a deck the viewer doesn't own would fetch someone
  // else's deck, and a caller bringing its own cards never reads it anyway.
  const liveCards = useDeckCards(cardsProp === undefined ? deckId : "");
  const { copied, copy, reset: resetCopied } = useCopyToClipboard();
  const [tab, setTab] = useState<ExportFormat>("text");
  const [formats, setFormats] = useState<Partial<Record<ExportFormat, DeckExportResponse>>>({});

  // Closing discards everything the dialog built up. The local drafts reset
  // during render; the two mutations are external and reset in the effect.
  const [seededOpen, setSeededOpen] = useState(open);
  if (seededOpen !== open) {
    setSeededOpen(open);
    if (!open) {
      setTab("text");
      setFormats({});
    }
  }
  const discardMutations = useEffectEvent(() => {
    exportDeck.reset();
    encodeDeck.reset();
    resetCopied();
  });
  useEffect(() => {
    if (open) {
      return;
    }
    discardMutations();
  }, [open]);

  // Whichever mutation this deck exports through. In-flight and failed states
  // are read off it rather than mirrored into `formats`, which only caches the
  // code each format came back with.
  const exportMutation = fromCards ? encodeDeck : exportDeck;

  // The deck itself is read as it stands when a format is first opened, not
  // reactively: an edit landing behind the dialog must not silently refetch the
  // text the user is in the middle of copying.
  const fetchFormat = useEffectEvent((format: ExportFormat) => {
    if (
      formats[format] ||
      (exportMutation.isPending && exportMutation.variables?.format === format)
    ) {
      return;
    }
    const onSuccess = (data: DeckExportResponse) => {
      setFormats((prev) => ({ ...prev, [format]: data }));
    };
    if (fromCards) {
      // Use the passed-in cards when available (the list menu, where the draft
      // collection isn't hydrated); fall back to the live editor draft.
      encodeDeck.mutate(
        { format, cards: toEncodeDeckCards(cardsProp ?? liveCards) },
        { onSuccess },
      );
    } else {
      exportDeck.mutate({ deckId, format }, { onSuccess });
    }
  });
  useEffect(() => {
    if (!open) {
      return;
    }
    fetchFormat(tab);
  }, [open, tab]);

  const handleTabChange = (newTab: ExportFormat) => {
    setTab(newTab);
    resetCopied();
  };

  const currentData = formats[tab];
  const isCurrentTab = exportMutation.variables?.format === tab;
  const currentLoading = exportMutation.isPending && isCurrentTab;
  const currentError = exportMutation.isError && isCurrentTab;

  const handleCopy = () => {
    if (!currentData?.code) {
      return;
    }
    // Use \r\n so line breaks survive iOS Safari's clipboard
    void copy(currentData.code.replaceAll("\n", "\r\n"));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <Tabs
          defaultValue="text"
          value={tab}
          onValueChange={(value) => handleTabChange(value as ExportFormat)}
        >
          <DialogHeader>
            <DialogTitle>Export deck</DialogTitle>
            <TabsList>
              <TabsTrigger value="text">Text</TabsTrigger>
              <TabsTrigger value="piltover">Deck Code</TabsTrigger>
              <TabsTrigger value="tts">TTS</TabsTrigger>
            </TabsList>
            <DialogDescription>{FORMAT_DESCRIPTIONS[tab]}</DialogDescription>
          </DialogHeader>

          {isDirty && (
            <p className="text-muted-foreground text-sm">
              You have unsaved changes. The exported code reflects the last saved state.
            </p>
          )}

          <TabsContent value={tab}>
            <div className="flex min-w-0 flex-col gap-3">
              <Textarea
                readOnly
                value={currentData?.code ?? ""}
                placeholder={currentError ? "Failed to generate export." : ""}
                className="field-sizing-fixed font-mono text-xs break-all"
                rows={8}
                onClick={(event) => (event.target as HTMLTextAreaElement).select()}
              />

              <div className="flex items-center gap-2 self-end">
                {currentLoading && (
                  <Loader2Icon className="text-muted-foreground size-4 animate-spin" />
                )}
                <Button onClick={handleCopy} disabled={!currentData}>
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
              </div>

              {currentData && currentData.warnings.length > 0 && (
                <div className="text-muted-foreground text-xs">
                  <p className="font-medium">Warnings:</p>
                  <ul className="mt-1 list-inside list-disc">
                    {currentData.warnings.map((warning) => (
                      <li key={warning}>{warning}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
