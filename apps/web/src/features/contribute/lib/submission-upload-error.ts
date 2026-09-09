const UPLOAD_STATUS_MESSAGES: Record<number, string> = {
  400: "That file is not an image. A JPG or PNG photo of the card works.",
  413: "That photo is larger than 20 MB. Send a smaller one, or paste a link instead.",
  429: "That is every upload for today. Try again tomorrow, or paste a link instead.",
};

export function uploadImageErrorMessage(status: number): string {
  return UPLOAD_STATUS_MESSAGES[status] ?? "The upload did not go through. Try again in a moment.";
}
