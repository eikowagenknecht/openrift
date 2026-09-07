import { Link } from "@tanstack/react-router";
import { CloudOffIcon } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Callout } from "@/components/ui/callout";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

function SignInLink({ className }: { className?: string }) {
  return (
    <Link
      to="/login"
      // Redirect is hardcoded to /decks: this component only mounts there.
      search={{ redirect: "/decks", email: undefined }}
      className={cn("hover:text-foreground font-medium underline", className)}
    >
      Sign in
    </Link>
  );
}

// The Badge is the tooltip trigger (via `render`) so it stays a span, valid
// inside the anchor-wrapped list rows/tiles.
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

export function LocalDeckSaveBanner() {
  return (
    <Callout className="text-muted-foreground mb-3 flex items-start gap-2 px-3 py-2 text-sm">
      <CloudOffIcon className="mt-0.5 size-4 shrink-0" />
      <span>
        Your decks are saved only on this device. <SignInLink /> to keep them safe and use them on
        your other devices.
      </span>
    </Callout>
  );
}
