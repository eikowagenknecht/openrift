import type { FriendGroupCollectionShareResponse } from "@openrift/shared";
import { Link } from "@tanstack/react-router";
import { BookOpenIcon } from "lucide-react";

/**
 * One wide row for a collection shared with the group: icon, name (links to the
 * in-group collection view), and copy count. Mirrors {@link SharedListRow} so a
 * member's collections and lists render uniformly on the Shared and
 * member-detail pages.
 * @returns The shared-collection row element.
 */
export function SharedCollectionRow({
  slug,
  share,
}: {
  slug: string;
  share: FriendGroupCollectionShareResponse;
}) {
  const noun = share.copyCount === 1 ? "Copy" : "Copies";
  return (
    <Link
      to="/groups/$slug/collections/$collectionId"
      params={{ slug, collectionId: share.collectionId }}
      search={(prev) => prev}
      className="bg-card hover:bg-muted flex items-center gap-3 rounded-md border p-2 transition-colors"
    >
      <BookOpenIcon className="text-muted-foreground size-5 shrink-0" />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="truncate font-medium">{share.collectionName}</span>
        <span className="text-muted-foreground text-xs">
          Collection · {share.copyCount} {noun}
        </span>
      </div>
    </Link>
  );
}
