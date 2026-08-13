import { describe, expect, it } from "vitest";

import type { CardSubmissionAlertEmailInput } from "./card-submission-emails.js";
import { buildCardSubmissionAlertEmail } from "./card-submission-emails.js";

const BASE: CardSubmissionAlertEmailInput = {
  recipientName: "Riven",
  submitterName: "Garen",
  submitterEmail: "contributor@example.com",
  cardName: "Azir, Emperor of the Sands",
  printings: [{ publicCode: "OGN-123/298", setName: "Origins", language: "en", finish: "foil" }],
  note: null,
  reviewUrl: "https://openrift.app/admin/cards?tab=candidates&source=usersubmission",
  unsubscribeUrl: "https://openrift.app/api/v1/unsubscribe?token=abc",
};

describe("buildCardSubmissionAlertEmail", () => {
  it("names the card in the subject and the submitter in the body", () => {
    const { subject, html } = buildCardSubmissionAlertEmail(BASE);
    expect(subject).toBe("New card submission: Azir, Emperor of the Sands — OpenRift");
    expect(html).toContain("Garen");
    expect(html).toContain("Azir, Emperor of the Sands");
    expect(html).toContain(BASE.submitterEmail);
    // The `&` in the review URL is escaped inside the href, as it must be.
    expect(html).toContain(
      "https://openrift.app/admin/cards?tab=candidates&amp;source=usersubmission",
    );
    expect(html).toContain(BASE.unsubscribeUrl);
  });

  it("does not claim the mail is about trading activity", () => {
    const { html } = buildCardSubmissionAlertEmail(BASE);
    expect(html).toContain("you&#39;re an OpenRift admin");
    expect(html).not.toContain("trading activity");
  });

  it("lists each printing, dropping the parts the submission left blank", () => {
    const { html } = buildCardSubmissionAlertEmail({
      ...BASE,
      printings: [
        { publicCode: "OGN-123/298", setName: "Origins", language: "en", finish: "foil" },
        { publicCode: "OGN-124/298", setName: null, language: null, finish: null },
      ],
    });
    expect(html).toContain("OGN-123/298 · Origins · foil · en");
    expect(html).toContain('<li style="margin:0 0 4px;">OGN-124/298</li>');
  });

  it("includes the submitter's note when they wrote one", () => {
    const { html } = buildCardSubmissionAlertEmail({ ...BASE, note: "The image is the wrong art" });
    expect(html).toContain("The image is the wrong art");
  });

  it("falls back to the submitter's email when they have no display name", () => {
    const { html } = buildCardSubmissionAlertEmail({ ...BASE, submitterName: null });
    expect(html).toContain("<strong>contributor@example.com</strong>");
  });

  it("escapes submitted text rather than rendering it as markup", () => {
    const { html } = buildCardSubmissionAlertEmail({
      ...BASE,
      note: "<script>alert(1)</script>",
    });
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });
});
