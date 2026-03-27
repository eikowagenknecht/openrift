import type { ErrorComponentProps } from "@tanstack/react-router";
import type { ErrorInfo, ReactNode } from "react";
import { Component } from "react";
import { createPortal } from "react-dom";

import { EMOJIS, ErrorMessageLayout, HEADINGS, SUBTEXTS, pick } from "@/components/error-message";

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

function ErrorFallback({ error }: { error: Error }) {
  return (
    <div className="bg-background text-foreground fixed inset-0 z-50 flex items-center justify-center">
      <ErrorMessageLayout
        emoji={pick(EMOJIS)}
        heading={pick(HEADINGS)}
        subtext={pick(SUBTEXTS)}
        goHome
        reload
        devError={error.stack ?? error.message}
      />
    </div>
  );
}
