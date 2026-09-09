import { ERROR_CODES } from "@openrift/shared/error-codes";
import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { registerRouterForTest } from "../../../test/mount-router.js";
import { readJson } from "../../../test/read-json.js";
import type { Variables } from "../../../types.js";
import { saveSubmissionUpload } from "../services/submission-uploads.js";
import {
  cardSubmissionsRouter,
  mountCardSubmissionsMiddleware,
} from "./authenticated-card-submissions";

vi.mock("../services/submission-uploads.js", () => ({
  saveSubmissionUpload: vi.fn(),
}));

const mockSaveSubmissionUpload = vi.mocked(saveSubmissionUpload);

// Mounted on a bare app with no router: an over-cap request never reaches one.
const app = new Hono<{ Variables: Variables }>();
mountCardSubmissionsMiddleware(app);
app.post("/api/v1/card-submissions", (c) => c.json({ ok: true }));
app.post("/api/v1/card-submissions/images", (c) => c.json({ ok: true }));

function submit(noteLength: number) {
  return app.request("/api/v1/card-submissions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ slug: "vi", submissionNote: "x".repeat(noteLength) }),
  });
}

function upload(bytes: number) {
  return app.request("/api/v1/card-submissions/images", {
    method: "POST",
    headers: { "Content-Type": "application/octet-stream" },
    body: Buffer.alloc(bytes),
  });
}

describe("card-submissions body limit", () => {
  it("rejects a submission over 256 KB with a 413 the oRPC client can parse", async () => {
    const res = await submit(256 * 1024);

    expect(res.status).toBe(413);
    // `defined` and `status` must match the shape of this endpoint's other errors
    // or the client discards the body as a malformed response.
    expect(await readJson(res)).toStrictEqual({
      defined: false,
      code: ERROR_CODES.PAYLOAD_TOO_LARGE,
      status: 413,
      message: "Submission exceeds 256 KB",
    });
  });

  it("lets an under-cap submission through", async () => {
    const res = await submit(100);

    expect(res.status).toBe(200);
  });

  it("gives the upload path its own 20 MB cap", async () => {
    const overSubmitCap = await upload(256 * 1024 + 1);
    expect(overSubmitCap.status).toBe(200);

    const res = await upload(20 * 1024 * 1024 + 1);

    expect(res.status).toBe(413);
    expect(await readJson(res)).toStrictEqual({
      defined: false,
      code: ERROR_CODES.PAYLOAD_TOO_LARGE,
      status: 413,
      message: "File exceeds 20 MB",
    });
  });
});

const USER_ID = "a0000000-0001-4000-a000-000000000001";

const mockCardSubmissions = { missingImagesForUser: vi.fn() };

const routed = new Hono<{ Variables: Variables }>();
routed.use("*", async (c, next) => {
  c.set("user", { id: USER_ID } as never);
  c.set("io", {} as never);
  c.set("repos", { cardSubmissions: mockCardSubmissions } as never);
  await next();
});
registerRouterForTest(routed, cardSubmissionsRouter);

function postImage(size: number) {
  const body = new FormData();
  body.append("file", new File([new Uint8Array(size)], "card.jpg", { type: "image/jpeg" }));
  return routed.request("/api/v1/card-submissions/images", { method: "POST", body });
}

describe("POST /card-submissions/images", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("answers with the stored URL", async () => {
    mockSaveSubmissionUpload.mockResolvedValue({
      status: "ok",
      url: "/media/submissions/0198f000-0000-7000-8000-00000000000a.jpg",
    });

    const res = await postImage(64);

    expect(res.status).toBe(200);
    expect(await readJson(res)).toStrictEqual({
      url: "/media/submissions/0198f000-0000-7000-8000-00000000000a.jpg",
    });
    expect(mockSaveSubmissionUpload.mock.calls[0]?.[1]).toMatchObject({ userId: USER_ID });
  });

  it("refuses a file over 20 MB before decoding it", async () => {
    const res = await postImage(20 * 1024 * 1024 + 1);

    expect(res.status).toBe(413);
    const body = await readJson(res);
    expect(body.code).toBe(ERROR_CODES.PAYLOAD_TOO_LARGE);
    expect(mockSaveSubmissionUpload).not.toHaveBeenCalled();
  });

  it("reports a file that is not an image as a bad request", async () => {
    mockSaveSubmissionUpload.mockResolvedValue({ status: "not_an_image" });

    const res = await postImage(64);

    expect(res.status).toBe(400);
    const body = await readJson(res);
    expect(body.code).toBe(ERROR_CODES.BAD_REQUEST);
  });

  it("reports the daily cap as 429 naming the limit", async () => {
    mockSaveSubmissionUpload.mockResolvedValue({ status: "rate_limited", limit: 100 });

    const res = await postImage(64);

    expect(res.status).toBe(429);
    const body = await readJson(res);
    expect(body.code).toBe("TOO_MANY_REQUESTS");
    expect(body.message).toContain("100");
  });
});

describe("GET /card-submissions/missing-images", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns the signed-in user's printings without artwork", async () => {
    const item = {
      printingId: "00000000-0000-4000-a000-000000000009",
      cardSlug: "jinx",
      cardName: "Jinx",
      setSlug: "origins",
      setName: "Origins",
      publicCode: "OGN-015/298",
      finish: "normal",
      language: "EN",
      copies: 3,
    };
    mockCardSubmissions.missingImagesForUser.mockResolvedValue([item]);

    const res = await routed.request("/api/v1/card-submissions/missing-images");

    expect(res.status).toBe(200);
    expect(await readJson(res)).toStrictEqual({ items: [item] });
    expect(mockCardSubmissions.missingImagesForUser).toHaveBeenCalledWith(USER_ID);
  });
});
