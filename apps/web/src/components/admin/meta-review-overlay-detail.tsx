import { formatDay } from "@openrift/shared/format-date";
import type { MetaOverlayQueueRow } from "@openrift/shared/types/api/meta";
import type { DeckZone } from "@openrift/shared/types/enums";
import { ArchiveXIcon, CheckIcon, LinkIcon } from "lucide-react";
import { toast } from "sonner";

import { MetaCardNamePicker } from "@/components/admin/meta-card-name-picker";
import { MetaEventSearchPicker } from "@/components/admin/meta-event-search-picker";
import { ConfirmActionButton, rankLabel } from "@/components/admin/meta-review-shared";
import { MetaStandingsRowPicker } from "@/components/admin/meta-standings-row-picker";
import { MetaSubmissionResolve } from "@/components/admin/meta-submission-resolve";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import {
  useIgnoreMetaSourceEvent,
  useIgnoreMetaSourcePlayer,
  useLinkMetaPlayerOverlay,
  useMetaEventMatchSuggestions,
  useMetaPlayerMatchSuggestions,
} from "@/hooks/use-admin-meta-overlays";
import { useMetaSubmissionForPlayerOverlay } from "@/hooks/use-admin-meta-submissions";
import { useZoneOrder } from "@/hooks/use-enums";
import { sourceDismissTarget } from "@/lib/meta-source-review";
import { cn } from "@/lib/utils";

/**
 * Pass `dropped` and `onToggle` together for an accept's claim picker; omit
 * both for a read-only list.
 */
export function OverlayChanges({
  changes,
  dropped,
  onToggle,
}: {
  changes: MetaOverlayQueueRow["changes"];
  dropped?: ReadonlySet<string>;
  onToggle?: (field: string) => void;
}) {
  const real = changes.filter((change) => change.from !== change.to);
  if (real.length === 0) {
    return <p className="text-muted-foreground text-sm">No field changes.</p>;
  }
  if (onToggle === undefined) {
    return (
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
        {real.map((change) => (
          <div key={change.field} className="contents">
            <dt className="text-muted-foreground font-mono text-xs">{change.field}</dt>
            <dd className="flex flex-wrap items-baseline gap-2">
              <span className="text-muted-foreground line-through">{change.from ?? "empty"}</span>
              <span aria-hidden>→</span>
              <span className="font-medium">{change.to ?? "empty"}</span>
            </dd>
          </div>
        ))}
      </dl>
    );
  }
  return (
    <ul className="space-y-1 text-sm">
      {real.map((change) => {
        const keep = dropped?.has(change.field) !== true;
        return (
          <li key={change.field} className="flex flex-wrap items-baseline gap-2">
            <Checkbox
              checked={keep}
              aria-label={`Claim ${change.field}`}
              onCheckedChange={() => {
                onToggle(change.field);
              }}
            />
            <span className="text-muted-foreground font-mono text-xs">{change.field}</span>
            <span className={cn("text-muted-foreground", keep && "line-through")}>
              {change.from ?? "empty"}
            </span>
            <span aria-hidden>→</span>
            <span className={keep ? "font-medium" : "text-muted-foreground line-through"}>
              {change.to ?? "empty"}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

function ZoneLines({ cards }: { cards: MetaOverlayQueueRow["cards"] }) {
  const { zoneOrder, zoneLabels } = useZoneOrder();
  const byZone = Map.groupBy(cards, (card) => card.zone);
  const zones = [
    ...zoneOrder.filter((zone) => byZone.has(zone)),
    ...[...byZone.keys()].filter((zone) => !(zoneOrder as string[]).includes(zone)),
  ];

  return (
    <div className="grid gap-x-6 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
      {zones.map((zone) => {
        const lines = byZone.get(zone) ?? [];
        const copies = lines.reduce((sum, card) => sum + card.quantity, 0);
        return (
          <section key={zone} className="space-y-1">
            <h3 className="text-muted-foreground text-xs font-medium">
              {zoneLabels[zone as DeckZone] ?? zone} · {copies}
            </h3>
            <ul className="space-y-0.5 text-sm">
              {lines.map((card) => (
                <li key={card.lineNumber} className="flex items-baseline gap-2">
                  <span className="text-muted-foreground w-5 shrink-0 tabular-nums">
                    {card.quantity}×
                  </span>
                  <span className={card.cardId === null ? "text-destructive" : undefined}>
                    {card.cardName}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

export function OverlayCardLines({ overlay }: { overlay: MetaOverlayQueueRow }) {
  if (overlay.cards.length === 0) {
    return null;
  }
  return (
    <div className="space-y-3">
      <div className="flex items-baseline gap-2">
        <span className="font-medium">Decklist</span>
        <span className="text-muted-foreground text-sm">
          {overlay.cards.length} line{overlay.cards.length === 1 ? "" : "s"}
          {overlay.unresolvedNames.length === 0 && " · every name resolved"}
        </span>
      </div>
      {overlay.unresolvedNames.length > 0 && (
        <div className="space-y-2 text-sm">
          <p className="text-destructive">
            {overlay.unresolvedNames.length} card{overlay.unresolvedNames.length === 1 ? "" : "s"}{" "}
            match nothing in the catalog, so no deck is attached until they do.
          </p>
          <ul className="space-y-1">
            {overlay.unresolvedNames.map((name) => (
              <li key={name} className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{name}</span>
                <MetaCardNamePicker name={name} />
              </li>
            ))}
          </ul>
        </div>
      )}
      <ZoneLines cards={overlay.cards} />
    </div>
  );
}

export function EventMatches({
  overlayId,
  busy,
  onAcceptInto,
}: {
  overlayId: string;
  busy: boolean;
  onAcceptInto: (metaEventId: string) => void;
}) {
  const { data, isPending } = useMetaEventMatchSuggestions(overlayId);

  if (isPending) {
    return <Skeleton className="h-16 w-full" />;
  }
  if (data === undefined) {
    return null;
  }
  const [best] = data.suggestions;

  return (
    <div className="space-y-2">
      {best === undefined ? (
        <p className="text-muted-foreground text-sm">
          No archived event within {data.windowDays} day{data.windowDays === 1 ? "" : "s"} looks
          like this one, so accepting mints a new one.
        </p>
      ) : (
        <div className="bg-warning-soft flex flex-wrap items-center gap-2 rounded-md px-3 py-2 text-sm">
          <span className="font-medium">{best.name}</span>
          <span className="text-muted-foreground tabular-nums">{formatDay(best.eventDate)}</span>
          <Badge variant="outline">{best.format}</Badge>
          <span className="text-muted-foreground">{best.reasons.join(", ")}</span>
          <Button
            size="sm"
            variant={best.isExact ? "default" : "outline"}
            disabled={busy}
            className="ml-auto"
            onClick={() => {
              onAcceptInto(best.metaEventId);
            }}
          >
            <CheckIcon />
            Accept into this
          </Button>
        </div>
      )}
      <MetaEventSearchPicker
        disabled={busy}
        onPick={(metaEventId) => {
          onAcceptInto(metaEventId);
        }}
      />
    </div>
  );
}

export function PlayerMatches({ overlay }: { overlay: MetaOverlayQueueRow }) {
  const linked = overlay.metaEventPlayerId !== null;
  const { data, isPending } = useMetaPlayerMatchSuggestions(overlay.id);
  const link = useLinkMetaPlayerOverlay();
  const suggestions = data?.suggestions ?? [];

  async function handleLink(metaEventPlayerId: string, playerName: string): Promise<void> {
    try {
      await link.mutateAsync({ id: overlay.id, metaEventPlayerId });
    } catch {
      // Reported by the global mutation error toast.
      return;
    }
    toast.success(`Linked to ${playerName}.`);
  }

  return (
    <div className="space-y-2">
      <span className="font-medium">Standings row</span>
      <p className="text-muted-foreground text-sm">
        {linked
          ? "Linked. Pick another row to move it: the one it leaves is taken back on the next promote, provided this upload is what minted it."
          : "Not linked to a standings row yet. Pick the row this entry describes, or accepting files a second row beside it."}
      </p>
      {isPending && <Skeleton className="h-16 w-full" />}
      {data !== undefined && suggestions.length === 0 && !linked && (
        <p className="text-muted-foreground text-sm">
          No standings row in this event shares this entry&apos;s name or its finish, so accepting
          files a new one.
        </p>
      )}
      {suggestions.length > 0 && (
        <ul className="space-y-1 rounded-md border px-3 py-2 text-sm">
          {suggestions.map((suggestion) => (
            <li key={suggestion.metaEventPlayerId} className="flex flex-wrap items-center gap-2">
              <span className="text-muted-foreground tabular-nums">
                {rankLabel(suggestion.rank, suggestion.rankIsTier)}
              </span>
              <span className="font-medium">{suggestion.playerName}</span>
              {suggestion.isExact && !suggestion.isCurrent && (
                <Badge variant="success">exact</Badge>
              )}
              {suggestion.deckId !== null && <Badge variant="outline">has a deck</Badge>}
              {suggestion.isCurrent && <Badge>linked</Badge>}
              <span className="text-muted-foreground">{suggestion.reasons.join(", ")}</span>
              {!suggestion.isCurrent && (
                <Button
                  size="sm"
                  variant={suggestion.isExact && !linked ? "default" : "outline"}
                  className="ml-auto"
                  disabled={link.isPending}
                  onClick={() => {
                    void handleLink(suggestion.metaEventPlayerId, suggestion.playerName);
                  }}
                >
                  <LinkIcon />
                  Link to this entry
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
      {overlay.metaEventId !== null && (
        <MetaStandingsRowPicker
          metaEventId={overlay.metaEventId}
          currentPlayerId={overlay.metaEventPlayerId}
          disabled={link.isPending}
          onPick={(metaEventPlayerId, playerName) => {
            void handleLink(metaEventPlayerId, playerName);
          }}
        />
      )}
    </div>
  );
}

export function DismissSourceKey({ overlay }: { overlay: MetaOverlayQueueRow }) {
  const ignoreEvent = useIgnoreMetaSourceEvent();
  const ignorePlayer = useIgnoreMetaSourcePlayer();
  const target = sourceDismissTarget(overlay);

  if (target === null) {
    return null;
  }

  const description =
    target.kind === "event"
      ? `Every crawl and upload skips ${target.provider}'s "${target.externalId}" from now on. You can undo it under Dismissed keys.`
      : `Every crawl and upload skips ${target.provider}'s "${target.externalId}" in event "${target.eventExternalId}" from now on. You can undo it under Dismissed keys.`;

  async function dismiss(): Promise<void> {
    if (target === null) {
      return;
    }
    if (target.kind === "event") {
      await ignoreEvent.mutateAsync({
        provider: target.provider,
        externalId: target.externalId,
      });
      return;
    }
    await ignorePlayer.mutateAsync({
      provider: target.provider,
      eventExternalId: target.eventExternalId,
      externalId: target.externalId,
    });
  }

  return (
    <div className="text-muted-foreground flex flex-wrap items-center gap-2 text-xs">
      <span>{target.provider}</span>
      <span className="font-mono">{target.externalId}</span>
      <ConfirmActionButton
        title="Dismiss this source key?"
        description={description}
        confirmLabel="Dismiss"
        onConfirm={dismiss}
        disabled={ignoreEvent.isPending || ignorePlayer.isPending}
        trigger={<Button variant="link-muted" size="sm" />}
      >
        <ArchiveXIcon />
        Dismiss this source key
      </ConfirmActionButton>
    </div>
  );
}

export function SubmissionLedger({ overlay }: { overlay: MetaOverlayQueueRow }) {
  const isPerson = overlay.provider === null;
  const { data } = useMetaSubmissionForPlayerOverlay(overlay.id, isPerson);
  const submission = data?.submission ?? null;
  if (submission === null) {
    return null;
  }
  return (
    <div className="border-t pt-2">
      <MetaSubmissionResolve submission={submission} playerOverlayId={overlay.id} />
    </div>
  );
}
