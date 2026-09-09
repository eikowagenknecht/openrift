import { isSubmissionUploadUrl } from "@openrift/shared/contribute-schema";

import type { Io } from "../../../../io.js";
import { readSubmissionUpload } from "../../../candidates/services/submission-uploads.js";
import { downloadImage } from "./download.js";

// `downloadImage` cannot fetch a contributor photo: its SSRF guard rejects the relative URL.
export function fetchOriginalImage(io: Io, url: string): Promise<{ buffer: Buffer; ext: string }> {
  return isSubmissionUploadUrl(url) ? readSubmissionUpload(io, url) : downloadImage(io, url);
}
