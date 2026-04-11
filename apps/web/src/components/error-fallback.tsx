import * as Sentry from "@sentry/react";
import type { ErrorComponentProps } from "@tanstack/react-router";
import type { ErrorInfo, ReactNode } from "react";
import { Component } from "react";
import { createPortal } from "react-dom";

import { EMOJIS, ErrorMessageLayout, HEADINGS, SUBTEXTS, pick } from "@/components/error-message";

export function RouterErrorFallback({ error }: ErrorComponentProps) {
  const normalizedError = error instanceof Error ? error : new Error(String(error));
  Sentry.captureException(normalizedError);
  if (typeof document === "undefined") {
    return <ErrorFallback error={normalizedError} />;
  }
  return createPortal(<ErrorFallback error={normalizedError} />, document.body);
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
    Sentry.captureException(error, { extra: { componentStack: info.componentStack } });
    console.error("Uncaught error:", error, info);
  }

  override render() {
    if (this.state.error) {
      return <ErrorFallback error={this.state.error} />;
    }
    return this.props.children;
  }
}

function ErrorFallback({ error }: { error: Error }) {
  const seed = error.message || "unknown";
  return (
    <div className="bg-background text-foreground fixed inset-0 z-50 flex items-center justify-center">
      <ErrorMessageLayout
        emoji={pick(EMOJIS, `${seed}:emoji`)}
        heading={pick(HEADINGS, `${seed}:heading`)}
        subtext={pick(SUBTEXTS, `${seed}:subtext`)}
        goHome
        reload
        devError={error.stack ?? error.message}
      />
    </div>
  );
}
