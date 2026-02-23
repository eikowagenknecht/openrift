import { Button } from "@/components/ui/button";
import { useSWUpdate } from "@/hooks/use-sw-update";

export function ReloadPrompt() {
  const { needRefresh, dismiss, applyUpdate } = useSWUpdate();

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
        <Button size="sm" onClick={() => applyUpdate()}>
          Reload
        </Button>
        <Button size="sm" variant="outline" onClick={dismiss}>
          Close
        </Button>
      </div>
    </div>
  );
}
