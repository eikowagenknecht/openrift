import type { ListIntent } from "@openrift/shared/types/api/list";
import { useState } from "react";

import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  useShareListWithFriendGroup,
  useUnshareListFromFriendGroup,
} from "@/features/groups/hooks/use-friend-group-sharing";
import { useFriendGroups } from "@/features/groups/hooks/use-friend-groups";
import { useListGroupShares } from "@/features/lists/hooks/use-list-group-shares";

type GroupVisibilityMode = "all" | "selected" | "none";

const VISIBILITY_OPTIONS: { value: GroupVisibilityMode; label: string }[] = [
  { value: "all", label: "All my groups" },
  { value: "selected", label: "Some groups" },
  { value: "none", label: "Only me" },
];

export function ListGroupShareSection({ listId, intent }: { listId: string; intent: ListIntent }) {
  const { data: groups } = useFriendGroups();
  const { data: sharedWith } = useListGroupShares(listId);
  const share = useShareListWithFriendGroup();
  const unshare = useUnshareListFromFriendGroup();
  // Sticky while interacting: picking "Some groups" must not bounce back to a
  // derived "all"/"none" when the checkboxes momentarily match those states.
  const [modeOverride, setModeOverride] = useState<GroupVisibilityMode | null>(null);

  const sharedSet = new Set(sharedWith.items.map((row) => row.groupId));
  const derivedMode: GroupVisibilityMode =
    sharedSet.size === 0 ? "none" : sharedSet.size >= groups.items.length ? "all" : "selected";
  const mode = modeOverride ?? derivedMode;
  const pending = share.isPending || unshare.isPending;

  const applyMode = (next: GroupVisibilityMode) => {
    setModeOverride(next);
    if (next === "all") {
      for (const group of groups.items) {
        if (!sharedSet.has(group.id)) {
          share.mutate({ slug: group.slug, listId });
        }
      }
    } else if (next === "none") {
      for (const group of groups.items) {
        if (sharedSet.has(group.id)) {
          unshare.mutate({ slug: group.slug, listId });
        }
      }
    }
  };

  return (
    <div className="space-y-3 border-t pt-4">
      <div>
        <h3 className="font-medium">Group visibility</h3>
        <p className="text-muted-foreground text-sm">
          {intent === "organize"
            ? "Choose which of your friend groups can see this list while signed in."
            : "Choose which of your friend groups can see this list and find trades with you."}
        </p>
      </div>
      {groups.items.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          You&apos;re not in any friend groups yet. Join or create one to share lists with its
          members.
        </p>
      ) : (
        <>
          <RadioGroup
            value={mode}
            onValueChange={(next) => applyMode(next as GroupVisibilityMode)}
            className="flex flex-col gap-2"
          >
            {VISIBILITY_OPTIONS.map((option) => {
              const radioId = `list-group-visibility-${option.value}`;
              return (
                <div key={option.value} className="flex items-center gap-2">
                  <RadioGroupItem id={radioId} value={option.value} disabled={pending} />
                  <label htmlFor={radioId} className="cursor-pointer text-sm">
                    {option.label}
                  </label>
                </div>
              );
            })}
          </RadioGroup>
          {mode === "selected" ? (
            <ul className="space-y-2 border-s ps-4">
              {groups.items.map((group) => {
                const isShared = sharedSet.has(group.id);
                const checkboxId = `share-list-group-${group.id}`;
                return (
                  <li key={group.id} className="flex items-center gap-2">
                    <Checkbox
                      id={checkboxId}
                      checked={isShared}
                      disabled={pending}
                      onCheckedChange={(checked) => {
                        if (checked === true) {
                          share.mutate({ slug: group.slug, listId });
                        } else if (checked === false) {
                          unshare.mutate({ slug: group.slug, listId });
                        }
                      }}
                    />
                    <label htmlFor={checkboxId} className="cursor-pointer text-sm">
                      {group.name}
                    </label>
                  </li>
                );
              })}
            </ul>
          ) : null}
        </>
      )}
    </div>
  );
}
