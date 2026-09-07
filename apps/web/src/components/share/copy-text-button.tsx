import { CheckIcon, CopyIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useCopyToClipboard } from "@/hooks/use-copy-to-clipboard";

interface CopyTextButtonProps {
  label: string;
  getText: () => string | Promise<string>;
  /** Keeps line breaks intact through iOS Safari's clipboard. */
  normalizeLineBreaks?: boolean;
  size?: "default" | "sm";
}

/**
 * A copy button with its own inline "Copied" feedback. Each instance holds
 * its own feedback state, so several can sit side by side without sharing a
 * checkmark.
 */
export function CopyTextButton({
  label,
  getText,
  normalizeLineBreaks = true,
  size = "default",
}: CopyTextButtonProps) {
  const { copied, copy } = useCopyToClipboard();

  const handleCopy = async () => {
    let text: string;
    try {
      text = await getText();
    } catch {
      return;
    }
    const payload = normalizeLineBreaks ? text.replaceAll("\n", "\r\n") : text;
    await copy(payload);
  };

  return (
    <Button variant="outline" size={size} onClick={() => void handleCopy()}>
      {copied ? <CheckIcon /> : <CopyIcon />}
      {copied ? "Copied" : label}
    </Button>
  );
}
