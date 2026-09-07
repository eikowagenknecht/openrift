import { describe, expect, it } from "vitest";

import { WATCH_LONG_SIDE, grabRotatedFrame, grabWatchFrame } from "./scan-frame-grab";

interface Draw {
  op: string;
  args: number[];
}

// jsdom has no canvas backend, so the tests substitute a plain object that
// records the transform and hands back pixels of the size it was asked for.
function fakeCanvas(available = true) {
  const draws: Draw[] = [];
  const context = {
    save: () => draws.push({ op: "save", args: [] }),
    restore: () => draws.push({ op: "restore", args: [] }),
    translate: (x: number, y: number) => draws.push({ op: "translate", args: [x, y] }),
    rotate: (angle: number) => draws.push({ op: "rotate", args: [angle] }),
    drawImage: (_source: unknown, ...args: number[]) => draws.push({ op: "drawImage", args }),
    getImageData: (_x: number, _y: number, width: number, height: number) => ({
      data: new Uint8ClampedArray(width * height * 4),
      width,
      height,
    }),
  };
  const canvas = {
    width: 0,
    height: 0,
    getContext: () => (available ? context : null),
  };
  return { canvas: canvas as unknown as HTMLCanvasElement, draws };
}

function fakeVideo(width: number, height: number): HTMLVideoElement {
  return { videoWidth: width, videoHeight: height } as HTMLVideoElement;
}

describe("grabRotatedFrame", () => {
  it("has nothing to grab before the camera reports a size", () => {
    const { canvas } = fakeCanvas();
    expect(grabRotatedFrame(fakeVideo(0, 0), canvas, 848, 0)).toBeNull();
  });

  it("scales the long side down to the processing size", () => {
    const { canvas } = fakeCanvas();
    expect(grabRotatedFrame(fakeVideo(1920, 1080), canvas, 848, 0)).toMatchObject({
      width: 848,
      height: 477,
    });
  });

  it("never scales a small frame up", () => {
    const { canvas } = fakeCanvas();
    expect(grabRotatedFrame(fakeVideo(640, 480), canvas, 848, 0)).toMatchObject({
      width: 640,
      height: 480,
    });
  });

  it("swaps the axes for a quarter turn", () => {
    const { canvas } = fakeCanvas();
    const frame = grabRotatedFrame(fakeVideo(640, 480), canvas, 848, 1);
    expect(frame).toMatchObject({ width: 480, height: 640 });
    expect(canvas.width).toBe(480);
    expect(canvas.height).toBe(640);
  });

  it("keeps the axes for a half turn", () => {
    const { canvas } = fakeCanvas();
    expect(grabRotatedFrame(fakeVideo(640, 480), canvas, 848, 2)).toMatchObject({
      width: 640,
      height: 480,
    });
  });

  it("draws an upright frame without moving the origin", () => {
    const { canvas, draws } = fakeCanvas();
    grabRotatedFrame(fakeVideo(640, 480), canvas, 848, 0);
    expect(draws.filter((draw) => draw.op === "translate")).toEqual([]);
    expect(draws.at(-1)?.op).toBe("restore");
  });

  it("moves the origin to the corner the rotation swings into", () => {
    const { canvas, draws } = fakeCanvas();
    grabRotatedFrame(fakeVideo(640, 480), canvas, 848, 3);
    expect(draws.find((draw) => draw.op === "translate")?.args).toEqual([0, 640]);
    expect(draws.find((draw) => draw.op === "rotate")?.args).toEqual([(3 * Math.PI) / 2]);
  });

  it("gives up when the canvas hands out no 2d context", () => {
    const { canvas } = fakeCanvas(false);
    expect(grabRotatedFrame(fakeVideo(640, 480), canvas, 848, 0)).toBeNull();
  });

  it("returns pixels for the whole rotated frame", () => {
    const { canvas } = fakeCanvas();
    const frame = grabRotatedFrame(fakeVideo(640, 480), canvas, 320, 1);
    expect(frame?.data).toHaveLength(240 * 320 * 4);
  });
});

describe("grabWatchFrame", () => {
  it("has nothing to grab before the camera reports a size", () => {
    const { canvas } = fakeCanvas();
    expect(grabWatchFrame(fakeVideo(0, 0), canvas)).toBeNull();
  });

  it("shrinks the frame to the watch size", () => {
    const { canvas } = fakeCanvas();
    expect(grabWatchFrame(fakeVideo(640, 480), canvas)).toMatchObject({
      width: WATCH_LONG_SIDE,
      height: 96,
    });
  });

  it("keeps at least one pixel on the short side", () => {
    const { canvas } = fakeCanvas();
    expect(grabWatchFrame(fakeVideo(4000, 4), canvas)?.height).toBe(1);
  });

  it("draws without rotating, since only consecutive frames are compared", () => {
    const { canvas, draws } = fakeCanvas();
    grabWatchFrame(fakeVideo(640, 480), canvas);
    expect(draws.map((draw) => draw.op)).toEqual(["drawImage"]);
  });

  it("gives up when the canvas hands out no 2d context", () => {
    const { canvas } = fakeCanvas(false);
    expect(grabWatchFrame(fakeVideo(640, 480), canvas)).toBeNull();
  });
});
