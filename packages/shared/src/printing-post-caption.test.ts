import { describe, expect, it } from "vitest";

import type { PrintingPostCaptionInput } from "./printing-post-caption.js";
import { buildPrintingPostCaption, buildPrintingsPostCaption } from "./printing-post-caption.js";

const base: PrintingPostCaptionInput = {
  cardName: "Yasuo, the Wanderer",
  publicCode: "OGN-042",
  finishLabel: "Foil",
  channelLabel: "Summoner Skirmish",
  markerLabels: ["Prerelease", "Stamped"],
  artist: "Nara Vale",
  imageCredit: "Rift Register",
  cardUrl: "https://example.test/cards/yasuo-the-wanderer",
};

describe("buildPrintingPostCaption", () => {
  it("builds every line for a fully described printing", () => {
    expect(buildPrintingPostCaption(base).split("\n")).toEqual([
      "Yasuo, the Wanderer · Foil · OGN-042",
      "Summoner Skirmish · Prerelease · Stamped · Art by Nara Vale · Image credit: Rift Register",
      "https://example.test/cards/yasuo-the-wanderer",
      "",
      "#Riftbound #RiftboundPromo",
    ]);
  });

  it("keeps the channel off the headline", () => {
    expect(buildPrintingPostCaption(base).split("\n")[0]).toBe(
      "Yasuo, the Wanderer · Foil · OGN-042",
    );
  });

  it("omits the channel from the second line when there is none", () => {
    const caption = buildPrintingPostCaption({ ...base, channelLabel: null });
    expect(caption.split("\n")[1]).toBe(
      "Prerelease · Stamped · Art by Nara Vale · Image credit: Rift Register",
    );
  });

  it("keeps a nested channel path whole", () => {
    const caption = buildPrintingPostCaption({
      ...base,
      channelLabel: "Nexus Night › October 2025",
      markerLabels: [],
    });
    expect(caption.split("\n")[1]).toBe(
      "Nexus Night › October 2025 · Art by Nara Vale · Image credit: Rift Register",
    );
  });

  it("drops the image credit when there is none", () => {
    const caption = buildPrintingPostCaption({ ...base, imageCredit: null });
    expect(caption.split("\n")[1]).toBe(
      "Summoner Skirmish · Prerelease · Stamped · Art by Nara Vale",
    );
  });

  it("keeps the markers off the headline", () => {
    expect(buildPrintingPostCaption(base).split("\n")[0]).not.toContain("Prerelease");
  });

  it("omits the markers from the second line when there are none", () => {
    const caption = buildPrintingPostCaption({ ...base, markerLabels: [] });
    expect(caption.split("\n")[1]).toBe(
      "Summoner Skirmish · Art by Nara Vale · Image credit: Rift Register",
    );
  });

  it("renders an unannounced code as Code TBA", () => {
    const caption = buildPrintingPostCaption({ ...base, publicCode: "TBA" });
    expect(caption.split("\n")[0]).toBe("Yasuo, the Wanderer · Foil · Code TBA");
  });

  it("skips an empty finish label rather than leaving a dangling separator", () => {
    const caption = buildPrintingPostCaption({ ...base, finishLabel: "" });
    expect(caption.split("\n")[0]).toBe("Yasuo, the Wanderer · OGN-042");
  });

  it("leads the second line with the label and the date", () => {
    const caption = buildPrintingPostCaption({
      ...base,
      labelText: "Released",
      dateText: "4 October 2026",
    });
    expect(caption.split("\n")[1]).toBe(
      "Released 4 October 2026 · Summoner Skirmish · Prerelease · Stamped · Art by Nara Vale · Image credit: Rift Register",
    );
  });

  it("leads with the date alone when there is no label text", () => {
    const caption = buildPrintingPostCaption({ ...base, dateText: "October 2026" });
    expect(caption.split("\n")[1]).toMatch(/^October 2026 · /u);
  });

  it("leaves the second line dateless when there is no date", () => {
    const caption = buildPrintingPostCaption({ ...base, labelText: "Released" });
    expect(caption.split("\n")[1]).toMatch(/^Summoner Skirmish/u);
  });

  it("always ends with the hashtags after a blank line", () => {
    const caption = buildPrintingPostCaption({
      ...base,
      channelLabel: null,
      imageCredit: null,
      markerLabels: [],
    });
    expect(caption.endsWith("\n\n#Riftbound #RiftboundPromo")).toBe(true);
  });
});

const second: PrintingPostCaptionInput = {
  cardName: "Annie, Dark Child",
  publicCode: "OGN-101",
  finishLabel: "Standard",
  channelLabel: "Nexus Night",
  markerLabels: ["Stamped"],
  artist: "Rune Atelier",
  imageCredit: null,
  cardUrl: "https://example.test/cards/annie-dark-child",
};

describe("buildPrintingsPostCaption", () => {
  it("matches the single builder for one printing", () => {
    expect(buildPrintingsPostCaption([base])).toBe(buildPrintingPostCaption(base));
  });

  it("separates the blocks with a blank line and ends with one hashtag line", () => {
    expect(buildPrintingsPostCaption([base, second]).split("\n")).toEqual([
      "Yasuo, the Wanderer · Foil · OGN-042",
      "Summoner Skirmish · Prerelease · Stamped · Art by Nara Vale · Image credit: Rift Register",
      "https://example.test/cards/yasuo-the-wanderer",
      "",
      "Annie, Dark Child · Standard · OGN-101",
      "Nexus Night · Stamped · Art by Rune Atelier",
      "https://example.test/cards/annie-dark-child",
      "",
      "#Riftbound #RiftboundPromo",
    ]);
  });

  it("keeps the printings in the order they were given", () => {
    const caption = buildPrintingsPostCaption([second, base]);
    expect(caption.split("\n")[0]).toBe("Annie, Dark Child · Standard · OGN-101");
  });

  it("adds no headcount line for several printings", () => {
    expect(buildPrintingsPostCaption([base, second])).not.toContain("2 promos");
  });

  it("dates each block from its own printing", () => {
    const caption = buildPrintingsPostCaption([
      { ...base, labelText: "Released", dateText: "4 October 2026" },
      { ...second, labelText: "Announced", dateText: "Q2 2026" },
    ]);
    const lines = caption.split("\n");
    expect(lines[1]).toMatch(/^Released 4 October 2026 · /u);
    expect(lines[5]).toMatch(/^Announced Q2 2026 · /u);
  });

  it("returns nothing for no printings", () => {
    expect(buildPrintingsPostCaption([])).toBe("");
  });
});
