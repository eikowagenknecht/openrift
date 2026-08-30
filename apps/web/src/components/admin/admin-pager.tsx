import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { getPageItems } from "@/lib/paginate";

/**
 * The numbered pager for a server-paged admin table. Renders nothing on a
 * single-page result, so a caller can mount it unconditionally.
 *
 * @returns The pager, or null when there is only one page.
 */
export function AdminPager({
  page,
  totalPages,
  onPageChange,
  label,
}: {
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  /** Names the navigation landmark, e.g. "Catalogue pages". */
  label: string;
}) {
  if (totalPages <= 1) {
    return null;
  }
  const items = getPageItems(page, totalPages);
  return (
    <nav className="flex items-center justify-center gap-1" aria-label={label}>
      <Button
        variant="outline"
        size="icon"
        className="size-8"
        disabled={page <= 1}
        onClick={() => onPageChange(page - 1)}
        aria-label="Previous page"
      >
        <ChevronLeftIcon className="size-4" />
      </Button>
      {items.map((item, index) =>
        item === "ellipsis" ? (
          <span key={`ellipsis-${index}`} className="text-muted-foreground px-1.5">
            …
          </span>
        ) : (
          <Button
            key={item}
            variant={item === page ? "default" : "outline"}
            size="icon"
            className="size-8 font-mono"
            aria-current={item === page ? "page" : undefined}
            onClick={() => onPageChange(item)}
          >
            {item}
          </Button>
        ),
      )}
      <Button
        variant="outline"
        size="icon"
        className="size-8"
        disabled={page >= totalPages}
        onClick={() => onPageChange(page + 1)}
        aria-label="Next page"
      >
        <ChevronRightIcon className="size-4" />
      </Button>
    </nav>
  );
}
