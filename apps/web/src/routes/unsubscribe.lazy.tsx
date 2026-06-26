import { unsubscribeContract } from "@openrift/shared/contracts";
import { createLazyFileRoute, Link } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { apiOrpcClient } from "@/lib/server-fns/orpc-client";

const confirmUnsubscribeFn = createServerFn({ method: "POST" })
  .validator((token: string) => token)
  .handler(({ data }) => apiOrpcClient(unsubscribeContract).confirm({ token: data }));

export const Route = createLazyFileRoute("/unsubscribe")({
  component: UnsubscribePage,
});

// Centered, app-shell-free card for this standalone email-landing page.
function Shell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center p-3">
      <div className="w-full max-w-md">
        <Link to="/" className="text-primary mb-4 inline-block text-lg font-bold">
          OpenRift
        </Link>
        <Card>
          <CardContent className="flex flex-col items-start gap-4 p-6 text-left">
            <h1 className="font-semibold">{title}</h1>
            {children}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function UnsubscribePage() {
  const preview = Route.useLoaderData();
  const { token } = Route.useSearch();
  const [status, setStatus] = useState<"idle" | "submitting" | "done" | "error">("idle");
  // The success label comes from the confirm response; before that, fall back to
  // the preview's label so the prompt reads correctly.
  const [doneLabel, setDoneLabel] = useState<string | null>(null);

  async function handleConfirm() {
    setStatus("submitting");
    try {
      const result = await confirmUnsubscribeFn({ data: token });
      setDoneLabel(result.channelLabel);
      setStatus("done");
    } catch {
      setStatus("error");
    }
  }

  if (!preview.valid) {
    return (
      <Shell title="Link not valid">
        <p className="text-muted-foreground text-sm">
          This unsubscribe link is invalid or has expired. Nothing was changed. You can manage email
          notifications anytime in your profile.
        </p>
        <Button render={<Link to="/" />}>Go to OpenRift</Button>
      </Shell>
    );
  }

  if (status === "done") {
    return (
      <Shell title="You're unsubscribed">
        <p className="text-muted-foreground text-sm">
          You&apos;ll no longer receive {doneLabel ?? preview.channelLabel}. You can turn this back
          on anytime in your OpenRift profile.
        </p>
        <Button render={<Link to="/" />}>Go to OpenRift</Button>
      </Shell>
    );
  }

  if (preview.alreadyUnsubscribed) {
    return (
      <Shell title="Already unsubscribed">
        <p className="text-muted-foreground text-sm">
          You&apos;re already unsubscribed from {preview.channelLabel}. You can turn it back on
          anytime in your OpenRift profile.
        </p>
        <Button render={<Link to="/" />}>Go to OpenRift</Button>
      </Shell>
    );
  }

  return (
    <Shell title="Unsubscribe?">
      <p className="text-muted-foreground text-sm">
        Stop receiving {preview.channelLabel}? You can turn it back on anytime in your OpenRift
        profile.
      </p>
      {status === "error" && (
        <p className="text-destructive text-sm">Something went wrong. Please try again.</p>
      )}
      <div className="flex items-center gap-3">
        <Button onClick={handleConfirm} disabled={status === "submitting"}>
          {status === "submitting" ? "Unsubscribing…" : "Unsubscribe"}
        </Button>
        <Link to="/" className="text-muted-foreground text-sm hover:underline">
          Keep my subscription
        </Link>
      </div>
    </Shell>
  );
}
