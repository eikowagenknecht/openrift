import { afterAll, describe, expect, it } from "vitest";

import { renderImage, shutdownRenderPool } from "./render-pool.js";

// The unit tests drive the pool with a fake worker. This one spawns the real
// Bun worker: satori, @resvg/resvg-js and sharp are native or native-backed, so
// their behaviour inside a worker thread is the assumption the whole design
// rests on and cannot be checked with a fake.

const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

afterAll(() => {
  shutdownRenderPool();
});

describe("render pool with real workers", () => {
  it("renders a PNG off the main thread", async () => {
    const png = await renderImage({
      kind: "share",
      input: {
        ownerName: "Owner",
        title: "Summoner Skirmish",
        intentLabel: "Wishlist",
        unit: { one: "card", many: "cards" },
        cards: [{ cardName: "Pyke, Bloodharbor Ripper", quantity: 3, imageId: null }],
        totalCount: 1,
      },
      scale: 1,
      options: {},
    });

    expect(png.subarray(0, 8)).toEqual(PNG_MAGIC);
    expect(png.byteLength).toBeGreaterThan(1000);
  });

  it("keeps the calling thread responsive while a render runs", async () => {
    const ticks: number[] = [];
    const ticking = setInterval(() => ticks.push(Date.now()), 10);

    await renderImage({
      kind: "share",
      input: {
        ownerName: "Owner",
        title: "Summoner Skirmish",
        intentLabel: "Wishlist",
        unit: { one: "card", many: "cards" },
        cards: Array.from({ length: 40 }, (_, i) => ({
          cardName: `Card ${i}`,
          quantity: 1,
          imageId: null,
        })),
        totalCount: 40,
      },
      scale: 2,
      options: {},
    });
    clearInterval(ticking);

    expect(ticks.length).toBeGreaterThan(1);
  });
});
