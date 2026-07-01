import * as Sentry from "@sentry/tanstackstart-react";
import type { ErrorComponentProps } from "@tanstack/react-router";
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
