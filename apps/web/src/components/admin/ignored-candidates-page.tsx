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
  useIgnoredCandidates,
  useUnignoreCandidateCard,
  useUnignoreCandidatePrinting,
} from "@/hooks/use-ignored-candidates";

export function IgnoredCandidatesPage() {
  const { data } = useIgnoredCandidates();
  const unignoreCard = useUnignoreCandidateCard();
  const unignorePrinting = useUnignoreCandidatePrinting();
  const { cards, printings } = data;

  return (
    <div className="space-y-8">
      {/* Candidate cards */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold">Ignored Candidate Cards</h2>
        <p className="text-sm text-muted-foreground">
          {cards.length === 0
            ? "No ignored candidate cards."
            : `${cards.length} ignored candidate card${cards.length === 1 ? "" : "s"}`}
        </p>
        {cards.length > 0 && (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-36">Provider</TableHead>
                  <TableHead>External ID</TableHead>
                  <TableHead className="w-36">Ignored At</TableHead>
                  <TableHead className="w-20" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {cards.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell>
                      <Badge variant="outline">{r.provider}</Badge>
                    </TableCell>
                    <TableCell className="font-mono text-xs">{r.externalId}</TableCell>
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
                            provider: r.provider,
                            externalId: r.externalId,
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

      {/* Candidate printings */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold">Ignored Candidate Printings</h2>
        <p className="text-sm text-muted-foreground">
          {printings.length === 0
            ? "No ignored candidate printings."
            : `${printings.length} ignored candidate printing${printings.length === 1 ? "" : "s"}`}
        </p>
        {printings.length > 0 && (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-36">Provider</TableHead>
                  <TableHead>External ID</TableHead>
                  <TableHead className="w-24">Finish</TableHead>
                  <TableHead className="w-36">Ignored At</TableHead>
                  <TableHead className="w-20" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {printings.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell>
                      <Badge variant="outline">{r.provider}</Badge>
                    </TableCell>
                    <TableCell className="font-mono text-xs">{r.externalId}</TableCell>
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
                            provider: r.provider,
                            externalId: r.externalId,
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
