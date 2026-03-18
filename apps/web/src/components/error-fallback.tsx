import type { ErrorComponentProps } from "@tanstack/react-router";
import type { ErrorInfo, ReactNode } from "react";
import { Component } from "react";
import { createPortal } from "react-dom";

import { buttonVariants } from "@/components/ui/button";
import { DEV } from "@/lib/env";

const HEADINGS = [
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

const SUBTEXTS = [
  "Someone shuffled the code wrong.",
  "We checked the binder — this page is missing.",
  "The Rift giveth, the Rift taketh away.",
  "This page fell through a Rift and didn't come back.",
  "Even mint-condition apps have bad days.",
  "We're looking into it. Probably.",
  "Something broke and it's definitely not your fault.",
  "No worries, the rest of the app is fine. Probably.",
];

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

const EMOJIS = [":(", String.raw`¯\_(ツ)_/¯`, "[MISPRINT]", "[DAMAGED]"];

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

// Router-level error component — uses a portal to break out of the layout and
// render a full-page takeover.
export function RouterErrorFallback({ error }: ErrorComponentProps) {
  return createPortal(
    <ErrorFallback error={error instanceof Error ? error : new Error(String(error))} />,
    document.body,
  );
}

// Top-level React error boundary — catches anything that escapes the router.
export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Uncaught error:", error, info);
  }

  override render() {
    if (this.state.error) {
      return <ErrorFallback error={this.state.error} />;
    }
    return this.props.children;
  }
}

// Router-level not-found component — uses a portal to break out of the layout.
export function RouterNotFoundFallback() {
  return createPortal(<NotFoundFallback />, document.body);
}

function NotFoundFallback() {
  const heading = pick(NOT_FOUND_HEADINGS);
  const subtext = pick(NOT_FOUND_SUBTEXTS);
  const emoji = pick(NOT_FOUND_EMOJIS);

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-4 bg-background px-4 text-center text-foreground">
      <div className="text-muted-foreground select-none text-4xl font-medium">{emoji}</div>
      <h1 className="text-xl font-semibold">{heading}</h1>
      <p className="text-muted-foreground max-w-md text-sm">{subtext}</p>
      <div className="mt-2 flex gap-3">
        <a href="/" className={buttonVariants()}>
          Go home
        </a>
      </div>
    </div>
  );
}

function ErrorFallback({ error }: { error: Error }) {
  const heading = pick(HEADINGS);
  const subtext = pick(SUBTEXTS);
  const emoji = pick(EMOJIS);

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-4 bg-background px-4 text-center text-foreground">
      <div className="text-muted-foreground select-none text-4xl font-medium">{emoji}</div>
      <h1 className="text-xl font-semibold">{heading}</h1>
      <p className="text-muted-foreground max-w-md text-sm">{subtext}</p>
      {DEV && (
        <pre className="bg-muted text-muted-foreground mt-2 max-w-lg overflow-auto rounded-md p-3 text-left text-xs">
          {error.message}
        </pre>
      )}
      <div className="mt-2 flex gap-3">
        <button
          type="button"
          className={buttonVariants({ variant: "outline" })}
          onClick={() => globalThis.location.reload()}
        >
          Reshuffle
        </button>
        <a href="/" className={buttonVariants()}>
          Go home
        </a>
      </div>
    </div>
  );
}
