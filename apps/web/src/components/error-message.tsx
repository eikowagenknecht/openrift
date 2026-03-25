import { Header } from "@/components/layout/header";
import { buttonVariants } from "@/components/ui/button";
import { DEV } from "@/lib/env";
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

const NOT_FOUND_HEADINGS = [
  "Nothing here but dust",
  "This card was never printed",
  "Lost in the Rift",
  "Page not found",
  "You've wandered off the map",
  "This page doesn't exist",
  "No card at this address",
  "The Rift has no record of this",
];

const NOT_FOUND_SUBTEXTS = [
  "Whatever was here, it's gone now.",
  "Double-check the URL or head back to safety.",
  "This page isn't in any set we know of.",
  "Maybe it was here once, maybe it never was.",
  "Even the best collectors come up empty sometimes.",
  "The URL looks wrong — or the page was removed.",
];

const NOT_FOUND_EMOJIS = ["?", "404", "[MISSING]", String.raw`¯\_(ツ)_/¯`];

export function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

export function ErrorMessageLayout({
  emoji,
  heading,
  subtext,
  className,
  goHome,
  reload,
  devError,
}: {
  emoji?: string;
  heading: string;
  subtext?: string;
  className?: string;
  goHome?: boolean;
  reload?: boolean;
  devError?: string;
}) {
  const hasActions = goHome || reload;

  return (
    <div
      className={cn("flex flex-col items-center justify-center gap-4 px-4 text-center", className)}
    >
      {emoji && (
        <div className="text-muted-foreground select-none text-4xl font-medium">{emoji}</div>
      )}
      <h1 className="text-xl font-semibold">{heading}</h1>
      {subtext && <p className="text-muted-foreground max-w-md text-sm">{subtext}</p>}
      {DEV && devError && (
        <pre className="bg-muted text-muted-foreground mt-2 max-w-lg overflow-auto rounded-md p-3 text-left text-xs">
          {devError}
        </pre>
      )}
      {hasActions && (
        <div className="mt-2 flex gap-3">
          {goHome && (
            <a href="/" className={buttonVariants()}>
              Go home
            </a>
          )}
          {reload && (
            <button
              type="button"
              className={buttonVariants({ variant: goHome ? "outline" : "default" })}
              onClick={() => globalThis.location.reload()}
            >
              Reshuffle
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export function RouteErrorFallback({ error }: { error?: unknown }) {
  const message = error instanceof Error ? error.message : error ? String(error) : undefined;
  return (
    <ErrorMessageLayout
      emoji={pick(EMOJIS)}
      heading={pick(HEADINGS)}
      subtext={pick(SUBTEXTS)}
      className="flex-1"
      reload
      devError={message}
    />
  );
}

export function RouteNotFoundFallback() {
  return (
    <>
      <Header />
      <ErrorMessageLayout
        emoji={pick(NOT_FOUND_EMOJIS)}
        heading={pick(NOT_FOUND_HEADINGS)}
        subtext={pick(NOT_FOUND_SUBTEXTS)}
        className="flex-1"
        goHome
      />
    </>
  );
}
