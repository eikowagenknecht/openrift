import type { ErrorComponentProps } from "@tanstack/react-router";
import type { ErrorInfo, ReactNode } from "react";
import { Component } from "react";
import { createPortal } from "react-dom";

import {
  EMOJIS,
  HEADINGS,
  MessageLayout,
  NOT_FOUND_EMOJIS,
  NOT_FOUND_HEADINGS,
  NOT_FOUND_SUBTEXTS,
  SUBTEXTS,
  pick,
} from "@/components/error-message";
import { buttonVariants } from "@/components/ui/button";
import { DEV } from "@/lib/env";

/**
 * Router-level error component — uses a portal to break out of the layout and
 * render a full-page takeover.
 * @returns A portal-rendered error fallback.
 */
export function RouterErrorFallback({ error }: ErrorComponentProps) {
  return createPortal(
    <ErrorFallback error={error instanceof Error ? error : new Error(String(error))} />,
    document.body,
  );
}

/** Top-level React error boundary — catches anything that escapes the router. */
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

/**
 * Router-level not-found component — uses a portal to break out of the layout.
 * @returns A portal-rendered not-found fallback.
 */
export function RouterNotFoundFallback() {
  return createPortal(<NotFoundFallback />, document.body);
}

function FullPageWrapper({ children }: { children: ReactNode }) {
  return <div className="fixed inset-0 z-50 bg-background text-foreground">{children}</div>;
}

function NotFoundFallback() {
  return (
    <FullPageWrapper>
      <MessageLayout
        emoji={pick(NOT_FOUND_EMOJIS)}
        heading={pick(NOT_FOUND_HEADINGS)}
        subtext={pick(NOT_FOUND_SUBTEXTS)}
        className="h-full"
      >
        <div className="mt-2 flex gap-3">
          <a href="/" className={buttonVariants()}>
            Go home
          </a>
        </div>
      </MessageLayout>
    </FullPageWrapper>
  );
}

function ErrorFallback({ error }: { error: Error }) {
  return (
    <FullPageWrapper>
      <MessageLayout
        emoji={pick(EMOJIS)}
        heading={pick(HEADINGS)}
        subtext={pick(SUBTEXTS)}
        className="h-full"
      >
        {DEV && (
          <pre className="bg-muted text-muted-foreground mt-2 max-w-lg overflow-auto rounded-md p-3 text-left text-xs">
            {error.message}
          </pre>
        )}
        <div className="mt-2 flex gap-3">
          <a href="/" className={buttonVariants()}>
            Go home
          </a>
          <button
            type="button"
            className={buttonVariants({ variant: "outline" })}
            onClick={() => globalThis.location.reload()}
          >
            Reshuffle
          </button>
        </div>
      </MessageLayout>
    </FullPageWrapper>
  );
}
