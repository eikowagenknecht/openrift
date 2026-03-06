import {
  ActionCard,
  ClearPriceCard,
  clearActions,
  refreshActions,
  useCronStatus,
} from "@/components/admin/refresh-actions";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useTcgplayerGroups, useUpdateTcgplayerGroup } from "@/hooks/use-tcgplayer-groups";

export function TcgplayerGroupsPage() {
  const { data, isLoading, error } = useTcgplayerGroups();
  const { data: cronStatus } = useCronStatus();
  const mutation = useUpdateTcgplayerGroup();

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (error) {
    return <p className="text-sm text-destructive">Failed to load: {error.message}</p>;
  }

  if (!data) {
    return null;
  }

  const { groups, sets } = data;

  function handleSetChange(groupId: number, value: string | null) {
    mutation.mutate({ groupId, setId: value });
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-4">
        <ActionCard action={refreshActions.tcgplayer} cronStatus={cronStatus} />
        <ClearPriceCard action={clearActions.tcgplayer} />
      </div>
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
                {group.assignedCount > 0 ? (
                  <Badge variant="secondary">{group.assignedCount}</Badge>
                ) : (
                  <span className="text-muted-foreground">0</span>
                )}
              </TableCell>
              <TableCell className="text-right">
                {group.stagedCount > 0 ? (
                  <Badge variant="secondary">{group.stagedCount}</Badge>
                ) : (
                  <span className="text-muted-foreground">0</span>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
