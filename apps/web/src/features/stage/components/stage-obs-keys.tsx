import type { OverlayBoardDirection } from "@openrift/shared/contracts/overlay";
import type { TierRow } from "@openrift/shared/types/api/tier-list";
import { useEffect } from "react";

import {
  useOverlayChannel,
  usePushOverlayCard,
  useSetOverlayHidden,
} from "@/features/stage/hooks/use-overlay";
import { useOverlayBoardSync } from "@/features/stage/hooks/use-overlay-board-sync";
import { resolvePresentationKey } from "@/features/stage/lib/presentation-keys";
import { isTypingTarget } from "@/lib/keyboard-target";

// Mounted only while signed in: the push mutation needs a session, and the stage runs signed out.
export function StageOverlayPushKey({ printingId }: { printingId: string }) {
  const pushCard = usePushOverlayCard();
  const mutate = pushCard.mutate;

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (isTypingTarget(event.target)) {
        return;
      }
      if (resolvePresentationKey(event) !== "push") {
        return;
      }
      event.preventDefault();
      mutate({ printingId });
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [mutate, printingId]);

  return null;
}

// Reads `hidden` from the channel query, not local state.
export function StageOverlayHideKey() {
  const { data: channel } = useOverlayChannel();
  const setHidden = useSetOverlayHidden();
  const mutate = setHidden.mutate;
  const hidden = channel?.payload.hidden;

  useEffect(() => {
    if (hidden === undefined) {
      return;
    }
    const handler = (event: KeyboardEvent) => {
      if (isTypingTarget(event.target)) {
        return;
      }
      if (resolvePresentationKey(event) !== "toggleHidden") {
        return;
      }
      event.preventDefault();
      mutate({ hidden: !hidden });
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [mutate, hidden]);

  return null;
}

export interface StageObsBoard {
  title: string;
  tiers: readonly TierRow[];
  direction: OverlayBoardDirection;
  revealCount: number;
}

// Split out for the same reason as StageOverlayPushKey: the channel mutation needs a session.
export function StageObsBoardSync({
  board,
  enabled,
  paused,
}: {
  board: StageObsBoard;
  enabled: boolean;
  paused: boolean;
}) {
  useOverlayBoardSync({ enabled, paused, ...board });
  return null;
}
