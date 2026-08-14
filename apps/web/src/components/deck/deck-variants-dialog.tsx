import type { Card, DeckSummaryResponse } from "@openrift/shared";
import { ZONE_LABELS } from "@openrift/shared";
import type { QueryClient } from "@tanstack/react-query";
import { useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { UnlinkIcon } from "lucide-react";
import { Suspense, useEffect, useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useCards } from "@/hooks/use-cards";
import {
  deckDetailQueryOptions,
  useDecks,
  useLinkDeckVariant,
  usePromoteDeckPrimary,
  useUnlinkDeckVariant,
} from "@/hooks/use-decks";
import { useRequiredUserId } from "@/lib/auth-session";
import type { DeckDiff, DeckDiffEntry } from "@/lib/deck-diff";
import { deckDiffCardsFrom, diffDecks } from "@/lib/deck-diff";
import { formatAbsoluteDate } from "@/lib/format-date";
import { cn } from "@/lib/utils";

interface DeckVariantsDialogProps {
  deckId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Preselects the "Deck" side of the comparison. Defaults to the open deck. */
  initialBaseId?: string;
  /** Preselects the "Compared with" side. Defaults to {@link defaultCompareId}. */
  initialCompareId?: string;
}

/**
 * Diffs two family members in reading order: what the older list would need to
 * become the newer one.
 * @returns The diff between the two decks' cards.
 */
async function loadVariantDiff(
  queryClient: QueryClient,
  userId: string,
  fromDeckId: string,
  toDeckId: string,
  cardsById: Record<string, Card>,
): Promise<DeckDiff> {
  const [from, to] = await Promise.all([
    queryClient.fetchQuery(deckDetailQueryOptions(userId, fromDeckId)),
    queryClient.fetchQuery(deckDetailQueryOptions(userId, toDeckId)),
  ]);
  return diffDecks(
    deckDiffCardsFrom(from.cards, cardsById),
    deckDiffCardsFrom(to.cards, cardsById),
  );
}

/** @returns The family member the comparison starts on: the predecessor, else the next member. */
export function defaultCompareId(deckId: string, members: readonly DeckSummaryResponse[]): string {
  const current = members.find((member) => member.id === deckId);
  const predecessorId = current?.predecessorDeckId;
  if (predecessorId && members.some((member) => member.id === predecessorId)) {
    return predecessorId;
  }
  const other = members.find((member) => member.id !== deckId);
  return other?.id ?? deckId;
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

const CHIP_BASE = "rounded px-1.5 font-mono text-xs font-bold tabular-nums";

const CHIP_STYLES: Record<DeckDiffEntry["kind"], string> = {
  add: "bg-green-500/10 text-green-600 dark:text-green-500",
  cut: "bg-destructive/10 text-destructive",
  change: "bg-amber-500/10 text-amber-700 dark:text-amber-500",
};

/** @returns The chip text, e.g. "+2", "−1", or "3→2". */
function chipLabel(entry: DeckDiffEntry): string {
  if (entry.kind === "add") {
    return `+${entry.theirs}`;
  }
  if (entry.kind === "cut") {
    return `−${entry.ours}`;
  }
  return `${entry.ours}→${entry.theirs}`;
}

function VariantDiffRow({ entry }: { entry: DeckDiffEntry }) {
  return (
    <div className="flex items-baseline gap-2">
      <span className={cn(CHIP_BASE, CHIP_STYLES[entry.kind])}>{chipLabel(entry)}</span>
      <span className="min-w-0 flex-1 truncate">{entry.cardName}</span>
    </div>
  );
}

function VariantMemberRow({
  deck,
  isCurrent,
  isPredecessor,
  canUnlink,
  onNavigate,
  onPromote,
  onUnlink,
}: {
  deck: DeckSummaryResponse;
  isCurrent: boolean;
  isPredecessor: boolean;
  canUnlink: boolean;
  onNavigate: () => void;
  onPromote: () => void;
  onUnlink: () => void;
}) {
  return (
    <li className="flex items-center gap-2">
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
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
          {isPredecessor && <Badge variant="muted">Previous version</Badge>}
        </div>
        <span className="text-muted-foreground text-2xs">
          Updated{" "}
          {formatAbsoluteDate(deck.updatedAt, { year: "numeric", month: "short", day: "numeric" })}
        </span>
      </div>
      {!deck.isPrimary && (
        <Button variant="ghost" size="sm" onClick={onPromote}>
          Make primary
        </Button>
      )}
      {canUnlink && (
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={`Remove ${deck.name} from variants`}
                onClick={onUnlink}
              />
            }
          >
            <UnlinkIcon className="size-4" />
          </TooltipTrigger>
          <TooltipContent>Remove from variants</TooltipContent>
        </Tooltip>
      )}
    </li>
  );
}

function VariantsDialogBody({
  deckId,
  initialBaseId,
  initialCompareId,
  onClose,
}: {
  deckId: string;
  initialBaseId?: string;
  initialCompareId?: string;
  onClose: () => void;
}) {
  const userId = useRequiredUserId();
  const queryClient = useQueryClient();
  const { cardsById } = useCards();
  const { data: items } = useDecks();
  const promotePrimary = usePromoteDeckPrimary();
  const linkVariant = useLinkDeckVariant();
  const unlinkVariant = useUnlinkDeckVariant();

  const current = items.find((item) => item.deck.id === deckId);
  const familyId = current?.deck.familyId ?? null;
  const members = items
    .filter((item) => (familyId ? item.deck.familyId === familyId : item.deck.id === deckId))
    .map((item) => item.deck)
    .toSorted((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  // A member someone else descends from is history, whichever way it was made.
  const predecessorIds = new Set(
    members.map((member) => member.predecessorDeckId).filter((id): id is string => id !== null),
  );

  const [baseId, setBaseId] = useState(initialBaseId ?? deckId);
  const [compareId, setCompareId] = useState(
    () => initialCompareId ?? defaultCompareId(deckId, members),
  );
  const [linkTargetId, setLinkTargetId] = useState<string | null>(null);
  const [markAsPreviousVersion, setMarkAsPreviousVersion] = useState(false);
  const [diff, setDiff] = useState<DeckDiff | null>(null);
  const [diffPending, setDiffPending] = useState(false);
  const [diffFailed, setDiffFailed] = useState(false);

  useEffect(() => {
    if (baseId === compareId) {
      setDiff(null);
      setDiffPending(false);
      setDiffFailed(false);
      return;
    }
    let cancelled = false;
    setDiffPending(true);
    setDiffFailed(false);
    const run = async () => {
      try {
        const result = await loadVariantDiff(queryClient, userId, compareId, baseId, cardsById);
        if (cancelled) {
          return;
        }
        setDiff(result);
        setDiffPending(false);
      } catch {
        if (cancelled) {
          return;
        }
        setDiff(null);
        setDiffPending(false);
        setDiffFailed(true);
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [queryClient, userId, baseId, compareId, cardsById]);

  const selectItems = members.map((member) => ({ value: member.id, label: member.name }));
  const baseName = members.find((member) => member.id === baseId)?.name ?? "this deck";
  const compareName = members.find((member) => member.id === compareId)?.name ?? "the other deck";
  const isIdentical = diff !== null && diff.zones.length === 0;

  const linkOptions = linkableDeckOptions(
    items.map((item) => item.deck),
    new Set(members.map((member) => member.id)),
  );
  // The other deck becomes this one's previous version, which only makes sense
  // while this deck has no predecessor yet.
  const canMarkPreviousVersion = (current?.deck.predecessorDeckId ?? null) === null;

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

  const handleLink = () => {
    if (linkTargetId === null) {
      return;
    }
    linkVariant.mutate(
      {
        deckId,
        otherDeckId: linkTargetId,
        markAsPreviousVersion: canMarkPreviousVersion && markAsPreviousVersion,
      },
      {
        onSuccess: () => {
          setLinkTargetId(null);
          setMarkAsPreviousVersion(false);
          toast.success("Decks linked");
        },
        // Errors are reported by the global mutation error toast.
      },
    );
  };

  return (
    <div className="flex min-w-0 flex-col gap-5">
      <ul className="flex min-w-0 flex-col gap-3">
        {members.map((member) => (
          <VariantMemberRow
            key={member.id}
            deck={member}
            isCurrent={member.id === deckId}
            isPredecessor={predecessorIds.has(member.id)}
            canUnlink={members.length > 1}
            onNavigate={onClose}
            onPromote={() => handlePromote(member.id)}
            onUnlink={() => handleUnlink(member.id)}
          />
        ))}
      </ul>

      <div className="flex min-w-0 flex-col gap-3 border-t pt-4">
        <span className="font-medium">Link another deck</span>
        {linkOptions.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            There is no other deck to link. Every deck you own is either already in this family or
            archived.
          </p>
        ) : (
          <>
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
            {canMarkPreviousVersion && (
              <div className="flex items-center gap-2">
                <Checkbox
                  id="deck-variants-previous"
                  checked={markAsPreviousVersion}
                  onCheckedChange={(checked) => setMarkAsPreviousVersion(checked === true)}
                />
                <Label htmlFor="deck-variants-previous" className="font-normal">
                  This is the newer version (link the other deck as its previous version)
                </Label>
              </div>
            )}
            <div>
              <Button
                variant="secondary"
                size="sm"
                disabled={linkTargetId === null || linkVariant.isPending}
                onClick={handleLink}
              >
                Link deck
              </Button>
            </div>
          </>
        )}
      </div>

      {members.length > 1 && (
        <div className="flex min-w-0 flex-col gap-3 border-t pt-4">
          <span className="font-medium">Show changes</span>
          <div className="flex min-w-0 flex-col gap-3 sm:flex-row">
            <div className="flex min-w-0 flex-1 flex-col gap-2">
              <Label htmlFor="deck-variants-base">Deck</Label>
              <Select
                items={selectItems}
                value={baseId}
                onValueChange={(value) => setBaseId(value ?? baseId)}
              >
                <SelectTrigger id="deck-variants-base" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {selectItems.map((item) => (
                    <SelectItem key={item.value} value={item.value}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex min-w-0 flex-1 flex-col gap-2">
              <Label htmlFor="deck-variants-compare">Compared with</Label>
              <Select
                items={selectItems}
                value={compareId}
                onValueChange={(value) => setCompareId(value ?? compareId)}
              >
                <SelectTrigger id="deck-variants-compare" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {selectItems.map((item) => (
                    <SelectItem key={item.value} value={item.value}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {baseId === compareId && (
            <p className="text-muted-foreground text-sm">Pick two different variants to compare.</p>
          )}
          {diffPending && <p className="text-muted-foreground text-sm">Loading changes…</p>}
          {diffFailed && (
            <p className="text-destructive text-sm">Couldn&apos;t load the changes. Try again.</p>
          )}
          {diff && (
            <div className="flex min-w-0 flex-col gap-3">
              <p className="text-muted-foreground text-sm tabular-nums">
                From {compareName} to {baseName} · {diff.sharedCount} cards shared
                {isIdentical ? "" : ` · +${diff.addCount} · −${diff.cutCount}`}
              </p>
              {isIdentical ? (
                <p className="text-sm">The two lists match, card for card.</p>
              ) : (
                <div className="flex max-h-[40dvh] min-w-0 flex-col gap-4 overflow-y-auto overscroll-contain">
                  {diff.zones.map((zoneDiff) => (
                    <section key={zoneDiff.zone} className="flex min-w-0 flex-col gap-1.5">
                      <span className="text-muted-foreground text-2xs font-semibold tracking-widest uppercase">
                        {ZONE_LABELS[zoneDiff.zone]}
                      </span>
                      {zoneDiff.entries.map((entry) => (
                        <VariantDiffRow key={entry.cardId} entry={entry} />
                      ))}
                    </section>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * The variant family of a deck (ADR-042): every member with its badges, a
 * promote action, and the card-level changes between any two of them.
 * @returns The variants dialog element.
 */
export function DeckVariantsDialog({
  deckId,
  open,
  onOpenChange,
  initialBaseId,
  initialCompareId,
}: DeckVariantsDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Variants</DialogTitle>
          <DialogDescription>
            Every version of this deck, and what changed between them.
          </DialogDescription>
        </DialogHeader>
        {/* The body reads the deck list and the catalog, both suspending
            queries — mounting it only while open keeps a closed dialog from
            suspending the page that hosts it. */}
        {open && (
          <Suspense fallback={<p className="text-muted-foreground text-sm">Loading variants…</p>}>
            <VariantsDialogBody
              deckId={deckId}
              initialBaseId={initialBaseId}
              initialCompareId={initialCompareId}
              onClose={() => onOpenChange(false)}
            />
          </Suspense>
        )}
      </DialogContent>
    </Dialog>
  );
}
