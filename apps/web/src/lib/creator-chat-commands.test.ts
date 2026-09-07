import { describe, expect, it } from "vitest";

import { CHAT_LOOKUP_PATH, chatBotSetups, chatLookupUrl } from "./creator-chat-commands";

describe("chatLookupUrl", () => {
  it("appends the lookup path to the origin", () => {
    expect(chatLookupUrl("https://openrift.app")).toBe(`https://openrift.app${CHAT_LOOKUP_PATH}`);
  });

  it("drops a trailing slash so the path is never doubled", () => {
    expect(chatLookupUrl("https://openrift.app/")).toBe(`https://openrift.app${CHAT_LOOKUP_PATH}`);
    expect(chatLookupUrl("https://openrift.app///")).toBe(
      `https://openrift.app${CHAT_LOOKUP_PATH}`,
    );
  });

  it("keeps a non-default port, so a preview deploy links to itself", () => {
    expect(chatLookupUrl("http://localhost:5173")).toBe(`http://localhost:5173${CHAT_LOOKUP_PATH}`);
  });
});

describe("chatBotSetups", () => {
  const setups = chatBotSetups("https://openrift.app");

  it("covers the three bots, in a stable order", () => {
    expect(setups.map((setup) => setup.id)).toEqual(["nightbot", "streamelements", "fossabot"]);
  });

  it("points every command at the absolute lookup URL", () => {
    for (const setup of setups) {
      expect(setup.command).toContain("https://openrift.app/api/v1/chat/card?q=");
    }
  });

  it("uses each bot's own fetch and escape syntax", () => {
    const byId = Object.fromEntries(setups.map((setup) => [setup.id, setup.command]));
    expect(byId.nightbot).toContain("$(urlfetch ");
    expect(byId.nightbot).toContain("$(querystring)");
    expect(byId.streamelements).toContain("$(customapi ");
    // oxlint-disable-next-line eslint/no-template-curly-in-string -- StreamElements' own syntax, asserted literally
    expect(byId.streamelements).toContain("$(queryescape ${1:})");
    expect(byId.fossabot).toContain("$(customapi ");
    expect(byId.fossabot).toContain("$(urlencode $(query))");
    expect(byId.fossabot).not.toContain("queryescape");
  });

  it("names the command !card everywhere a bot takes the prefix", () => {
    const byId = Object.fromEntries(setups.map((setup) => [setup.id, setup.command]));
    expect(byId.nightbot).toContain("!addcom !card ");
    expect(byId.streamelements).toContain("!command add !card ");
    expect(byId.fossabot).toContain("!addcmd card ");
  });

  it("balances the parentheses in every command", () => {
    for (const setup of setups) {
      const opens = [...setup.command].filter((character) => character === "(").length;
      const closes = [...setup.command].filter((character) => character === ")").length;
      expect(opens, `${setup.id} parentheses`).toBe(closes);
    }
  });

  it("keeps each command on one line, since a bot pastes it as one message", () => {
    for (const setup of setups) {
      expect(setup.command).not.toContain("\n");
    }
  });

  it("rebuilds the commands against whatever origin it is given", () => {
    const preview = chatBotSetups("https://preview.openrift.app");
    for (const setup of preview) {
      expect(setup.command).toContain("https://preview.openrift.app/api/v1/chat/card");
      expect(setup.command).not.toContain("//openrift.app");
    }
  });
});
