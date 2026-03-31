import type { DeckImportCardPreview, DeckResponse, DeckZone } from "@openrift/shared";
import { useNavigate } from "@tanstack/react-router";
import { Download, Loader2 } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useCreateDeck, useImportPreview, useSaveDeckCards } from "@/hooks/use-decks";

const FORMAT_LABELS: Record<string, string> = {
  standard: "Standard",
  freeform: "Freeform",
};

const ZONE_LABELS: Record<DeckZone, string> = {
  legend: "Legend",
  champion: "Champion",
  runes: "Runes",
  battlefield: "Battlefield",
  main: "Main Deck",
  sideboard: "Sideboard",
  overflow: "Overflow",
};

/** Display order for zones in the preview. */
const ZONE_ORDER: DeckZone[] = ["legend", "champion", "runes", "battlefield", "main", "sideboard"];

function PreviewSection({ cards }: { cards: DeckImportCardPreview[] }) {
  const grouped = Map.groupBy(cards, (card) => card.zone);

  return (
    <div className="flex max-h-64 flex-col gap-3 overflow-y-auto text-sm">
      {ZONE_ORDER.map((zone) => {
        const zoneCards = grouped.get(zone);
        if (!zoneCards || zoneCards.length === 0) {
          return null;
        }
        const totalQty = zoneCards.reduce((sum, card) => sum + card.quantity, 0);

        return (
          <div key={zone}>
            <p className="text-muted-foreground mb-1 text-xs font-medium">
              {ZONE_LABELS[zone]} ({totalQty})
            </p>
            <ul className="space-y-0.5">
              {zoneCards.map((card) => (
                <li key={card.cardId} className="flex items-center gap-2">
                  <span className="text-muted-foreground w-5 text-right text-xs">
                    {card.quantity}x
                  </span>
                  <span>{card.cardName}</span>
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </div>
  );
}

interface ImportDeckDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function ImportDeckDialog({ open, onOpenChange }: ImportDeckDialogProps) {
  const navigate = useNavigate();
  const importPreview = useImportPreview();
  const createDeck = useCreateDeck();
  const saveDeckCards = useSaveDeckCards();

  const [code, setCode] = useState("");
  const [name, setName] = useState("Imported Deck");
  const [format, setFormat] = useState<"standard" | "freeform">("standard");
  const [step, setStep] = useState<"paste" | "preview" | "creating">("paste");

  const handlePreview = () => {
    importPreview.mutate(
      { code },
      {
        onSuccess: () => setStep("preview"),
      },
    );
  };

  const handleImport = () => {
    setStep("creating");
    createDeck.mutate(
      { name, format },
      {
        onSuccess: (data) => {
          const deck = data as DeckResponse;
          const cards = (importPreview.data?.cards ?? []).map((card) => ({
            cardId: card.cardId,
            zone: card.zone,
            quantity: card.quantity,
          }));
          saveDeckCards.mutate(
            { deckId: deck.id, cards },
            {
              onSuccess: () => {
                onOpenChange(false);
                void navigate({ to: "/decks/$deckId", params: { deckId: deck.id } });
              },
              onError: () => setStep("preview"),
            },
          );
        },
        onError: () => setStep("preview"),
      },
    );
  };

  const handleBack = () => {
    setStep("paste");
    importPreview.reset();
  };

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) {
      // Reset state on close
      setCode("");
      setName("Imported Deck");
      setFormat("standard");
      setStep("paste");
      importPreview.reset();
    }
    onOpenChange(nextOpen);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Import deck</DialogTitle>
        </DialogHeader>

        {step === "paste" && (
          <>
            <div className="flex flex-col gap-4 py-2">
              <div className="flex flex-col gap-2">
                <Label htmlFor="import-code">Deck code</Label>
                <Textarea
                  id="import-code"
                  placeholder="Paste a Piltover Archive deck code..."
                  value={code}
                  onChange={(event) => setCode(event.target.value)}
                  className="font-mono text-xs"
                  rows={3}
                  // oxlint-disable-next-line jsx-a11y/no-autofocus -- dialog input should auto-focus
                  autoFocus
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="import-name">Deck name</Label>
                <Input
                  id="import-name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="import-format">Format</Label>
                <Select value={format} onValueChange={(value) => setFormat(value as typeof format)}>
                  <SelectTrigger id="import-format">
                    <SelectValue>{(value: string) => FORMAT_LABELS[value] ?? value}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="standard">Standard</SelectItem>
                    <SelectItem value="freeform">Freeform</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {importPreview.isError && (
                <p className="text-destructive text-sm">
                  Invalid or unsupported deck code. Check the code and try again.
                </p>
              )}
            </div>
            <DialogFooter>
              <Button onClick={handlePreview} disabled={!code.trim() || importPreview.isPending}>
                {importPreview.isPending && <Loader2 className="size-4 animate-spin" />}
                Preview
              </Button>
            </DialogFooter>
          </>
        )}

        {step === "preview" && importPreview.data && (
          <>
            <PreviewSection cards={importPreview.data.cards} />

            {importPreview.data.warnings.length > 0 && (
              <div className="text-muted-foreground text-xs">
                <p className="font-medium">Warnings:</p>
                <ul className="mt-1 list-inside list-disc">
                  {importPreview.data.warnings.map((warning) => (
                    <li key={warning}>{warning}</li>
                  ))}
                </ul>
              </div>
            )}

            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={handleBack}>
                Back
              </Button>
              <Button onClick={handleImport} disabled={importPreview.data.cards.length === 0}>
                Import
              </Button>
            </DialogFooter>
          </>
        )}

        {step === "creating" && (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="text-muted-foreground size-6 animate-spin" />
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

export function ImportDeckButton() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        <Download className="size-4" />
        Import
      </Button>
      <ImportDeckDialog open={open} onOpenChange={setOpen} />
    </>
  );
}
