import { useMutation } from "@tanstack/react-query";

import { uploadImageErrorMessage } from "@/features/contribute/lib/submission-upload-error";
import { ApiError } from "@/lib/server-fns/api-error";

const UPLOAD_PATH = "/api/v1/card-submissions/images";

async function uploadSubmissionImage(file: File): Promise<string> {
  const body = new FormData();
  body.append("file", file);
  const response = await fetch(`${globalThis.location.origin}${UPLOAD_PATH}`, {
    method: "POST",
    body,
    credentials: "include",
  });
  if (!response.ok) {
    throw new ApiError(uploadImageErrorMessage(response.status), {
      status: response.status,
      diagnostic: `POST ${UPLOAD_PATH} → ${response.status}`,
    });
  }
  const { url } = (await response.json()) as { url: string };
  return url;
}

export function useUploadSubmissionImage() {
  return useMutation({ mutationFn: uploadSubmissionImage });
}
