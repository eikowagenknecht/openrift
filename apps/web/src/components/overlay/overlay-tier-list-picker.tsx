import type { TierRow } from "@openrift/shared";
import type { QueryClient } from "@tanstack/react-query";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { LayoutListIcon, Loader2Icon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { CommandEmpty } from "@/components/ui/command";
import { PickerList, PickerRow } from "@/components/ui/picker-list";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { tierListQueryOptions, tierListsQueryOptions } from "@/hooks/use-tier-lists";
import { useRequiredUserId } from "@/lib/auth-session";

/** A tier list loaded in full, ready to push to the overlay. */
export interface PickedTierList {
  id: string;
  title: string;
  tiers: TierRow[];
}

/**
 * Loads one list's board, tolerating a failure by reporting it and picking
 * nothing. Lives outside the component so the awaited call and its error branch
 * stay out of a compiled render body.
 *
 * @returns The list, or undefined when the fetch failed.
 */
async function loadTierList(
  queryClient: QueryClient,
  userId: string,
  id: string,
): Promise<PickedTierList | undefined> {
  try {
    const detail = await queryClient.ensureQueryData(tierListQueryOptions(userId, id));
    return { id: detail.id, title: detail.title, tiers: detail.tiers };
  } catch {
    toast.error("Couldn't load that tier list.");
    return undefined;
  }
}

/**
 * Picks which of the creator's tier lists to put on stream.
 *
 * The index is fetched only once the popover opens, and the board itself only
 * once a list is picked — the dashboard is opened to push cards far more often
 * than to push a ranking, and neither should cost a request until it is asked
 * for.
 *
 * @returns The picker button and its popover.
 */
export function OverlayTierListPicker({
  selected,
  onPick,
}: {
  /** The list already picked, named on the trigger. */
  selected: PickedTierList | null;
  onPick: (list: PickedTierList) => void;
}) {
  const userId = useRequiredUserId();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [highlightedId, setHighlightedId] = useState("");

  const lists = useQuery({ ...tierListsQueryOptions(userId), enabled: open });

  const pick = async (id: string) => {
    setBusyId(id);
    const list = await loadTierList(queryClient, userId, id);
    setBusyId(null);
    if (list) {
      onPick(list);
      setOpen(false);
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button variant="outline" size="sm" className="min-w-0">
            <LayoutListIcon className="size-4" />
            <span className="truncate">{selected?.title ?? "Pick a tier list"}</span>
          </Button>
        }
      />
      <PopoverContent align="start" className="w-80 p-0">
        <PickerList
          searchPlaceholder="Search your tier lists…"
          highlightedId={highlightedId}
          onHighlightChange={setHighlightedId}
        >
          <CommandEmpty>
            {lists.isPending ? "Loading tier lists…" : "No tier lists yet."}
          </CommandEmpty>
          {(lists.data ?? []).map((list) => (
            <PickerRow
              key={list.id}
              value={list.id}
              keywords={[list.title]}
              onSelect={() => void pick(list.id)}
            >
              <span className="min-w-0 flex-1 truncate">{list.title}</span>
              {busyId === list.id ? (
                <Loader2Icon className="text-muted-foreground size-4 animate-spin" />
              ) : (
                <span className="text-muted-foreground shrink-0 text-sm">
                  {list.cardCount} {list.cardCount === 1 ? "card" : "cards"}
                </span>
              )}
            </PickerRow>
          ))}
        </PickerList>
      </PopoverContent>
    </Popover>
  );
}
