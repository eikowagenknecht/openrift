import type { TournamentDetailResponse } from "@openrift/shared";
import { toast } from "sonner";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useFriendGroups } from "@/hooks/use-friend-groups";
import { useUpdateTournament } from "@/hooks/use-tournaments";

/**
 * Friend-group link picker, shown to the host only. Lets them link the
 * tournament to one of their groups, switch it to another, or unlink it
 * entirely after creation. The viewer can only pick groups they belong to; the
 * currently linked group is always offered so its name stays visible even if the
 * viewer isn't a member of it.
 * @returns The group-picker card.
 */
export function GroupCard({
  detail,
  locked,
}: {
  detail: TournamentDetailResponse;
  locked: boolean;
}) {
  const { data } = useFriendGroups();
  const updateTournament = useUpdateTournament();
  const currentValue = detail.groupId ?? "none";
  const groupItems = [
    { value: "none", label: "Not linked to a group" },
    ...data.items.map((group) => ({ value: group.id, label: group.name })),
  ];
  if (detail.groupId && !data.items.some((group) => group.id === detail.groupId)) {
    groupItems.push({ value: detail.groupId, label: detail.groupName ?? "Linked group" });
  }

  async function changeGroup(value: string) {
    const groupId = value === "none" ? null : value;
    const successMessage = value === "none" ? "Group unlinked" : "Group updated";
    try {
      await updateTournament.mutateAsync({ id: detail.id, groupId });
      toast.success(successMessage);
    } catch {
      // Reported by the global mutation error toast (see reportMutationError).
    }
  }

  return (
    <Card id="group" className="scroll-mt-16">
      <CardHeader>
        <CardTitle>Group</CardTitle>
        <CardDescription>
          Link the tournament to one of your groups so its members can find and follow it, or unlink
          it to keep it standalone. You can only pick groups you belong to.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Select
          items={groupItems}
          value={currentValue}
          disabled={locked || updateTournament.isPending}
          onValueChange={(value) => {
            if (value && value !== currentValue) {
              void changeGroup(value);
            }
          }}
        >
          <SelectTrigger className="max-w-sm" aria-label="Group">
            <SelectValue placeholder="Not linked to a group" />
          </SelectTrigger>
          <SelectContent>
            {groupItems.map((item) => (
              <SelectItem key={item.value} value={item.value}>
                {item.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </CardContent>
    </Card>
  );
}
