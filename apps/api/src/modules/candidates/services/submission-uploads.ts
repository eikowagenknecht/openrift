// oxlint-disable-next-line import/no-nodejs-modules -- server-side file needs filesystem path join
import { extname, join } from "node:path";

import { isSubmissionUploadUrl } from "@openrift/shared/contribute-schema";
import { v7 as uuidv7 } from "uuid";

import type { Repos } from "../../../deps.js";
import type { Io } from "../../../io.js";
import { MEDIA_DIR } from "../../catalog/services/images/paths.js";

export const SUBMISSION_MEDIA_DIR = join(MEDIA_DIR, "submissions");

const URL_PREFIX = "/media/submissions/";

const UPLOAD_DAILY_LIMIT = 100;

const DAY_MS = 24 * 60 * 60 * 1000;

const MAX_EDGE_PX = 4000;

const JPEG_QUALITY = 92;

const uploadTimesByUser = new Map<string, number[]>();

export type SubmissionUploadResult =
  | { status: "ok"; url: string }
  | { status: "not_an_image" }
  | { status: "rate_limited"; limit: number };

interface SaveSubmissionUploadArgs {
  userId: string;
  buffer: Buffer;
  now: Date;
}

async function reencode(io: Io, buffer: Buffer): Promise<{ data: Buffer; ext: string } | null> {
  try {
    const { format } = await io.sharp(buffer).metadata();
    if (!format) {
      return null;
    }
    // Re-encoding is what drops EXIF, GPS included: sharp writes no metadata
    // unless asked to.
    const pipeline = io
      .sharp(buffer)
      .rotate()
      .resize(MAX_EDGE_PX, MAX_EDGE_PX, { fit: "inside", withoutEnlargement: true });
    return format === "png"
      ? { data: await pipeline.png().toBuffer(), ext: "png" }
      : { data: await pipeline.jpeg({ quality: JPEG_QUALITY }).toBuffer(), ext: "jpg" };
  } catch {
    return null;
  }
}

// nginx serves `media/submissions/` to anyone; the uuid filename is the only thing keeping an upload unlisted.
export async function saveSubmissionUpload(
  io: Io,
  args: SaveSubmissionUploadArgs,
): Promise<SubmissionUploadResult> {
  const { userId, buffer, now } = args;

  const since = now.getTime() - DAY_MS;
  const recent = (uploadTimesByUser.get(userId) ?? []).filter((at) => at > since);
  if (recent.length >= UPLOAD_DAILY_LIMIT) {
    uploadTimesByUser.set(userId, recent);
    return { status: "rate_limited", limit: UPLOAD_DAILY_LIMIT };
  }

  const encoded = await reencode(io, buffer);
  if (!encoded) {
    return { status: "not_an_image" };
  }

  const name = `${uuidv7()}.${encoded.ext}`;
  await io.fs.mkdir(SUBMISSION_MEDIA_DIR, { recursive: true });
  await io.fs.writeFile(join(SUBMISSION_MEDIA_DIR, name), encoded.data);

  recent.push(now.getTime());
  uploadTimesByUser.set(userId, recent);

  return { status: "ok", url: `${URL_PREFIX}${name}` };
}

export async function readSubmissionUpload(
  io: Io,
  url: string,
): Promise<{ buffer: Buffer; ext: string }> {
  if (!isSubmissionUploadUrl(url)) {
    throw new Error(`Not a submission upload URL: ${url}`);
  }
  const name = url.slice(URL_PREFIX.length);
  const buffer = await io.fs.readFile(join(SUBMISSION_MEDIA_DIR, name));
  return { buffer, ext: extname(name) };
}

export async function deleteSubmissionUpload(io: Io, url: string): Promise<void> {
  if (!isSubmissionUploadUrl(url)) {
    return;
  }
  const name = url.slice(URL_PREFIX.length);
  // oxlint-disable-next-line no-empty-function -- swallow missing-file errors
  await io.fs.unlink(join(SUBMISSION_MEDIA_DIR, name)).catch(() => {});
}

// An upload an admin already attached stays: `image_files.original_url` still points at it.
export async function discardSubmissionUploads(
  io: Io,
  repos: Repos,
  candidateCardId: string,
): Promise<void> {
  try {
    const imageUrls = await repos.cardSubmissions.candidatePrintingImageUrls(candidateCardId);
    const urls = imageUrls.filter((url) => isSubmissionUploadUrl(url));
    if (urls.length === 0) {
      return;
    }
    const inUse = await repos.printingImages.originalUrlsInUse(urls);
    for (const url of urls) {
      if (!inUse.has(url)) {
        await deleteSubmissionUpload(io, url);
      }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[submission-uploads] Cleanup failed for candidate ${candidateCardId}:`, message);
  }
}
