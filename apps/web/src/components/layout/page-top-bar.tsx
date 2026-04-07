import { Link } from "@tanstack/react-router";
import { ArrowLeftIcon, ChevronDownIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface PageTopBarProps {
  children: React.ReactNode;
  className?: string;
}

/**
 * Unified top bar with consistent `bg-muted/50` styling, used by both deck and collection pages.
 * @returns The top bar container element.
 */
export function PageTopBar({ children, className }: PageTopBarProps) {
  return (
    <div
      className={cn("bg-muted/50 flex items-center gap-3 rounded-lg px-3 py-2 text-sm", className)}
    >
      {children}
    </div>
  );
}

/**
 * Back arrow linking to a parent route.
 * @returns The back arrow link element.
 */
export function PageTopBarBack({ to }: { to: string }) {
  return (
    <Link to={to} className="hover:bg-muted -ml-1 rounded-md p-1.5 transition-colors">
      <ArrowLeftIcon className="size-4" />
    </Link>
  );
}

interface PageTopBarTitleProps {
  onToggleSidebar?: () => void;
  children: React.ReactNode;
}

/**
 * Page title. On mobile, renders as a button with a chevron that toggles the sidebar.
 * On desktop, renders as static text (sidebar is always visible).
 * @returns The title element.
 */
export function PageTopBarTitle({ onToggleSidebar, children }: PageTopBarTitleProps) {
  if (onToggleSidebar) {
    return (
      <>
        <Button
          variant="ghost"
          size="sm"
          className="-ml-1 gap-1 text-sm font-medium md:hidden"
          onClick={onToggleSidebar}
        >
          {children}
          <ChevronDownIcon className="text-muted-foreground size-4" />
        </Button>
        <span className="hidden min-w-0 truncate text-sm font-semibold md:block">{children}</span>
      </>
    );
  }
  return <span className="min-w-0 truncate text-sm font-semibold">{children}</span>;
}

/**
 * Right-aligned action buttons area.
 * @returns The actions container element.
 */
export function PageTopBarActions({ children, className }: PageTopBarProps) {
  return (
    <div className={cn("ml-auto flex shrink-0 items-center gap-2", className)}>{children}</div>
  );
}
