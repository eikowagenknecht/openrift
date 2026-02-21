import { Download } from "lucide-react";

import { Button } from "@/components/ui/button";
import { usePwaInstall } from "@/hooks/use-pwa-install";

export function InstallButton() {
  const { canInstall, install } = usePwaInstall();

  if (!canInstall) {
    return null;
  }

  return (
    <Button variant="ghost" size="icon" onClick={install} aria-label="Install app">
      <Download className="size-5" />
    </Button>
  );
}
