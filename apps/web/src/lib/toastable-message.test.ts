import { describe, expect, it } from "vitest";

import { toastableMessage } from "./toastable-message";

const FALLBACK = "Something went wrong.";

describe("toastableMessage", () => {
  it("keeps a message the app wrote", () => {
    expect(toastableMessage("Collection not found", FALLBACK)).toBe("Collection not found");
  });

  it("trims surrounding whitespace", () => {
    expect(toastableMessage("  Deck is full  ", FALLBACK)).toBe("Deck is full");
  });

  it("replaces a gateway's HTML error page", () => {
    const body =
      "<html> <head><title>405 Not Allowed</title></head> <body> " +
      "<center><h1>405 Not Allowed</h1></center> <hr><center>nginx/1.31.4</center> </body> </html>";

    expect(toastableMessage(body, FALLBACK)).toBe(FALLBACK);
  });

  it("replaces markup that does not lead with a tag", () => {
    expect(toastableMessage("Error: <body>500</body>", FALLBACK)).toBe(FALLBACK);
  });

  it("replaces an empty or whitespace-only message", () => {
    expect(toastableMessage("", FALLBACK)).toBe(FALLBACK);
    expect(toastableMessage("   \n ", FALLBACK)).toBe(FALLBACK);
  });

  it("replaces a message too long to read in a toast", () => {
    expect(toastableMessage("x".repeat(301), FALLBACK)).toBe(FALLBACK);
  });

  it("keeps a message right at the length limit", () => {
    const message = "x".repeat(300);

    expect(toastableMessage(message, FALLBACK)).toBe(message);
  });

  it("keeps prose that merely mentions a comparison", () => {
    expect(toastableMessage("Quantity must be < 100", FALLBACK)).toBe("Quantity must be < 100");
  });
});
