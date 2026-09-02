import type { MetaEventDetail } from "@openrift/shared";
import { TriangleAlertIcon } from "lucide-react";
import { useState } from "react";

import { Alert, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { DialogForm } from "@/components/ui/dialog-form";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useDeckFormatList } from "@/hooks/use-enums";
import { useSubmitMetaEventCorrection } from "@/hooks/use-meta-submissions";
import type { MetaEventCorrectionDraft } from "@/lib/meta-event-correction-form";
import {
  metaEventCorrectionDraft,
  metaEventCorrectionEdits,
  validateMetaEventCorrectionDraft,
} from "@/lib/meta-event-correction-form";

/**
 * "Suggest a correction" for an archived event's own facts (ADR-014's User
 * submissions). Every box opens holding what the archive says, so changing one
 * is the whole gesture; the note is what a reviewer reads first and is the one
 * required field.
 *
 * Nothing here edits the event. The correction goes into the same review queue a
 * decklist does, and an admin applies it by hand.
 *
 * @param props.event The event as the page has it.
 * @param props.onClose Closes the dialog.
 * @returns The dialog element.
 */
export function MetaEventCorrectionDialog({
  event,
  onClose,
}: {
  event: MetaEventDetail;
  onClose: () => void;
}) {
  const { labels: formatLabels } = useDeckFormatList();
  const submit = useSubmitMetaEventCorrection();
  const [draft, setDraft] = useState<MetaEventCorrectionDraft>(() =>
    metaEventCorrectionDraft(event),
  );
  const [problem, setProblem] = useState("");
  const [sent, setSent] = useState(false);

  function set<TKey extends keyof MetaEventCorrectionDraft>(
    key: TKey,
    value: MetaEventCorrectionDraft[TKey],
  ) {
    setDraft((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit() {
    const found = validateMetaEventCorrectionDraft(draft, event);
    if (found !== null) {
      setProblem(found);
      return;
    }
    setProblem("");
    let outcome;
    try {
      outcome = await submit.mutateAsync({
        metaEventId: event.id,
        fieldEdits: metaEventCorrectionEdits(draft, event),
        note: draft.note.trim(),
      });
    } catch {
      /* Reported by the global mutation error toast. */
      return;
    }
    if (!outcome.ok) {
      setProblem(outcome.message);
      return;
    }
    setSent(true);
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogForm onSubmit={() => void handleSubmit()}>
          <DialogHeader>
            <DialogTitle>Suggest a correction</DialogTitle>
            <DialogDescription>
              {sent
                ? "Thank you. Someone reads every correction by hand, so this can take a while."
                : "Change what the archive has wrong about this tournament. Nothing changes until someone reads it."}
            </DialogDescription>
          </DialogHeader>

          {!sent && (
            <div className="max-h-[60vh] overflow-y-auto py-2">
              <FieldGroup>
                <Field>
                  <FieldLabel htmlFor="meta-correction-note">What&apos;s wrong</FieldLabel>
                  <Textarea
                    id="meta-correction-note"
                    value={draft.note}
                    rows={3}
                    maxLength={2000}
                    placeholder="What we got wrong, and where you saw the right version"
                    onChange={(e) => set("note", e.target.value)}
                  />
                </Field>

                <Field>
                  <FieldLabel htmlFor="meta-correction-name">Tournament name</FieldLabel>
                  <Input
                    id="meta-correction-name"
                    value={draft.name}
                    maxLength={120}
                    onChange={(e) => set("name", e.target.value)}
                  />
                </Field>

                <Field>
                  <FieldLabel htmlFor="meta-correction-date">Day it was played</FieldLabel>
                  <DatePicker
                    value={draft.eventDate}
                    onChange={(iso) => set("eventDate", iso)}
                    onClear={() => set("eventDate", event.eventDate)}
                    className="w-full"
                  />
                </Field>

                <Field>
                  <FieldLabel htmlFor="meta-correction-players">How many played</FieldLabel>
                  <Input
                    id="meta-correction-players"
                    inputMode="numeric"
                    value={draft.playerCount}
                    placeholder="64"
                    onChange={(e) => set("playerCount", e.target.value)}
                  />
                </Field>

                <Field>
                  <FieldLabel htmlFor="meta-correction-organizer">Who ran it</FieldLabel>
                  <Input
                    id="meta-correction-organizer"
                    value={draft.organizer}
                    maxLength={120}
                    placeholder="Rift Games Berlin"
                    onChange={(e) => set("organizer", e.target.value)}
                  />
                </Field>

                <Field>
                  <FieldLabel htmlFor="meta-correction-location">Venue</FieldLabel>
                  <Input
                    id="meta-correction-location"
                    value={draft.location}
                    maxLength={200}
                    placeholder="Ionia Hall, Berlin"
                    onChange={(e) => set("location", e.target.value)}
                  />
                </Field>

                <Field>
                  <FieldLabel htmlFor="meta-correction-country">Country</FieldLabel>
                  <Input
                    id="meta-correction-country"
                    value={draft.country}
                    maxLength={2}
                    placeholder="DE"
                    className="w-20 uppercase"
                    onChange={(e) => set("country", e.target.value)}
                  />
                  <FieldDescription>Two-letter code, like DE or US.</FieldDescription>
                </Field>

                <Field>
                  <FieldDescription>
                    The format stays as we have it ({formatLabels[event.format] ?? event.format}).
                    If that is wrong too, say so in the note.
                  </FieldDescription>
                </Field>
              </FieldGroup>
            </div>
          )}

          {problem !== "" && (
            <Alert variant="destructive">
              <TriangleAlertIcon />
              <AlertTitle>{problem}</AlertTitle>
            </Alert>
          )}

          <DialogFooter>
            <DialogClose render={<Button variant="outline" type="button" />}>
              {sent ? "Close" : "Cancel"}
            </DialogClose>
            {!sent && (
              <Button type="submit" disabled={submit.isPending}>
                {submit.isPending ? "Sending…" : "Send the correction"}
              </Button>
            )}
          </DialogFooter>
        </DialogForm>
      </DialogContent>
    </Dialog>
  );
}
