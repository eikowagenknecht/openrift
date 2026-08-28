/**
 * The chat-bot setup commands handed out in the chat-commands help article.
 *
 * Each string is pasted verbatim into a creator's own chat (or their bot's
 * dashboard) and creates a `!card` command that calls the plain-text lookup
 * endpoint. Every bot spells the same three ideas differently — fetch a URL,
 * take the rest of the message, url-encode it — so the syntax below is copied
 * from each bot's own documentation rather than assumed to be shared.
 */

/** The plain-text lookup, relative to the site origin. */
export const CHAT_LOOKUP_PATH = "/api/v1/chat/card";

/**
 * StreamElements' "argument 1 to the end of the message" token. Kept as a
 * plain string because `${1:}` is not valid inside a JS template literal.
 */
// oxlint-disable-next-line eslint/no-template-curly-in-string -- StreamElements' own syntax, not a JS placeholder; it must reach the bot literally
const STREAMELEMENTS_REST_OF_MESSAGE = "${1:}";

/** One bot's setup line, plus the one thing that trips people up on it. */
export interface ChatBotSetup {
  /** Stable key, also the React list key. */
  id: "nightbot" | "streamelements" | "fossabot";
  /** The bot's name, spelled as its own docs spell it. */
  name: string;
  /** Pasted verbatim to create the command. */
  command: string;
  /** The detail that is not obvious from the line itself. */
  note: string;
}

/**
 * Builds the absolute lookup URL for a deployment.
 *
 * Absolute on purpose: a chat bot fetches a full URL or nothing, so this is
 * the one place on the site that cannot fall back to a relative path.
 *
 * @param origin Site origin, with or without a trailing slash.
 * @returns The lookup endpoint URL, e.g. `https://openrift.app/api/v1/chat/card`.
 */
export function chatLookupUrl(origin: string): string {
  return `${origin.replace(/\/+$/u, "")}${CHAT_LOOKUP_PATH}`;
}

/**
 * The setup line for each supported bot.
 *
 * @param origin Site origin the commands should point at.
 * @returns One entry per bot, in the order they are shown.
 */
export function chatBotSetups(origin: string): ChatBotSetup[] {
  const url = chatLookupUrl(origin);
  return [
    {
      id: "nightbot",
      name: "Nightbot",
      command: `!addcom !card $(urlfetch ${url}?q=$(querystring))`,
      note: "Paste it in your own chat as a moderator, or add the same response under Commands in the Nightbot dashboard.",
    },
    {
      id: "streamelements",
      name: "StreamElements",
      command: `!command add !card $(customapi ${url}?q=$(queryescape ${STREAMELEMENTS_REST_OF_MESSAGE}))`,
      note: "StreamElements cuts a response off at 400 characters, which is the length this endpoint is written to fit.",
    },
    {
      id: "fossabot",
      name: "Fossabot",
      command: `!addcmd card $(customapi ${url}?q=$(urlencode $(query)))`,
      note: "Fossabot takes the command name without a leading exclamation mark. Viewers still type !card.",
    },
  ];
}
