import type { DeckSummaryResponse } from "@openrift/shared";
import { formatDay } from "@openrift/shared";
import { Link } from "@tanstack/react-router";
import { CopyIcon, EllipsisVerticalIcon, Link2Icon } from "lucide-react";
import { Suspense, useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
  useLinkDeckVariant,
  usePromoteDeckPrimary,
  useSetDeckPredecessor,
  useUnlinkDeckVariant,
} from "@/hooks/use-decks";
import { buildRailLayout } from "@/lib/deck-variant-rail";
import { cn } from "@/lib/utils";

import { DeckVariantCreateForm } from "./deck-variant-create-dialog";

interface DeckVariantsDialogProps {
  deckId: string;
  /** The open deck's name, for the names a new variant or checkpoint defaults to. */
  deckName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** The parent picker's "this version starts the history" option. */
const NO_PARENT = "none";

/** Indent per generation in the lineage list. */
const GENERATION_INDENT = 18;

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

function LineageRow({
  deck,
  generation,
  isCurrent,
  openDeckId,
  parentChoices,
  canUnlink,
  onNavigate,
  onSetParent,
  onPromote,
  onUnlink,
}: {
  deck: DeckSummaryResponse;
  /** Depth from the family's oldest version; drives the indent and the elbow. */
  generation: number;
  isCurrent: boolean;
  openDeckId: string;
  parentChoices: { value: string; label: string }[];
  canUnlink: boolean;
  onNavigate: () => void;
  onSetParent: (parentId: string | null) => void;
  onPromote: () => void;
  onUnlink: () => void;
}) {
  const parentItems = [{ value: NO_PARENT, label: "Starts the history" }, ...parentChoices];
  return (
    <li
      className="flex min-w-0 items-start gap-2"
      style={{ paddingLeft: generation * GENERATION_INDENT }}
    >
      <span className="relative flex w-3 shrink-0 justify-center pt-2">
        {generation > 0 && (
          // The elbow into this row's dot, from the column of the generation
          // above it — the same fork the rail draws, turned on its side.
          <span
            aria-hidden
            className="border-border absolute rounded-bl-sm border-b border-l"
            style={{
              left: -GENERATION_INDENT + 6,
              top: -6,
              width: GENERATION_INDENT - 6,
              height: 14,
            }}
          />
        )}
        <span
          aria-hidden
          className={cn(
            "size-2 rounded-full",
            isCurrent ? "bg-primary ring-primary/25 ring-4" : "bg-muted-foreground",
          )}
        />
      </span>

      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex min-w-0 items-center gap-1.5">
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
        </div>
        <div className="flex min-w-0 flex-wrap items-center gap-2">
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
        <span className="text-muted-foreground text-2xs">Updated {formatDay(deck.updatedAt)}</span>
      </div>

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
            <DropdownMenuItem
              onClick={onUnlink}
              className="text-destructive focus:text-destructive"
            >
              Remove from variants
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
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

  // At most one panel is expanded at a time: two forms open under a short list
  // of versions would push each other off the bottom of the dialog.
  const [panel, setPanel] = useState<"create" | "link" | null>(null);
  const [linkTargetId, setLinkTargetId] = useState<string | null>(null);

  const current = items.find((item) => item.deck.id === deckId);
  const familyId = current?.deck.familyId ?? null;
  const members = items
    .filter((item) => (familyId ? item.deck.familyId === familyId : item.deck.id === deckId))
    .map((item) => item.deck);

  // The rail's graph, read as a list: the layout already walks the family
  // parent-first, so rows arrive in an order where every parent is above its
  // children and `x` is the generation to indent by.
  const lineage = buildRailLayout(members, deckId, members.length);
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
      <ul className="flex min-w-0 flex-col gap-3">
        {lineage.nodes.map((node) => {
          const deck = membersById.get(node.id);
          if (!deck) {
            return null;
          }
          return (
            <LineageRow
              key={deck.id}
              deck={deck}
              generation={node.x}
              isCurrent={node.isCurrent}
              openDeckId={deckId}
              parentChoices={parentOptions(members, deck.id)}
              canUnlink={members.length > 1}
              onNavigate={onClose}
              onSetParent={(parentId) => handleSetParent(deck.id, parentId)}
              onPromote={() => handlePromote(deck.id)}
              onUnlink={() => handleUnlink(deck.id)}
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
