import { Link } from "@tanstack/react-router";
import { ArrowLeftIcon, ChevronDownIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface PageTopBarProps {
  children: React.ReactNode;
  className?: string;
}

/**
 * Unified top bar, used by both deck and collection pages.
 * @returns The top bar container element.
 */
export function PageTopBar({ children, className }: PageTopBarProps) {
  return (
    <div className={cn("flex h-8 items-center rounded-lg text-sm", className)}>{children}</div>
  );
}

/**
 * Back arrow linking to a parent route.
 * @returns The back arrow link element.
 */
export function PageTopBarBack({ to }: { to: string }) {
  return (
    <Link to={to} className="hover:bg-muted rounded-md p-1.5">
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
          className="mr-2 gap-1 text-sm font-medium md:hidden"
          onClick={onToggleSidebar}
        >
          {children}
          <ChevronDownIcon className="text-muted-foreground size-4" />
        </Button>
        <span className="mr-2 hidden min-w-0 truncate px-3 text-lg font-semibold md:block">
          {children}
        </span>
      </>
    );
  }
  return <span className="mr-2 min-w-0 truncate text-lg font-semibold">{children}</span>;
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
