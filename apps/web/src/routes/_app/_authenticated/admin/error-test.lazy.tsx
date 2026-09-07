import { createLazyFileRoute } from "@tanstack/react-router";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { AdminPageTopBar } from "@/features/admin/components/admin-page-top-bar";

export const Route = createLazyFileRoute("/_app/_authenticated/admin/error-test")({
  component: ErrorTestPage,
});

function ErrorTestPage() {
  return (
    <div className="flex flex-col gap-4 p-6">
      <AdminPageTopBar title="Error Test" />
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
