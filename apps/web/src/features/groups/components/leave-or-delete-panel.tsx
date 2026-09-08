import type { FriendGroupDetailResponse } from "@openrift/shared/types/api/friend-group";
import { useNavigate } from "@tanstack/react-router";
import { Trash2Icon } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { DialogForm } from "@/components/ui/dialog-form";
import { TransferOwnershipControl } from "@/features/groups/components/transfer-ownership-control";
import {
  useDeleteFriendGroup,
  useLeaveFriendGroup,
} from "@/features/groups/hooks/use-friend-group-mutations";

export function LeaveOrDeletePanel({
  data,
  slug,
}: {
  data: FriendGroupDetailResponse;
  slug: string;
}) {
  const navigate = useNavigate();
  const leave = useLeaveFriendGroup();
  const remove = useDeleteFriendGroup();
  const isOwner = data.viewerRole === "owner";
  const [confirmOpen, setConfirmOpen] = useState(false);

  async function handleDelete() {
    try {
      await remove.mutateAsync(slug);
      void navigate({ to: "/groups" });
    } catch {
      /* Reported by the global mutation error toast. */
    }
  }

  async function handleLeave() {
    try {
      await leave.mutateAsync(slug);
      void navigate({ to: "/groups" });
    } catch {
      /* Reported by the global mutation error toast. */
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Membership</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {isOwner ? (
          <>
            <TransferOwnershipControl data={data} slug={slug} />
            <p className="text-muted-foreground text-sm">
              As the owner you can&apos;t leave the group yourself, transfer ownership first.
              Deleting it removes the group for everyone.
            </p>
            <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
              <DialogTrigger render={<Button variant="destructive" />}>
                <Trash2Icon className="size-4" />
                Delete group
              </DialogTrigger>
              <DialogContent>
                <DialogForm onSubmit={() => void handleDelete()}>
                  <DialogHeader>
                    <DialogTitle>Delete this group?</DialogTitle>
                    <DialogDescription>
                      The group, its members, invites, and list-shares will be permanently removed.
                      Lists themselves stay; only their share with this group goes.
                    </DialogDescription>
                  </DialogHeader>
                  <DialogFooter>
                    <Button variant="ghost" onClick={() => setConfirmOpen(false)}>
                      Cancel
                    </Button>
                    <Button type="submit" variant="destructive" disabled={remove.isPending}>
                      Delete
                    </Button>
                  </DialogFooter>
                </DialogForm>
              </DialogContent>
            </Dialog>
          </>
        ) : (
          <Button variant="ghost" onClick={() => void handleLeave()} disabled={leave.isPending}>
            Leave group
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
