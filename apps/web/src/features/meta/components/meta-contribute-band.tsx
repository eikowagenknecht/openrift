import { Link } from "@tanstack/react-router";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export const BAND_GLOW =
  "radial-gradient(120% 90% at 50% 115%, color-mix(in oklab, var(--border-accent) 16%, transparent), transparent 70%)";

export function MetaContributeBand() {
  return (
    <Card className="ring-border-accent" style={{ backgroundImage: BAND_GLOW }}>
      <CardContent className="flex flex-col gap-4 sm:flex-row sm:items-center sm:gap-6">
        <div className="flex min-w-0 flex-col gap-1">
          <p className="font-semibold">Help complete the record</p>
          <p className="text-muted-foreground">
            Decklists, results, and corrections are all welcome, whether you played, judged, or just
            watched. Contributors are credited on every event.
          </p>
        </div>
        <Button className="shrink-0 sm:ml-auto" render={<Link to="/meta/submit" />}>
          Send a decklist
        </Button>
      </CardContent>
    </Card>
  );
}
