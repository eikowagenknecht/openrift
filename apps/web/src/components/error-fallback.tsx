import type { ErrorComponentProps } from "@tanstack/react-router";

import { Button, buttonVariants } from "@/components/ui/button";

export function ErrorFallback({ error, reset }: ErrorComponentProps) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 px-4 py-16 text-center">
      <div className="text-muted-foreground text-6xl">:(</div>
      <h1 className="text-xl font-semibold">Something went wrong</h1>
      <p className="text-muted-foreground max-w-md text-sm">
        An unexpected error occurred. You can try again, or go back to the home page.
      </p>
      {import.meta.env.DEV && error instanceof Error && (
        <pre className="bg-muted text-muted-foreground mt-2 max-w-lg overflow-auto rounded-md p-3 text-left text-xs">
          {error.message}
        </pre>
      )}
      <div className="mt-2 flex gap-3">
        <Button variant="outline" onClick={reset}>
          Try again
        </Button>
        <a href="/" className={buttonVariants()}>
          Go home
        </a>
      </div>
    </div>
  );
}
