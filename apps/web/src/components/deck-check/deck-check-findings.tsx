import type { DeckCheckChangeSummary, DeckCheckEntryDetailResponse } from "@openrift/shared";
import { legendDisplayName } from "@openrift/shared";
import { RefreshCwIcon, WandSparklesIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { DialogForm } from "@/components/ui/dialog-form";
import { Label } from "@/components/ui/label";
import { useCards } from "@/hooks/use-cards";
import { useZoneOrder } from "@/hooks/use-enums";
import {
  useApplyTournamentDeckCheckZoneFixes,
  useReResolveTournamentDeckCheck,
} from "@/hooks/use-tournament-deck-check";
import { zoneFixAllowed } from "@/lib/deck-check-actions";

export function ChangeBanner({ summary }: { summary: DeckCheckChangeSummary }) {
  const describe = (line: { name: string; quantity: number }) => `${line.quantity}× ${line.name}`;
  return (
    <div className="border-destructive/50 bg-destructive/10 flex flex-col gap-1 rounded-md border p-3 text-sm">
      <span className="font-medium">This list changed since a judge last reviewed it.</span>
      {summary.added.length > 0 ? (
        <span>Added: {summary.added.map((line) => describe(line)).join(", ")}</span>
      ) : null}
      {summary.removed.length > 0 ? (
        <span>Removed: {summary.removed.map((line) => describe(line)).join(", ")}</span>
      ) : null}
      {summary.changed.length > 0 ? (
        <span>
          Changed:{" "}
          {summary.changed
            .map((line) => `${line.name} ${line.oldQuantity}× → ${line.newQuantity}×`)
            .join(", ")}
        </span>
      ) : null}
    </div>
  );
}

export function FindingsBanner({
  tournamentId,
  detail,
  onResolved,
}: {
  tournamentId: string;
  detail: DeckCheckEntryDetailResponse;
  onResolved: () => void;
}) {
  const reResolve = useReResolveTournamentDeckCheck();
  const [fixZonesOpen, setFixZonesOpen] = useState(false);
  const unmatched = detail.cards.filter((card) => card.matchStatus !== "matched");
  const suggestions = detail.zoneSuggestions;
  // Zone corrections are allowed while submitted, approved, or checked — the same
  // gate the per-card pencil uses. Add/remove stays locked to submitted.
  const canFixZones = suggestions.length > 0 && zoneFixAllowed(detail.entry.state);
  if (detail.violations.length === 0 && unmatched.length === 0 && suggestions.length === 0) {
    return null;
  }
  return (
    <div className="flex flex-col gap-2 rounded-md border border-amber-500/50 bg-amber-500/10 p-3 text-sm">
      <span className="font-medium">Possible deck problems</span>
      <ul className="list-disc pl-5">
        {unmatched.length > 0 ? (
          <li>
            {unmatched.length} {unmatched.length === 1 ? "card" : "cards"} could not be matched to
            the catalog and cannot be validated.
          </li>
        ) : null}
        {suggestions.length > 0 ? (
          <li>
            {suggestions.length} {suggestions.length === 1 ? "card looks" : "cards look"} mis-zoned:
            their type belongs in a different zone than the import put them in.
          </li>
        ) : null}
        {detail.violations.map((violation) => (
          <li key={`${violation.zone}:${violation.code}:${violation.cardId ?? ""}`}>
            {violation.message}
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap gap-2">
        {unmatched.length > 0 ? (
          <Button
            size="sm"
            variant="outline"
            disabled={reResolve.isPending}
            title="Try matching the unidentified cards against the catalog again, e.g. after a catalog fix"
            onClick={async () => {
              const result = await reResolve.mutateAsync({ tournamentId });
              toast.info(
                result.updatedLines === 0
                  ? "No new matches found"
                  : `${result.updatedLines} ${result.updatedLines === 1 ? "line" : "lines"} now resolve`,
              );
              onResolved();
            }}
          >
            <RefreshCwIcon className="size-4" />
            Re-resolve cards
          </Button>
        ) : null}
        {canFixZones ? (
          <Button size="sm" variant="outline" onClick={() => setFixZonesOpen(true)}>
            <WandSparklesIcon className="size-4" />
            Fix zones
          </Button>
        ) : null}
      </div>
      {canFixZones ? (
        <FixZonesDialog
          tournamentId={tournamentId}
          entryId={detail.entry.id}
          suggestions={suggestions}
          open={fixZonesOpen}
          onOpenChange={setFixZonesOpen}
        />
      ) : null}
    </div>
  );
}

function FixZonesDialog({
  tournamentId,
  entryId,
  suggestions,
  open,
  onOpenChange,
}: {
  tournamentId: string;
  entryId: string;
  suggestions: DeckCheckEntryDetailResponse["zoneSuggestions"];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { zoneLabels } = useZoneOrder();
  const { printingsByCardId } = useCards();
  const applyZoneFixes = useApplyTournamentDeckCheckZoneFixes();
  // Every suggestion starts selected; a judge unticks any move that is
  // deliberate (e.g. a custom format that parks a card in a non-standard zone).
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(suggestions.map((suggestion) => suggestion.cardId)),
  );

  // The server-stored name is the bare catalog name; show the colloquial Legend
  // name ("Azir, Emperor of the Sands") from the catalog when we can resolve it.
  const displayNameFor = (suggestion: DeckCheckEntryDetailResponse["zoneSuggestions"][number]) => {
    const printing = printingsByCardId.get(suggestion.cardId)?.[0];
    return printing ? legendDisplayName(printing.card) : suggestion.cardName;
  };

  const handleApply = async () => {
    const cardIds = suggestions
      .map((suggestion) => suggestion.cardId)
      .filter((cardId) => selected.has(cardId));
    if (cardIds.length === 0) {
      return;
    }
    await applyZoneFixes.mutateAsync({ tournamentId, entryId, cardIds });
    onOpenChange(false);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (nextOpen) {
          setSelected(new Set(suggestions.map((suggestion) => suggestion.cardId)));
        }
        onOpenChange(nextOpen);
      }}
    >
      <DialogContent>
        <DialogForm onSubmit={() => void handleApply()}>
          <DialogHeader>
            <DialogTitle>Fix card zones</DialogTitle>
            <DialogDescription>
              Based on their type, these cards belong in a different zone than the import put them
              in. Untick any that are intentional, then apply the rest.
            </DialogDescription>
          </DialogHeader>
          <ul className="flex flex-col gap-2">
            {suggestions.map((suggestion) => (
              <li key={suggestion.cardId}>
                <Label className="hover:bg-muted/40 flex items-center gap-3 rounded-md p-2">
                  <Checkbox
                    checked={selected.has(suggestion.cardId)}
                    onCheckedChange={(checked: boolean) =>
                      setSelected((prev) => {
                        const next = new Set(prev);
                        if (checked) {
                          next.add(suggestion.cardId);
                        } else {
                          next.delete(suggestion.cardId);
                        }
                        return next;
                      })
                    }
                  />
                  <span className="min-w-0 flex-1 truncate font-normal">
                    {displayNameFor(suggestion)}
                  </span>
                  <span className="text-muted-foreground shrink-0 text-sm">
                    {zoneLabels[suggestion.currentZone]} → {zoneLabels[suggestion.suggestedZone]}
                  </span>
                </Label>
              </li>
            ))}
          </ul>
          <DialogFooter>
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={applyZoneFixes.isPending || selected.size === 0}>
              {applyZoneFixes.isPending ? "Applying..." : `Move ${selected.size}`}
            </Button>
          </DialogFooter>
        </DialogForm>
      </DialogContent>
    </Dialog>
  );
}
