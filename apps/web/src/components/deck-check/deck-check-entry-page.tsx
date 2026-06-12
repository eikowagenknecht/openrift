import type {
  DeckCheckChangeSummary,
  DeckCheckEntryCardResponse,
  DeckCheckEntryDetailResponse,
  FriendGroupDetailResponse,
  Printing,
} from "@openrift/shared";
import { imageUrl } from "@openrift/shared";
import { Link } from "@tanstack/react-router";
import {
  CheckIcon,
  ExpandIcon,
  LayoutGridIcon,
  PencilIcon,
  PlusIcon,
  RotateCcwIcon,
  Rows3Icon,
  ShrinkIcon,
  TriangleAlertIcon,
  XIcon,
} from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";

import { CardCell } from "@/components/cards/card-cell";
import { useCardThumbnailDisplay } from "@/components/cards/card-thumbnail";
import { ConfirmActionDialog } from "@/components/confirm-action-dialog";
import { DeckDomainBar } from "@/components/deck/deck-domain-bar";
import {
  DomainIcon,
  FannedPreview,
  FormatStateBadge,
  typeCountSummary,
} from "@/components/deck/deck-tile";
import { HoveredCardPreview } from "@/components/deck/hovered-card-preview";
import { ColumnControls } from "@/components/filters/column-controls";
import { SortGroupControls } from "@/components/filters/sort-group-controls";
import type { SortGroupOption } from "@/components/filters/sort-group-controls";
import { GroupBreadcrumbBar } from "@/components/friend-groups/group-breadcrumb";
import { ImportCatalogSearch } from "@/components/import/import-catalog-search";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useCards } from "@/hooks/use-cards";
import {
  useAddDeckCheckCard,
  useDeckCheckEntry,
  useFixDeckCheckCard,
  useRemoveDeckCheckCard,
  useSetDeckCheckVerdict,
  useTickDeckCheckCard,
  useUpdateDeckCheckEntry,
} from "@/hooks/use-deck-check";
import { useDomainColors } from "@/hooks/use-domain-colors";
import { useEnumOrders, useZoneOrder } from "@/hooks/use-enums";
import { useIsMobile } from "@/hooks/use-is-mobile";
import { usePreferredPrinting } from "@/hooks/use-preferred-printing";
import { useResponsiveColumns } from "@/hooks/use-responsive-columns";
import { sortDeckCheckCards } from "@/lib/deck-check-sort";
import { getDomainGradientStyle } from "@/lib/domain";
import { cn, PAGE_PADDING } from "@/lib/utils";
import { useDeckCheckViewStore } from "@/stores/deck-check-view-store";
import type { DeckCheckDisplayMode, DeckCheckSort } from "@/stores/deck-check-view-store";

/**
 * The checker: verdict controls, advisory legality findings, deck stats, and
 * the zone-grouped card list where each card is a tappable verification tick.
 * Polls so concurrent judges reconcile.
 * @returns The checker page content.
 */
export function DeckCheckEntryPage({
  slug,
  eventId,
  entryId,
  data,
}: {
  slug: string;
  eventId: string;
  entryId: string;
  data: FriendGroupDetailResponse;
}) {
  const { data: detail, refetch } = useDeckCheckEntry(slug, eventId, entryId);
  const wide = useDeckCheckViewStore((state) => state.wide);
  const setWide = useDeckCheckViewStore((state) => state.setWide);
  const displayMode = useDeckCheckViewStore((state) => state.displayMode);
  const setDisplayMode = useDeckCheckViewStore((state) => state.setDisplayMode);
  const sortBy = useDeckCheckViewStore((state) => state.sortBy);
  const setSortBy = useDeckCheckViewStore((state) => state.setSortBy);
  const sortDir = useDeckCheckViewStore((state) => state.sortDir);
  const setSortDir = useDeckCheckViewStore((state) => state.setSortDir);
  const maxColumns = useDeckCheckViewStore((state) => state.maxColumns);
  const setMaxColumns = useDeckCheckViewStore((state) => state.setMaxColumns);
  const { containerRef, columns, physicalMax, physicalMin, autoColumns, containerWidth } =
    useResponsiveColumns(maxColumns);
  const [notes, setNotes] = useState("");
  const [notesDirty, setNotesDirty] = useState(false);

  if (!detail) {
    return <p className="text-muted-foreground">Loading…</p>;
  }

  // The rendered width of one card, derived from the resolved column count, for
  // image resolution and for sizing the small content-width flow zones.
  const cellWidth =
    columns > 0 && containerWidth > 0
      ? Math.floor((containerWidth - (columns - 1) * CHECK_GRID_GAP) / columns)
      : CHECK_CELL_WIDTH;

  const crumbs = [
    { label: data.group.name, link: <Link to="/groups/$slug" params={{ slug }} /> },
    { label: "Events", link: <Link to="/groups/$slug/checks" params={{ slug }} /> },
    {
      label: detail.event.name,
      link: <Link to="/groups/$slug/checks/$eventId" params={{ slug, eventId }} />,
    },
    { label: detail.entry.playerName },
  ];

  return (
    <>
      <GroupBreadcrumbBar segments={crumbs} />
      <div className={cn("mx-auto flex w-full max-w-5xl flex-col gap-4", PAGE_PADDING)}>
        <EntryHeader
          slug={slug}
          eventId={eventId}
          entryId={entryId}
          detail={detail}
          notes={notesDirty ? notes : (detail.entry.notes ?? "")}
          notesDirty={notesDirty}
          onNotesSaved={() => setNotesDirty(false)}
        />
        <div className="flex flex-col gap-4 md:flex-row">
          <EntryPreview cards={detail.cards} />
          <div className="flex min-w-0 flex-1 flex-col gap-3">
            <StatsSummary detail={detail} />
            <Textarea
              value={notesDirty ? notes : (detail.entry.notes ?? "")}
              onChange={(event) => {
                setNotes(event.target.value);
                setNotesDirty(true);
              }}
              placeholder="Notes for this entry (saved with the verdict)"
              maxLength={4000}
              rows={3}
              className="flex-1"
            />
          </div>
        </div>
        {detail.entry.changeSummary ? <ChangeBanner summary={detail.entry.changeSummary} /> : null}
        <FindingsBanner detail={detail} />
      </div>
      <div
        className={cn(
          "w-full pb-4",
          PAGE_PADDING,
          (!wide || displayMode === "list") && "mx-auto max-w-5xl",
        )}
      >
        <div className="mb-2 flex flex-wrap items-center justify-end gap-2">
          <SortGroupControls
            sortOptions={CHECK_SORT_OPTIONS}
            sortBy={sortBy}
            sortDir={sortDir}
            onSortByChange={setSortBy}
            onSortDirChange={setSortDir}
          />
          <DisplayModeToggle mode={displayMode} onModeChange={setDisplayMode} />
          {displayMode === "grid" ? (
            <ColumnControls
              maxColumns={maxColumns}
              autoColumns={autoColumns}
              minColumns={physicalMin}
              maxColumnsLimit={physicalMax}
              onMaxColumnsChange={setMaxColumns}
            />
          ) : null}
          {displayMode === "grid" ? (
            <Button
              variant="outline"
              className="hidden md:flex"
              aria-pressed={wide}
              onClick={() => setWide(!wide)}
            >
              {wide ? <ShrinkIcon className="size-4" /> : <ExpandIcon className="size-4" />}
              {wide ? "Narrow view" : "Wide view"}
            </Button>
          ) : null}
        </div>
        <div ref={containerRef}>
          <CardChecklist
            slug={slug}
            eventId={eventId}
            entryId={entryId}
            cards={detail.cards}
            displayMode={displayMode}
            sortBy={sortBy}
            sortDir={sortDir}
            columns={columns}
            cellWidth={cellWidth}
            locked={detail.entry.checkStatus !== "unchecked"}
            onStale={() => void refetch()}
          />
        </div>
      </div>
    </>
  );
}

/**
 * The /decks-style fanned legend + champion art for this entry, over the
 * legend's domain gradient.
 * @returns The preview block, sized for the hero row.
 */
function EntryPreview({ cards }: { cards: DeckCheckEntryCardResponse[] }) {
  const { getPreferredPrinting, getPreferredFrontImage } = usePreferredPrinting();
  const domainColors = useDomainColors();

  const legendCardId = cards.find(
    (card) => card.zone === "legend" && card.resolvedCardId,
  )?.resolvedCardId;
  const championCardId = cards.find(
    (card) => card.zone === "champion" && card.resolvedCardId,
  )?.resolvedCardId;
  const legendDomains = legendCardId ? getPreferredPrinting(legendCardId)?.card.domains : undefined;
  const gradientStyle =
    legendDomains && legendDomains.length > 0
      ? getDomainGradientStyle(legendDomains, "40", domainColors)
      : undefined;

  return (
    <div className="w-full shrink-0 self-start overflow-hidden rounded-xl border md:w-72">
      <FannedPreview
        legendImage={legendCardId ? (getPreferredFrontImage(legendCardId) ?? null) : null}
        championImage={championCardId ? (getPreferredFrontImage(championCardId) ?? null) : null}
        gradientStyle={gradientStyle}
      />
    </div>
  );
}

function EntryHeader({
  slug,
  eventId,
  entryId,
  detail,
  notes,
  notesDirty,
  onNotesSaved,
}: {
  slug: string;
  eventId: string;
  entryId: string;
  detail: DeckCheckEntryDetailResponse;
  notes: string;
  notesDirty: boolean;
  onNotesSaved: () => void;
}) {
  const { entry } = detail;
  const setVerdict = useSetDeckCheckVerdict();
  const [editOpen, setEditOpen] = useState(false);
  const [addCardOpen, setAddCardOpen] = useState(false);

  const submitVerdict = (checkStatus: "unchecked" | "checked" | "issue") => {
    setVerdict.mutate(
      {
        slug,
        eventId,
        entryId,
        checkStatus,
        ...(notesDirty || checkStatus !== "unchecked" ? { notes: notes.trim() || null } : {}),
      },
      { onSuccess: () => onNotesSaved() },
    );
  };

  const checked = entry.checkStatus !== "unchecked";

  return (
    <header className="flex flex-col gap-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex min-w-0 flex-col">
          <div className="flex items-center gap-2">
            <h2 className="truncate text-lg font-semibold">{entry.playerName}</h2>
            <Button
              size="sm"
              variant="ghost"
              aria-label="Edit player details"
              onClick={() => setEditOpen(true)}
            >
              <PencilIcon className="size-4" />
            </Button>
            {entry.withdrawnAt ? <Badge variant="secondary">Withdrawn</Badge> : null}
            {entry.checkStatus === "checked" ? <Badge>Checked</Badge> : null}
            {entry.checkStatus === "issue" ? <Badge variant="destructive">Issue</Badge> : null}
          </div>
          <p className="text-muted-foreground text-sm">
            {[entry.riotId, entry.playerEmail].filter(Boolean).join(" · ") || "No contact details"}
          </p>
          {checked && entry.checkedByName ? (
            <p className="text-muted-foreground text-sm">
              {entry.checkStatus === "issue" ? "Flagged" : "Checked"} by {entry.checkedByName}
            </p>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {checked ? null : (
            <Button size="sm" variant="outline" onClick={() => setAddCardOpen(true)}>
              <PlusIcon className="size-4" />
              Add card
            </Button>
          )}
          {checked ? (
            <Button
              size="sm"
              variant="outline"
              disabled={setVerdict.isPending}
              onClick={() => submitVerdict("unchecked")}
            >
              <RotateCcwIcon className="size-4" />
              Re-open
            </Button>
          ) : (
            <>
              <Button
                size="sm"
                disabled={setVerdict.isPending}
                onClick={() => submitVerdict("checked")}
              >
                <CheckIcon className="size-4" />
                Mark checked
              </Button>
              <Button
                size="sm"
                variant="destructive"
                disabled={setVerdict.isPending}
                onClick={() => submitVerdict("issue")}
              >
                <TriangleAlertIcon className="size-4" />
                Mark issue
              </Button>
            </>
          )}
        </div>
      </div>
      <EditPlayerDialog
        slug={slug}
        eventId={eventId}
        entryId={entryId}
        entry={entry}
        open={editOpen}
        onOpenChange={setEditOpen}
      />
      <AddCardDialog
        slug={slug}
        eventId={eventId}
        entryId={entryId}
        open={addCardOpen}
        onOpenChange={setAddCardOpen}
      />
    </header>
  );
}

function EditPlayerDialog({
  slug,
  eventId,
  entryId,
  entry,
  open,
  onOpenChange,
}: {
  slug: string;
  eventId: string;
  entryId: string;
  entry: DeckCheckEntryDetailResponse["entry"];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [playerName, setPlayerName] = useState(entry.playerName);
  const [playerEmail, setPlayerEmail] = useState(entry.playerEmail ?? "");
  const [riotId, setRiotId] = useState(entry.riotId ?? "");
  const updateEntry = useUpdateDeckCheckEntry();

  const handleSave = async () => {
    const name = playerName.trim();
    if (!name) {
      return;
    }
    await updateEntry.mutateAsync({
      slug,
      eventId,
      entryId,
      playerName: name,
      playerEmail: playerEmail.trim() || null,
      riotId: riotId.trim() || null,
    });
    onOpenChange(false);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (nextOpen) {
          setPlayerName(entry.playerName);
          setPlayerEmail(entry.playerEmail ?? "");
          setRiotId(entry.riotId ?? "");
        }
        onOpenChange(nextOpen);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit player details</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="deck-check-player-name">Name</Label>
            <Input
              id="deck-check-player-name"
              value={playerName}
              onChange={(event) => setPlayerName(event.target.value)}
              maxLength={120}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="deck-check-player-email">Email (optional)</Label>
            <Input
              id="deck-check-player-email"
              type="email"
              value={playerEmail}
              onChange={(event) => setPlayerEmail(event.target.value)}
              maxLength={254}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="deck-check-riot-id">Riot ID (optional)</Label>
            <Input
              id="deck-check-riot-id"
              value={riotId}
              onChange={(event) => setRiotId(event.target.value)}
              maxLength={120}
              placeholder="Player#EUW"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={updateEntry.isPending || !playerName.trim()}>
            {updateEntry.isPending ? "Saving..." : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Card-name input with catalog typeahead, shared by the add-card and fix-card
 * dialogs. Free text stays valid (unknown names become flagged placeholders).
 * @returns The combobox field.
 */
function CardNameSearchField({
  initialName,
  onNameChange,
}: {
  initialName?: string;
  onNameChange: (name: string) => void;
}) {
  const { printingsByCardId } = useCards();
  const { labels } = useEnumOrders();
  return (
    <ImportCatalogSearch<Printing>
      ariaLabel="Card name"
      placeholder="Search card name"
      initialQuery={initialName}
      getResults={(query) => {
        const lower = query.toLowerCase();
        const matches: Printing[] = [];
        for (const printings of printingsByCardId.values()) {
          const printing = printings[0];
          if (printing?.card.name.toLowerCase().includes(lower)) {
            matches.push(printing);
          }
        }
        return matches
          .toSorted(
            (first, second) =>
              Number(second.card.name.toLowerCase().startsWith(lower)) -
                Number(first.card.name.toLowerCase().startsWith(lower)) ||
              first.card.name.localeCompare(second.card.name),
          )
          .slice(0, 8);
      }}
      getKey={(printing) => printing.cardId}
      renderItem={(printing) => (
        <>
          <span className="truncate font-medium">{printing.card.name}</span>
          <span className="text-muted-foreground shrink-0">
            {labels.cardTypes[printing.card.type]}
          </span>
        </>
      )}
      onSelect={(printing) => onNameChange(printing.card.name)}
      fillOnSelect={(printing) => printing.card.name}
      onQueryChange={onNameChange}
      inputClassName="w-full"
    />
  );
}

function FixCardDialog({
  slug,
  eventId,
  entryId,
  card,
  open,
  onOpenChange,
}: {
  slug: string;
  eventId: string;
  entryId: string;
  card: DeckCheckEntryCardResponse;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [name, setName] = useState(card.rawName);
  const fixCard = useFixDeckCheckCard();

  const handleSave = async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      return;
    }
    await fixCard.mutateAsync({ slug, eventId, entryId, cardId: card.id, name: trimmed });
    onOpenChange(false);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (nextOpen) {
          setName(card.rawName);
        }
        onOpenChange(nextOpen);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Fix card name</DialogTitle>
          <DialogDescription>
            Correct the submitted name; the card is matched against the catalog again. Zone, copies,
            and ticks stay.
          </DialogDescription>
        </DialogHeader>
        {/* oxlint-disable-next-line jsx-a11y/no-static-element-interactions -- keydown only relays Enter from the combobox input to the dialog's submit */}
        <div
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.defaultPrevented) {
              void handleSave();
            }
          }}
        >
          <CardNameSearchField
            key={String(open)}
            initialName={card.rawName}
            onNameChange={setName}
          />
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={fixCard.isPending || !name.trim()}>
            {fixCard.isPending ? "Saving..." : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AddCardDialog({
  slug,
  eventId,
  entryId,
  open,
  onOpenChange,
}: {
  slug: string;
  eventId: string;
  entryId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { zoneOrder, zoneLabels } = useZoneOrder();
  const [name, setName] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [section, setSection] = useState("main");
  const addCard = useAddDeckCheckCard();

  const handleAdd = async () => {
    const trimmed = name.trim();
    const parsedQuantity = Number(quantity);
    if (
      !trimmed ||
      !Number.isInteger(parsedQuantity) ||
      parsedQuantity < 1 ||
      parsedQuantity > 99
    ) {
      return;
    }
    await addCard.mutateAsync({
      slug,
      eventId,
      entryId,
      name: trimmed,
      quantity: parsedQuantity,
      section,
    });
    setName("");
    setQuantity("1");
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add card</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          {/* oxlint-disable-next-line jsx-a11y/no-static-element-interactions -- keydown only relays Enter from the combobox input to the dialog's submit */}
          <div
            className="flex flex-col gap-1.5"
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.defaultPrevented) {
                void handleAdd();
              }
            }}
          >
            <Label>Card name</Label>
            <CardNameSearchField key={String(open)} onNameChange={setName} />
          </div>
          <div className="flex gap-3">
            <div className="flex flex-1 flex-col gap-1.5">
              <Label htmlFor="deck-check-card-quantity">Copies</Label>
              <Input
                id="deck-check-card-quantity"
                inputMode="numeric"
                value={quantity}
                onChange={(event) => setQuantity(event.target.value.replaceAll(/[^0-9]/gu, ""))}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    void handleAdd();
                  }
                }}
              />
            </div>
            <div className="flex flex-1 flex-col gap-1.5">
              <Label>Zone</Label>
              <Select value={section} onValueChange={(value) => setSection(value ?? "main")}>
                <SelectTrigger className="w-full">
                  <SelectValue>
                    {(value: string) => zoneLabels[value as never] ?? value}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {zoneOrder.map((zone) => (
                    <SelectItem key={zone} value={zone}>
                      {zoneLabels[zone]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleAdd} disabled={addCard.isPending || !name.trim()}>
            {addCard.isPending ? "Adding..." : "Add"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ChangeBanner({ summary }: { summary: DeckCheckChangeSummary }) {
  const describe = (line: { name: string; quantity: number }) => `${line.quantity}× ${line.name}`;
  return (
    <div className="border-destructive/50 bg-destructive/10 flex flex-col gap-1 rounded-md border p-3 text-sm">
      <span className="font-medium">This list changed after it was checked.</span>
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

function FindingsBanner({ detail }: { detail: DeckCheckEntryDetailResponse }) {
  const unmatched = detail.cards.filter((card) => card.matchStatus !== "matched");
  if (detail.violations.length === 0 && unmatched.length === 0) {
    return null;
  }
  return (
    <div className="flex flex-col gap-1 rounded-md border border-amber-500/50 bg-amber-500/10 p-3 text-sm">
      <span className="font-medium">Possible deck problems</span>
      <ul className="list-disc pl-5">
        {unmatched.length > 0 ? (
          <li>
            {unmatched.length} {unmatched.length === 1 ? "card" : "cards"} could not be matched to
            the catalog and cannot be validated.
          </li>
        ) : null}
        {detail.violations.map((violation) => (
          <li key={`${violation.zone}:${violation.code}:${violation.cardId ?? ""}`}>
            {violation.message}
          </li>
        ))}
      </ul>
    </div>
  );
}

function StatsSummary({ detail }: { detail: DeckCheckEntryDetailResponse }) {
  const { getPreferredPrinting } = usePreferredPrinting();

  const legendLine = detail.cards.find((card) => card.zone === "legend");
  const championLine = detail.cards.find((card) => card.zone === "champion");
  const legendDomains = legendLine?.resolvedCardId
    ? getPreferredPrinting(legendLine.resolvedCardId)?.card.domains
    : undefined;
  const typeSummary = typeCountSummary(detail.typeCounts);
  const subtitle = [legendLine?.rawName, championLine?.rawName].filter(Boolean).join(" / ");

  return (
    <div className="flex flex-col gap-2">
      {subtitle ? <p className="text-muted-foreground truncate text-sm">{subtitle}</p> : null}
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-1">
          {legendDomains?.map((domain) => (
            <DomainIcon key={domain} domain={domain} />
          ))}
          {typeSummary ? (
            <span className="text-muted-foreground text-2xs ml-1">{typeSummary}</span>
          ) : null}
        </span>
        {detail.event.format ? (
          <FormatStateBadge format={detail.event.format} isValid={detail.violations.length === 0} />
        ) : null}
      </div>
      {detail.domainDistribution.length > 0 ? (
        <DeckDomainBar distribution={detail.domainDistribution} />
      ) : null}
    </div>
  );
}

/** The floating-preview payload built from a row's resolved printing. */
interface HoveredPreview {
  thumbnailUrl: string;
  fullUrl: string;
  landscape: boolean;
}

function CardChecklist({
  slug,
  eventId,
  entryId,
  cards,
  displayMode,
  sortBy,
  sortDir,
  columns,
  cellWidth,
  locked,
  onStale,
}: {
  slug: string;
  eventId: string;
  entryId: string;
  cards: DeckCheckEntryCardResponse[];
  displayMode: DeckCheckDisplayMode;
  sortBy: DeckCheckSort;
  sortDir: "asc" | "desc";
  columns: number;
  cellWidth: number;
  /** A finished verdict (checked/issue) locks card edits until the entry is re-opened. */
  locked: boolean;
  onStale: () => void;
}) {
  const { zoneLabels } = useZoneOrder();
  const { allPrintings } = useCards();
  const isMobile = useIsMobile();
  const previewContainerRef = useRef<HTMLDivElement>(null);
  const [hovered, setHovered] = useState<HoveredPreview | null>(null);

  const printingById = new Map(allPrintings.map((printing) => [printing.id, printing]));
  // Resolve catalogue name + short code for the "name" / "id" sorts.
  const identify = (printingId: string | null) => {
    const printing = printingId ? printingById.get(printingId) : undefined;
    return printing ? { name: printing.card.name, shortCode: printing.shortCode } : undefined;
  };

  // List rows float a large card image while hovered (desktop only); build the
  // preview payload from the row's resolved front image.
  const handleHover = (printing: Printing | null) => {
    const front = printing?.images.find((image) => image.face === "front");
    setHovered(
      printing && front
        ? {
            thumbnailUrl: imageUrl(front.imageId, "400w"),
            fullUrl: imageUrl(front.imageId, "full"),
            landscape: printing.card.type === "battlefield",
          }
        : null,
    );
  };

  const cardsByZone = Map.groupBy(cards, (card) => card.zone);
  const zoneCards = (zone: DeckCheckEntryCardResponse["zone"]) =>
    sortDeckCheckCards(cardsByZone.get(zone) ?? [], sortBy, sortDir, identify);

  // The small zones (one to three cards each) flow on a shared wrapping row,
  // so on wide screens legend, champion, and battlefields share one line and
  // fall onto separate lines only when they no longer fit.
  const flowZones = (["legend", "champion", "battlefield"] as const).filter((zone) =>
    cardsByZone.has(zone),
  );
  const stackedZones = (["main", "sideboard", "overflow", "runes"] as const).filter((zone) =>
    cardsByZone.has(zone),
  );

  if (displayMode === "list") {
    // List view stacks every zone vertically — the flow/stacked split only
    // matters for the thumbnail grid's wrapping row.
    const orderedZones = [...flowZones, ...stackedZones];
    return (
      <div ref={previewContainerRef} className="relative flex flex-col gap-6">
        <HoveredCardPreview
          hoveredCard={isMobile ? null : hovered}
          origin="main"
          containerRef={previewContainerRef}
        />
        {orderedZones.map((zone) => (
          <ZoneSection
            key={zone}
            slug={slug}
            eventId={eventId}
            entryId={entryId}
            label={zoneLabels[zone]}
            cards={zoneCards(zone)}
            displayMode="list"
            printingById={printingById}
            onHover={handleHover}
            columns={columns}
            cellWidth={cellWidth}
            onStale={onStale}
          />
        ))}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {flowZones.length > 0 ? (
        <div className="flex flex-wrap gap-x-10 gap-y-6">
          {flowZones.map((zone) => (
            <ZoneSection
              key={zone}
              slug={slug}
              eventId={eventId}
              entryId={entryId}
              label={zoneLabels[zone]}
              cards={zoneCards(zone)}
              displayMode="grid"
              columns={columns}
              cellWidth={cellWidth}
              intrinsic
              locked={locked}
              onStale={onStale}
            />
          ))}
        </div>
      ) : null}
      {stackedZones.map((zone) => (
        <ZoneSection
          key={zone}
          slug={slug}
          eventId={eventId}
          entryId={entryId}
          label={zoneLabels[zone]}
          cards={zoneCards(zone)}
          displayMode="grid"
          columns={columns}
          cellWidth={cellWidth}
          locked={locked}
          onStale={onStale}
        />
      ))}
    </div>
  );
}

/** Active-state classes for the toolbar toggle groups (filled when pressed). */
const ACTIVE_TOGGLE_CLASS =
  "aria-pressed:bg-primary aria-pressed:text-primary-foreground aria-pressed:hover:bg-primary aria-pressed:hover:text-primary-foreground";

function DisplayModeToggle({
  mode,
  onModeChange,
}: {
  mode: DeckCheckDisplayMode;
  onModeChange: (mode: DeckCheckDisplayMode) => void;
}) {
  return (
    <ToggleGroup
      aria-label="Display mode"
      variant="outline"
      value={[mode]}
      onValueChange={([next]) => {
        if (next === "grid" || next === "list") {
          onModeChange(next);
        }
      }}
    >
      <ToggleGroupItem
        value="grid"
        className={ACTIVE_TOGGLE_CLASS}
        title="Grid view"
        aria-label="Grid view"
      >
        <LayoutGridIcon className="size-4" />
      </ToggleGroupItem>
      <ToggleGroupItem
        value="list"
        className={ACTIVE_TOGGLE_CLASS}
        title="List view"
        aria-label="List view"
      >
        <Rows3Icon className="size-4" />
      </ToggleGroupItem>
    </ToggleGroup>
  );
}

/** Gap between checker cells, matching the grid's `gap-3` (used in width math). */
const CHECK_GRID_GAP = 12;
/** Fallback rendered cell width before the grid has been measured. */
const CHECK_CELL_WIDTH = 172;

/** Card-line sort options exposed in the checker toolbar. */
const CHECK_SORT_OPTIONS: SortGroupOption<DeckCheckSort>[] = [
  { value: "deck", label: "Deck order" },
  { value: "id", label: "ID" },
  { value: "name", label: "Name" },
];

function ZoneSection({
  slug,
  eventId,
  entryId,
  label,
  cards,
  displayMode,
  printingById,
  onHover,
  columns,
  cellWidth,
  intrinsic,
  locked,
  onStale,
}: {
  slug: string;
  eventId: string;
  entryId: string;
  label: string;
  cards: DeckCheckEntryCardResponse[];
  displayMode: DeckCheckDisplayMode;
  /** Printing lookup for resolving list-row names; only passed in list mode. */
  printingById?: Map<string, Printing>;
  /** Floating-preview hover callback; only passed in list mode. */
  onHover?: (printing: Printing | null) => void;
  /** Resolved cards-per-row count for the stacked (full-width) zones. */
  columns: number;
  /** Rendered width of one card, driving image sizing and intrinsic sections. */
  cellWidth: number;
  /** Content-sized section for the wrapping zone row. */
  intrinsic?: boolean;
  /** A finished verdict (checked/issue) hides the per-copy remove control. */
  locked: boolean;
  onStale: () => void;
}) {
  const verifiedCopies = cards.reduce(
    (sum, card) => sum + card.foundCopies.filter(Boolean).length,
    0,
  );
  const totalCopies = cards.reduce((sum, card) => sum + card.quantity, 0);
  const done = totalCopies > 0 && verifiedCopies === totalCopies;

  const heading = (
    <h3 className="text-muted-foreground flex items-center gap-1.5 text-sm font-medium tracking-wide uppercase">
      <span>{label}</span>
      <span className={cn(done && "text-green-600")}>
        · {verifiedCopies}/{totalCopies}
      </span>
      {done ? <CheckIcon className="size-3.5 text-green-600" strokeWidth={3} /> : null}
    </h3>
  );

  if (displayMode === "list") {
    return (
      <section className="flex min-w-0 flex-col gap-1.5">
        {heading}
        <div className="flex flex-col">
          {cards.flatMap((card) =>
            Array.from({ length: card.quantity }, (_copy, copyIndex) => (
              <ChecklistRow
                key={`${card.id}:${copyIndex}`}
                slug={slug}
                eventId={eventId}
                entryId={entryId}
                card={card}
                copyIndex={copyIndex}
                printing={
                  card.resolvedPrintingId ? printingById?.get(card.resolvedPrintingId) : undefined
                }
                onHover={onHover}
                onStale={onStale}
              />
            )),
          )}
        </div>
      </section>
    );
  }

  // Flow zones size each card to `cellWidth`; stacked zones fill the row with
  // exactly `columns` equal tracks so the count matches the toolbar control.
  const intrinsicWidth = totalCopies * cellWidth + (totalCopies - 1) * CHECK_GRID_GAP;
  const gridTemplateColumns = intrinsic
    ? `repeat(auto-fill, minmax(min(${cellWidth}px, 100%), 1fr))`
    : `repeat(${columns}, minmax(0, 1fr))`;
  return (
    <section
      className="flex min-w-0 flex-col gap-2"
      style={intrinsic ? { width: `min(100%, ${intrinsicWidth}px)` } : undefined}
    >
      {heading}
      <div className="grid gap-3" style={{ gridTemplateColumns }}>
        {cards.flatMap((card) =>
          Array.from({ length: card.quantity }, (_copy, copyIndex) => (
            <ChecklistCell
              key={`${card.id}:${copyIndex}`}
              slug={slug}
              eventId={eventId}
              entryId={entryId}
              card={card}
              copyIndex={copyIndex}
              cellWidth={cellWidth}
              locked={locked}
              onStale={onStale}
            />
          )),
        )}
      </div>
    </section>
  );
}

/**
 * One physical copy of a card line as a dense text row: a found checkbox, set
 * code, name, and (for multi-copy lines) the copy number. Tapping the row
 * toggles found for that copy; remove and (for unmatched lines) fix sit at the
 * right. Hovering floats the large card image via the shared preview.
 * @returns The tappable copy row.
 */
function ChecklistRow({
  slug,
  eventId,
  entryId,
  card,
  copyIndex,
  printing,
  onHover,
  onStale,
}: {
  slug: string;
  eventId: string;
  entryId: string;
  card: DeckCheckEntryCardResponse;
  copyIndex: number;
  printing?: Printing;
  onHover?: (printing: Printing | null) => void;
  onStale: () => void;
}) {
  const tickCard = useTickDeckCheckCard();
  const removeCard = useRemoveDeckCheckCard();
  const [removeOpen, setRemoveOpen] = useState(false);
  const [fixOpen, setFixOpen] = useState(false);
  const found = card.foundCopies[copyIndex] === true;
  const matched = printing !== undefined && card.matchStatus === "matched";
  const name = matched ? printing.card.name : card.rawName;

  const toggle = async () => {
    try {
      await tickCard.mutateAsync({
        slug,
        eventId,
        entryId,
        cardId: card.id,
        copyIndex,
        found: !found,
      });
    } catch {
      toast.info("This list changed; reloading");
      onStale();
    }
  };

  return (
    <div
      className="hover:bg-muted/40 flex items-center gap-2 rounded-md"
      onMouseEnter={() => {
        if (matched) {
          onHover?.(printing);
        }
      }}
      onMouseLeave={() => onHover?.(null)}
    >
      <button
        type="button"
        onClick={() => void toggle()}
        className="flex min-w-0 flex-1 items-center gap-3 rounded-md px-2 py-1.5 text-left"
      >
        <span
          aria-hidden
          className={cn(
            "flex size-5 shrink-0 items-center justify-center rounded border",
            found ? "border-green-600 bg-green-600 text-white" : "border-input",
          )}
        >
          {found ? <CheckIcon className="size-3.5" strokeWidth={3} /> : null}
        </span>
        {matched ? (
          <span className="text-muted-foreground w-24 shrink-0 text-sm tabular-nums">
            {printing.shortCode}
          </span>
        ) : null}
        <span
          className={cn("min-w-0 flex-1 truncate", found && "text-muted-foreground line-through")}
        >
          {name}
        </span>
        {matched ? null : (
          <span className="text-muted-foreground shrink-0 text-sm">
            {card.matchStatus === "ambiguous" ? "Several matches" : "Not in catalog"}
          </span>
        )}
        {card.quantity > 1 ? (
          <span className="text-muted-foreground text-2xs shrink-0">copy {copyIndex + 1}</span>
        ) : null}
      </button>
      <div className="flex shrink-0 items-center gap-0.5 pr-1">
        {matched ? null : (
          <>
            <button
              type="button"
              aria-label={`Fix the name of ${card.rawName}`}
              className="text-muted-foreground hover:text-foreground rounded p-1"
              onClick={() => setFixOpen(true)}
            >
              <PencilIcon className="size-3.5" />
            </button>
            <FixCardDialog
              slug={slug}
              eventId={eventId}
              entryId={entryId}
              card={card}
              open={fixOpen}
              onOpenChange={setFixOpen}
            />
          </>
        )}
        <button
          type="button"
          aria-label={`Remove this copy of ${card.rawName}`}
          className="text-muted-foreground hover:text-destructive rounded p-1"
          onClick={() => setRemoveOpen(true)}
        >
          <XIcon className="size-3.5" />
        </button>
      </div>
      <ConfirmActionDialog
        open={removeOpen}
        onOpenChange={setRemoveOpen}
        title={`Remove ${card.rawName}?`}
        description={
          card.quantity > 1
            ? "Only this copy is removed from the list."
            : "The card is removed from this list."
        }
        confirmLabel="Remove"
        pendingLabel="Removing..."
        isPending={removeCard.isPending}
        onConfirm={async () => {
          await removeCard.mutateAsync({ slug, eventId, entryId, cardId: card.id, copyIndex });
          setRemoveOpen(false);
        }}
      />
    </div>
  );
}

/**
 * One physical copy of a card line. A line with quantity 3 renders three
 * cells — the deck on the table is unsorted, so the judge finds copies one at
 * a time. Each cell carries its own found tick, so the cell you tap is the
 * one that lights up.
 * @returns The tappable copy cell.
 */
function ChecklistCell({
  slug,
  eventId,
  entryId,
  card,
  copyIndex,
  cellWidth,
  locked,
  onStale,
}: {
  slug: string;
  eventId: string;
  entryId: string;
  card: DeckCheckEntryCardResponse;
  copyIndex: number;
  cellWidth: number;
  /** A finished verdict (checked/issue) freezes ticking and hides the remove control. */
  locked: boolean;
  onStale: () => void;
}) {
  const { allPrintings } = useCards();
  const display = useCardThumbnailDisplay();
  const tickCard = useTickDeckCheckCard();
  const removeCard = useRemoveDeckCheckCard();
  const [removeOpen, setRemoveOpen] = useState(false);
  const [fixOpen, setFixOpen] = useState(false);
  const found = card.foundCopies[copyIndex] === true;

  const toggle = async () => {
    // A finished verdict freezes the checklist; re-open the entry to tick again.
    if (locked) {
      return;
    }
    try {
      await tickCard.mutateAsync({
        slug,
        eventId,
        entryId,
        cardId: card.id,
        copyIndex,
        found: !found,
      });
    } catch {
      // A 409 means the list was re-imported under us; reload the entry.
      toast.info("This list changed; reloading");
      onStale();
    }
  };

  const foundOverlay = found ? (
    <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
      <div className="bg-background/80 rounded-full p-3 shadow-md">
        <CheckIcon className="size-12 text-green-600" strokeWidth={3} />
      </div>
    </div>
  ) : null;

  const removeAffordance = locked ? null : (
    <>
      <button
        type="button"
        aria-label={`Remove this copy of ${card.rawName}`}
        className="bg-background/80 hover:text-destructive pointer-events-auto absolute top-1 right-1 z-20 rounded-full p-1 shadow-sm"
        onClick={(event) => {
          event.stopPropagation();
          setRemoveOpen(true);
        }}
      >
        <XIcon className="size-3.5" />
      </button>
      <ConfirmActionDialog
        open={removeOpen}
        onOpenChange={setRemoveOpen}
        title={`Remove ${card.rawName}?`}
        description={
          card.quantity > 1
            ? "Only this copy is removed from the list."
            : "The card is removed from this list."
        }
        confirmLabel="Remove"
        pendingLabel="Removing..."
        isPending={removeCard.isPending}
        onConfirm={async () => {
          await removeCard.mutateAsync({ slug, eventId, entryId, cardId: card.id, copyIndex });
          setRemoveOpen(false);
        }}
      />
    </>
  );

  const printing = card.resolvedPrintingId
    ? allPrintings.find((candidate) => candidate.id === card.resolvedPrintingId)
    : undefined;

  if (!printing || card.matchStatus !== "matched") {
    return (
      <div className="relative">
        <button
          type="button"
          onClick={() => void toggle()}
          className={`flex h-full w-full flex-col items-start gap-1 rounded-md border border-dashed border-amber-500/60 bg-amber-500/10 p-2 text-left text-sm ${found ? "opacity-60" : ""}`}
        >
          <span className="font-medium break-all">{card.rawName}</span>
          <span className="text-muted-foreground">
            {card.matchStatus === "ambiguous" ? "Several matches" : "Not in catalog"}
          </span>
        </button>
        {locked ? null : (
          <>
            <button
              type="button"
              aria-label={`Fix the name of ${card.rawName}`}
              className="bg-background/80 hover:text-foreground pointer-events-auto absolute top-1 right-8 z-20 rounded-full p-1 shadow-sm"
              onClick={(event) => {
                event.stopPropagation();
                setFixOpen(true);
              }}
            >
              <PencilIcon className="size-3.5" />
            </button>
            <FixCardDialog
              slug={slug}
              eventId={eventId}
              entryId={entryId}
              card={card}
              open={fixOpen}
              onOpenChange={setFixOpen}
            />
          </>
        )}
        {foundOverlay}
        {removeAffordance}
      </div>
    );
  }

  return (
    <CardCell
      printing={printing}
      ctx={{ isSelected: false, isFlashing: false, cardWidth: cellWidth, priority: false }}
      display={display}
      showImages
      onClick={() => void toggle()}
      leftOverlay={
        <>
          {foundOverlay}
          {removeAffordance}
        </>
      }
      dimmed={found}
    />
  );
}
