import type { PairingPlayer, PairingWarning, PodSnapshotPlayer } from "@openrift/shared";
import { TriangleAlertIcon } from "lucide-react";

import { Alert, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

// Default region label: the raw slug (named so the React Compiler can reorder it).
const rawRegionSlug = (slug: string): string => slug;

/**
 * Rebuild the engine's `PairingPlayer[]` (Map opponents) from the wire snapshot.
 * @returns The players in the engine's snapshot shape.
 */
export function snapshotToPlayers(snapshot: PodSnapshotPlayer[]): PairingPlayer[] {
  return snapshot.map((player) => ({
    id: player.playerId,
    score: player.score,
    pods3: player.pods3,
    pods4: player.pods4,
    byes: player.byes,
    opponents: new Map(Object.entries(player.opponents)),
    region: player.region,
  }));
}

/**
 * A human-readable, organizer-facing description of one warning.
 * @returns The warning sentence.
 */
function describeWarning(
  warning: PairingWarning,
  nameById: Map<string, string>,
  regionLabel: (slug: string) => string,
): string {
  const name = (id: string) => nameById.get(id) ?? "A player";
  switch (warning.kind) {
    case "rematch": {
      return `${name(warning.playerIds[0])} & ${name(warning.playerIds[1])} have met ${
        warning.meetings === 1 ? "once" : `${warning.meetings} times`
      } before`;
    }
    case "largeSpread": {
      return `Wide score spread (${warning.spread})`;
    }
    case "repeatedThreePod": {
      return `${name(warning.playerId)} has already been in ${warning.priorThreePods} 3-pod${
        warning.priorThreePods === 1 ? "" : "s"
      }`;
    }
    case "repeatBye": {
      return `${name(warning.playerId)} has already had ${warning.priorByes} bye${
        warning.priorByes === 1 ? "" : "s"
      }`;
    }
    case "sameRegion": {
      return `${name(warning.playerIds[0])} & ${name(warning.playerIds[1])} both play ${regionLabel(
        warning.region,
      )}`;
    }
  }
}

/**
 * The pod's warnings written out, one line each, in the app's amber warning
 * callout. Renders nothing when there are no warnings.
 * @returns The warning alert, or null.
 */
export function WarningList({
  warnings,
  nameById,
  regionLabel = rawRegionSlug,
  className,
}: {
  warnings: PairingWarning[];
  nameById: Map<string, string>;
  regionLabel?: (slug: string) => string;
  className?: string;
}) {
  if (warnings.length === 0) {
    return null;
  }
  return (
    <Alert variant="warning" className={cn(className)}>
      <TriangleAlertIcon />
      <AlertTitle>
        <ul className="flex flex-col gap-0.5 font-normal">
          {warnings.map((warning, index) => (
            <li key={index}>{describeWarning(warning, nameById, regionLabel)}</li>
          ))}
        </ul>
      </AlertTitle>
    </Alert>
  );
}

/**
 * The compact form: a warning badge with the count, and the warnings themselves
 * in a tooltip. Renders nothing when there are no warnings.
 * @returns The badge, or null.
 */
export function WarningBadge({
  warnings,
  nameById,
  regionLabel = rawRegionSlug,
}: {
  warnings: PairingWarning[];
  nameById: Map<string, string>;
  regionLabel?: (slug: string) => string;
}) {
  if (warnings.length === 0) {
    return null;
  }
  return (
    <Tooltip>
      <TooltipTrigger render={<Badge variant="warning" />}>
        <TriangleAlertIcon />
        <span className="tabular-nums">{warnings.length}</span>
      </TooltipTrigger>
      <TooltipContent>
        <ul className="flex flex-col gap-0.5">
          {warnings.map((warning, index) => (
            <li key={index}>{describeWarning(warning, nameById, regionLabel)}</li>
          ))}
        </ul>
      </TooltipContent>
    </Tooltip>
  );
}
