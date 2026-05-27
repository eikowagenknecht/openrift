import type { ListIntent, ListKind, PublicUserBundleListResponse } from "@openrift/shared";
import { Link, createLazyFileRoute } from "@tanstack/react-router";
import { FolderIcon, HandshakeIcon, HeartIcon } from "lucide-react";
import type { ComponentType, SVGProps } from "react";

import { listKindIcon } from "@/components/list/create-list-dialog";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { UserAvatar } from "@/components/user-avatar";
import { usePublicUserBundle } from "@/hooks/use-user-share";
import { CONTAINER_WIDTH, PAGE_PADDING } from "@/lib/utils";

export const Route = createLazyFileRoute("/_app/users_/share/$token")({
  component: SharedUserBundlePage,
});

const INTENT_LABEL: Record<ListIntent, string> = {
  wish: "Wishlist",
  trade: "Tradelist",
  organize: "Organize",
};

const INTENT_ICON: Record<ListIntent, ComponentType<SVGProps<SVGSVGElement>>> = {
  wish: HeartIcon,
  trade: HandshakeIcon,
  organize: FolderIcon,
};

const KIND_NOUN: Record<ListKind, { singular: string; plural: string }> = {
  card: { singular: "Card", plural: "Cards" },
  printing: { singular: "Printing", plural: "Printings" },
  copy: { singular: "Copy", plural: "Copies" },
};

function SharedUserBundlePage() {
  const { token } = Route.useParams();
  const { data } = usePublicUserBundle(token);
  const { owner, lists } = data;

  return (
    <div className={`${PAGE_PADDING} ${CONTAINER_WIDTH} flex flex-col gap-6 py-4`}>
      <header className="flex items-center gap-3">
        <UserAvatar
          name={owner.displayName}
          gravatarHash={owner.gravatarHash}
          size="lg"
          className="size-12"
        />
        <div className="flex flex-col">
          <h1 className="text-xl font-semibold">{owner.displayName}&rsquo;s lists</h1>
          <p className="text-muted-foreground text-sm">Wishlist &amp; tradelist</p>
        </div>
      </header>

      {lists.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <HeartIcon />
            </EmptyMedia>
            <EmptyTitle>Nothing shared yet</EmptyTitle>
            <EmptyDescription>
              This person hasn&apos;t added any wishlist or tradelist items yet. Check back later.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {lists.map((list) => (
            <BundleListCard key={list.id} token={token} list={list} />
          ))}
        </div>
      )}
    </div>
  );
}

function BundleListCard({ token, list }: { token: string; list: PublicUserBundleListResponse }) {
  const IntentIcon = INTENT_ICON[list.intent];
  const KindIcon = listKindIcon(list.kind);
  const kindNoun =
    list.entryCount === 1 ? KIND_NOUN[list.kind].singular : KIND_NOUN[list.kind].plural;
  return (
    <Link
      to="/users/share/$token/lists/$listId"
      params={{ token, listId: list.id }}
      className="hover:bg-accent/40 focus-visible:ring-ring/50 rounded-lg transition-colors outline-none focus-visible:ring-2"
    >
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between gap-2 text-base">
            <span className="truncate">{list.name}</span>
            <Badge variant="outline" className="text-2xs gap-1">
              <IntentIcon className="size-3" />
              {INTENT_LABEL[list.intent]}
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Badge variant="outline" className="text-2xs gap-1">
            <KindIcon className="size-3" />
            {list.entryCount} {kindNoun}
          </Badge>
        </CardContent>
      </Card>
    </Link>
  );
}
