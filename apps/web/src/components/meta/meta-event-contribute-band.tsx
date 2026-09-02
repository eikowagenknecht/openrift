import type { MetaEventDetail, MetaEventPlayer } from "@openrift/shared";
import { Link } from "@tanstack/react-router";

import { BAND_GLOW } from "@/components/meta/meta-contribute-band";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useUserId } from "@/lib/auth-session";

/**
 * The archive's ask, aimed at this event: the reader looking at a field whose
 * lists are half missing is exactly the person who was in the room.
 */
export function MetaEventContributeBand({
  event,
  players,
  slug,
}: {
  event: MetaEventDetail;
  players: readonly MetaEventPlayer[];
  slug: string;
}) {
  const userId = useUserId();

  if (players.length === 0) {
    return null;
  }

  const missing = players.filter((player) => player.shareToken === null).length;
  const title = `Were you at ${event.name}?`;
  const body =
    missing === 0
      ? "Every entry has its decklist. Corrections are still welcome."
      : `${missing} of ${players.length} entries are still missing their decklist. Contributors are credited on every event.`;

  return (
    <Card className="ring-border-accent" style={{ backgroundImage: BAND_GLOW }}>
      <CardContent className="flex flex-col gap-4 sm:flex-row sm:items-center sm:gap-6">
        <div className="flex min-w-0 flex-col gap-1">
          <p className="font-semibold">{title}</p>
          <p className="text-muted-foreground">{body}</p>
        </div>
        {userId === null ? (
          <Button
            className="shrink-0 sm:ml-auto"
            render={
              <Link to="/login" search={{ redirect: `/meta/${slug}/submit`, email: undefined }} />
            }
          >
            Sign in to add a decklist
          </Button>
        ) : (
          <Button
            className="shrink-0 sm:ml-auto"
            render={<Link to="/meta/$slug/submit" params={{ slug }} />}
          >
            Add a decklist
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
