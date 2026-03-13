import { createLazyFileRoute } from "@tanstack/react-router";
import { useState } from "react";

import { Button } from "@/components/ui/button";

export const Route = createLazyFileRoute("/_authenticated/admin/error-test")({
  component: ErrorTestPage,
});

function ErrorTestPage() {
  return (
    <div className="flex flex-col gap-4 p-6">
      <h1 className="text-xl font-semibold">Error boundary test</h1>
      <p className="text-muted-foreground text-sm">
        Click the button to throw during render, which triggers the error boundary.
      </p>
      <div className="flex gap-3">
        <RenderBomb />
      </div>
    </div>
  );
}

function RenderBomb() {
  const [shouldThrow, setShouldThrow] = useState(false);

  if (shouldThrow) {
    throw new Error("Test error: thrown during render");
  }

  return (
    <Button variant="destructive" onClick={() => setShouldThrow(true)}>
      Trigger error
    </Button>
  );
}
