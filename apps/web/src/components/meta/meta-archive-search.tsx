import { SearchIcon } from "lucide-react";

import { Input } from "@/components/ui/input";
import { useSearchUrlSync } from "@/hooks/use-search-url-sync";
import { cn } from "@/lib/utils";

/**
 * The archive's free-text field, sitting on the same row as the scope bar and
 * matching its control height. Local state keeps typing instant; the debounced
 * value lands in the URL, which is what the lists narrow from.
 */
export function MetaArchiveSearch({
  value,
  onCommit,
  className,
}: {
  value: string;
  onCommit: (next: string) => void;
  className?: string;
}) {
  const [typed, setTyped] = useSearchUrlSync({ urlValue: value, onCommit });

  return (
    <div className={cn("relative min-w-52 flex-1", className)}>
      <SearchIcon
        aria-hidden
        className="text-muted-foreground absolute top-1/2 left-2.5 size-4 -translate-y-1/2"
      />
      <Input
        type="search"
        aria-label="Search the archive"
        placeholder="Search events, venues, organizers…"
        value={typed}
        onChange={(event) => setTyped(event.target.value)}
        className="pl-8"
      />
    </div>
  );
}
