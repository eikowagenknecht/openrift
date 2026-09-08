import type { FriendGroupDetailResponse } from "@openrift/shared/types/api/friend-group";
import { CrownIcon } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
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
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { useTransferFriendGroupOwnership } from "@/features/groups/hooks/use-friend-group-mutations";
import { useRequiredUserId } from "@/lib/auth-session";

export function TransferOwnershipControl({
  data,
  slug,
}: {
  data: FriendGroupDetailResponse;
  slug: string;
}) {
  const viewerId = useRequiredUserId();
  const transfer = useTransferFriendGroupOwnership();
  const [targetId, setTargetId] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const candidates = data.members.filter((member) => member.userId !== viewerId);
  if (candidates.length === 0) {
    return null;
  }
  const items = candidates.map((member) => ({
    value: member.userId,
    label: member.userName ?? "Unknown user",
  }));
  const target = candidates.find((member) => member.userId === targetId);

  async function handleTransfer() {
    if (!target) {
      return;
    }
    try {
      await transfer.mutateAsync({ slug, userId: target.userId });
      setConfirmOpen(false);
    } catch {
      /* Reported by the global mutation error toast. */
    }
  }

  return (
    <>
      <div className="flex flex-col gap-2">
        <Label className="flex items-center gap-2">
          <CrownIcon className="size-4" />
          Transfer ownership
        </Label>
        <p className="text-muted-foreground text-sm">
          Hand the group to another member. You stay in the group as an admin.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <Select items={items} value={targetId} onValueChange={(value) => setTargetId(value)}>
            <SelectTrigger className="w-56" aria-label="New owner">
              <SelectValue placeholder="Choose a member" />
            </SelectTrigger>
            <SelectContent>
              {items.map((item) => (
                <SelectItem key={item.value} value={item.value}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
            <DialogTrigger render={<Button variant="outline" disabled={target === undefined} />}>
              Transfer ownership
            </DialogTrigger>
            <DialogContent>
              <DialogForm onSubmit={() => void handleTransfer()}>
                <DialogHeader>
                  <DialogTitle>Make {target?.userName ?? "this member"} the owner?</DialogTitle>
                  <DialogDescription>
                    They take over the group immediately, including these settings. You become an
                    admin and can&apos;t undo this yourself.
                  </DialogDescription>
                </DialogHeader>
                <DialogFooter>
                  <Button variant="ghost" onClick={() => setConfirmOpen(false)}>
                    Cancel
                  </Button>
                  <Button type="submit" variant="destructive" disabled={transfer.isPending}>
                    Transfer
                  </Button>
                </DialogFooter>
              </DialogForm>
            </DialogContent>
          </Dialog>
        </div>
      </div>
      <Separator />
    </>
  );
}
