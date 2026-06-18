import type { DeckCheckEventSummaryResponse, FriendGroupDetailResponse } from "@openrift/shared";
import { Link } from "@tanstack/react-router";
import { ChevronDownIcon, PlusIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { isAdmin } from "@/components/friend-groups/friend-group-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { DatePicker } from "@/components/ui/date-picker";
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
import { useCreateDeckCheckEvent, useDeckCheckEvents } from "@/hooks/use-deck-check";
import { useDeckFormatList } from "@/hooks/use-enums";
import { partitionDeckCheckEvents } from "@/lib/deck-check-events";
import { cn } from "@/lib/utils";

/**
 * The group's deck-check events, newest first, with past and archived events
 * tucked into a collapsible section below. Reached via the group's "Events"
 * tab (judge+).
 * @returns The events page content.
 */
export function DeckCheckEventsPage({
  slug,
  data,
}: {
  slug: string;
  data: FriendGroupDetailResponse;
}) {
  const { data: events } = useDeckCheckEvents(slug);
  const admin = isAdmin(data.viewerRole);
  const [createOpen, setCreateOpen] = useState(false);
  const { current, pastOrArchived } = partitionDeckCheckEvents(events.items);

  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-col gap-3">
        {admin ? (
          <div className="flex justify-end">
            <Button size="sm" onClick={() => setCreateOpen(true)}>
              <PlusIcon className="size-4" />
              New event
            </Button>
          </div>
        ) : null}
        {events.items.length === 0 ? (
          <p className="text-muted-foreground">
            No events yet. An admin creates the event here; entrant decklists are then sent to it
            with an API key.
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {current.length === 0 ? (
              <p className="text-muted-foreground">No upcoming events.</p>
            ) : (
              current.map((event) => <EventRow key={event.id} slug={slug} event={event} />)
            )}
          </div>
        )}
        {pastOrArchived.length > 0 ? (
          <PastAndArchivedEvents slug={slug} events={pastOrArchived} />
        ) : null}
      </section>

      <CreateEventDialog slug={slug} open={createOpen} onOpenChange={setCreateOpen} />
    </div>
  );
}

/**
 * Past and archived events tucked into a collapsible section so the list leads
 * with what's upcoming. Collapsed by default; the count stays visible on the
 * trigger.
 * @returns The collapsible past-and-archived section.
 */
function PastAndArchivedEvents({
  slug,
  events,
}: {
  slug: string;
  events: DeckCheckEventSummaryResponse[];
}) {
  const [open, setOpen] = useState(false);
  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger className="text-muted-foreground hover:text-foreground flex w-full cursor-pointer items-center gap-1.5 text-sm font-medium transition-colors">
        <ChevronDownIcon
          className={cn("size-4 shrink-0 transition-transform", open && "rotate-180")}
        />
        Past and archived ({events.length})
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="mt-2 flex flex-col gap-2">
          {events.map((event) => (
            <EventRow key={event.id} slug={slug} event={event} />
          ))}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

function EventRow({ slug, event }: { slug: string; event: DeckCheckEventSummaryResponse }) {
  const { labels } = useDeckFormatList();
  return (
    <Link
      to="/groups/$slug/events/$eventId"
      params={{ slug, eventId: event.id }}
      className="bg-card hover:bg-muted hover:text-foreground flex items-center gap-3 rounded-md border p-3 transition-colors"
    >
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="truncate font-medium">{event.name}</span>
        <span className="text-muted-foreground text-sm">
          {event.eventDate ?? "No date"}
          {event.format ? ` · ${labels[event.format]}` : ""}
          {` · ${event.entryCount} ${event.entryCount === 1 ? "entrant" : "entrants"}`}
        </span>
      </div>
      {event.status === "archived" ? <Badge variant="secondary">Archived</Badge> : null}
      <Badge variant={event.checkedCount === event.entryCount ? "default" : "secondary"}>
        {event.checkedCount} / {event.entryCount} checked
      </Badge>
    </Link>
  );
}

function CreateEventDialog({
  slug,
  open,
  onOpenChange,
}: {
  slug: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [name, setName] = useState("");
  const [eventDate, setEventDate] = useState("");
  const [format, setFormat] = useState("");
  const formats = useDeckFormatList();
  const createEvent = useCreateDeckCheckEvent();

  const handleSubmit = async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      return;
    }
    await createEvent.mutateAsync({
      slug,
      name: trimmed,
      eventDate: eventDate || null,
      format: format || null,
    });
    toast.success("Event created");
    setName("");
    setEventDate("");
    setFormat("");
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New deck-check event</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="deck-check-event-name">Name</Label>
            <Input
              id="deck-check-event-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              maxLength={120}
              placeholder="Summoner Skirmish #12"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Date (optional)</Label>
            <DatePicker
              value={eventDate || null}
              onChange={(iso) => setEventDate(iso)}
              onClear={() => setEventDate("")}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Format (optional)</Label>
            <Select value={format} onValueChange={(value) => setFormat(value ?? "")}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="No legality checks">
                  {(value: string) => formats.labels[value] ?? "No legality checks"}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">No legality checks</SelectItem>
                {formats.formats.map((row) => (
                  <SelectItem key={row.slug} value={row.slug}>
                    {row.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={createEvent.isPending || !name.trim()}>
            {createEvent.isPending ? "Creating..." : "Create"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
