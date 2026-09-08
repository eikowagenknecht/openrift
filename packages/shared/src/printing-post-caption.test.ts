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
      "Yasuo, the Wanderer, Summoner Skirmish promo",
      "Prerelease · Stamped · Foil · OGN-042",
      "Art: Nara Vale · Image credit: Rift Register",
      "https://example.test/cards/yasuo-the-wanderer",
      "#Riftbound #RiftboundPromo",
    ]);
  });

  it("drops the channel from the headline when there is none", () => {
    const caption = buildPrintingPostCaption({ ...base, channelLabel: null });
    expect(caption.split("\n")[0]).toBe("Yasuo, the Wanderer promo");
  });

  it("drops the image credit when there is none", () => {
    const caption = buildPrintingPostCaption({ ...base, imageCredit: null });
    expect(caption.split("\n")[2]).toBe("Art: Nara Vale");
  });

  it("omits the marker segment when there are no markers", () => {
    const caption = buildPrintingPostCaption({ ...base, markerLabels: [] });
    expect(caption.split("\n")[1]).toBe("Foil · OGN-042");
  });

  it("renders an unannounced code as Code TBA", () => {
    const caption = buildPrintingPostCaption({ ...base, publicCode: "TBA" });
    expect(caption.split("\n")[1]).toBe("Prerelease · Stamped · Foil · Code TBA");
  });

  it("skips an empty finish label rather than leaving a dangling separator", () => {
    const caption = buildPrintingPostCaption({
      ...base,
      finishLabel: "",
      markerLabels: [],
    });
    expect(caption.split("\n")[1]).toBe("OGN-042");
  });

  it("appends the label and the date to the headline", () => {
    const caption = buildPrintingPostCaption({
      ...base,
      labelText: "Released",
      dateText: "4 October 2026",
    });
    expect(caption.split("\n")[0]).toBe(
      "Yasuo, the Wanderer, Summoner Skirmish promo · Released 4 October 2026",
    );
  });

  it("appends the date alone when there is no label text", () => {
    const caption = buildPrintingPostCaption({ ...base, dateText: "October 2026" });
    expect(caption.split("\n")[0]).toBe(
      "Yasuo, the Wanderer, Summoner Skirmish promo · October 2026",
    );
  });

  it("leaves the headline alone when there is no date", () => {
    const caption = buildPrintingPostCaption({ ...base, labelText: "Released" });
    expect(caption.split("\n")[0]).toBe("Yasuo, the Wanderer, Summoner Skirmish promo");
  });

  it("appends the date to a headline without a channel", () => {
    const caption = buildPrintingPostCaption({
      ...base,
      channelLabel: null,
      labelText: "Collected",
      dateText: "2026",
    });
    expect(caption.split("\n")[0]).toBe("Yasuo, the Wanderer promo · Collected 2026");
  });

  it("always ends with the hashtags", () => {
    const caption = buildPrintingPostCaption({
      ...base,
      channelLabel: null,
      imageCredit: null,
      markerLabels: [],
    });
    expect(caption.endsWith("\n#Riftbound #RiftboundPromo")).toBe(true);
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
      "Yasuo, the Wanderer, Summoner Skirmish promo",
      "Prerelease · Stamped · Foil · OGN-042",
      "Art: Nara Vale · Image credit: Rift Register",
      "https://example.test/cards/yasuo-the-wanderer",
      "",
      "Annie, Dark Child, Nexus Night promo",
      "Stamped · Standard · OGN-101",
      "Art: Rune Atelier",
      "https://example.test/cards/annie-dark-child",
      "#Riftbound #RiftboundPromo",
    ]);
  });

  it("keeps the printings in the order they were given", () => {
    const caption = buildPrintingsPostCaption([second, base]);
    expect(caption.split("\n")[0]).toBe("Annie, Dark Child, Nexus Night promo");
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
    expect(lines[0]).toBe("Yasuo, the Wanderer, Summoner Skirmish promo · Released 4 October 2026");
    expect(lines[5]).toBe("Annie, Dark Child, Nexus Night promo · Announced Q2 2026");
  });

  it("returns nothing for no printings", () => {
    expect(buildPrintingsPostCaption([])).toBe("");
  });
});
