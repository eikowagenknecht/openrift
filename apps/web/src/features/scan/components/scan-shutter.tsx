import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";

interface ScanShutterProps {
  icon: ReactNode;
  label: string;
  disabled?: boolean;
  onClick: () => void;
}

export function ScanShutter({ icon, label, disabled, onClick }: ScanShutterProps) {
  return (
    <div className="flex flex-col items-center gap-1">
      <Button
        size="icon"
        className="size-18 rounded-full [clip-path:none] [&_svg:not([class*='size-'])]:size-7"
        disabled={disabled}
        onClick={onClick}
        aria-label={label}
      >
        {icon}
      </Button>
      <span className="text-sm text-white/80">{label}</span>
    </div>
  );
}
