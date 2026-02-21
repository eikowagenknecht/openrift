import { useRegisterSW } from "virtual:pwa-register/react";

import { Button } from "@/components/ui/button";

export function ReloadPrompt() {
  const {
    offlineReady: [offlineReady, setOfflineReady],
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW();

  function close() {
    setOfflineReady(false);
    setNeedRefresh(false);
  }

  if (!offlineReady && !needRefresh) {
    return null;
  }

  return (
    <div
      className="fixed bottom-4 right-4 z-50 flex max-w-sm items-center gap-3 rounded-lg border border-border bg-card p-4 shadow-lg"
      role="status"
      aria-live="polite"
    >
      <div className="flex-1 text-sm">
        {needRefresh ? (
          <span>New content available, click reload to update</span>
        ) : (
          <span>App ready to work offline</span>
        )}
      </div>
      <div className="flex gap-2">
        {needRefresh && (
          <Button size="sm" onClick={() => updateServiceWorker(true)}>
            Reload
          </Button>
        )}
        <Button size="sm" variant="outline" onClick={close}>
          Close
        </Button>
      </div>
    </div>
  );
}
