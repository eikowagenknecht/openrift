import { CheckIcon, Share2Icon } from "lucide-react";
import { toast } from "sonner";

import { PageTopBarButton } from "@/components/layout/page-top-bar";
import { useCopyToClipboard } from "@/hooks/use-copy-to-clipboard";

export function ShareLinkButton({ cardName }: { cardName: string }) {
  const { copied, copy } = useCopyToClipboard();

  const handleShare = async () => {
    if (typeof globalThis === "undefined" || !globalThis.location) {
      return;
    }
    const url = globalThis.location.href;

    if (typeof navigator.share === "function") {
      try {
        await navigator.share({ title: cardName, url });
        return;
      } catch (error) {
        // AbortError: user dismissed the share sheet; stay silent.
        if (error instanceof Error && error.name === "AbortError") {
          return;
        }
      }
    }

    if (await copy(url)) {
      toast.success("Link copied");
    } else {
      toast.error("Could not copy link");
    }
  };

  return (
    <PageTopBarButton onClick={() => void handleShare()} aria-label="Share link">
      {copied ? <CheckIcon className="size-4" /> : <Share2Icon className="size-4" />}
      Share
    </PageTopBarButton>
  );
}
