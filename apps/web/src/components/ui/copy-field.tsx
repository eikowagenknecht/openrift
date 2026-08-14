import { CheckIcon, CopyIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useCopyToClipboard } from "@/hooks/use-copy-to-clipboard";
import { cn } from "@/lib/utils";

// Hand-authored primitive (not shadcn-scaffolded).
//
// The generic form of the row ShareLinkRow builds for share links: a read-only
// value plus a Copy button that confirms inline. Use this for anything else
// meant to be copied verbatim — a chat-bot command, a code, a snippet. Share
// links keep going through ShareLinkRow, which adds the QR affordance on top.

interface CopyFieldProps {
  /** The text shown and copied. */
  value: string;
  /** Accessible name for the read-only field, e.g. "Nightbot command". */
  label: string;
  /**
   * Monospace the value. For anything the user reads character by character
   * before pasting it somewhere that cares (commands, codes, URLs).
   */
  mono?: boolean;
  className?: string;
}

/**
 * A read-only value with a Copy button.
 *
 * The value stays selectable, so a denied clipboard write (insecure context,
 * Safari losing the gesture window) still leaves the user a way to copy it by
 * hand — which is why the failure is swallowed rather than surfaced.
 *
 * @returns The copy row.
 */
export function CopyField({ value, label, mono = false, className }: CopyFieldProps) {
  const { copied, copy } = useCopyToClipboard();

  return (
    <div className={cn("flex items-center gap-2", className)}>
      <Input
        value={value}
        readOnly
        aria-label={label}
        className={cn("min-w-0 flex-1", mono && "font-mono text-sm")}
        onFocus={(event) => event.currentTarget.select()}
      />
      <Button variant="outline" onClick={() => void copy(value)}>
        {copied ? <CheckIcon /> : <CopyIcon />}
        {copied ? "Copied" : "Copy"}
      </Button>
    </div>
  );
}
