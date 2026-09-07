import { SearchIcon } from "lucide-react";

import { Input } from "@/components/ui/input";
import { useSearchUrlSync } from "@/features/cards/hooks/use-search-url-sync";
import { cn } from "@/lib/utils";

// State lives here, not lifted, so each keystroke re-renders only this input
// and not the parent table with its potentially thousands of rows.
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
