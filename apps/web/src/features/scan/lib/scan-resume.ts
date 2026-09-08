const RESUME_PROMPT_AFTER_MS = 24 * 60 * 60 * 1000;

export function shouldPromptResume(lastScanAt: number | null): boolean {
  return lastScanAt === null || Date.now() - lastScanAt >= RESUME_PROMPT_AFTER_MS;
}

export function describeLastScan(lastScanAt: number | null): string {
  if (lastScanAt === null) {
    return "in an earlier session";
  }
  const days = Math.floor((Date.now() - lastScanAt) / (24 * 60 * 60 * 1000));
  if (days <= 0) {
    return "earlier today";
  }
  if (days === 1) {
    return "yesterday";
  }
  return `${days} days ago`;
}
