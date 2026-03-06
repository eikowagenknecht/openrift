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
import {
  useCardmarketExpansions,
  useUpdateCardmarketExpansion,
} from "@/hooks/use-cardmarket-expansions";

export function CardmarketExpansionsPage() {
  const { data, isLoading, error } = useCardmarketExpansions();
  const mutation = useUpdateCardmarketExpansion();

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

  const { expansions, sets } = data;

  function handleSetChange(expansionId: number, value: string | null) {
    mutation.mutate({ expansionId, setId: value });
  }

  return (
    <div className="space-y-4">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-24">Expansion ID</TableHead>
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
          {expansions.length === 0 && (
            <TableRow>
              <TableCell colSpan={4} className="text-muted-foreground h-24 text-center">
                No expansions yet — they appear after a Cardmarket price scrape runs.
              </TableCell>
            </TableRow>
          )}
          {expansions.map((expansion) => (
            <TableRow key={expansion.expansionId}>
              <TableCell className="font-mono">
                <a
                  href={`https://www.cardmarket.com/en/Riftbound/Products/Singles?idExpansion=${expansion.expansionId}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary underline underline-offset-4 hover:text-primary/80"
                >
                  {expansion.expansionId}
                </a>
              </TableCell>
              <TableCell>
                <Select
                  value={expansion.setId}
                  onValueChange={(v) => handleSetChange(expansion.expansionId, v)}
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
                {expansion.assignedCount > 0 ? (
                  <Badge variant="secondary">{expansion.assignedCount}</Badge>
                ) : (
                  <span className="text-muted-foreground">0</span>
                )}
              </TableCell>
              <TableCell className="text-right">
                {expansion.stagedCount > 0 ? (
                  <Badge variant="secondary">{expansion.stagedCount}</Badge>
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
