import type { AdminMetaEvent, MetaEventTier } from "@openrift/shared";
import { META_EVENT_TIERS } from "@openrift/shared";
import { useState } from "react";
import { toast } from "sonner";

import { MetaCrossSourcePanel } from "@/components/admin/meta-cross-source-panel";
import { MetaEventDriftPanel } from "@/components/admin/meta-event-drift-panel";
import { MetaEventSourcesEditor } from "@/components/admin/meta-event-sources-editor";
import { ReviewDisclosure } from "@/components/admin/meta-review-shared";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { DialogForm } from "@/components/ui/dialog-form";
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
import { useCreateMetaEvent, useUpdateMetaEvent } from "@/hooks/use-admin-meta";
import { useWriteMetaEventOverlayFields } from "@/hooks/use-admin-meta-overlays";
import { useDeckFormatList } from "@/hooks/use-enums";
import type { MetaEventBody, MetaEventDraft } from "@/lib/admin-meta-draft";
import {
  EMPTY_META_EVENT_DRAFT,
  metaEventDraftToBody,
  metaEventOverlayEdits,
  metaEventToDraft,
  validateMetaEventDraft,
} from "@/lib/admin-meta-draft";
import { errorText } from "@/lib/error-text";
import { META_EVENT_TIER_LABELS } from "@/lib/meta-format";

const FORM_ID = "meta-event-form";

interface MetaEventDialogProps {
  event?: AdminMetaEvent;
  onClose: () => void;
}

// Editing writes the slug first: a failed rename should not leave an overlay claim behind.
export function MetaEventDialog({ event, onClose }: MetaEventDialogProps) {
  const { formats, labels: formatLabels } = useDeckFormatList();
  const createEvent = useCreateMetaEvent();
  const updateEvent = useUpdateMetaEvent();
  const writeOverlay = useWriteMetaEventOverlayFields();

  const [draft, setDraft] = useState<MetaEventDraft>(() =>
    event ? metaEventToDraft(event) : { ...EMPTY_META_EVENT_DRAFT, format: formats[0]?.slug ?? "" },
  );
  const [formError, setFormError] = useState("");
  const [driftOpen, setDriftOpen] = useState(false);
  const [crossSourceOpen, setCrossSourceOpen] = useState(false);

  const isPending = createEvent.isPending || updateEvent.isPending || writeOverlay.isPending;

  function set<TKey extends keyof MetaEventDraft>(key: TKey, value: MetaEventDraft[TKey]) {
    setDraft((prev) => ({ ...prev, [key]: value }));
  }

  async function saveEdit(current: AdminMetaEvent, body: MetaEventBody): Promise<void> {
    if (body.slug !== current.slug) {
      await updateEvent.mutateAsync({ id: current.id, slug: body.slug });
    }
    const edits = metaEventOverlayEdits(current, body);
    if (edits.length > 0) {
      await writeOverlay.mutateAsync({ id: current.id, edits });
    }
  }

  async function handleSubmit() {
    const problem = validateMetaEventDraft(draft);
    if (problem) {
      setFormError(problem);
      return;
    }
    setFormError("");
    const body = metaEventDraftToBody(draft);
    // The branch is resolved before the try: the compiler bails on a
    // conditional inside one, and a `finally` is not lowerable either.
    const save = event ? () => saveEdit(event, body) : () => createEvent.mutateAsync(body);
    const successMessage = event ? `Updated "${body.name}"` : `Created "${body.name}"`;
    try {
      await save();
      toast.success(successMessage);
      onClose();
    } catch (error) {
      setFormError(errorText(error, "Save failed"));
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-xl">
        <DialogForm id={FORM_ID} onSubmit={() => void handleSubmit()}>
          <DialogHeader>
            <DialogTitle>{event ? "Edit event" : "New event"}</DialogTitle>
            <DialogDescription>
              The slug is the event&apos;s public URL. Renaming it breaks existing links.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="meta-event-slug">Slug</Label>
              <Input
                id="meta-event-slug"
                value={draft.slug}
                onChange={(e) => set("slug", e.target.value.toLowerCase())}
                placeholder="summoner-skirmish-2026"
                className="font-mono"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="meta-event-name">Name</Label>
              <Input
                id="meta-event-name"
                value={draft.name}
                onChange={(e) => set("name", e.target.value)}
                placeholder="Summoner Skirmish 2026"
              />
            </div>

            <div className="space-y-1.5">
              <Label>Date</Label>
              <DatePicker
                value={draft.eventDate}
                onChange={(iso) => set("eventDate", iso)}
                onClear={() => set("eventDate", "")}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="meta-event-format">Format</Label>
              <Select
                value={draft.format}
                onValueChange={(value) => {
                  if (value !== null) {
                    set("format", value as string);
                  }
                }}
                items={formatLabels}
              >
                <SelectTrigger id="meta-event-format" className="mb-0 w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {formats.map((format) => (
                    <SelectItem key={format.slug} value={format.slug}>
                      {format.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="meta-event-tier">Tier</Label>
              <Select
                value={draft.tier}
                onValueChange={(value) => {
                  if (value !== null) {
                    set("tier", value as MetaEventTier);
                  }
                }}
                items={META_EVENT_TIER_LABELS}
              >
                <SelectTrigger id="meta-event-tier" className="mb-0 w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {META_EVENT_TIERS.map((tier) => (
                    <SelectItem key={tier} value={tier}>
                      {META_EVENT_TIER_LABELS[tier]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="meta-event-players">Players</Label>
              <Input
                id="meta-event-players"
                value={draft.playerCount}
                inputMode="numeric"
                onChange={(e) => set("playerCount", e.target.value)}
                placeholder="Optional"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="meta-event-organizer">Organizer</Label>
              <Input
                id="meta-event-organizer"
                value={draft.organizer}
                onChange={(e) => set("organizer", e.target.value)}
                placeholder="Optional, e.g. LGS Berlin"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="meta-event-country">Country</Label>
              <Input
                id="meta-event-country"
                value={draft.country}
                onChange={(e) => set("country", e.target.value.toUpperCase())}
                placeholder="Optional, e.g. DE"
                maxLength={2}
                className="font-mono"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="meta-event-location">Address</Label>
              <Input
                id="meta-event-location"
                value={draft.location}
                onChange={(e) => set("location", e.target.value)}
                placeholder="Optional venue address"
              />
            </div>

            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="meta-event-notes">Notes</Label>
              <Textarea
                id="meta-event-notes"
                value={draft.notes}
                onChange={(e) => set("notes", e.target.value)}
                placeholder="Optional markdown, shown on the event page"
                className="min-h-24"
              />
            </div>
          </div>

          {formError && <p className="text-destructive text-sm">{formError}</p>}
        </DialogForm>

        {/* Kept outside the form element: nested there, Enter in a source/drift field would submit the event. */}
        {event && <MetaEventSourcesEditor eventId={event.id} />}

        {event && (
          <ReviewDisclosure title="Source drift" onOpenChange={setDriftOpen}>
            <MetaEventDriftPanel metaEventId={event.id} enabled={driftOpen} />
          </ReviewDisclosure>
        )}

        {event && (
          <ReviewDisclosure title="Cross-source players" onOpenChange={setCrossSourceOpen}>
            <MetaCrossSourcePanel metaEventId={event.id} enabled={crossSourceOpen} />
          </ReviewDisclosure>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form={FORM_ID} disabled={isPending}>
            {event ? "Save" : "Create event"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
