import { PackageIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { ExpandToggle } from "@/components/ui/expand-toggle";
import { Pressable } from "@/components/ui/pressable";

import { DemoRow, DemoSection } from "./demo-primitives";

export function PressableSection() {
  const [expanded, setExpanded] = useState(true);
  const [iconOnlyExpanded, setIconOnlyExpanded] = useState(false);
  return (
    <DemoSection
      id="pressable"
      title="Pressable & disclosure"
      note="Pressable is the unstyled-but-accessible clickable region. ExpandToggle owns aria-expanded and the rotating chevron."
    >
      <DemoRow label="Pressable (rich clickable row)">
        <Pressable
          className="hover:bg-muted/50 flex w-full max-w-sm items-center gap-3 rounded-lg border p-2"
          onClick={() => toast("Row pressed")}
        >
          <div className="bg-muted flex size-10 shrink-0 items-center justify-center rounded-md">
            <PackageIcon className="text-muted-foreground size-4" />
          </div>
          <div className="min-w-0">
            <div className="truncate font-medium">Piltover Trader</div>
            <div className="text-muted-foreground text-xs">OGN-042 · Epic</div>
          </div>
        </Pressable>
      </DemoRow>
      <DemoRow label="ExpandToggle (labeled)">
        <div className="w-full max-w-sm space-y-2">
          <ExpandToggle expanded={expanded} onClick={() => setExpanded((v) => !v)}>
            <span className="font-medium">Sideboard plan</span>
            <span className="text-muted-foreground text-xs">3 matchups</span>
          </ExpandToggle>
          {expanded && (
            <p className="text-muted-foreground pl-6 text-sm">
              Against control, bring in the burn package.
            </p>
          )}
        </div>
      </DemoRow>
      <DemoRow label="ExpandToggle (icon-only)">
        <ExpandToggle
          expanded={iconOnlyExpanded}
          onClick={() => setIconOnlyExpanded((v) => !v)}
          aria-label={iconOnlyExpanded ? "Collapse" : "Expand"}
          className="text-muted-foreground hover:text-foreground"
        />
      </DemoRow>
    </DemoSection>
  );
}
