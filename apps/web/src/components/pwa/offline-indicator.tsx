import { WifiOff } from "lucide-react";
import { useEffect } from "react";
import { toast } from "sonner";

import { useOnlineStatus } from "@/hooks/use-online-status";

export function OfflineIndicator() {
  const isOnline = useOnlineStatus();

  useEffect(() => {
    if (isOnline) {
      toast.dismiss("offline-status");
    } else {
      toast.warning("You're offline", {
        id: "offline-status",
        duration: Infinity,
        icon: <WifiOff className="size-4" />,
      });
    }
  }, [isOnline]);

  return null;
}
