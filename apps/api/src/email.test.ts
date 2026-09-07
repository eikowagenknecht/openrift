import { describe, expect, it } from "vitest";

import { createEmailSender } from "./email.js";
import type { Config } from "./types.js";

const unconfigured: Config["smtp"] = {
  configured: false,
  host: undefined,
  port: 465,
  secure: true,
  user: undefined,
  pass: undefined,
  from: undefined,
};

const configured: Config["smtp"] = {
  configured: true,
  host: "smtp.test",
  port: 465,
  secure: true,
  user: "user",
  pass: "pass",
  from: "from@test",
};

describe("createEmailSender", () => {
  it("throws when SMTP is unconfigured outside development", () => {
    expect(() => createEmailSender(unconfigured, false)).toThrow(/SMTP is not configured/u);
  });

  it("returns a console-logging sender when unconfigured in development", async () => {
    const sendEmail = createEmailSender(unconfigured, true);
    expect(typeof sendEmail).toBe("function");
    await expect(
      sendEmail({ to: "user@example.test", subject: "Hi", html: "<p>hi</p>" }),
    ).resolves.toBeUndefined();
  });

  it("builds a real sender when SMTP is configured", () => {
    const sendEmail = createEmailSender(configured, false);
    expect(typeof sendEmail).toBe("function");
  });
});
