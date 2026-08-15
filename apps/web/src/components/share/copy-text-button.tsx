import { CheckIcon, CopyIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useCopyToClipboard } from "@/hooks/use-copy-to-clipboard";

interface CopyTextButtonProps {
  /** Button label, e.g. "Copy text" or "Copy for Cardmarket". */
  label: string;
  /**
   * Produces the text to copy when clicked. May be async (e.g. a price lookup
   * feeding the text); a rejection leaves the button idle rather than toasting,
   * since the surrounding surface always offers another way to the content.
   */
  getText: () => string | Promise<string>;
  /**
   * Rewrites `\n` to `\r\n` before copying, which is what keeps line breaks
   * intact through iOS Safari's clipboard. On by default; turn off only for
   * single-line payloads where the rewrite is pure noise.
   */
  normalizeLineBreaks?: boolean;
  size?: "default" | "sm";
}

/**
 * A copy button with its own inline "Copied" feedback, for copying a computed
 * block of text (deck lists, Cardmarket wants, share blurbs). Each instance
 * holds its own feedback state, so several can sit side by side without
 * sharing a checkmark.
 *
 * @returns The copy button.
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
      // Text production failed (e.g. prices unavailable); stay idle.
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
