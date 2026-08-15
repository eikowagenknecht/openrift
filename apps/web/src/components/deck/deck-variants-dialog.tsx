import type { DeckSummaryResponse } from "@openrift/shared";
import { formatDay } from "@openrift/shared";
import { Link } from "@tanstack/react-router";
import { CopyIcon, EllipsisVerticalIcon, Link2Icon, Trash2Icon } from "lucide-react";
import { Suspense, useState } from "react";
import { toast } from "sonner";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { DialogForm } from "@/components/ui/dialog-form";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  useDecks,
  useDeleteDeck,
  useLinkDeckVariant,
  usePromoteDeckPrimary,
  useSetDeckPredecessor,
  useUnlinkDeckVariant,
} from "@/hooks/use-decks";
import type { VariantGraphRow } from "@/lib/deck-variant-graph";
import { buildVariantGraph } from "@/lib/deck-variant-graph";
import { cn } from "@/lib/utils";

import { DeckVariantCreateForm } from "./deck-variant-create-dialog";

interface DeckVariantsDialogProps {
  deckId: string;
  /** The open deck's name, for the names a new variant or checkpoint defaults to. */
  deckName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** The parent picker's "this version came from nothing" option. */
const NO_PARENT = "none";

/** Horizontal distance between two lanes of the graph gutter. */
const LANE_WIDTH = 14;
/** Height of a row's first line, which the dot is centred on. */
const HEADER_HEIGHT = 28;
/** Padding above and below a row's content; rows themselves sit flush. */
const ROW_PAD_Y = 8;
/** Distance from the top of a row to the centre of its dot. */
const DOT_Y = ROW_PAD_Y + HEADER_HEIGHT / 2;
/** Diameter of a dot (`size-2`). */
const DOT_SIZE = 8;

/** @returns The pixel centre of a lane inside the gutter. */
function laneX(lane: number): number {
  return lane * LANE_WIDTH + LANE_WIDTH / 2;
}

/**
 * The decks that can still join this family: everything else the user owns,
 * minus the members already in it and minus archived decks (linking one would
 * hide it in the family right after).
 * @returns Picker options, by name.
 */
export function linkableDeckOptions(
  decks: readonly DeckSummaryResponse[],
  memberIds: ReadonlySet<string>,
): { value: string; label: string }[] {
  return decks
    .filter((deck) => !memberIds.has(deck.id) && deck.archivedAt === null)
    .map((deck) => ({ value: deck.id, label: deck.name }))
    .toSorted((left, right) => left.label.localeCompare(right.label));
}

/**
 * The family members a deck may be pointed at as the version it came from:
 * everyone but itself and its own descendants, since either would close the
 * history into a loop. The server enforces the same rule; this only keeps
 * impossible choices out of the menu.
 *
 * @returns Picker options, by name.
 */
export function parentOptions(
  members: readonly DeckSummaryResponse[],
  deckId: string,
): { value: string; label: string }[] {
  const descendants = new Set([deckId]);
  // Repeat until nothing new lands: one pass only reaches direct children,
  // and members arrive in no particular order.
  let grew = true;
  while (grew) {
    grew = false;
    for (const member of members) {
      if (
        member.predecessorDeckId !== null &&
        descendants.has(member.predecessorDeckId) &&
        !descendants.has(member.id)
      ) {
        descendants.add(member.id);
        grew = true;
      }
    }
  }
  return members
    .filter((member) => !descendants.has(member.id))
    .map((member) => ({ value: member.id, label: member.name }))
    .toSorted((left, right) => left.label.localeCompare(right.label));
}

/**
 * One row's slice of the graph: the lines running past it, the line into its
 * dot, and any fork leaving it. Drawn with plain boxes rather than an SVG so a
 * row can be as tall as its content and the lines still meet across rows.
 *
 * @returns The gutter element for one row.
 */
function LineageGutter({
  row,
  isCurrent,
  laneCount,
}: {
  row: VariantGraphRow;
  isCurrent: boolean;
  laneCount: number;
}) {
  const x = laneX(row.lane);
  return (
    <div aria-hidden className="relative shrink-0" style={{ width: laneCount * LANE_WIDTH }}>
      {row.throughLanes.map((lane) => (
        <span
          key={lane}
          className="bg-border absolute inset-y-0 w-px"
          style={{ left: laneX(lane) }}
        />
      ))}
      {row.hasParentAbove && (
        <span className="bg-border absolute top-0 w-px" style={{ left: x, height: DOT_Y }} />
      )}
      {row.continuesBelow && (
        <span className="bg-border absolute bottom-0 w-px" style={{ left: x, top: DOT_Y }} />
      )}
      {row.branchLanes.map((lane) => (
        // A fork leaves the dot sideways and turns down a lane of its own, so
        // it reads as branching off this version rather than following it.
        <span
          key={lane}
          className={cn(
            "border-border absolute bottom-0 border-t",
            lane > row.lane ? "rounded-tr-sm border-r" : "rounded-tl-sm border-l",
          )}
          style={{
            left: Math.min(x, laneX(lane)),
            top: DOT_Y,
            // One past the lane distance: a `w-px` line covers [laneX, laneX+1),
            // so a box that stops at laneX leaves its border a pixel short of
            // the column it joins, on either side.
            width: Math.abs(laneX(lane) - x) + 1,
          }}
        />
      ))}
      <span
        className={cn(
          "absolute size-2 rounded-full",
          isCurrent ? "bg-primary ring-primary/25 ring-4" : "bg-muted-foreground",
        )}
        style={{ left: x - DOT_SIZE / 2, top: DOT_Y - DOT_SIZE / 2 }}
      />
    </div>
  );
}

/**
 * The per-version overflow menu. Split out so the row itself stays readable.
 *
 * @returns The actions menu for one version.
 */
function RowActions({
  deck,
  isCurrent,
  openDeckId,
  canUnlink,
  onPromote,
  onUnlink,
  onDelete,
}: {
  deck: DeckSummaryResponse;
  isCurrent: boolean;
  openDeckId: string;
  canUnlink: boolean;
  onPromote: () => void;
  onUnlink: () => void;
  onDelete: () => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={<Button variant="ghost" size="icon-sm" aria-label={`Actions for ${deck.name}`} />}
      >
        <EllipsisVerticalIcon className="size-4" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {!isCurrent && (
          <DropdownMenuItem
            render={<Link to="/decks/compare" search={{ from: deck.id, to: openDeckId }} />}
          >
            Show changes
          </DropdownMenuItem>
        )}
        {!deck.isPrimary && <DropdownMenuItem onClick={onPromote}>Make primary</DropdownMenuItem>}
        {canUnlink && (
          <DropdownMenuItem onClick={onUnlink} className="text-destructive focus:text-destructive">
            Remove from variants
          </DropdownMenuItem>
        )}
        {/* The open deck deletes itself from its own top bar instead: doing it
            here would delete the page the dialog is sitting on. */}
        {!isCurrent && (
          <DropdownMenuItem onClick={onDelete} className="text-destructive focus:text-destructive">
            <Trash2Icon className="size-4" />
            Delete version
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function LineageRow({
  deck,
  row,
  laneCount,
  isCurrent,
  openDeckId,
  parentChoices,
  canUnlink,
  onNavigate,
  onSetParent,
  onPromote,
  onUnlink,
  onDelete,
}: {
  deck: DeckSummaryResponse;
  /** Where this version's dot sits, and which lines pass its row. */
  row: VariantGraphRow;
  laneCount: number;
  isCurrent: boolean;
  openDeckId: string;
  parentChoices: { value: string; label: string }[];
  canUnlink: boolean;
  onNavigate: () => void;
  onSetParent: (parentId: string | null) => void;
  onPromote: () => void;
  onUnlink: () => void;
  onDelete: () => void;
}) {
  const parentItems = [{ value: NO_PARENT, label: "Nothing" }, ...parentChoices];
  return (
    // Rows sit flush against each other and pad their own content, so the
    // gutter's lines run unbroken from one row into the next.
    <li className="flex min-w-0 items-stretch gap-2">
      <LineageGutter row={row} isCurrent={isCurrent} laneCount={laneCount} />
      <div className="flex min-w-0 flex-1 flex-col gap-1 py-2">
        <div className="flex min-w-0 items-center gap-1.5" style={{ height: HEADER_HEIGHT }}>
          <Link
            to="/decks/$deckId"
            params={{ deckId: deck.id }}
            className="truncate font-medium hover:underline"
            onClick={onNavigate}
          >
            {deck.name}
          </Link>
          {isCurrent && <Badge variant="subtle">Current</Badge>}
          {deck.isPrimary && <Badge variant="secondary">Primary</Badge>}
          {deck.isDraft && <Badge variant="warning">Draft</Badge>}
          <span className="text-muted-foreground text-2xs ml-auto shrink-0">
            Updated {formatDay(deck.updatedAt)}
          </span>
          <RowActions
            deck={deck}
            isCurrent={isCurrent}
            openDeckId={openDeckId}
            canUnlink={canUnlink}
            onPromote={onPromote}
            onUnlink={onUnlink}
            onDelete={onDelete}
          />
        </div>
        {/* A family of one has nothing to have come from, so the picker only
            shows up once there is another version to point at. */}
        {parentChoices.length > 0 && (
          <div className="flex min-w-0 items-center gap-2">
            <span className="text-muted-foreground text-2xs shrink-0">Came from</span>
            <Select
              items={parentItems}
              value={deck.predecessorDeckId ?? NO_PARENT}
              onValueChange={(value) => onSetParent(value === NO_PARENT ? null : (value ?? null))}
            >
              <SelectTrigger
                size="sm"
                aria-label={`Previous version of ${deck.name}`}
                className="min-w-0 flex-1"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {parentItems.map((item) => (
                  <SelectItem key={item.value} value={item.value}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>
    </li>
  );
}

function VariantsDialogBody({
  deckId,
  deckName,
  onClose,
}: {
  deckId: string;
  deckName: string;
  onClose: () => void;
}) {
  const { data: items } = useDecks();
  const promotePrimary = usePromoteDeckPrimary();
  const linkVariant = useLinkDeckVariant();
  const unlinkVariant = useUnlinkDeckVariant();
  const setPredecessor = useSetDeckPredecessor();
  const deleteDeck = useDeleteDeck();

  // The version awaiting a delete confirm. Held as the deck rather than a
  // boolean so the prompt can name it, and so one dialog serves every row.
  const [deleteTarget, setDeleteTarget] = useState<DeckSummaryResponse | null>(null);

  // At most one panel is expanded at a time: two forms open under a short list
  // of versions would push each other off the bottom of the dialog.
  const [panel, setPanel] = useState<"create" | "link" | null>(null);
  const [linkTargetId, setLinkTargetId] = useState<string | null>(null);

  const current = items.find((item) => item.deck.id === deckId);
  const familyId = current?.deck.familyId ?? null;
  const members = items
    .filter((item) => (familyId ? item.deck.familyId === familyId : item.deck.id === deckId))
    .map((item) => item.deck);

  // The family as a commit graph: rows arrive oldest-first with every version
  // above the ones that came from it, and each row carries the lines to draw
  // beside it. Repointing a version re-runs this, so the graph redraws itself.
  const graph = buildVariantGraph(members, deckId);
  const membersById = new Map(members.map((member) => [member.id, member]));

  const linkOptions = linkableDeckOptions(
    items.map((item) => item.deck),
    new Set(members.map((member) => member.id)),
  );

  const handlePromote = (memberId: string) => {
    promotePrimary.mutate(memberId, {
      onSuccess: () => toast.success("Primary variant updated"),
      // Errors are reported by the global mutation error toast.
    });
  };

  const handleUnlink = (memberId: string) => {
    unlinkVariant.mutate(memberId, {
      onSuccess: () => toast.success("Removed from variants"),
      // Errors are reported by the global mutation error toast.
    });
  };

  const handleDelete = () => {
    const target = deleteTarget;
    setDeleteTarget(null);
    if (target === null || deleteDeck.isPending) {
      return;
    }
    // The family repairs itself server-side: a sole survivor goes standalone,
    // and a deleted primary hands the flag on. The graph redraws from the
    // refreshed list, so there is nothing to fix up here.
    deleteDeck.mutate(target.id, {
      onSuccess: () => toast.success("Version deleted"),
      // Errors are reported by the global mutation error toast.
    });
  };

  const handleSetParent = (memberId: string, parentId: string | null) => {
    setPredecessor.mutate({ deckId: memberId, predecessorDeckId: parentId });
  };

  const handleLink = () => {
    if (linkTargetId === null) {
      return;
    }
    linkVariant.mutate(
      { deckId, otherDeckId: linkTargetId },
      {
        onSuccess: () => {
          setLinkTargetId(null);
          setPanel(null);
          toast.success("Decks linked");
        },
        // Errors are reported by the global mutation error toast.
      },
    );
  };

  return (
    <div className="flex min-w-0 flex-col gap-5">
      <ul className="flex min-w-0 flex-col">
        {graph.rows.map((row) => {
          const deck = membersById.get(row.id);
          if (!deck) {
            return null;
          }
          return (
            <LineageRow
              key={deck.id}
              deck={deck}
              row={row}
              laneCount={graph.laneCount}
              isCurrent={deck.id === deckId}
              openDeckId={deckId}
              parentChoices={parentOptions(members, deck.id)}
              canUnlink={members.length > 1}
              onNavigate={onClose}
              onSetParent={(parentId) => handleSetParent(deck.id, parentId)}
              onPromote={() => handlePromote(deck.id)}
              onUnlink={() => handleUnlink(deck.id)}
              onDelete={() => setDeleteTarget(deck)}
            />
          );
        })}
      </ul>

      <div className="flex min-w-0 flex-col gap-3 border-t pt-4">
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="secondary" size="sm" onClick={() => setPanel("create")}>
            <CopyIcon className="size-4" />
            New variant…
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setPanel("link")}>
            <Link2Icon className="size-4" />
            Link another deck…
          </Button>
        </div>

        {panel === "create" && (
          <DeckVariantCreateForm
            deckId={deckId}
            deckName={deckName}
            layout="inline"
            sources={members.map((member) => ({ value: member.id, label: member.name }))}
            onCancel={() => setPanel(null)}
            onCreated={() => setPanel(null)}
          />
        )}

        {panel === "link" && (
          <div className="bg-muted/40 flex min-w-0 flex-col gap-3 rounded-md p-3">
            <div className="flex min-w-0 flex-col gap-0.5">
              <span className="font-medium">Link another deck</span>
              <span className="text-muted-foreground text-sm">
                Pulls a deck you already own into this family, keeping its own list.
              </span>
            </div>
            {linkOptions.length === 0 ? (
              <p className="text-muted-foreground text-sm">
                There is no other deck to link. Every deck you own is either already in this family
                or archived.
              </p>
            ) : (
              <div className="flex min-w-0 flex-col gap-2">
                <Label htmlFor="deck-variants-link">Deck</Label>
                <Select
                  items={linkOptions}
                  value={linkTargetId}
                  onValueChange={(value) => setLinkTargetId(value)}
                >
                  <SelectTrigger id="deck-variants-link" className="w-full">
                    <SelectValue placeholder="Pick a deck" />
                  </SelectTrigger>
                  <SelectContent>
                    {linkOptions.map((item) => (
                      <SelectItem key={item.value} value={item.value}>
                        {item.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setPanel(null)}>
                Cancel
              </Button>
              <Button
                disabled={linkTargetId === null || linkVariant.isPending}
                onClick={handleLink}
              >
                Link deck
              </Button>
            </div>
          </div>
        )}
      </div>

      <AlertDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open) {
            setDeleteTarget(null);
          }
        }}
      >
        <AlertDialogContent>
          <DialogForm onSubmit={handleDelete}>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete version</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to delete &ldquo;{deleteTarget?.name}&rdquo;? The deck and its
                cards are deleted. This cannot be undone, but the other versions stay.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction type="submit" disabled={deleteDeck.isPending}>
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </DialogForm>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

/**
 * The variant family of a deck (ADR-042), as its history: every member under
 * the version it came from, with the lineage editable row by row. Comparing two
 * versions lives on the changes page, not here.
 *
 * @returns The variants dialog element.
 */
export function DeckVariantsDialog({
  deckId,
  deckName,
  open,
  onOpenChange,
}: DeckVariantsDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Variants</DialogTitle>
          <DialogDescription>
            Manage versions of this deck, compare and link them.
          </DialogDescription>
        </DialogHeader>
        {/* The body reads the deck list, a suspending query; mounting it only
            while open keeps a closed dialog from suspending the page that
            hosts it. */}
        {open && (
          <Suspense fallback={<p className="text-muted-foreground text-sm">Loading variants…</p>}>
            <VariantsDialogBody
              deckId={deckId}
              deckName={deckName}
              onClose={() => onOpenChange(false)}
            />
          </Suspense>
        )}
      </DialogContent>
    </Dialog>
  );
}
