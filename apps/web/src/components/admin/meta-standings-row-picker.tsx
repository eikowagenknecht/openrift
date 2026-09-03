import { useQuery } from "@tanstack/react-query";
import { LinkIcon } from "lucide-react";
import { useState } from "react";

import { rankLabel } from "@/components/admin/meta-review-shared";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CommandEmpty } from "@/components/ui/command";
import { PickerList, PickerRow } from "@/components/ui/picker-list";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Skeleton } from "@/components/ui/skeleton";
import { adminMetaEventPlayersQueryOptions } from "@/hooks/use-admin-meta";

/** The whole event's standings, searchable. `currentPlayerId`'s row is listed but not pickable. */
function StandingsRows({
  metaEventId,
  currentPlayerId,
  onPick,
}: {
  metaEventId: string;
  currentPlayerId: string | null;
  onPick: (metaEventPlayerId: string, playerName: string) => void;
}) {
  const { data, isPending } = useQuery(adminMetaEventPlayersQueryOptions(metaEventId));
  const [highlightedId, setHighlightedId] = useState("");

  if (isPending) {
    return <Skeleton className="m-2 h-32" />;
  }

  return (
    <PickerList
      searchPlaceholder="Search the standings…"
      highlightedId={highlightedId}
      onHighlightChange={setHighlightedId}
    >
      <CommandEmpty>No standings row matches.</CommandEmpty>
      {(data?.players ?? []).map((player) => {
        const rank = rankLabel(player.rank, player.rankIsTier);
        const linked = player.id === currentPlayerId;
        return (
          <PickerRow
            key={player.id}
            value={player.id}
            keywords={[player.playerName, rank, `#${rank}`]}
            onSelect={
              linked
                ? undefined
                : () => {
                    onPick(player.id, player.playerName);
                  }
            }
          >
            <span className="text-muted-foreground w-8 shrink-0 tabular-nums">{rank}</span>
            <span className="min-w-0 flex-1 truncate">{player.playerName}</span>
            {linked ? (
              <Badge>linked</Badge>
            ) : (
              player.deckId !== null && <Badge variant="outline">deck</Badge>
            )}
          </PickerRow>
        );
      })}
    </PickerList>
  );
}

/** The trigger for {@link StandingsRows}. Its query only fires once opened. */
export function MetaStandingsRowPicker({
  metaEventId,
  currentPlayerId,
  disabled,
  onPick,
}: {
  metaEventId: string;
  currentPlayerId: string | null;
  disabled?: boolean;
  onPick: (metaEventPlayerId: string, playerName: string) => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button variant="outline" size="sm" disabled={disabled}>
            <LinkIcon />
            {currentPlayerId === null ? "Pick a standings row" : "Pick another row"}
          </Button>
        }
      />
      <PopoverContent align="start" className="w-80 p-0">
        <StandingsRows
          metaEventId={metaEventId}
          currentPlayerId={currentPlayerId}
          onPick={(metaEventPlayerId, playerName) => {
            setOpen(false);
            onPick(metaEventPlayerId, playerName);
          }}
        />
      </PopoverContent>
    </Popover>
  );
}
