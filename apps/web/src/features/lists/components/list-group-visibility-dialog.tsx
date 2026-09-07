import type { ListIntent } from "@openrift/shared/types/api/list";
import { Suspense, useState } from "react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  useFriendGroups,
  useShareListWithFriendGroup,
  useUnshareListFromFriendGroup,
} from "@/features/groups/hooks/use-friend-groups";
import { useListGroupShares } from "@/features/lists/hooks/use-list-group-shares";

interface Props {
  listId: string;
  intent: ListIntent;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onManagePublicLink: () => void;
}

export function ListGroupVisibilityDialog({
  listId,
  intent,
  open,
  onOpenChange,
  onManagePublicLink,
}: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Group visibility</DialogTitle>
          <DialogDescription>
            {intent === "organize"
              ? "Choose which of your friend groups can see this list while signed in."
              : "Choose which of your friend groups can see this list and find trades with you."}
          </DialogDescription>
        </DialogHeader>

        <Suspense fallback={null}>
          <GroupVisibilityControl listId={listId} />
        </Suspense>

        <p className="text-muted-foreground border-t pt-4 text-sm">
          Want anyone with a link to see it?{" "}
          <Button variant="link" className="h-auto p-0" onClick={onManagePublicLink}>
            Share a public link
          </Button>
        </p>
      </DialogContent>
    </Dialog>
  );
}

type GroupVisibilityMode = "all" | "selected" | "none";

const VISIBILITY_OPTIONS: { value: GroupVisibilityMode; label: string }[] = [
  { value: "all", label: "All my groups" },
  { value: "selected", label: "Some groups" },
  { value: "none", label: "Only me" },
];

function GroupVisibilityControl({ listId }: { listId: string }) {
  const { data: groups } = useFriendGroups();
  const { data: sharedWith } = useListGroupShares(listId);
  const share = useShareListWithFriendGroup();
  const unshare = useUnshareListFromFriendGroup();
  // Sticky while interacting: picking "Some groups" must not bounce back to a
  // derived "all"/"none" when the checkboxes momentarily match those states.
  const [modeOverride, setModeOverride] = useState<GroupVisibilityMode | null>(null);

  if (groups.items.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">
        You&apos;re not in any friend groups yet. Join or create one to share lists with its
        members.
      </p>
    );
  }

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
    <div className="space-y-3">
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
    </div>
  );
}
