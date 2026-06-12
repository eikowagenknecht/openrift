import type {
  DeckCheckEntrySummaryResponse,
  DeckCheckEventSummaryResponse,
  FriendGroupDetailResponse,
} from "@openrift/shared";
import { Link, useNavigate } from "@tanstack/react-router";
import {
  ArchiveIcon,
  ArchiveRestoreIcon,
  CopyIcon,
  Link2Icon,
  PencilIcon,
  RefreshCwIcon,
  Trash2Icon,
  UserPlusIcon,
  XIcon,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { ConfirmActionDialog } from "@/components/confirm-action-dialog";
import { isAdmin } from "@/components/friend-groups/friend-group-shell";
import { TopBarBreadcrumbBar } from "@/components/layout/top-bar-breadcrumb";
import { Badge } from "@/components/ui/badge";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  useCreateDeckCheckEntry,
  useDeckCheckEvent,
  useDeleteDeckCheckEvent,
  useRegenerateDeckCheckSubmissionToken,
  useReResolveDeckCheckEvent,
  useUpdateDeckCheckEvent,
} from "@/hooks/use-deck-check";
import { useDeckFormatList, useZoneOrder } from "@/hooks/use-enums";
import { parseManualDecklist } from "@/lib/deck-check-manual-entry";
import { getSiteUrl } from "@/lib/site-config";
import { cn, PAGE_PADDING } from "@/lib/utils";

/** Actionable entries first: submissions to review, then drafts, then done. */
const STATE_ORDER: Record<DeckCheckEntrySummaryResponse["state"], number> = {
  submitted: 0,
  editable: 1,
  approved: 2,
  checked: 3,
  withdrawn: 4,
};

/**
 * One event's entrant list: search, unchecked-first sort, live progress, and
 * the re-resolve / archive / delete actions. Polls so all judges share state.
 * @returns The entrant-list page content.
 */
export function DeckCheckEventPage({
  slug,
  eventId,
  data,
}: {
  slug: string;
  eventId: string;
  data: FriendGroupDetailResponse;
}) {
  const { data: detail } = useDeckCheckEvent(slug, eventId);
  const [search, setSearch] = useState("");
  const reResolve = useReResolveDeckCheckEvent();
  const updateEvent = useUpdateDeckCheckEvent();
  const deleteEvent = useDeleteDeckCheckEvent();
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [renameOpen, setRenameOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const navigate = useNavigate();
  const { labels: formatLabels } = useDeckFormatList();
  const admin = isAdmin(data.viewerRole);

  if (!detail) {
    return <p className="text-muted-foreground">Loading…</p>;
  }

  const { event, entries } = detail;
  const crumbs = [
    { label: data.group.name, link: <Link to="/groups/$slug" params={{ slug }} /> },
    { label: "Events", link: <Link to="/groups/$slug/checks" params={{ slug }} /> },
    { label: event.name },
  ];
  const needle = search.trim().toLowerCase();
  const visible = entries
    .filter((entry) => !needle || entry.playerName.toLowerCase().includes(needle))
    .toSorted(
      (a, b) =>
        Number(b.unlockRequestedAt !== null) - Number(a.unlockRequestedAt !== null) ||
        STATE_ORDER[a.state] - STATE_ORDER[b.state] ||
        a.playerName.localeCompare(b.playerName),
    );
  const hasUnresolved = entries.some((entry) => entry.unmatchedLineCount > 0);

  return (
    <>
      <TopBarBreadcrumbBar segments={crumbs} />
      <div className={cn("mx-auto flex w-full max-w-5xl flex-col gap-4", PAGE_PADDING)}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex min-w-0 flex-col">
            <div className="flex items-center gap-1">
              <h2 className="truncate text-lg font-semibold">{event.name}</h2>
              {admin ? (
                <Button
                  size="sm"
                  variant="ghost"
                  aria-label="Rename event"
                  onClick={() => setRenameOpen(true)}
                >
                  <PencilIcon className="size-4" />
                </Button>
              ) : null}
            </div>
            <p className="text-muted-foreground text-sm">
              {event.eventDate ?? "No date"}
              {event.format ? ` · ${formatLabels[event.format]}` : ""}
              {` · ${event.checkedCount} of ${event.entryCount} checked`}
            </p>
            {admin ? (
              <button
                type="button"
                className="text-muted-foreground hover:text-foreground flex w-fit items-center gap-1 text-sm"
                title="The id API pushes use to address this event"
                onClick={async () => {
                  await navigator.clipboard.writeText(event.id);
                  toast.success("Event id copied");
                }}
              >
                <code>{event.id}</code>
                <CopyIcon className="size-3.5" />
              </button>
            ) : null}
          </div>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              disabled={event.status === "archived"}
              title={
                event.status === "archived"
                  ? "Un-archive the event to add entrants"
                  : "Add a player and decklist by hand"
              }
              onClick={() => setAddOpen(true)}
            >
              <UserPlusIcon className="size-4" />
              Add player
            </Button>
            {hasUnresolved ? (
              <Button
                size="sm"
                variant="outline"
                disabled={reResolve.isPending}
                onClick={async () => {
                  const result = await reResolve.mutateAsync({ slug, eventId });
                  toast.info(
                    result.updatedLines === 0
                      ? "No new matches found"
                      : `${result.updatedLines} ${result.updatedLines === 1 ? "line" : "lines"} now resolve`,
                  );
                }}
              >
                <RefreshCwIcon className="size-4" />
                Re-resolve cards
              </Button>
            ) : null}
            {admin ? (
              <>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={updateEvent.isPending}
                  onClick={() =>
                    updateEvent.mutate({
                      slug,
                      eventId,
                      status: event.status === "archived" ? "active" : "archived",
                    })
                  }
                >
                  {event.status === "archived" ? (
                    <ArchiveRestoreIcon className="size-4" />
                  ) : (
                    <ArchiveIcon className="size-4" />
                  )}
                  {event.status === "archived" ? "Un-archive" : "Archive"}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setDeleteOpen(true)}>
                  <Trash2Icon className="text-destructive size-4" />
                </Button>
              </>
            ) : null}
          </div>
        </div>

        {event.status === "archived" ? (
          <p className="text-muted-foreground bg-muted rounded-md p-2 text-sm">
            This event is archived. Pushes from the organizer system are rejected until it is
            un-archived.
          </p>
        ) : null}

        {admin ? <SubmissionSettingsSection slug={slug} eventId={eventId} event={event} /> : null}

        <Input
          value={search}
          onChange={(event_) => setSearch(event_.target.value)}
          placeholder="Search players"
          className="max-w-xs"
        />

        {visible.length === 0 ? (
          <p className="text-muted-foreground">
            {entries.length === 0
              ? "No entrants yet. Add one by hand with “Add player”, or they appear as soon as your organizer system pushes lists."
              : "No players match the search."}
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {visible.map((entry) => (
              <EntryRow key={entry.id} slug={slug} eventId={eventId} entry={entry} />
            ))}
          </div>
        )}

        {admin ? (
          <RenameEventDialog
            slug={slug}
            eventId={eventId}
            currentName={event.name}
            open={renameOpen}
            onOpenChange={setRenameOpen}
          />
        ) : null}

        <AddManualEntryDialog
          slug={slug}
          eventId={eventId}
          open={addOpen}
          onOpenChange={setAddOpen}
        />

        <ConfirmActionDialog
          open={deleteOpen}
          onOpenChange={setDeleteOpen}
          title="Delete this event?"
          description="All entrant lists and check results are removed. This cannot be undone."
          confirmLabel="Delete"
          pendingLabel="Deleting..."
          isPending={deleteEvent.isPending}
          onConfirm={async () => {
            await deleteEvent.mutateAsync({ slug, eventId });
            setDeleteOpen(false);
            void navigate({ to: "/groups/$slug/checks", params: { slug } });
          }}
        />
      </div>
    </>
  );
}

/**
 * Splits an ISO timestamp into the local date and time input values.
 * @returns The local `YYYY-MM-DD` date and `HH:mm` time, empty when unset.
 */
function toLocalDateTimeParts(iso: string | null): { date: string; time: string } {
  if (!iso) {
    return { date: "", time: "" };
  }
  const value = new Date(iso);
  const pad = (part: number) => String(part).padStart(2, "0");
  return {
    date: `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`,
    time: `${pad(value.getHours())}:${pad(value.getMinutes())}`,
  };
}

/**
 * Current wall-clock time in the browser's timezone, trimmed to minutes and
 * tagged with the IANA zone, to sit beside the close-time input (which is also
 * local) for a direct, unambiguous compare.
 * @returns E.g. `2026-06-20 18:00 Europe/Berlin`.
 */
function localNowMinutes(): string {
  const parts = toLocalDateTimeParts(new Date().toISOString());
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  return `${parts.date} ${parts.time} ${zone}`;
}

/**
 * Validates a typed 24h time. A plain text field instead of
 * `<input type="time">`, because the native control renders in the OS clock
 * format (12h with AM/PM on many machines) and the app is 24h everywhere.
 * @returns True for `H:mm` / `HH:mm` within 00:00-23:59.
 */
function isValidTime(value: string): boolean {
  const match = /^(?<hours>\d{1,2}):(?<minutes>\d{2})$/u.exec(value);
  if (!match?.groups) {
    return false;
  }
  return Number(match.groups.hours) <= 23 && Number(match.groups.minutes) <= 59;
}

/**
 * Zero-pads a valid time for ISO composition (`9:30` → `09:30`).
 * @returns The padded `HH:mm` string.
 */
function padTime(value: string): string {
  const [hours = "0", minutes = "00"] = value.split(":");
  return `${hours.padStart(2, "0")}:${minutes}`;
}

/**
 * Per-event player-submission settings (admin+, ADR-026): the opt-in toggle,
 * the shareable submission link, and the optional close date. The link is a
 * capability; regenerating it cuts off the old one.
 * @returns The settings block.
 */
function SubmissionSettingsSection({
  slug,
  eventId,
  event,
}: {
  slug: string;
  eventId: string;
  event: DeckCheckEventSummaryResponse;
}) {
  const updateEvent = useUpdateDeckCheckEvent();
  const regenerate = useRegenerateDeckCheckSubmissionToken();
  const [regenerateOpen, setRegenerateOpen] = useState(false);
  const stored = toLocalDateTimeParts(event.submissionsCloseAt);
  const [closeDate, setCloseDate] = useState(stored.date);
  const [closeTime, setCloseTime] = useState(stored.time);
  const [closeAtDirty, setCloseAtDirty] = useState(false);

  const submitUrl = event.submissionToken
    ? `${getSiteUrl()}/tournament-submit/${event.submissionToken}`
    : null;
  const dateValue = closeAtDirty ? closeDate : stored.date;
  const timeValue = closeAtDirty ? closeTime : stored.time;

  return (
    <section className="bg-card flex flex-col gap-3 rounded-md border p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex flex-col">
          <Label htmlFor="allow-self-submission">Player submissions</Label>
          <p className="text-muted-foreground text-sm">
            Allow players to submit their decks for this event via OpenRift.
          </p>
        </div>
        <Switch
          id="allow-self-submission"
          checked={event.allowSelfSubmission}
          disabled={updateEvent.isPending}
          onCheckedChange={(checked) =>
            updateEvent.mutate({ slug, eventId, allowSelfSubmission: checked })
          }
        />
      </div>
      {event.allowSelfSubmission && submitUrl ? (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              className="text-muted-foreground hover:text-foreground flex min-w-0 items-center gap-1 text-sm"
              title="Copy the submission link players use"
              onClick={async () => {
                await navigator.clipboard.writeText(submitUrl);
                toast.success("Submission link copied");
              }}
            >
              <code className="truncate">{submitUrl}</code>
              <CopyIcon className="size-3.5 shrink-0" />
            </button>
            <Button size="sm" variant="destructive" onClick={() => setRegenerateOpen(true)}>
              <RefreshCwIcon className="size-4" />
              New link
            </Button>
            <ConfirmActionDialog
              open={regenerateOpen}
              onOpenChange={setRegenerateOpen}
              title="Create a new submission link?"
              description="The current link stops working immediately. Players holding the old link can no longer open it; share the new one with them."
              confirmLabel="Create new link"
              pendingLabel="Creating..."
              isPending={regenerate.isPending}
              onConfirm={async () => {
                await regenerate.mutateAsync({ slug, eventId });
                setRegenerateOpen(false);
                toast.success("New link created; the old one no longer works");
              }}
            />
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="submissions-close-date">Submissions close (optional)</Label>
              <div className="flex items-center gap-2">
                <DatePicker
                  value={dateValue || null}
                  onChange={(iso) => {
                    setCloseDate(iso);
                    setCloseTime(timeValue || "23:59");
                    setCloseAtDirty(true);
                  }}
                  onClear={() => {
                    setCloseDate("");
                    setCloseTime("");
                    setCloseAtDirty(true);
                  }}
                  className="w-40"
                />
                <Input
                  id="submissions-close-date"
                  value={timeValue}
                  disabled={!dateValue}
                  placeholder="23:59"
                  maxLength={5}
                  aria-label="Close time (24h)"
                  aria-invalid={Boolean(dateValue) && !isValidTime(timeValue || "23:59")}
                  onChange={(inputEvent) => {
                    setCloseTime(inputEvent.target.value);
                    setCloseAtDirty(true);
                  }}
                  className="w-20"
                />
                {dateValue ? (
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Reset close date"
                    title="Clear the close date"
                    disabled={updateEvent.isPending}
                    onClick={() => {
                      setCloseDate("");
                      setCloseTime("");
                      setCloseAtDirty(false);
                      updateEvent.mutate({ slug, eventId, submissionsCloseAt: null });
                    }}
                  >
                    <XIcon className="size-4" />
                  </Button>
                ) : null}
                <span className="text-muted-foreground text-sm">
                  Current time is <code>{localNowMinutes()}</code>
                </span>
              </div>
            </div>
            {closeAtDirty ? (
              <Button
                variant="outline"
                disabled={
                  updateEvent.isPending ||
                  (Boolean(closeDate) && !isValidTime(closeTime || "23:59"))
                }
                onClick={() => {
                  updateEvent.mutate(
                    {
                      slug,
                      eventId,
                      submissionsCloseAt: closeDate
                        ? new Date(`${closeDate}T${padTime(closeTime || "23:59")}`).toISOString()
                        : null,
                    },
                    { onSuccess: () => setCloseAtDirty(false) },
                  );
                }}
              >
                Save
              </Button>
            ) : null}
          </div>
          <div className="flex items-center justify-between gap-2">
            <div className="flex flex-col">
              <Label htmlFor="list-lock-mode">Edits after submission</Label>
              <p className="text-muted-foreground text-sm">
                Allow players to edit their decks for this event after submitting them (not legal in
                official Riot tournaments). If disabled, edits can only be made through judges.
              </p>
            </div>
            <Switch
              id="list-lock-mode"
              checked={event.listLockMode === "at_deadline"}
              disabled={updateEvent.isPending}
              onCheckedChange={(checked) =>
                updateEvent.mutate({
                  slug,
                  eventId,
                  listLockMode: checked ? "at_deadline" : "on_submit",
                })
              }
            />
          </div>
        </>
      ) : null}
    </section>
  );
}

function EntryRow({
  slug,
  eventId,
  entry,
}: {
  slug: string;
  eventId: string;
  entry: DeckCheckEntrySummaryResponse;
}) {
  return (
    <Link
      to="/groups/$slug/checks/$eventId/$entryId"
      params={{ slug, eventId, entryId: entry.id }}
      className="bg-card hover:bg-muted hover:text-foreground flex items-center gap-3 rounded-md border p-3 transition-colors"
    >
      <div className="flex min-w-0 flex-1 flex-col">
        <span
          className={`truncate font-medium ${entry.state === "withdrawn" ? "line-through" : ""}`}
        >
          {entry.playerName}
        </span>
        <span className="text-muted-foreground text-sm">
          {entry.state === "editable"
            ? "List hidden while the player edits"
            : `${entry.verifiedCopyCount} / ${entry.copyCount} cards found`}
          {entry.state === "checked" && entry.checkedByName
            ? ` · checked by ${entry.checkedByName}`
            : entry.state === "approved" && entry.approvedByName
              ? ` · approved by ${entry.approvedByName}`
              : ""}
        </span>
      </div>
      {entry.source === "api" ? (
        <Badge variant="outline" title="Submitted by the organizer system">
          API
        </Badge>
      ) : null}
      {entry.source === "self" ? (
        <Badge variant="outline" title="Submitted by the player through OpenRift">
          Self
        </Badge>
      ) : null}
      {entry.claimedUserName ? (
        <Badge
          variant="outline"
          title={`Linked to the OpenRift account of ${entry.claimedUserName}`}
        >
          <Link2Icon className="size-3" />
          Linked
        </Badge>
      ) : null}
      {entry.unlockRequestedAt ? (
        <Badge variant="destructive" title="The player asked to unlock this approved deck">
          Unlock requested
        </Badge>
      ) : null}
      {entry.changedSinceReview ? <Badge variant="destructive">Changed since review</Badge> : null}
      {entry.unmatchedLineCount > 0 ? (
        <Badge variant="secondary">{entry.unmatchedLineCount} unmatched</Badge>
      ) : null}
      <EntryStateBadge state={entry.state} reviewOutcome={entry.reviewOutcome} />
    </Link>
  );
}

export function EntryStateBadge({
  state,
  reviewOutcome,
}: {
  state: DeckCheckEntrySummaryResponse["state"];
  reviewOutcome: DeckCheckEntrySummaryResponse["reviewOutcome"];
}) {
  if (state === "editable") {
    return <Badge variant="outline">Editing</Badge>;
  }
  if (state === "approved") {
    return <Badge>Approved</Badge>;
  }
  if (state === "checked") {
    return reviewOutcome === "issue" ? (
      <Badge variant="destructive">Checked · issue</Badge>
    ) : (
      <Badge>Checked</Badge>
    );
  }
  if (state === "withdrawn") {
    return <Badge variant="secondary">Withdrawn</Badge>;
  }
  return reviewOutcome === "issue" ? (
    <Badge variant="destructive">Submitted · issue</Badge>
  ) : (
    <Badge variant="secondary">Submitted</Badge>
  );
}

function RenameEventDialog({
  slug,
  eventId,
  currentName,
  open,
  onOpenChange,
}: {
  slug: string;
  eventId: string;
  currentName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [name, setName] = useState(currentName);
  const updateEvent = useUpdateDeckCheckEvent();

  const handleRename = async () => {
    const trimmed = name.trim();
    if (!trimmed || trimmed === currentName) {
      onOpenChange(false);
      return;
    }
    await updateEvent.mutateAsync({ slug, eventId, name: trimmed });
    onOpenChange(false);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (nextOpen) {
          setName(currentName);
        }
        onOpenChange(nextOpen);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Rename event</DialogTitle>
        </DialogHeader>
        <Input
          value={name}
          onChange={(event) => setName(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              void handleRename();
            }
          }}
          maxLength={120}
        />
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleRename} disabled={updateEvent.isPending || !name.trim()}>
            {updateEvent.isPending ? "Saving..." : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AddManualEntryDialog({
  slug,
  eventId,
  open,
  onOpenChange,
}: {
  slug: string;
  eventId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { zoneLabels } = useZoneOrder();
  const navigate = useNavigate();
  const createEntry = useCreateDeckCheckEntry();
  const [playerName, setPlayerName] = useState("");
  const [playerEmail, setPlayerEmail] = useState("");
  const [riotId, setRiotId] = useState("");
  const [decklist, setDecklist] = useState("");

  const parsed = parseManualDecklist(decklist);
  const perZone = [...Map.groupBy(parsed.cards, (card) => card.section).entries()].map(
    ([section, cards]) => ({
      section,
      copies: cards.reduce((sum, card) => sum + card.quantity, 0),
    }),
  );

  const reset = () => {
    setPlayerName("");
    setPlayerEmail("");
    setRiotId("");
    setDecklist("");
  };

  const handleSubmit = async () => {
    const trimmedName = playerName.trim();
    if (!trimmedName) {
      return;
    }
    const detail = await createEntry.mutateAsync({
      slug,
      eventId,
      playerName: trimmedName,
      playerEmail: playerEmail.trim() || null,
      riotId: riotId.trim() || null,
      cards: parsed.cards,
    });
    toast.success("Player added");
    reset();
    onOpenChange(false);
    void navigate({
      to: "/groups/$slug/checks/$eventId/$entryId",
      params: { slug, eventId, entryId: detail.entry.id },
    });
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) {
          reset();
        }
        onOpenChange(nextOpen);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add player</DialogTitle>
          <DialogDescription>
            Enter an entrant by hand when the organizer system cannot push their list.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="manual-entry-name">Player name</Label>
            <Input
              id="manual-entry-name"
              value={playerName}
              onChange={(event) => setPlayerName(event.target.value)}
              maxLength={120}
              placeholder="Jane Summoner"
            />
          </div>
          <div className="flex gap-3">
            <div className="flex flex-1 flex-col gap-1.5">
              <Label htmlFor="manual-entry-email">Email (optional)</Label>
              <Input
                id="manual-entry-email"
                value={playerEmail}
                onChange={(event) => setPlayerEmail(event.target.value)}
                maxLength={254}
              />
            </div>
            <div className="flex flex-1 flex-col gap-1.5">
              <Label htmlFor="manual-entry-riot-id">Riot ID (optional)</Label>
              <Input
                id="manual-entry-riot-id"
                value={riotId}
                onChange={(event) => setRiotId(event.target.value)}
                maxLength={120}
                placeholder="Player#EUW"
              />
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="manual-entry-decklist">Decklist</Label>
            <Textarea
              id="manual-entry-decklist"
              value={decklist}
              onChange={(event) => setDecklist(event.target.value)}
              rows={10}
              className="font-mono"
              placeholder={
                "Champion:\n1 Some Champion\nMain:\n3 Some Card\nSideboard:\n2 Tech Card"
              }
            />
            <p className="text-muted-foreground text-sm">
              One card per line as <code>2 Card Name</code>, with optional zone headers (Champion:,
              Main:, Sideboard:, …). Lines without a header go to the main deck. Card matches are
              checked after you save.
            </p>
            {parsed.cards.length > 0 ? (
              <p className="text-muted-foreground text-sm">
                {parsed.totalCopies} {parsed.totalCopies === 1 ? "copy" : "copies"} ·{" "}
                {perZone
                  .map(
                    ({ section, copies }) => `${zoneLabels[section as never] ?? section} ${copies}`,
                  )
                  .join(" · ")}
              </p>
            ) : null}
            {parsed.warnings.map((warning) => (
              <p key={warning} className="text-destructive text-sm">
                {warning}
              </p>
            ))}
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={createEntry.isPending || !playerName.trim()}>
            {createEntry.isPending ? "Adding..." : "Add player"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
