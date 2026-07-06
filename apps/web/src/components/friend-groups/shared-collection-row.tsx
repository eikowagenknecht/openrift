import type { FriendGroupCollectionShareResponse } from "@openrift/shared";
import { Link } from "@tanstack/react-router";
import { BookOpenIcon } from "lucide-react";
import type { ReactNode } from "react";

import { Card } from "@/components/ui/card";

/**
 * Shared styling for a collection card row. Apply to the row's `<Card>` (nested
 * inside a `<Link className="block">`) so every collection row (member shares
 * and the group's own pool) looks identical.
 */
export const COLLECTION_ROW_CLASS =
  "hover:bg-muted flex-row items-center gap-3 p-2 transition-colors";

/**
 * The inner content of a collection card row: book icon, name, and a muted
 * subtitle. Wrap it in a `<Link className="block"><Card className={COLLECTION_ROW_CLASS}>`
 * pointing at whichever collection view the caller needs.
 * @returns The row's icon + text content.
 */
export function CollectionRowContent({ name, subtitle }: { name: string; subtitle: ReactNode }) {
  return (
    <>
      <BookOpenIcon className="text-muted-foreground size-5 shrink-0" />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="truncate font-medium">{name}</span>
        <span className="text-muted-foreground text-xs">{subtitle}</span>
      </div>
    </>
  );
}

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
      className="block"
    >
      <Card className={COLLECTION_ROW_CLASS}>
        <CollectionRowContent
          name={share.collectionName}
          subtitle={`Collection · ${share.copyCount} ${noun}`}
        />
      </Card>
    </Link>
  );
}
