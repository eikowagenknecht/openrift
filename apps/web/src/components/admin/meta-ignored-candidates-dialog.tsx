import { formatDay } from "@openrift/shared";
import { Undo2Icon } from "lucide-react";
import type { ReactNode } from "react";

import { Heading } from "@/components/heading";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type {
  IgnoredMetaCandidate,
  IgnoredMetaCandidateDeck,
} from "@/hooks/use-admin-meta-candidates";
import {
  useAdminMetaIgnoredCandidates,
  useUnignoreMetaCandidateDeck,
  useUnignoreMetaCandidateEvent,
} from "@/hooks/use-admin-meta-candidates";

interface IgnoredRowProps {
  /** The source's event id, shown on deck rows: deck ids repeat across events. */
  eventExternalId?: string;
  externalId: string;
  provider: string;
  createdAt: string;
  onUnignore: () => void;
  pending: boolean;
}

function IgnoredRow({
  eventExternalId,
  externalId,
  provider,
  createdAt,
  onUnignore,
  pending,
}: IgnoredRowProps) {
  return (
    <li className="flex items-center justify-between gap-3 py-2">
      <div className="flex min-w-0 items-center gap-2">
        <Badge variant="outline">{provider}</Badge>
        {eventExternalId !== undefined && (
          <span className="text-muted-foreground truncate font-mono text-sm">
            {eventExternalId} /
          </span>
        )}
        <span className="truncate font-mono text-sm">{externalId}</span>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <span className="text-muted-foreground text-sm">{formatDay(createdAt)}</span>
        <Button variant="ghost" size="sm" disabled={pending} onClick={onUnignore}>
          <Undo2Icon />
          Unignore
        </Button>
      </div>
    </li>
  );
}

interface IgnoredListProps {
  title: string;
  emptyText: string;
  /** Row count, so the section can say "nothing here" without reading the rows. */
  count: number;
  children: ReactNode;
}

function IgnoredList({ title, emptyText, count, children }: IgnoredListProps) {
  return (
    <section className="space-y-2">
      <Heading level={3}>{title}</Heading>
      {count === 0 && <p className="text-muted-foreground text-sm">{emptyText}</p>}
      <ul className="divide-y">{children}</ul>
    </section>
  );
}

/**
 * The keys uploads skip (ADR-014). Unignoring one only lifts the skip: the row
 * comes back the next time a source pushes it, not immediately.
 *
 * @returns The ignored-candidates dialog.
 */
export function MetaIgnoredCandidatesDialog({ onClose }: { onClose: () => void }) {
  const { data, isPending } = useAdminMetaIgnoredCandidates();
  const unignoreEvent = useUnignoreMetaCandidateEvent();
  const unignoreDeck = useUnignoreMetaCandidateDeck();

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Ignored candidates</DialogTitle>
          <DialogDescription>
            These keys are skipped on every upload. Unignore one to let a future push stage it
            again. A deck key covers only the event it is listed under.
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[60vh] space-y-6 overflow-y-auto">
          {isPending && <p className="text-muted-foreground text-sm">Loading...</p>}
          {data && (
            <>
              <IgnoredList title="Events" emptyText="No ignored events." count={data.events.length}>
                {data.events.map((row: IgnoredMetaCandidate) => (
                  <IgnoredRow
                    key={`${row.provider}\n${row.externalId}`}
                    provider={row.provider}
                    externalId={row.externalId}
                    createdAt={row.createdAt}
                    pending={unignoreEvent.isPending}
                    onUnignore={() =>
                      unignoreEvent.mutate({ provider: row.provider, externalId: row.externalId })
                    }
                  />
                ))}
              </IgnoredList>
              <IgnoredList title="Decks" emptyText="No ignored decks." count={data.decks.length}>
                {data.decks.map((row: IgnoredMetaCandidateDeck) => (
                  <IgnoredRow
                    key={`${row.provider}\n${row.eventExternalId}\n${row.externalId}`}
                    provider={row.provider}
                    eventExternalId={row.eventExternalId}
                    externalId={row.externalId}
                    createdAt={row.createdAt}
                    pending={unignoreDeck.isPending}
                    onUnignore={() =>
                      unignoreDeck.mutate({
                        provider: row.provider,
                        eventExternalId: row.eventExternalId,
                        externalId: row.externalId,
                      })
                    }
                  />
                ))}
              </IgnoredList>
            </>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
