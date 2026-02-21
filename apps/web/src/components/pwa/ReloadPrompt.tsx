import { useRegisterSW } from "virtual:pwa-register/react";

import { Button } from "@/components/ui/button";

// Poll for SW updates every 60 s so iOS picks up new deploys without
// requiring the user to fully close and reopen the app twice.
const UPDATE_INTERVAL_MS = 60_000;

export function ReloadPrompt() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegistered(registration) {
      if (!registration) {
        return;
      }
      setInterval(() => {
        void registration.update();
      }, UPDATE_INTERVAL_MS);
    },
  });

  if (!needRefresh) {
    return null;
  }

  return (
    <div
      className="fixed bottom-4 right-4 z-50 flex max-w-sm items-center gap-3 rounded-lg border border-border bg-card p-4 shadow-lg"
      role="status"
      aria-live="polite"
    >
      <div className="flex-1 text-sm">
        <span>New content available, click reload to update</span>
      </div>
      <div className="flex gap-2">
        <Button size="sm" onClick={() => updateServiceWorker(true)}>
          Reload
        </Button>
        <Button size="sm" variant="outline" onClick={() => setNeedRefresh(false)}>
          Close
        </Button>
      </div>
    </div>
  );
}
