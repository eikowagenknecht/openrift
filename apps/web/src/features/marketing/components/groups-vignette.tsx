import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { UserAvatar } from "@/components/user-avatar";
import { cn } from "@/lib/utils";

import { ArtStrip, Vignette, VignetteHeading } from "./vignette-parts";

const GROUP_CARDS = [
  {
    name: "Thursday store crew",
    members: ["Alice", "Mira", "Nour", "Ravi"],
    extraMembers: 4,
    waiting: "2 trade requests",
    canGet: 9,
    canGetExtra: 5,
    theydWant: 5,
    theydWantExtra: 3,
    volume: "12 cards traded in the last 30 days",
    active: true,
  },
  {
    name: "Bothfeld Rift Club",
    members: ["Sina", "Jonas"],
    extraMembers: 1,
    waiting: null,
    canGet: 3,
    canGetExtra: 1,
    theydWant: null,
    theydWantExtra: 0,
    volume: "No trades in the last 30 days",
    active: false,
  },
] as const;

export function GroupsVignette({ thumbnailUrls }: { thumbnailUrls: string[] }) {
  return (
    <Vignette>
      <VignetteHeading>Your groups</VignetteHeading>
      <div className="flex flex-col gap-3">
        {GROUP_CARDS.map((group, index) => (
          <Card key={group.name} className="gap-2.5 p-4">
            <div className="flex min-w-0 items-center gap-2">
              <span className="min-w-0 flex-1 truncate font-medium">{group.name}</span>
              <span className="flex shrink-0 items-center -space-x-1">
                {group.members.map((member) => (
                  <UserAvatar
                    key={member}
                    name={member}
                    size="sm"
                    className="bg-card ring-card ring-2"
                  />
                ))}
                <span className="text-muted-foreground pl-3 text-xs tabular-nums">
                  +{group.extraMembers}
                </span>
              </span>
            </div>
            {group.waiting && <Badge className="self-start">{group.waiting}</Badge>}
            <div className="flex min-w-0 items-center gap-2.5">
              <ArtStrip
                urls={thumbnailUrls.slice(index * 3, index * 3 + 3)}
                extra={group.canGetExtra}
              />
              <span className="text-muted-foreground min-w-0 truncate text-sm">
                <span className="text-success font-medium">{group.canGet}</span> you could get
              </span>
            </div>
            {group.theydWant !== null && (
              <div className="flex min-w-0 items-center gap-2.5">
                <ArtStrip urls={thumbnailUrls.slice(6, 8)} extra={group.theydWantExtra} />
                <span className="text-muted-foreground min-w-0 truncate text-sm">
                  <span className="text-success font-medium">{group.theydWant}</span> they&apos;d
                  want
                </span>
              </div>
            )}
            <p className="text-muted-foreground flex items-center gap-1.5 pt-0.5 text-sm">
              <span
                aria-hidden="true"
                className={cn(
                  "size-1.5 rounded-full",
                  group.active ? "bg-success" : "bg-muted-foreground/50",
                )}
              />
              {group.volume}
            </p>
          </Card>
        ))}
      </div>
    </Vignette>
  );
}
