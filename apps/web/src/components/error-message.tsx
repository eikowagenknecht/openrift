import { useRouterState } from "@tanstack/react-router";
import { useState } from "react";

import { Footer } from "@/components/layout/footer";
import { Header } from "@/components/layout/header";
import { buttonVariants } from "@/components/ui/button";
import { cn, FOOTER_PADDING_NO_TOP } from "@/lib/utils";

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

function hashString(input: string): number {
  let hash = 0;
  for (let index = 0; index < input.length; index++) {
    hash = Math.trunc(hash * 31 + (input.codePointAt(index) ?? 0));
  }
  return hash;
}

export function pick<T>(arr: T[], seed: string): T {
  return arr[Math.abs(hashString(seed)) % arr.length];
}

function DevErrorDetails({ error }: { error: string }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="mt-2 flex max-w-lg flex-col items-center gap-2">
      <button
        type="button"
        className="text-muted-foreground text-xs underline"
        onClick={() => setOpen((prev) => !prev)}
      >
        {open ? "Hide details" : "Show details"}
      </button>
      {open && (
        <pre className="bg-muted text-muted-foreground max-h-60 w-full overflow-auto rounded-md p-3 text-left text-xs break-words whitespace-pre-wrap">
          {error}
        </pre>
      )}
    </div>
  );
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
      className={cn(
        "flex flex-col items-center justify-center gap-4 px-4 py-8 text-center",
        className,
      )}
    >
      {emoji && (
        <div className="text-muted-foreground text-4xl font-medium select-none">{emoji}</div>
      )}
      <h1 className="text-2xl font-bold">{heading}</h1>
      {subtext && <p className="text-muted-foreground max-w-md text-sm">{subtext}</p>}
      {hasActions && (
        <div className="flex gap-3">
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
      {devError && <DevErrorDetails error={devError} />}
    </div>
  );
}

export function RouteErrorFallback({ error }: { error?: unknown }) {
  const message = error instanceof Error ? error.message : error ? String(error) : undefined;
  const seed = message ?? "unknown";
  return (
    <ErrorMessageLayout
      emoji={pick(EMOJIS, `${seed}:emoji`)}
      heading={pick(HEADINGS, `${seed}:heading`)}
      subtext={pick(SUBTEXTS, `${seed}:subtext`)}
      className="flex-1"
      reload
      devError={message}
    />
  );
}

/**
 * Not-found fallback without Header/Footer — used as the router-level default.
 * @returns Not-found UI
 */
export function NotFoundFallback() {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  return (
    <ErrorMessageLayout
      emoji={pick(NOT_FOUND_EMOJIS, `${pathname}:emoji`)}
      heading={pick(NOT_FOUND_HEADINGS, `${pathname}:heading`)}
      subtext={pick(NOT_FOUND_SUBTEXTS, `${pathname}:subtext`)}
      className="flex-1"
      goHome
    />
  );
}

/**
 * Not-found fallback with Header/Footer — used on the root route.
 * @returns Not-found page
 */
export function RouteNotFoundFallback() {
  return (
    <>
      <Header />
      <NotFoundFallback />
      <Footer className={FOOTER_PADDING_NO_TOP} />
    </>
  );
}
