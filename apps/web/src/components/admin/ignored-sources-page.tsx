import { Undo2Icon } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  useIgnoredSources,
  useUnignoreCardSource,
  useUnignorePrintingSource,
} from "@/hooks/use-ignored-sources";

export function IgnoredSourcesPage() {
  const { data } = useIgnoredSources();
  const unignoreCard = useUnignoreCardSource();
  const unignorePrinting = useUnignorePrintingSource();
  const { cards, printings } = data;

  return (
    <div className="space-y-8">
      {/* Card sources */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold">Ignored Card Sources</h2>
        <p className="text-sm text-muted-foreground">
          {cards.length === 0
            ? "No ignored card sources."
            : `${cards.length} ignored card source${cards.length === 1 ? "" : "s"}`}
        </p>
        {cards.length > 0 && (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-36">Source</TableHead>
                  <TableHead>Entity ID</TableHead>
                  <TableHead className="w-36">Ignored At</TableHead>
                  <TableHead className="w-20" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {cards.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell>
                      <Badge variant="outline">{r.source}</Badge>
                    </TableCell>
                    <TableCell className="font-mono text-xs">{r.sourceEntityId}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {r.createdAt.slice(0, 16).replace("T", " ")}
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2 text-xs"
                        onClick={() =>
                          unignoreCard.mutate({
                            source: r.source,
                            sourceEntityId: r.sourceEntityId,
                          })
                        }
                        disabled={unignoreCard.isPending}
                      >
                        <Undo2Icon className="size-3.5" />
                        Unignore
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </section>

      {/* Printing sources */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold">Ignored Printing Sources</h2>
        <p className="text-sm text-muted-foreground">
          {printings.length === 0
            ? "No ignored printing sources."
            : `${printings.length} ignored printing source${printings.length === 1 ? "" : "s"}`}
        </p>
        {printings.length > 0 && (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-36">Source</TableHead>
                  <TableHead>Entity ID</TableHead>
                  <TableHead className="w-24">Finish</TableHead>
                  <TableHead className="w-36">Ignored At</TableHead>
                  <TableHead className="w-20" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {printings.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell>
                      <Badge variant="outline">{r.source}</Badge>
                    </TableCell>
                    <TableCell className="font-mono text-xs">{r.sourceEntityId}</TableCell>
                    <TableCell>
                      {r.finish ? (
                        <Badge variant="outline">{r.finish}</Badge>
                      ) : (
                        <span className="text-xs text-muted-foreground">all</span>
                      )}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {r.createdAt.slice(0, 16).replace("T", " ")}
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2 text-xs"
                        onClick={() =>
                          unignorePrinting.mutate({
                            source: r.source,
                            sourceEntityId: r.sourceEntityId,
                            finish: r.finish ?? null,
                          })
                        }
                        disabled={unignorePrinting.isPending}
                      >
                        <Undo2Icon className="size-3.5" />
                        Unignore
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </section>
    </div>
  );
}
