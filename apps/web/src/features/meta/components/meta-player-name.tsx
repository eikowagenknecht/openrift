import { Link } from "@tanstack/react-router";

import { cn } from "@/lib/utils";

export interface MetaPlayerNameProps {
  name: string;
  playerKey: string | null | undefined;
  /**
   * Positions the link so the name still takes its own clicks inside a
   * stretched-link tile, where an unpositioned anchor sits under the overlay.
   */
  inStretchedTile?: boolean;
  className?: string;
}

/**
 * Never inside a wrapper that is itself a link: an anchor inside an anchor is
 * invalid, so those surfaces print the name plain.
 */
export function MetaPlayerName({
  name,
  playerKey,
  inStretchedTile = false,
  className,
}: MetaPlayerNameProps) {
  if (playerKey === null || playerKey === undefined || playerKey === "") {
    return <span className={className}>{name}</span>;
  }

  return (
    <Link
      to="/meta/players/$key"
      params={{ key: playerKey }}
      className={cn("hover:underline", inStretchedTile && "relative", className)}
    >
      {name}
    </Link>
  );
}
