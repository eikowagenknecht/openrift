import type { ReactNode } from "react";

import { Badge } from "@/components/ui/badge";

import { Vignette, VignetteHeading } from "./vignette-parts";

/**
 * The command a viewer types. The bot's own prefix is `!card`; everything after
 * it is passed through to the lookup, so a plain name is the normal case.
 */
const QUERY = "!card viktor innovator";

/**
 * The bot's answer, in the exact shape `chatCardLine` builds it: name, an em
 * dash, the stat line in the Discord bot's `describeCard` order, another em
 * dash, then the card URL. One line, because a newline would split into two
 * chat messages. The card is a real one, so the stats are the ones the endpoint
 * would actually return.
 */
const REPLY = "Viktor, Innovator — Champion Unit · Mind · Energy 4 · Might 3 · Power 1 —";
const REPLY_URL = "openrift.app/cards/viktor-innovator";

/** The chatter lines above the lookup, so the command lands in a conversation. */
const BACKLOG = [
  { name: "riftcaptain", text: "that top end is nuts" },
  { name: "mothbite", text: "wait what does viktor even do" },
];

function ChatLine({ name, children }: { name: string; children: ReactNode }) {
  return (
    <p className="text-sm leading-snug">
      <span className="text-foreground/70 font-semibold">{name}</span>
      <span className="text-muted-foreground">: </span>
      {children}
    </p>
  );
}

/**
 * A stream chat with the lookup command in it: a viewer types `!card`, the
 * channel bot answers with the card on one line.
 *
 * Reuses the Discord vignette's type/reply cycle rather than a pair of its own,
 * so the two bot miniatures on this page run on the same beat.
 *
 * @returns The chat vignette.
 */
export function ChatVignette() {
  return (
    <Vignette>
      <VignetteHeading>Stream chat</VignetteHeading>

      <div className="flex flex-col gap-2">
        {BACKLOG.map((line) => (
          <ChatLine key={line.name} name={line.name}>
            <span className="text-muted-foreground">{line.text}</span>
          </ChatLine>
        ))}

        <ChatLine name="mothbite">
          {/* One step per character: the command's length sets the run. */}
          <span
            className="text-primary motion-safe:animate-vignette-type inline-block font-medium"
            style={{ animationTimingFunction: `steps(${QUERY.length}, end)` }}
          >
            {QUERY}
          </span>
        </ChatLine>

        <div className="motion-safe:animate-vignette-reply flex flex-col gap-1">
          <p className="text-sm leading-snug">
            <span className="text-primary font-semibold">Nightbot</span>
            <Badge variant="subtle" className="mx-1.5 align-middle">
              BOT
            </Badge>
            <span className="text-muted-foreground">: </span>
            <span className="text-foreground/90">{REPLY}</span>{" "}
            <span className="text-primary break-all underline underline-offset-2">{REPLY_URL}</span>
          </p>
        </div>
      </div>

      <p className="text-muted-foreground border-border border-t pt-3 text-xs">
        Works the same in StreamElements and Fossabot. A name that matches nothing comes back as a
        search link, so a typo still lands somewhere useful.
      </p>
    </Vignette>
  );
}
