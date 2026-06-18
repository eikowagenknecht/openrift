import { describe, expect, it } from "vitest";

import { CONTACT_METHOD_LABELS, formatContactMethodsSummary } from "./contact-methods.js";
import type { ContactMethod } from "./types/api/contact-method.js";

function method(overrides: Partial<ContactMethod>): ContactMethod {
  return { id: "id-1", type: "discord", value: "seb#1234", ...overrides };
}

describe("CONTACT_METHOD_LABELS", () => {
  it("has a human label for every channel", () => {
    expect(CONTACT_METHOD_LABELS.discord).toBe("Discord");
    expect(CONTACT_METHOD_LABELS.in_person).toBe("In person");
    expect(CONTACT_METHOD_LABELS.other).toBe("Other");
  });
});

describe("formatContactMethodsSummary", () => {
  it("returns an empty string for no methods", () => {
    expect(formatContactMethodsSummary([])).toBe("");
  });

  it("formats a single method as 'Label: value'", () => {
    expect(formatContactMethodsSummary([method({ type: "email", value: "a@b.com" })])).toBe(
      "Email: a@b.com",
    );
  });

  it("joins several methods with a middot separator in order", () => {
    const summary = formatContactMethodsSummary([
      method({ id: "1", type: "discord", value: "seb#1234" }),
      method({ id: "2", type: "phone", value: "+49 151" }),
    ]);
    expect(summary).toBe("Discord: seb#1234 · Phone: +49 151");
  });
});
