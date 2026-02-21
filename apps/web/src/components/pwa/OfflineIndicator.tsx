import { WifiOff } from "lucide-react";

import { useOnlineStatus } from "@/hooks/use-online-status";

export function OfflineIndicator() {
  const isOnline = useOnlineStatus();

  if (isOnline) {
    return null;
  }

  return (
    <div
      className="fixed bottom-16 right-4 z-50 flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm text-muted-foreground shadow-lg"
      role="status"
      aria-live="polite"
    >
      <WifiOff className="size-4" />
      <span>You're offline</span>
    </div>
  );
}
