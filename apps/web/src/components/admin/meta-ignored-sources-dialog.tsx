import { formatDay } from "@openrift/shared/format-date";
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
  IgnoredMetaSourceEvent,
  IgnoredMetaSourcePlayer,
} from "@/hooks/use-admin-meta-overlays";
import {
  useAdminMetaIgnoredSources,
  useUnignoreMetaSourceEvent,
  useUnignoreMetaSourcePlayer,
} from "@/hooks/use-admin-meta-overlays";

interface IgnoredRowProps {
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
 * Ignoring leaves the mirrored row in place; unignoring restores it immediately, without a re-crawl.
 */
export function MetaIgnoredSourcesDialog({ onClose }: { onClose: () => void }) {
  const { data, isPending } = useAdminMetaIgnoredSources();
  const unignoreEvent = useUnignoreMetaSourceEvent();
  const unignorePlayer = useUnignoreMetaSourcePlayer();

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Dismissed source keys</DialogTitle>
          <DialogDescription>
            These keys are skipped by every crawl and every upload. Unignoring one brings it back as
            it was. A player key covers only its listed event.
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[60vh] space-y-6 overflow-y-auto">
          {isPending && <p className="text-muted-foreground text-sm">Loading…</p>}
          {data && (
            <>
              <IgnoredList title="Events" emptyText="No ignored events." count={data.events.length}>
                {data.events.map((row: IgnoredMetaSourceEvent) => (
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
              <IgnoredList
                title="Players"
                emptyText="No ignored players."
                count={data.players.length}
              >
                {data.players.map((row: IgnoredMetaSourcePlayer) => (
                  <IgnoredRow
                    key={`${row.provider}\n${row.eventExternalId}\n${row.externalId}`}
                    provider={row.provider}
                    eventExternalId={row.eventExternalId}
                    externalId={row.externalId}
                    createdAt={row.createdAt}
                    pending={unignorePlayer.isPending}
                    onUnignore={() =>
                      unignorePlayer.mutate({
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
