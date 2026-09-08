import { SwordsIcon, UserMinusIcon } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { IconChip } from "@/components/ui/icon-chip";
import { UserAvatar } from "@/components/user-avatar";

import { Vignette } from "./vignette-parts";

const PAIRINGS = [
  {
    label: "Match 1",
    status: "Reported",
    sides: [
      { name: "Alice", score: "2", points: "+3" },
      { name: "Mira", score: "1", points: "+0" },
    ],
  },
  {
    label: "Match 2",
    status: "1 of 2 in",
    sides: [
      { name: "Nour", score: "2", points: null },
      { name: "Ravi", score: null, points: null },
    ],
  },
] as const;

export function TournamentsVignette() {
  return (
    <Vignette>
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-heading font-medium">Round 3</span>
        <Badge variant="warning">Reporting</Badge>
        <span className="text-muted-foreground text-sm">2 matches · 1 bye</span>
      </div>
      <div className="flex flex-col gap-3">
        {PAIRINGS.map((pairing) => (
          <Card key={pairing.label} className="gap-3 p-4">
            <div className="flex items-center gap-2">
              <IconChip
                icon={SwordsIcon}
                tone={pairing.status === "Reported" ? "success" : "neutral"}
                size="sm"
                shape="round"
              />
              <span className="font-heading font-medium">{pairing.label}</span>
              <span className="ml-auto">
                <Badge variant={pairing.status === "Reported" ? "success" : "warning"}>
                  {pairing.status}
                </Badge>
              </span>
            </div>
            <ul className="flex flex-col gap-1.5 text-sm">
              {pairing.sides.map((side) => (
                <li key={side.name} className="flex items-center justify-between gap-2">
                  <span className="flex min-w-0 items-center gap-2">
                    {side.score && (
                      <Badge variant="secondary" className="shrink-0 tabular-nums">
                        {side.score}
                      </Badge>
                    )}
                    <UserAvatar name={side.name} size="sm" />
                    <span className="truncate font-medium">{side.name}</span>
                  </span>
                  {side.points && (
                    <span className="shrink-0 font-semibold tabular-nums">{side.points}</span>
                  )}
                </li>
              ))}
            </ul>
          </Card>
        ))}
      </div>
      <div className="flex flex-col gap-2">
        <span className="text-muted-foreground flex items-center gap-1.5 text-sm font-medium">
          <UserMinusIcon className="size-4" aria-hidden="true" />
          Byes
        </span>
        <div className="flex items-center justify-between gap-2 text-sm">
          <span className="flex min-w-0 items-center gap-2">
            <UserAvatar name="Sina" size="sm" />
            <span className="truncate font-medium">Sina</span>
          </span>
          <span className="font-semibold tabular-nums">+3 bye</span>
        </div>
      </div>
    </Vignette>
  );
}
