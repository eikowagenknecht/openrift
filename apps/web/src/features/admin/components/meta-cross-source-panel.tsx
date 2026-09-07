import type { MetaCrossSourceCitation, MetaCrossSourceRow } from "@openrift/shared/types/api/meta";
import { LinkIcon, UnlinkIcon, UserXIcon } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { rankLabel } from "@/features/admin/components/meta-review-shared";
import { MetaStandingsRowPicker } from "@/features/admin/components/meta-standings-row-picker";
import {
  useLinkMetaCrossSourcePlayers,
  useMetaCrossSourceReview,
  useSetMetaSourceContributes,
  useUnlinkMetaCrossSourcePlayer,
} from "@/features/admin/hooks/use-admin-meta-overlays";
import { crossSourceAutoLinks, crossSourceProgress } from "@/features/meta/lib/meta-cross-source";
import { sourceProviderDisplay } from "@/features/meta/lib/meta-source-review";

function StateBadge({ row }: { row: MetaCrossSourceRow }) {
  if (row.state === "linked") {
    return <Badge>linked</Badge>;
  }
  if (row.state === "distinct") {
    return <Badge variant="outline">its own row</Badge>;
  }
  return <Badge variant="warning">unreviewed</Badge>;
}

function SourceHeader({
  source,
  rows,
  busy,
}: {
  source: MetaCrossSourceCitation;
  rows: readonly MetaCrossSourceRow[];
  busy: boolean;
}) {
  const provider = sourceProviderDisplay(source.provider);
  const progress = crossSourceProgress(rows, source.provider);
  const contributes = useSetMetaSourceContributes();

  async function toggle(): Promise<void> {
    try {
      await contributes.mutateAsync({ id: source.id, contributes: !source.contributes });
    } catch {
      // Reported by the global mutation error toast.
      return;
    }
    toast.success(
      source.contributes
        ? "Cited only now. The event has been promoted again."
        : "Reading this source now. The event has been promoted again.",
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Badge variant={provider.variant}>{provider.label}</Badge>
      {source.contributes ? (
        <Badge variant="success">read</Badge>
      ) : (
        <Badge variant="muted">cited only</Badge>
      )}
      {!source.contributes && (
        <span className="text-muted-foreground tabular-nums">
          {progress.linked} linked, {progress.distinct} on their own, {progress.unreviewed} left
        </span>
      )}
      <Button
        size="sm"
        variant={source.contributes ? "outline" : "default"}
        className="ml-auto"
        disabled={busy || contributes.isPending || (!source.contributes && progress.unreviewed > 0)}
        onClick={() => {
          void toggle();
        }}
      >
        {source.contributes ? "Stop reading this source" : "Let this source contribute"}
      </Button>
    </div>
  );
}

function EntryRow({
  metaEventId,
  row,
  busy,
  onLink,
  onUnlink,
}: {
  metaEventId: string;
  row: MetaCrossSourceRow;
  busy: boolean;
  onLink: (row: MetaCrossSourceRow, metaEventPlayerId: string | null, name: string) => void;
  onUnlink: (row: MetaCrossSourceRow) => void;
}) {
  const current = row.suggestions.find((suggestion) => suggestion.isCurrent);

  return (
    <li className="space-y-1 border-b py-2 last:border-0">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-muted-foreground w-8 shrink-0 tabular-nums">
          {rankLabel(row.rank, false)}
        </span>
        <span className="font-medium">{row.playerName}</span>
        {row.legendName !== null && <span className="text-muted-foreground">{row.legendName}</span>}
        {row.hasDeck && <Badge variant="outline">deck</Badge>}
        <StateBadge row={row} />
        {current !== undefined && (
          <span className="text-muted-foreground">
            → {rankLabel(current.rank, current.rankIsTier)} {current.playerName}
          </span>
        )}
        {row.state !== "unreviewed" && (
          <Button
            size="sm"
            variant="ghost"
            className="ml-auto"
            disabled={busy}
            onClick={() => {
              onUnlink(row);
            }}
          >
            <UnlinkIcon />
            Undo
          </Button>
        )}
      </div>

      {row.state === "unreviewed" && (
        <div className="space-y-1 pl-10">
          {row.suggestions.length === 0 && (
            <p className="text-muted-foreground">
              No live row shares this name or this finish, so this is most likely someone the other
              source never listed.
            </p>
          )}
          {row.suggestions.map((suggestion) => (
            <div key={suggestion.metaEventPlayerId} className="flex flex-wrap items-center gap-2">
              <span className="text-muted-foreground tabular-nums">
                {rankLabel(suggestion.rank, suggestion.rankIsTier)}
              </span>
              <span>{suggestion.playerName}</span>
              {suggestion.isExact && <Badge variant="success">exact</Badge>}
              {suggestion.deckId !== null && <Badge variant="outline">has a deck</Badge>}
              <span className="text-muted-foreground">{suggestion.reasons.join(", ")}</span>
              <Button
                size="sm"
                variant={suggestion.isExact ? "default" : "outline"}
                className="ml-auto"
                disabled={busy}
                onClick={() => {
                  onLink(row, suggestion.metaEventPlayerId, suggestion.playerName);
                }}
              >
                <LinkIcon />
                Same player
              </Button>
            </div>
          ))}
          <div className="flex flex-wrap items-center gap-2">
            <MetaStandingsRowPicker
              metaEventId={metaEventId}
              currentPlayerId={null}
              disabled={busy}
              onPick={(metaEventPlayerId, playerName) => {
                onLink(row, metaEventPlayerId, playerName);
              }}
            />
            <Button
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={() => {
                onLink(row, null, row.playerName);
              }}
            >
              <UserXIcon />
              Not in this event yet
            </Button>
          </div>
        </div>
      )}
    </li>
  );
}

export function MetaCrossSourcePanel({
  metaEventId,
  enabled,
}: {
  metaEventId: string;
  enabled: boolean;
}) {
  const { data, isPending, isError } = useMetaCrossSourceReview(metaEventId, enabled);
  const link = useLinkMetaCrossSourcePlayers();
  const unlink = useUnlinkMetaCrossSourcePlayer();
  const busy = link.isPending || unlink.isPending;

  async function handleLink(
    row: MetaCrossSourceRow,
    metaEventPlayerId: string | null,
    name: string,
  ): Promise<void> {
    try {
      await link.mutateAsync({
        id: metaEventId,
        links: [
          {
            provider: row.provider,
            sourceIdentity: row.sourceIdentity,
            metaEventPlayerId,
          },
        ],
      });
    } catch {
      // Reported by the global mutation error toast.
      return;
    }
    toast.success(
      metaEventPlayerId === null ? `${name} will get their own row.` : `Linked to ${name}.`,
    );
  }

  async function handleUnlink(row: MetaCrossSourceRow): Promise<void> {
    try {
      await unlink.mutateAsync({
        id: metaEventId,
        provider: row.provider,
        sourceIdentity: row.sourceIdentity,
      });
    } catch {
      // Reported by the global mutation error toast.
      return;
    }
    toast.success(`${row.playerName} is unreviewed again.`);
  }

  async function handleAutoLink(): Promise<void> {
    const picks = crossSourceAutoLinks(data?.rows ?? []);
    if (picks.length === 0) {
      return;
    }
    try {
      await link.mutateAsync({
        id: metaEventId,
        links: picks.map((pick) => ({
          provider: pick.provider,
          sourceIdentity: pick.sourceIdentity,
          metaEventPlayerId: pick.metaEventPlayerId,
        })),
      });
    } catch {
      // Reported by the global mutation error toast.
      return;
    }
    toast.success(`Linked ${picks.length} exact match${picks.length === 1 ? "" : "es"}.`);
  }

  if (isError) {
    return <p className="text-destructive">The cross-source review could not be loaded.</p>;
  }
  if (isPending || data === undefined) {
    return <Skeleton className="h-40 w-full" />;
  }

  if (data.sources.length === 0) {
    return (
      <p className="text-muted-foreground">
        No crawled source is linked to this event, so there is nothing to match across.
      </p>
    );
  }

  const autoLinks = crossSourceAutoLinks(data.rows);

  return (
    <div className="space-y-3">
      <p className="text-muted-foreground">
        A player has no identity that spans two sources, so a second one is credited without being
        read until every entry below names the live row it is. Then it can contribute, and what it
        holds that the read source does not — a decklist, a legend, a record — lands on that row.
      </p>

      {data.sources.map((source) => (
        <SourceHeader key={source.id} source={source} rows={data.rows} busy={busy} />
      ))}

      {data.rows.length === 0 && (
        <p className="text-muted-foreground">
          Every source linked to this event is read. There is nothing to match across.
        </p>
      )}

      {autoLinks.length > 0 && (
        <Button
          size="sm"
          variant="outline"
          disabled={busy}
          onClick={() => {
            void handleAutoLink();
          }}
        >
          <LinkIcon />
          Link {autoLinks.length} exact match{autoLinks.length === 1 ? "" : "es"}
        </Button>
      )}

      <ul>
        {data.rows.map((row) => (
          <EntryRow
            key={`${row.provider}:${row.sourceIdentity}`}
            metaEventId={metaEventId}
            row={row}
            busy={busy}
            onLink={(target, metaEventPlayerId, name) => {
              void handleLink(target, metaEventPlayerId, name);
            }}
            onUnlink={(target) => {
              void handleUnlink(target);
            }}
          />
        ))}
      </ul>
    </div>
  );
}
