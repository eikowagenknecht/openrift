import type { FriendGroupRole, FriendGroupShareResponse } from "@openrift/shared";
import { Link } from "@tanstack/react-router";
import { ChevronLeftIcon } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useFriendGroupMemberDetail } from "@/hooks/use-friend-groups";
import { cn, PAGE_PADDING } from "@/lib/utils";

import { MatchRowGroup } from "./match-row-card";

interface MemberDetailPageProps {
  slug: string;
  userId: string;
}

const INTENT_LABEL: Record<"buy" | "sell" | "organize", string> = {
  buy: "Buy list",
  sell: "Sell list",
  organize: "Organize list",
};

const ROLE_LABEL: Record<FriendGroupRole, string> = {
  owner: "Owner",
  admin: "Admin",
  member: "Member",
};

export function MemberDetailPage({ slug, userId }: MemberDetailPageProps) {
  const { data } = useFriendGroupMemberDetail(slug, userId);
  const { member } = data;

  const sharesByIntent: Record<"buy" | "sell" | "organize", FriendGroupShareResponse[]> = {
    buy: [],
    sell: [],
    organize: [],
  };
  for (const share of data.shares) {
    const intent = share.listIntent as "buy" | "sell" | "organize";
    sharesByIntent[intent].push(share);
  }

  return (
    <div className={cn("mx-auto flex w-full max-w-4xl flex-col gap-6", PAGE_PADDING)}>
      <Link
        to="/groups/$slug"
        params={{ slug }}
        className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-sm"
      >
        <ChevronLeftIcon className="size-4" />
        Back to group
      </Link>

      <header className="flex items-center gap-4">
        {member.userImage ? (
          <img src={member.userImage} alt="" className="size-14 rounded-full" />
        ) : (
          <div className="bg-muted size-14 rounded-full" />
        )}
        <div className="flex flex-col gap-0.5">
          <h1 className="text-2xl font-semibold">{member.userName ?? "Unknown user"}</h1>
          {member.nickname ? <p className="text-muted-foreground">{member.nickname}</p> : null}
          <Badge variant="outline" className="w-fit text-xs">
            {ROLE_LABEL[member.role]}
          </Badge>
        </div>
      </header>

      {data.matches.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="text-muted-foreground text-sm font-medium tracking-wide uppercase">
            They have what you want
          </h2>
          <MatchRowGroup rows={data.matches} groupSlug={slug} />
        </section>
      )}

      {data.reverseMatches.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="text-muted-foreground text-sm font-medium tracking-wide uppercase">
            They want what you have
          </h2>
          <MatchRowGroup rows={data.reverseMatches} groupSlug={slug} />
        </section>
      )}

      <section className="flex flex-col gap-3">
        <h2 className="text-muted-foreground text-sm font-medium tracking-wide uppercase">
          Their shared lists
        </h2>
        {data.shares.length === 0 ? (
          <p className="text-muted-foreground">
            {member.userName ?? "This member"} hasn&apos;t shared any lists with this group yet.
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {(["buy", "sell", "organize"] as const).map((intent) => {
              const items = sharesByIntent[intent];
              if (items.length === 0) {
                return null;
              }
              return (
                <Card key={intent}>
                  <CardHeader>
                    <CardTitle className="text-base">{INTENT_LABEL[intent]}</CardTitle>
                    <CardDescription>
                      {items.length} list{items.length === 1 ? "" : "s"}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="flex flex-col gap-2">
                    {items.map((share) => (
                      <Link
                        key={share.listId}
                        to="/groups/$slug/lists/$listId"
                        params={{ slug, listId: share.listId }}
                        className="hover:bg-muted hover:text-foreground -mx-2 rounded px-2 py-1 text-sm transition-colors"
                      >
                        {share.listName}
                      </Link>
                    ))}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
