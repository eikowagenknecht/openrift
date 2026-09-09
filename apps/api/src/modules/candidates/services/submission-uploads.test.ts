import sharp from "sharp";
import { beforeEach, describe, expect, it } from "vitest";

import { defaultIo } from "../../../io.js";
import type { Io } from "../../../io.js";
import {
  mockMkdir,
  mockReadFile,
  mockUnlink,
  mockWriteFile,
  resetImageMocks,
} from "../../../test/image-mocks.js";
import {
  SUBMISSION_MEDIA_DIR,
  deleteSubmissionUpload,
  readSubmissionUpload,
  saveSubmissionUpload,
} from "./submission-uploads.js";

const io: Io = { ...defaultIo, fs: { ...defaultIo.fs, ...mockedFs() } };

function mockedFs() {
  return {
    mkdir: mockMkdir as never,
    readFile: mockReadFile as never,
    unlink: mockUnlink as never,
    writeFile: mockWriteFile as never,
  };
}

const NOW = new Date("2026-09-09T10:00:00Z");

function photo(options: { width: number; height: number; format: "png" | "jpeg" }) {
  const image = sharp({
    create: {
      width: options.width,
      height: options.height,
      channels: 3,
      background: { r: 200, g: 40, b: 90 },
    },
  });
  return options.format === "png" ? image.png().toBuffer() : image.jpeg().toBuffer();
}

function writtenBuffer(): Buffer {
  return mockWriteFile.mock.calls[0]?.[1] as Buffer;
}

function writtenPath(): string {
  return String(mockWriteFile.mock.calls[0]?.[0]);
}

function writtenMeta() {
  return sharp(writtenBuffer()).metadata();
}

beforeEach(() => {
  resetImageMocks();
});

describe("saveSubmissionUpload", () => {
  it("stores a JPEG under a uuid name and answers with its public URL", async () => {
    const result = await saveSubmissionUpload(io, {
      userId: "jpeg-user",
      buffer: await photo({ width: 300, height: 420, format: "jpeg" }),
      now: NOW,
    });

    expect(result).toStrictEqual({
      status: "ok",
      url: expect.stringMatching(
        /^\/media\/submissions\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.jpg$/u,
      ),
    });
    expect(mockMkdir).toHaveBeenCalledWith(SUBMISSION_MEDIA_DIR, { recursive: true });
    expect(writtenPath().startsWith(SUBMISSION_MEDIA_DIR)).toBe(true);
    const meta = await writtenMeta();
    expect(meta.format).toBe("jpeg");
  });

  it("keeps a PNG a PNG", async () => {
    const result = await saveSubmissionUpload(io, {
      userId: "png-user",
      buffer: await photo({ width: 120, height: 160, format: "png" }),
      now: NOW,
    });

    expect(result.status === "ok" && result.url.endsWith(".png")).toBe(true);
    const meta = await writtenMeta();
    expect(meta.format).toBe("png");
  });

  it("caps the longest edge at 4000px", async () => {
    await saveSubmissionUpload(io, {
      userId: "big-user",
      buffer: await photo({ width: 5000, height: 2500, format: "jpeg" }),
      now: NOW,
    });

    const meta = await sharp(writtenBuffer()).metadata();
    expect(meta.width).toBe(4000);
    expect(meta.height).toBe(2000);
  });

  it("leaves a smaller photo at its own size", async () => {
    await saveSubmissionUpload(io, {
      userId: "small-user",
      buffer: await photo({ width: 640, height: 480, format: "jpeg" }),
      now: NOW,
    });

    const meta = await sharp(writtenBuffer()).metadata();
    expect(meta.width).toBe(640);
    expect(meta.height).toBe(480);
  });

  it("drops the EXIF the source carried", async () => {
    const source = await sharp({
      create: { width: 200, height: 200, channels: 3, background: { r: 1, g: 2, b: 3 } },
    })
      .withExif({ IFD0: { Copyright: "Contributor", Software: "Camera" } })
      .jpeg()
      .toBuffer();
    const sourceMeta = await sharp(source).metadata();
    expect(sourceMeta.exif).toBeDefined();

    await saveSubmissionUpload(io, { userId: "exif-user", buffer: source, now: NOW });

    const meta = await writtenMeta();
    expect(meta.exif).toBeUndefined();
  });

  it("applies the EXIF orientation instead of carrying it", async () => {
    const source = await sharp({
      create: { width: 400, height: 200, channels: 3, background: { r: 9, g: 9, b: 9 } },
    })
      .withMetadata({ orientation: 6 })
      .jpeg()
      .toBuffer();

    await saveSubmissionUpload(io, { userId: "rotate-user", buffer: source, now: NOW });

    const meta = await sharp(writtenBuffer()).metadata();
    expect(meta.width).toBe(200);
    expect(meta.height).toBe(400);
  });

  it("rejects a file sharp cannot decode", async () => {
    const result = await saveSubmissionUpload(io, {
      userId: "text-user",
      buffer: Buffer.from("this is not an image"),
      now: NOW,
    });

    expect(result).toStrictEqual({ status: "not_an_image" });
    expect(mockWriteFile).not.toHaveBeenCalled();
  });

  it("rejects a truncated image", async () => {
    const png = await photo({ width: 100, height: 100, format: "png" });
    const result = await saveSubmissionUpload(io, {
      userId: "truncated-user",
      buffer: png.subarray(0, 40),
      now: NOW,
    });

    expect(result).toStrictEqual({ status: "not_an_image" });
  });

  it("caps one user at 100 uploads in a rolling 24h window", async () => {
    const buffer = await photo({ width: 8, height: 8, format: "png" });
    for (let i = 0; i < 100; i++) {
      const ok = await saveSubmissionUpload(io, { userId: "busy-user", buffer, now: NOW });
      expect(ok.status).toBe("ok");
    }

    expect(await saveSubmissionUpload(io, { userId: "busy-user", buffer, now: NOW })).toStrictEqual(
      { status: "rate_limited", limit: 100 },
    );

    const nextDay = new Date(NOW.getTime() + 24 * 60 * 60 * 1000 + 1);
    const afterWindow = await saveSubmissionUpload(io, {
      userId: "busy-user",
      buffer,
      now: nextDay,
    });
    expect(afterWindow.status).toBe("ok");
  });

  it("counts the cap per user", async () => {
    const buffer = await photo({ width: 8, height: 8, format: "png" });
    for (let i = 0; i < 100; i++) {
      await saveSubmissionUpload(io, { userId: "capped-user", buffer, now: NOW });
    }

    const other = await saveSubmissionUpload(io, { userId: "other-user", buffer, now: NOW });
    expect(other.status).toBe("ok");
  });
});

describe("readSubmissionUpload", () => {
  it("reads the file behind an upload URL", async () => {
    mockReadFile.mockResolvedValue(Buffer.from("stored"));

    const result = await readSubmissionUpload(
      io,
      "/media/submissions/0198f000-0000-7000-8000-00000000000a.jpg",
    );

    expect(result).toStrictEqual({ buffer: Buffer.from("stored"), ext: ".jpg" });
    expect(String(mockReadFile.mock.calls[0]?.[0])).toBe(
      `${SUBMISSION_MEDIA_DIR}/0198f000-0000-7000-8000-00000000000a.jpg`,
    );
  });

  it("refuses anything that is not an upload URL", async () => {
    await expect(readSubmissionUpload(io, "/media/submissions/../../etc/passwd")).rejects.toThrow(
      "Not a submission upload URL",
    );
    await expect(readSubmissionUpload(io, "https://example.test/a.jpg")).rejects.toThrow(
      "Not a submission upload URL",
    );
    expect(mockReadFile).not.toHaveBeenCalled();
  });
});

describe("deleteSubmissionUpload", () => {
  it("unlinks the stored file", async () => {
    await deleteSubmissionUpload(io, "/media/submissions/0198f000-0000-7000-8000-00000000000a.png");

    expect(String(mockUnlink.mock.calls[0]?.[0])).toBe(
      `${SUBMISSION_MEDIA_DIR}/0198f000-0000-7000-8000-00000000000a.png`,
    );
  });

  it("ignores a file that is already gone", async () => {
    mockUnlink.mockRejectedValue(Object.assign(new Error("ENOENT"), { code: "ENOENT" }));

    await expect(
      deleteSubmissionUpload(io, "/media/submissions/0198f000-0000-7000-8000-00000000000a.png"),
    ).resolves.toBeUndefined();
  });

  it("does nothing for a URL outside the upload tree", async () => {
    await deleteSubmissionUpload(io, "https://example.test/a.jpg");

    expect(mockUnlink).not.toHaveBeenCalled();
  });
});
