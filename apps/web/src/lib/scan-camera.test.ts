import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { acquireScannerStream } from "./scan-camera";

function stubGetUserMedia(
  implementation: (constraints: MediaStreamConstraints) => Promise<MediaStream>,
): ReturnType<typeof vi.fn> {
  const getUserMedia = vi.fn(implementation);
  Object.defineProperty(navigator, "mediaDevices", {
    value: { getUserMedia },
    configurable: true,
  });
  return getUserMedia;
}

const FAKE_STREAM = { getTracks: () => [] } as unknown as MediaStream;

describe("acquireScannerStream", () => {
  beforeEach(() => {
    vi.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("opens the camera in one call and passes the frame rate cap through", async () => {
    const getUserMedia = stubGetUserMedia(() => Promise.resolve(FAKE_STREAM));

    const acquired = await acquireScannerStream(true);

    expect(acquired).toEqual({ stream: FAKE_STREAM, failure: null });
    expect(getUserMedia).toHaveBeenCalledTimes(1);
    const constraints = getUserMedia.mock.calls[0][0] as { video: MediaTrackConstraints };
    expect(constraints.video.frameRate).toEqual({ max: 30 });
  });

  it("asks for no frame rate cap on a fast device", async () => {
    const getUserMedia = stubGetUserMedia(() => Promise.resolve(FAKE_STREAM));

    await acquireScannerStream(false);

    const constraints = getUserMedia.mock.calls[0][0] as { video: MediaTrackConstraints };
    expect(constraints.video.frameRate).toBeUndefined();
  });

  it("retries uncapped when the capped request is overconstrained", async () => {
    const getUserMedia = stubGetUserMedia(
      vi
        .fn()
        .mockRejectedValueOnce(new DOMException("no mode fits", "OverconstrainedError"))
        .mockResolvedValueOnce(FAKE_STREAM),
    );

    const acquired = await acquireScannerStream(true);

    expect(acquired.stream).toBe(FAKE_STREAM);
    expect(getUserMedia).toHaveBeenCalledTimes(2);
    const retry = getUserMedia.mock.calls[1][0] as { video: MediaTrackConstraints };
    expect(retry.video.frameRate).toBeUndefined();
  });

  it("does not retry an overconstrained request that was already uncapped", async () => {
    const failure = new DOMException("no mode fits", "OverconstrainedError");
    const getUserMedia = stubGetUserMedia(() => Promise.reject(failure));

    const acquired = await acquireScannerStream(false);

    expect(acquired).toEqual({ stream: null, failure });
    expect(getUserMedia).toHaveBeenCalledTimes(1);
  });

  it("does not retry a rejection that is not about constraints", async () => {
    const failure = new DOMException("Permission denied", "NotAllowedError");
    const getUserMedia = stubGetUserMedia(() => Promise.reject(failure));

    const acquired = await acquireScannerStream(true);

    expect(acquired).toEqual({ stream: null, failure });
    expect(getUserMedia).toHaveBeenCalledTimes(1);
  });

  it("returns the retry's rejection when the uncapped attempt fails too", async () => {
    const retryFailure = new DOMException("camera gone", "NotReadableError");
    const getUserMedia = stubGetUserMedia(
      vi
        .fn()
        .mockRejectedValueOnce(new DOMException("no mode fits", "OverconstrainedError"))
        .mockRejectedValueOnce(retryFailure),
    );

    const acquired = await acquireScannerStream(true);

    expect(acquired).toEqual({ stream: null, failure: retryFailure });
    expect(getUserMedia).toHaveBeenCalledTimes(2);
  });
});
