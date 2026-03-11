import { CountBadge } from "@/components/admin/count-badge";
import {
  ActionCard,
  ClearPriceCard,
  clearActions,
  refreshActions,
  useCronStatus,
} from "@/components/admin/refresh-actions";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useTcgplayerGroups, useUpdateTcgplayerGroup } from "@/hooks/use-tcgplayer-groups";

import { AdminQueryShell } from "./admin-query-shell";

export function TcgplayerGroupsPage() {
  const query = useTcgplayerGroups();
  const { data: cronStatus } = useCronStatus();
  const mutation = useUpdateTcgplayerGroup();

  function handleSetChange(groupId: number, value: string | null) {
    mutation.mutate({ groupId, setId: value });
  }

  return (
    <AdminQueryShell query={query}>
      {({ groups, sets }) => (
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-[repeat(auto-fill,minmax(300px,1fr))]">
            <ActionCard action={refreshActions.tcgplayer} cronStatus={cronStatus} />
            <ClearPriceCard action={clearActions.tcgplayer} />
          </div>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-24">Group ID</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead className="w-28">Abbreviation</TableHead>
                  <TableHead className="w-64">OpenRift Set</TableHead>
                  <TableHead className="w-24 text-right" title="Products mapped to printings">
                    Assigned
                  </TableHead>
                  <TableHead
                    className="w-24 text-right"
                    title="Distinct products in staging, not yet mapped to printings"
                  >
                    Staged
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {groups.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="text-muted-foreground h-24 text-center">
                      No groups yet — they appear after a TCGPlayer price scrape runs.
                    </TableCell>
                  </TableRow>
                )}
                {groups.map((group) => (
                  <TableRow key={group.groupId}>
                    <TableCell className="font-mono">{group.groupId}</TableCell>
                    <TableCell>{group.name}</TableCell>
                    <TableCell className="font-mono">{group.abbreviation}</TableCell>
                    <TableCell>
                      <Select
                        value={group.setId}
                        onValueChange={(v) => handleSetChange(group.groupId, v)}
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Unmapped" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={null}>Unmapped</SelectItem>
                          {sets.map((s) => (
                            <SelectItem key={s.id} value={s.id}>
                              {s.name} ({s.id})
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell className="text-right">
                      <CountBadge count={group.assignedCount} />
                    </TableCell>
                    <TableCell className="text-right">
                      <CountBadge count={group.stagedCount} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      )}
    </AdminQueryShell>
  );
}
