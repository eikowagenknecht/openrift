import { Link } from "@tanstack/react-router";
import { LinkIcon, SettingsIcon } from "lucide-react";
import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import { useCardSourceList, useLinkCard, useSourceNames } from "@/hooks/use-card-sources";

type Filter = "all" | "unchecked" | "unmatched";

export function CardSourcesListPage() {
  const [filter, setFilter] = useState<Filter>("all");
  const [source, setSource] = useState<string>();
  const { data: sourceNames } = useSourceNames();
  const { data, isLoading } = useCardSourceList(filter, source);
  const linkCard = useLinkCard();

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-64" />
      </div>
    );
  }

  const rows = data ?? [];

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          nativeButton={false}
          render={<Link to="/admin/cards-manage" />}
        >
          <SettingsIcon />
          Manage
        </Button>

        <Select
          value={source ?? ""}
          onValueChange={(v) => setSource(!v || v === "__all__" ? undefined : v)}
        >
          <SelectTrigger className="w-48">
            <SelectValue placeholder="All sources" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">All sources</SelectItem>
            {sourceNames?.map((name) => (
              <SelectItem key={name} value={name}>
                {name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {(["all", "unchecked", "unmatched"] as const).map((f) => (
          <Button
            key={f}
            variant={filter === f ? "default" : "outline"}
            size="sm"
            onClick={() => setFilter(f)}
          >
            {f === "all" ? "All" : f === "unchecked" ? "Has unchecked" : "Unmatched only"}
          </Button>
        ))}
      </div>

      {rows.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">No card sources found.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Card Name</TableHead>
              <TableHead className="w-28">Sources</TableHead>
              <TableHead className="w-28">Unchecked</TableHead>
              <TableHead className="w-28">Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => {
              const total = row.uncheckedCardCount + row.uncheckedPrintingCount;
              return (
                <TableRow key={row.cardId ?? row.name}>
                  <TableCell>
                    <Link
                      to={row.cardId ? "/admin/cards/$cardId" : "/admin/cards/new/$name"}
                      params={row.cardId ? { cardId: row.cardId } : { name: row.normalizedName }}
                      className="font-medium hover:underline"
                    >
                      {row.name}
                      {row.sourceIds.length > 0 && (
                        <span className="ml-2 font-normal text-muted-foreground">
                          ({row.sourceIds.join(", ")})
                        </span>
                      )}
                      {row.pendingSourceIds.length > 0 && (
                        <span className="ml-2 font-normal italic text-muted-foreground/50">
                          ({row.pendingSourceIds.join(", ")})
                        </span>
                      )}
                    </Link>
                    {row.hasGallery && <Badge className="ml-2 text-xs">gallery</Badge>}
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary">{row.sourceCount}</Badge>
                  </TableCell>
                  <TableCell>
                    {total > 0 ? (
                      <Badge variant="destructive">
                        {row.uncheckedCardCount} + {row.uncheckedPrintingCount}
                      </Badge>
                    ) : (
                      <Badge variant="outline">0</Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    {row.cardId ? (
                      <Badge variant="outline">Matched</Badge>
                    ) : row.suggestedCard ? (
                      <SuggestedMatch
                        cardName={row.suggestedCard.name}
                        isPending={linkCard.isPending}
                        onLink={() =>
                          linkCard.mutate({
                            name: row.normalizedName,
                            cardId: row.suggestedCard?.id ?? "",
                          })
                        }
                      />
                    ) : (
                      <Badge variant="secondary">Unmatched</Badge>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}
    </div>
  );
}

function SuggestedMatch({
  cardName,
  isPending,
  onLink,
}: {
  cardName: string;
  isPending: boolean;
  onLink: () => void;
}) {
  return (
    <div className="flex items-center gap-1">
      <Badge variant="secondary" className="truncate">
        {cardName}
      </Badge>
      <Button
        variant="outline"
        size="sm"
        className="h-6 shrink-0 text-xs"
        disabled={isPending}
        onClick={onLink}
      >
        <LinkIcon className="mr-1 size-3" />
        Link
      </Button>
    </div>
  );
}
