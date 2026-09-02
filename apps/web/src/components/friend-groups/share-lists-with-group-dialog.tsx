import { Link } from "@tanstack/react-router";
import { HandshakeIcon, HeartIcon } from "lucide-react";
import { Suspense, useState } from "react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { DialogForm } from "@/components/ui/dialog-form";
import {
  useFriendGroupShareableLists,
  useShareListWithFriendGroup,
} from "@/hooks/use-friend-groups";

/**
 * One-time prompt shown right after a member joins a group (accepts an invite),
 * the deliberate point of consent that replaces the old share-by-default. Lists
 * the member's wish/trade lists pre-selected so a single click shares them, but
 * sharing only happens when they confirm — skipping shares nothing.
 * @returns The dialog node.
 */
export function ShareListsWithGroupDialog({
  slug,
  groupName,
  open,
  onOpenChange,
  cancelLabel = "Skip for now",
  preselectAll = true,
}: {
  slug: string;
  groupName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Footer dismiss label. Defaults to the join-flow "Skip for now". */
  cancelLabel?: string;
  /**
   * Whether to start with every candidate checked. True for the join flow's
   * one-click "share them all"; false for a deliberate "Share more", where the
   * member wants to pick what to add.
   */
  preselectAll?: boolean;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Share lists with {groupName}?</DialogTitle>
          <DialogDescription>
            Members can see every card on the lists you pick. You can change this anytime.
          </DialogDescription>
        </DialogHeader>
        <Suspense
          fallback={<div className="text-muted-foreground py-4 text-sm">Loading your lists…</div>}
        >
          <ShareListsBody
            slug={slug}
            onOpenChange={onOpenChange}
            cancelLabel={cancelLabel}
            preselectAll={preselectAll}
          />
        </Suspense>
      </DialogContent>
    </Dialog>
  );
}

function ShareListsBody({
  slug,
  onOpenChange,
  cancelLabel,
  preselectAll,
}: {
  slug: string;
  onOpenChange: (open: boolean) => void;
  cancelLabel: string;
  preselectAll: boolean;
}) {
  const { data } = useFriendGroupShareableLists(slug);
  const share = useShareListWithFriendGroup();

  const tradableLists = data.items.filter(
    (item) => item.listIntent === "wish" || item.listIntent === "trade",
  );
  const candidates = tradableLists.filter((item) => item.sharedAt === null);

  // The join flow pre-checks everything for a one-click "share them all"; a
  // deliberate "Share more" starts empty so the member picks what to add.
  const [selectedIds, setSelectedIds] = useState<Set<string>>(
    () => new Set(preselectAll ? candidates.map((item) => item.listId) : []),
  );

  if (candidates.length === 0) {
    return (
      <>
        <p className="text-muted-foreground">
          {tradableLists.length === 0 ? (
            <>
              You don&apos;t have a wishlist or tradelist to share yet.{" "}
              <Link to="/collections" className="text-foreground underline underline-offset-4">
                Create one
              </Link>{" "}
              and you can share it with this group from its manage page.
            </>
          ) : (
            "You've already shared all your wishlists and tradelists with this group."
          )}
        </p>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </>
    );
  }

  const handleShare = async () => {
    const toShare = candidates.filter((item) => selectedIds.has(item.listId));
    await Promise.allSettled(
      toShare.map((item) => share.mutateAsync({ slug, listId: item.listId })),
    );
    onOpenChange(false);
  };

  return (
    <DialogForm onSubmit={() => void handleShare()}>
      <ul className="flex flex-col gap-2">
        {candidates.map((item) => {
          const checkboxId = `share-list-${item.listId}`;
          const isSelected = selectedIds.has(item.listId);
          return (
            <li key={item.listId} className="flex items-center gap-3">
              <Checkbox
                id={checkboxId}
                checked={isSelected}
                disabled={share.isPending}
                onCheckedChange={(checked) => {
                  setSelectedIds((prev) => {
                    const next = new Set(prev);
                    if (checked === false) {
                      next.delete(item.listId);
                    } else {
                      next.add(item.listId);
                    }
                    return next;
                  });
                }}
              />
              <label
                htmlFor={checkboxId}
                className="flex min-w-0 flex-1 cursor-pointer items-center gap-2"
              >
                {item.listIntent === "wish" ? (
                  <HeartIcon className="text-muted-foreground size-4 shrink-0" />
                ) : (
                  <HandshakeIcon className="text-muted-foreground size-4 shrink-0" />
                )}
                <span className="truncate font-medium">{item.listName}</span>
                <span className="text-muted-foreground shrink-0 text-xs">
                  {item.entryCount} {item.entryCount === 1 ? "card" : "cards"}
                </span>
              </label>
            </li>
          );
        })}
      </ul>
      <DialogFooter>
        <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={share.isPending}>
          {cancelLabel}
        </Button>
        <Button type="submit" disabled={share.isPending || selectedIds.size === 0}>
          {selectedIds.size === 1 ? "Share 1 list" : `Share ${selectedIds.size} lists`}
        </Button>
      </DialogFooter>
    </DialogForm>
  );
}
