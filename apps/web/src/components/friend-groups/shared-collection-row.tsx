import type { FriendGroupCollectionShareResponse } from "@openrift/shared/types/api/friend-group";
import { Link } from "@tanstack/react-router";
import { FolderIcon } from "lucide-react";

import { CardArtThumbStack } from "@/components/cards/card-art-thumb-stack";
import { IconChip } from "@/components/ui/icon-chip";

export function SharedCollectionRow({
  slug,
  share,
}: {
  slug: string;
  share: FriendGroupCollectionShareResponse;
}) {
  const noun = share.copyCount === 1 ? "copy" : "copies";
  return (
    <Link
      to="/groups/$slug/collections/$collectionId"
      params={{ slug, collectionId: share.collectionId }}
      search={(prev) => prev}
      className="hover:bg-muted/50 focus-visible:ring-ring/50 flex items-center gap-2.5 rounded-md px-2 py-2 outline-none focus-visible:ring-2"
    >
      <IconChip icon={FolderIcon} tone="info" size="sm" shape="round" />
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-sm font-medium">{share.collectionName}</span>
        <span className="text-muted-foreground truncate text-xs">
          {share.copyCount} {noun}
        </span>
      </span>
      {share.coverPrintings.length > 0 ? (
        <CardArtThumbStack
          items={share.coverPrintings.map((cover) => ({
            key: cover.printingId,
            imageId: cover.imageId,
          }))}
          max={3}
          className="shrink-0"
          thumbClassName="ring-card w-7"
        />
      ) : null}
    </Link>
  );
}
