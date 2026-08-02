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
import { useMyOrganizations } from "@/hooks/use-organizations";
import { useUpdateTournament } from "@/hooks/use-tournaments";

/**
 * Host reassignment, shown to the host only. Lets them move the tournament
 * between a personal host (themselves) and any organization they belong to.
 * @returns The host-picker card.
 */
export function HostCard({
  detail,
  locked,
}: {
  detail: TournamentDetailResponse;
  locked: boolean;
}) {
  const { data } = useMyOrganizations();
  const updateTournament = useUpdateTournament();
  const currentValue = detail.host.type === "user" ? "user" : (detail.host.orgId ?? "user");
  const hostItems = [
    { value: "user", label: "You (personal)" },
    ...data.items.map((org) => ({ value: org.id, label: org.name })),
  ];

  async function changeHost(value: string) {
    const host =
      value === "user"
        ? ({ type: "user" } as const)
        : ({ type: "organization", orgId: value } as const);
    try {
      await updateTournament.mutateAsync({ id: detail.id, host });
      toast.success("Host updated");
    } catch {
      // Reported by the global mutation error toast (see reportMutationError).
    }
  }

  return (
    <Card id="host" className="scroll-mt-16">
      <CardHeader>
        <CardTitle>Host</CardTitle>
        <CardDescription>
          Who can run this tournament. An organization brings in its owners, managers, and judges
          automatically. As a personal host, that is just you. You can invite extra staff either
          way.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Select
          items={hostItems}
          value={currentValue}
          disabled={locked || updateTournament.isPending}
          onValueChange={(value) => {
            if (value && value !== currentValue) {
              void changeHost(value);
            }
          }}
        >
          <SelectTrigger className="max-w-sm" aria-label="Host">
            <SelectValue placeholder="Host" />
          </SelectTrigger>
          <SelectContent>
            {hostItems.map((item) => (
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
