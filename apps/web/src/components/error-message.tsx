import type { ReactNode } from "react";

import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const HEADINGS = [
  "The Rift collapsed",
  "Critical misprint detected",
  "This page pulled a blank",
  "Shuffled into the void",
  "Well, that wasn't supposed to happen",
  "We drew a bug",
  "Something broke (no, you can't grade it)",
  "That's not ideal",
  "Yeah, that's a bug",
];

export const SUBTEXTS = [
  "Someone shuffled the code wrong.",
  "We checked the binder — this page is missing.",
  "The Rift giveth, the Rift taketh away.",
  "This page fell through a Rift and didn't come back.",
  "Even mint-condition apps have bad days.",
  "We're looking into it. Probably.",
  "Something broke and it's definitely not your fault.",
  "No worries, the rest of the app is fine. Probably.",
];

export const EMOJIS = [":(", String.raw`¯\_(ツ)_/¯`, "[MISPRINT]", "[DAMAGED]"];

export const NOT_FOUND_HEADINGS = [
  "Nothing here but dust",
  "This card was never printed",
  "Lost in the Rift",
  "Page not found",
  "You've wandered off the map",
  "This page doesn't exist",
  "No card at this address",
  "The Rift has no record of this",
];

export const NOT_FOUND_SUBTEXTS = [
  "Whatever was here, it's gone now.",
  "Double-check the URL or head back to safety.",
  "This page isn't in any set we know of.",
  "Maybe it was here once, maybe it never was.",
  "Even the best collectors come up empty sometimes.",
  "The URL looks wrong — or the page was removed.",
];

export const NOT_FOUND_EMOJIS = ["?", "404", "[MISSING]", String.raw`¯\_(ツ)_/¯`];

export function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

export function MessageLayout({
  emoji,
  heading,
  subtext,
  className,
  children,
}: {
  emoji?: string;
  heading: string;
  subtext?: string;
  className?: string;
  children?: ReactNode;
}) {
  return (
    <div
      className={cn("flex flex-col items-center justify-center gap-4 px-4 text-center", className)}
    >
      {emoji && (
        <div className="text-muted-foreground select-none text-4xl font-medium">{emoji}</div>
      )}
      <h1 className="text-xl font-semibold">{heading}</h1>
      {subtext && <p className="text-muted-foreground max-w-md text-sm">{subtext}</p>}
      {children}
    </div>
  );
}

export function InlineError(props: { centered: true } | { centered?: false; message?: string }) {
  if (props.centered) {
    return (
      <MessageLayout
        emoji={pick(EMOJIS)}
        heading={pick(HEADINGS)}
        subtext={pick(SUBTEXTS)}
        className="flex-1"
      >
        <div className="mt-2 flex gap-3">
          <button
            type="button"
            className={buttonVariants({ variant: "outline" })}
            onClick={() => globalThis.location.reload()}
          >
            Reload
          </button>
        </div>
      </MessageLayout>
    );
  }

  return <p className="p-4 text-sm text-destructive">{props.message ?? "Failed to load."}</p>;
}
