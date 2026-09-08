import type { ReactNode } from "react";
import { useEffect, useState } from "react";

import { PresentationFilmstrip } from "@/features/stage/components/presentation-filmstrip";
import { PresentationHelpSheet } from "@/features/stage/components/presentation-help-sheet";
import type { StageObsBoard } from "@/features/stage/components/stage-obs-keys";
import {
  StageObsBoardSync,
  StageOverlayHideKey,
  StageOverlayPushKey,
} from "@/features/stage/components/stage-obs-keys";
import type { StageEditControls } from "@/features/stage/components/stage-settings";
import { StageSettings } from "@/features/stage/components/stage-settings";
import { StageShell } from "@/features/stage/components/stage-shell";
import {
  BOARD_ACTIONS,
  ownsSpaceKey,
  resolvePresentationKey,
  WALK_ACTIONS,
} from "@/features/stage/lib/presentation-keys";
import type { PresentationItem } from "@/features/stage/lib/presentation-queue";
import { stepIndex } from "@/features/stage/lib/presentation-queue";
import { usePresentationStore } from "@/features/stage/stores/presentation-store";
import { useUserId } from "@/lib/auth-session";
import { isTypingTarget } from "@/lib/keyboard-target";

export function PresentationStage({
  items,
  index,
  onIndexChange,
  onExit,
  exitLabel,
  title,
  boardControls = false,
  obsBoard,
  edit,
  children,
}: {
  items: PresentationItem[];
  index: number;
  onIndexChange: (index: number) => void;
  onExit: () => void;
  exitLabel?: string;
  title?: string;
  boardControls?: boolean;
  obsBoard?: StageObsBoard;
  edit?: StageEditControls;
  children: ReactNode;
}) {
  const showStrip = usePresentationStore((state) => state.showStrip);
  const showHelp = usePresentationStore((state) => state.showHelp);
  const userId = useUserId();
  // Deliberately not in the presentation store: a restored "mirroring" flag would put
  // a board from a previous session on stream the moment this one opened.
  const [obsBoardOn, setObsBoardOn] = useState(false);

  const editing = edit?.editing === true;
  const current = items[index];
  const obsAvailable = obsBoard !== undefined && userId !== null;

  const handleEscape = () => {
    const store = usePresentationStore.getState();
    if (store.showHelp) {
      store.closeHelp();
      return;
    }
    onExit();
  };

  const toggleEdit = edit?.onToggle;

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (isTypingTarget(event.target)) {
        return;
      }
      if (event.key === " " && ownsSpaceKey(event.target)) {
        return;
      }
      const action = resolvePresentationKey(event);
      if (action === null || action === "exit") {
        // Escape belongs to the shell.
        return;
      }
      if (!boardControls && BOARD_ACTIONS.has(action)) {
        return;
      }
      // Handed back so arrows still scroll an oversized board while editing.
      if (editing && WALK_ACTIONS.has(action)) {
        return;
      }
      // Handled by StageOverlayPushKey / StageOverlayHideKey, mounted only while signed in;
      // swallowing here would make the keys dead even when signed in.
      if (action === "push" || action === "toggleHidden") {
        return;
      }
      if (action === "toggleObs") {
        if (!obsAvailable) {
          return;
        }
        event.preventDefault();
        setObsBoardOn((on) => !on);
        return;
      }
      if (action === "toggleEdit") {
        if (toggleEdit === undefined) {
          return;
        }
        event.preventDefault();
        toggleEdit();
        return;
      }
      event.preventDefault();
      const store = usePresentationStore.getState();
      switch (action) {
        case "next": {
          onIndexChange(stepIndex(index, items.length, 1));
          break;
        }
        case "prev": {
          onIndexChange(stepIndex(index, items.length, -1));
          break;
        }
        case "first": {
          onIndexChange(0);
          break;
        }
        case "last": {
          onIndexChange(Math.max(items.length - 1, 0));
          break;
        }
        case "toggleText": {
          store.toggleText();
          break;
        }
        case "toggleStrip": {
          store.toggleStrip();
          break;
        }
        case "toggleHelp": {
          store.toggleHelp();
          break;
        }
        case "toggleBoard": {
          store.toggleBoard();
          break;
        }
        case "toggleHero": {
          store.toggleHero();
          break;
        }
        case "toggleRank": {
          store.toggleRank();
          break;
        }
        case "toggleReveal": {
          store.toggleReveal();
          break;
        }
        case "toggleDirection": {
          store.toggleDirection();
          break;
        }
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [boardControls, editing, index, items.length, obsAvailable, onIndexChange, toggleEdit]);

  const empty = !current && !editing;

  // The queue position only means something on a walk; editing shows the save state instead.
  let marker: ReactNode;
  if (editing) {
    marker = edit?.status;
  } else if (!empty) {
    marker = (
      <>
        {current?.contextLabel ? `${current.contextLabel} · ` : ""}
        {index + 1} / {items.length}
      </>
    );
  }

  return (
    <>
      {userId !== null && current && !editing && (
        <StageOverlayPushKey printingId={current.printing.id} />
      )}
      {userId !== null && <StageOverlayHideKey />}
      {/* Always mounted when a board exists; enabled/paused control the sync, so editing
          pauses the mirror without dropping what's already on stream. */}
      {obsBoard !== undefined && userId !== null && (
        <StageObsBoardSync board={obsBoard} enabled={obsBoardOn} paused={editing} />
      )}
      <StageShell
        onExit={onExit}
        exitLabel={exitLabel}
        onEscape={handleEscape}
        settings={
          <StageSettings
            boardControls={boardControls}
            obs={
              obsAvailable
                ? { enabled: obsBoardOn, onToggle: () => setObsBoardOn(!obsBoardOn) }
                : undefined
            }
            edit={edit}
          />
        }
        title={
          <>
            {title && <div className="text-sm text-white/50">{title}</div>}
            {marker !== undefined && (
              <div className="font-mono text-sm tracking-widest text-white/70 uppercase tabular-nums">
                {marker}
              </div>
            )}
          </>
        }
        footer={
          showStrip && !editing && !empty ? (
            <PresentationFilmstrip items={items} index={index} onSelect={onIndexChange} />
          ) : null
        }
        hint="Press ? for keys"
        overlay={
          showHelp ? (
            <PresentationHelpSheet
              boardControls={boardControls}
              pushControls={userId !== null}
              obsControls={obsAvailable}
              editControls={edit !== undefined}
              editing={editing}
            />
          ) : null
        }
      >
        {empty ? (
          <div className="flex flex-1 items-center justify-center p-8 text-center text-white/50">
            {edit ? "Nothing on the board yet. Press E to start ranking." : "Nothing to show here."}
          </div>
        ) : (
          children
        )}
      </StageShell>
    </>
  );
}
