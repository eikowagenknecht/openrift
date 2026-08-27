import { Link } from "@tanstack/react-router";
import { CloudOffIcon } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

// Local decks (ADR-035) live only in this browser's localStorage until the user
// creates an account and claims them. These calm, informational hints tell a
// signed-out user that fact at the moments they build a deck: the create dialog,
// the deck list, and the builder top bar (the "On this device" badge tooltip).

/**
 * Shared login link for the local-save hints, matching the deck builder's sign-in link.
 * Both hints render on /decks, which is also the only page that mounts the
 * claim prompt, so signing in has to come back here for the decks to be claimed.
 * @returns The sign-in link element.
 */
function SignInLink({ className }: { className?: string }) {
  return (
    <Link
      to="/login"
      search={{ redirect: "/decks", email: undefined }}
      className={cn("hover:text-foreground font-medium underline", className)}
    >
      Sign in
    </Link>
  );
}

/**
 * The "On this device" badge for a local deck, with a tooltip explaining that
 * it's browser-only and how to keep it. Used on the builder top bar and on deck
 * list rows/tiles. The Badge itself is the tooltip trigger (via `render`) so it
 * stays a span, valid inside the anchor-wrapped list rows/tiles.
 * @param className Extra classes for the badge (responsive visibility, size).
 * @returns The badge element.
 */
export function LocalDeckBadge({ className }: { className?: string }) {
  return (
    <Tooltip>
      <TooltipTrigger render={<Badge variant="secondary" className={className} />}>
        On this device
      </TooltipTrigger>
      <TooltipContent className="max-w-56 text-center">
        Saved only on this device. Sign in to keep it and use it anywhere.
      </TooltipContent>
    </Tooltip>
  );
}

/**
 * Muted one-liner for the "New deck" dialog, shown to signed-out users so they
 * know the deck they're about to create won't leave this device.
 * @returns The note element.
 */
export function LocalDeckSaveNote() {
  return (
    <p className="text-muted-foreground flex items-start gap-1.5 text-sm">
      <CloudOffIcon className="mt-0.5 size-3.5 shrink-0" />
      <span>
        You&apos;re not signed in, so this deck is saved only on this device. <SignInLink /> to keep
        it and use it anywhere.
      </span>
    </p>
  );
}

/**
 * Info banner above the deck list, shown when a signed-out visitor has one or
 * more browser-local decks that aren't backed up to an account yet.
 * @returns The banner element.
 */
export function LocalDeckSaveBanner() {
  return (
    <div className="text-muted-foreground bg-muted/40 mb-3 flex items-start gap-2 rounded-lg border px-3 py-2 text-sm">
      <CloudOffIcon className="mt-0.5 size-4 shrink-0" />
      <span>
        Your decks are saved only on this device. <SignInLink /> to keep them safe and use them on
        your other devices.
      </span>
    </div>
  );
}
