import { SearchIcon } from "lucide-react";

import { Input } from "@/components/ui/input";
import { useSearchUrlSync } from "@/hooks/use-search-url-sync";
import { cn } from "@/lib/utils";

/**
 * Search input whose local state lives inside this small component, so every
 * keystroke only re-renders the input itself — not the parent table with its
 * potentially thousands of rows. The debounced value commits to the URL via
 * `onCommit`, at which point the parent re-renders for a new filtered set.
 * @returns A debounced search input with a leading magnifier icon.
 */
export function DebouncedSearchInput({
  urlValue,
  onCommit,
  placeholder,
  className,
}: {
  urlValue: string;
  onCommit: (value: string) => void;
  placeholder: string;
  className?: string;
}) {
  const [searchInput, setSearchInput] = useSearchUrlSync({ urlValue, onCommit });
  return (
    <div className="relative">
      <SearchIcon className="text-muted-foreground absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2" />
      <Input
        placeholder={placeholder}
        value={searchInput}
        onChange={(e) => setSearchInput(e.target.value)}
        className={cn("h-8 pl-8 text-sm", className)}
      />
    </div>
  );
}
