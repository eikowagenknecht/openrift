import { CheckIcon, LoaderIcon } from "lucide-react";

import { Progress } from "@/components/ui/progress";
import type { ResourceProgress } from "@/hooks/use-scan-engine";

function formatMb(bytes: number): string {
  return `${(bytes / 1_048_576).toFixed(1)} MB`;
}

interface ScanLoadRowProps {
  label: string;
  done: boolean;
  /** Byte progress, for the resources that report it. */
  progress?: ResourceProgress;
}

/**
 * One line of the engine loading screen: a resource's name, its download
 * progress while it has one, and a check once it is ready.
 *
 * @returns The load row element.
 */
export function ScanLoadRow({ label, done, progress }: ScanLoadRowProps) {
  let detail: string | null = null;
  let percent: number | null = null;
  if (!done && progress) {
    if (progress.total > 0 && progress.loaded >= progress.total) {
      // Fully downloaded but not ready yet: wasm compilation or session setup.
      detail = "starting…";
      percent = 100;
    } else if (progress.total > 0) {
      detail = `${formatMb(progress.loaded)} / ${formatMb(progress.total)}`;
      percent = (100 * progress.loaded) / progress.total;
    } else if (progress.loaded > 0) {
      detail = formatMb(progress.loaded);
    }
  }
  return (
    <div className="w-64 max-w-full">
      <div className="flex items-center gap-2">
        {done ? (
          <CheckIcon className="size-4 shrink-0 text-green-500" />
        ) : (
          <LoaderIcon className="size-4 shrink-0 animate-spin" />
        )}
        {/* Colours are inherited, not pinned: these rows also run on the dark
            plate of the pre-start panel, where `text-foreground` would be
            invisible in the light theme. */}
        <span className="flex-1 text-left">{label}</span>
        {detail !== null && <span className="text-sm tabular-nums opacity-70">{detail}</span>}
      </div>
      {percent !== null && <Progress value={percent} className="mt-1.5" />}
    </div>
  );
}
