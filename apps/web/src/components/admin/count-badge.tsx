import { Badge } from "@/components/ui/badge";

export function CountBadge({ count }: { count: number }) {
  return count > 0 ? (
    <Badge variant="secondary">{count}</Badge>
  ) : (
    <span className="text-muted-foreground">0</span>
  );
}
