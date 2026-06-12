import { PlayerDeckRow } from "@/components/deck-check/player-decks-page";
import { useMyTournamentDecks } from "@/hooks/use-deck-check-player";

/**
 * The Events tab for a plain group member (ADR-026): only their own entries
 * in this group's events, each leading to the player-facing deck page. The
 * entrant list and the checker stay judge+ only (the PII boundary).
 * @returns The member view of the group's events.
 */
export function GroupTournamentDecksView({ slug }: { slug: string }) {
  const { data, isPending } = useMyTournamentDecks();
  const entries = (data?.items ?? []).filter((entry) => entry.groupSlug === slug);

  if (isPending) {
    return <p className="text-muted-foreground">Loading...</p>;
  }
  if (entries.length === 0) {
    return (
      <p className="text-muted-foreground">
        You haven&apos;t entered a deck in this group&apos;s events yet. The full event view is
        visible to judges only.
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-3">
      <p className="text-muted-foreground text-sm">
        Your decks in this group&apos;s events. Only judges see other players&apos; entries.
      </p>
      {entries.map((entry) => (
        <PlayerDeckRow key={entry.id} entry={entry} />
      ))}
    </div>
  );
}
