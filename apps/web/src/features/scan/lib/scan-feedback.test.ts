import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

interface FakeParam {
  setValueAtTime: ReturnType<typeof vi.fn>;
  exponentialRampToValueAtTime: ReturnType<typeof vi.fn>;
}

interface FakeOscillator {
  type: string;
  frequency: FakeParam;
  connect: ReturnType<typeof vi.fn>;
  start: ReturnType<typeof vi.fn>;
  stop: ReturnType<typeof vi.fn>;
}

interface FakeGain {
  gain: FakeParam;
  connect: ReturnType<typeof vi.fn>;
}

interface FakeContext {
  currentTime: number;
  state: string;
  destination: object;
  resume: ReturnType<typeof vi.fn>;
  createOscillator: () => FakeOscillator;
  createGain: () => FakeGain;
}

function param(): FakeParam {
  return { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() };
}

let contexts: FakeContext[] = [];
let oscillators: FakeOscillator[] = [];
let gains: FakeGain[] = [];
let constructed = 0;
let contextOverrides: Partial<FakeContext> = {};

function FakeAudioContext(): FakeContext {
  constructed++;
  const context: FakeContext = {
    currentTime: 10,
    state: "running",
    destination: {},
    resume: vi.fn(),
    createOscillator: () => {
      const oscillator: FakeOscillator = {
        type: "",
        frequency: param(),
        connect: vi.fn(),
        start: vi.fn(),
        stop: vi.fn(),
      };
      oscillators.push(oscillator);
      return oscillator;
    },
    createGain: () => {
      const gain: FakeGain = { gain: param(), connect: vi.fn() };
      gains.push(gain);
      return gain;
    },
    ...contextOverrides,
  };
  contexts.push(context);
  return context;
}

function installAudioContext(): void {
  vi.stubGlobal("AudioContext", FakeAudioContext);
}

async function loadPlayLockTick(): Promise<() => void> {
  const module = await import("./scan-feedback");
  return module.playLockTick;
}

beforeEach(() => {
  vi.resetModules();
  contexts = [];
  oscillators = [];
  gains = [];
  constructed = 0;
  contextOverrides = {};
  installAudioContext();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("playLockTick", () => {
  it("opens one audio context and reuses it across ticks", async () => {
    const playLockTick = await loadPlayLockTick();
    playLockTick();
    playLockTick();
    expect(constructed).toBe(1);
    expect(oscillators).toHaveLength(2);
  });

  it("resumes a context the browser suspended", async () => {
    contextOverrides = { state: "suspended" };
    const playLockTick = await loadPlayLockTick();
    playLockTick();
    expect(contexts[0]?.resume).toHaveBeenCalledOnce();
  });

  it("leaves a running context alone", async () => {
    const playLockTick = await loadPlayLockTick();
    playLockTick();
    expect(contexts[0]?.resume).not.toHaveBeenCalled();
  });

  it("sweeps the tone up partway through the tick", async () => {
    const playLockTick = await loadPlayLockTick();
    playLockTick();
    const frequency = oscillators[0]!.frequency;
    expect(frequency.setValueAtTime.mock.calls).toEqual([
      [660, 10],
      [990, 10.06],
    ]);
  });

  it("fades the tick out instead of cutting it", async () => {
    const playLockTick = await loadPlayLockTick();
    playLockTick();
    const gain = gains[0]!.gain;
    expect(gain.setValueAtTime).toHaveBeenCalledWith(0.08, 10);
    expect(gain.exponentialRampToValueAtTime).toHaveBeenCalledWith(0.0001, 10.14);
  });

  it("routes the oscillator through the gain to the speakers", async () => {
    const playLockTick = await loadPlayLockTick();
    playLockTick();
    expect(oscillators[0]?.connect).toHaveBeenCalledWith(gains[0]);
    expect(gains[0]?.connect).toHaveBeenCalledWith(contexts[0]?.destination);
  });

  it("stops the oscillator so it cannot outlive the tick", async () => {
    const playLockTick = await loadPlayLockTick();
    playLockTick();
    expect(oscillators[0]?.start).toHaveBeenCalledWith(10);
    expect(oscillators[0]?.stop).toHaveBeenCalledWith(10.15);
  });

  it("stays silent when the browser refuses an audio context", async () => {
    function BlockedAudioContext(): never {
      throw new Error("autoplay blocked");
    }
    vi.stubGlobal("AudioContext", BlockedAudioContext);
    const playLockTick = await loadPlayLockTick();
    expect(() => {
      playLockTick();
    }).not.toThrow();
  });

  it("retries the context on the next tick after a refused one", async () => {
    let refuse = true;
    function RefusingAudioContext(): object {
      if (refuse) {
        throw new Error("autoplay blocked");
      }
      constructed++;
      return {};
    }
    vi.stubGlobal("AudioContext", RefusingAudioContext);
    const playLockTick = await loadPlayLockTick();
    playLockTick();
    refuse = false;
    playLockTick();
    expect(constructed).toBe(1);
  });

  it("stays silent when the context cannot build an oscillator", async () => {
    contextOverrides = {
      createOscillator: () => {
        throw new Error("no hardware");
      },
    };
    const playLockTick = await loadPlayLockTick();
    expect(() => {
      playLockTick();
    }).not.toThrow();
  });
});
