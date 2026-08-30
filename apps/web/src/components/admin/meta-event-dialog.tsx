import type { AdminMetaEvent, MetaEventTier } from "@openrift/shared";
import { META_EVENT_TIERS } from "@openrift/shared";
import { useState } from "react";
import { toast } from "sonner";

import { MetaEventSourcesEditor } from "@/components/admin/meta-event-sources-editor";
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
import { useDeckFormatList } from "@/hooks/use-enums";
import type { MetaEventDraft } from "@/lib/admin-meta-draft";
import {
  EMPTY_META_EVENT_DRAFT,
  metaEventDraftToBody,
  metaEventToDraft,
  validateMetaEventDraft,
} from "@/lib/admin-meta-draft";
import { errorText } from "@/lib/error-text";
import { META_EVENT_TIER_LABELS } from "@/lib/meta-format";

interface MetaEventDialogProps {
  /** The event being edited. Omitted when the dialog creates a new one. */
  event?: AdminMetaEvent;
  onClose: () => void;
}

/**
 * The create / edit form for an archived event. The event list mounts it only
 * while it is open, so the draft starts fresh on every open.
 *
 * @returns The event dialog.
 */
export function MetaEventDialog({ event, onClose }: MetaEventDialogProps) {
  const { formats, labels: formatLabels } = useDeckFormatList();
  const createEvent = useCreateMetaEvent();
  const updateEvent = useUpdateMetaEvent();

  const [draft, setDraft] = useState<MetaEventDraft>(() =>
    event ? metaEventToDraft(event) : { ...EMPTY_META_EVENT_DRAFT, format: formats[0]?.slug ?? "" },
  );
  const [formError, setFormError] = useState("");

  const isPending = createEvent.isPending || updateEvent.isPending;

  function set<TKey extends keyof MetaEventDraft>(key: TKey, value: MetaEventDraft[TKey]) {
    setDraft((prev) => ({ ...prev, [key]: value }));
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
    const save = event
      ? () => updateEvent.mutateAsync({ id: event.id, ...body })
      : () => createEvent.mutateAsync(body);
    const successMessage = event ? `Updated "${body.name}"` : `Created "${body.name}"`;
    try {
      await save();
      toast.success(successMessage);
      onClose();
    } catch (error) {
      // The global mutation error toast reports it too; this line keeps the
      // reason in front of the form so the field can be fixed in place.
      setFormError(errorText(error, "Save failed"));
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-xl">
        <DialogForm onSubmit={handleSubmit}>
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

          {/* Citations replaced the old single source link (ADR-014). They are
              their own rows, written and deleted on their own, so they live
              beside the form rather than inside its save. */}
          {event && <MetaEventSourcesEditor eventId={event.id} />}

          {formError && <p className="text-destructive text-sm">{formError}</p>}

          <DialogFooter>
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={isPending}>
              {event ? "Save" : "Create event"}
            </Button>
          </DialogFooter>
        </DialogForm>
      </DialogContent>
    </Dialog>
  );
}
