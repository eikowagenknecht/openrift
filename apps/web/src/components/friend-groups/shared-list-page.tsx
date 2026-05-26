import type { ListEntryDetailResponse } from "@openrift/shared";
import { imageUrl } from "@openrift/shared";
import { Link } from "@tanstack/react-router";

import { PAGE_TOP_BAR_STICKY, PageTopBarBack } from "@/components/layout/page-top-bar";
import { ListHeader } from "@/components/list/list-header";
import { useCards } from "@/hooks/use-cards";
import { useEnumOrders } from "@/hooks/use-enums";
import { useFriendGroupSharedList } from "@/hooks/use-friend-groups";
import { cn, PAGE_PADDING } from "@/lib/utils";

interface SharedListPageProps {
  slug: string;
  listId: string;
}

/**
 * Browsable view of another member's list shared with the current group. Any
 * member of the group can open this page; the API gates access via
 * friend_group_list_shares + membership.
 *
 * Renders a simple grid of entries (no add/edit affordances) so members can
 * see the full contents, not just the per-card matches.
 * @returns The shared list detail page.
 */
export function SharedListPage({ slug, listId }: SharedListPageProps) {
  const { data } = useFriendGroupSharedList(slug, listId);
  const { cardsById, sets } = useCards();
  const { labels } = useEnumOrders();
  const setsById = new Map(sets.map((set) => [set.id, set]));

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className={PAGE_TOP_BAR_STICKY}>
        <ListHeader
          list={data.list}
          entries={data.entries}
          attribution={{ kind: "owner", ownerName: data.list.ownerName }}
          backLink={<PageTopBarBack to="/groups/$slug" params={{ slug }} />}
        />
      </div>
      <div className={cn("mx-auto flex w-full max-w-5xl flex-col gap-6", PAGE_PADDING)}>
        {data.entries.length === 0 ? (
          <p className="text-muted-foreground">
            This list is empty. Check back later or ping {data.list.ownerName ?? "the owner"}{" "}
            directly.
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {data.entries.map((entry) => (
              <SharedListEntryRow
                key={entry.id}
                entry={entry}
                cardSlug={cardsById[(entry as { cardId?: string }).cardId ?? ""]?.slug}
                setName={setNameFor(entry, setsById)}
                rarityLabel={rarityLabelFor(entry, labels.rarities)}
                finishLabel={finishLabelFor(entry, labels.finishes)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function setNameFor(
  entry: ListEntryDetailResponse,
  setsById: Map<string, { name: string }>,
): string | null {
  if (entry.kind === "card") {
    return null;
  }
  return setsById.get(entry.setId)?.name ?? entry.setId;
}

function rarityLabelFor(
  entry: ListEntryDetailResponse,
  rarityLabels: Record<string, string>,
): string | null {
  if (entry.kind === "card") {
    return null;
  }
  return rarityLabels[entry.rarity] ?? entry.rarity;
}

function finishLabelFor(
  entry: ListEntryDetailResponse,
  finishLabels: Record<string, string>,
): string | null {
  if (entry.kind === "card") {
    return null;
  }
  return finishLabels[entry.finish] ?? entry.finish;
}

interface SharedListEntryRowProps {
  entry: ListEntryDetailResponse;
  cardSlug: string | undefined;
  setName: string | null;
  rarityLabel: string | null;
  finishLabel: string | null;
}

function SharedListEntryRow({
  entry,
  cardSlug,
  setName,
  rarityLabel,
  finishLabel,
}: SharedListEntryRowProps) {
  const cardId = entry.kind === "card" ? entry.cardId : undefined;
  const imageId = entry.kind === "card" ? null : entry.imageId;
  const metaParts = [setName, rarityLabel, finishLabel].filter(
    (part): part is string => part !== null,
  );
  const meta = metaParts.length > 0 ? metaParts.join(" · ") : null;

  const tile = (
    <div className="bg-card hover:bg-muted hover:text-foreground flex items-center gap-3 rounded-md border p-2 transition-colors">
      <div className="bg-muted relative aspect-[5/7] w-12 shrink-0 overflow-hidden rounded">
        {imageId ? (
          <img
            src={imageUrl(imageId, "120w")}
            alt={entry.cardName}
            className="size-full object-cover"
            loading="lazy"
          />
        ) : null}
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="truncate font-medium">{entry.cardName}</span>
        {meta ? <span className="text-muted-foreground text-xs">{meta}</span> : null}
        {entry.quantity > 1 ? (
          <span className="text-muted-foreground text-xs">×{entry.quantity}</span>
        ) : null}
      </div>
    </div>
  );

  // Card-kind entries don't carry a printingId, so we link to the card by its
  // slug from the catalog. If we couldn't resolve a slug, render as text.
  if (cardSlug && cardId) {
    return (
      <Link to="/cards/$cardSlug" params={{ cardSlug }} className="block">
        {tile}
      </Link>
    );
  }
  return tile;
}
