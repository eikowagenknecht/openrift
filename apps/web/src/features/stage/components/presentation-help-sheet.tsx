import { Kbd } from "@/components/ui/kbd";

interface KeyHelpRow {
  keys: string[];
  what: string;
}

const WALK_KEY_HELP: KeyHelpRow[] = [
  { keys: ["←", "→"], what: "Step through the queue" },
  { keys: ["Space"], what: "Next card" },
  { keys: ["Home", "End"], what: "First / last card" },
  { keys: ["T"], what: "Text panel" },
  { keys: ["F"], what: "Thumbnail strip" },
];

const BOARD_KEY_HELP: KeyHelpRow[] = [
  { keys: ["B"], what: "Whole board / one card" },
  { keys: ["C"], what: "Current card beside the board" },
  { keys: ["K"], what: "The current card's tier, large" },
  { keys: ["R"], what: "Fill the board as you go" },
  { keys: ["D"], what: "Start from the bottom tier" },
];

const PUSH_KEY_HELP: KeyHelpRow[] = [{ keys: ["P"], what: "Push this card to the OBS overlay" }];

const OBS_BOARD_KEY_HELP: KeyHelpRow[] = [
  { keys: ["O"], what: "Show this board on the OBS overlay" },
];

const HIDE_KEY_HELP: KeyHelpRow[] = [{ keys: ["H"], what: "Hide / show the OBS overlay" }];

const COMMON_KEY_HELP: KeyHelpRow[] = [
  { keys: ["?"], what: "This help" },
  { keys: ["Esc"], what: "Leave the stage" },
];

export function PresentationHelpSheet({
  boardControls,
  pushControls,
  obsControls,
  editControls,
  editing,
}: {
  boardControls: boolean;
  pushControls: boolean;
  obsControls: boolean;
  editControls: boolean;
  editing: boolean;
}) {
  const rows: KeyHelpRow[] = [
    ...(editing ? [] : WALK_KEY_HELP),
    ...(boardControls && !editing ? BOARD_KEY_HELP : []),
    ...(pushControls && !editing ? PUSH_KEY_HELP : []),
    ...(obsControls && !editing ? OBS_BOARD_KEY_HELP : []),
    ...(pushControls ? HIDE_KEY_HELP : []),
    ...(editControls
      ? [{ keys: ["E"], what: editing ? "Back to the show" : "Edit the board" }]
      : []),
    ...COMMON_KEY_HELP,
  ];
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 flex justify-center pb-8">
      <dl className="grid grid-cols-[auto_1fr] items-center gap-x-5 gap-y-2 rounded-lg bg-black/80 px-6 py-5 backdrop-blur-sm">
        {rows.map((row) => (
          <div key={row.what} className="contents">
            <dt className="flex justify-end gap-1">
              {row.keys.map((key) => (
                <Kbd key={key}>{key}</Kbd>
              ))}
            </dt>
            <dd className="text-sm text-white/70">{row.what}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
