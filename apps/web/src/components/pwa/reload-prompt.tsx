import { useEffect } from "react";
import { toast } from "sonner";

import { useSWUpdate } from "@/hooks/use-sw-update";

export function ReloadPrompt() {
  const { needRefresh, applyUpdate } = useSWUpdate();

  useEffect(() => {
    if (needRefresh) {
      toast("New content available, click reload to update", {
        id: "sw-update",
        duration: Infinity,
        action: { label: "Reload", onClick: () => applyUpdate() },
        cancel: {
          label: "Dismiss",
          onClick: () => toast.dismiss("sw-update"),
        },
      });
    } else {
      toast.dismiss("sw-update");
    }
  }, [needRefresh, applyUpdate]);

  return null;
}
