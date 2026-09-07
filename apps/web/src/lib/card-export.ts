/**
 * Browser-only export plumbing for the card designer: rasterize a rendered
 * card element to a PNG via html2canvas-pro, then download or copy it.
 */
import { html2canvas } from "html2canvas-pro";

/** px */
export const CARD_EXPORT_WIDTH = 750;

export type ExportAction = "download" | "copy";
export type ExportOutcome = "downloaded" | "copied";

// html2canvas-pro reads clip-path polygons but not em/calc units; resolve
// those to percentages before capture.
function resolveClipPaths(element: HTMLElement): void {
  const inlineClip = element.style.clipPath;
  if (
    inlineClip &&
    inlineClip.includes("polygon") &&
    (inlineClip.includes("em") || inlineClip.includes("calc"))
  ) {
    const computed = getComputedStyle(element).clipPath;
    const width = element.offsetWidth;
    const height = element.offsetHeight;
    if (width > 0 && height > 0 && computed.includes("polygon")) {
      const converted = computed.replaceAll(/[\d.]+px/gu, (match, offset) => {
        // oxlint-disable-next-line unicorn/prefer-number-coercion -- match includes the "px" unit; Number() would yield NaN
        const px = Number.parseFloat(match);
        const before = computed.slice(computed.indexOf("(") + 1, offset);
        const valueIndex = before.split(/[\s,]+/u).filter(Boolean).length;
        const isX = valueIndex % 2 === 0;
        const percent = isX ? (px / width) * 100 : (px / height) * 100;
        return `${percent.toFixed(1)}%`;
      });
      element.style.clipPath = converted;
    }
  }
  for (const child of element.children) {
    if (child instanceof HTMLElement) {
      resolveClipPaths(child);
    }
  }
}

// Two animation frames so React has committed and the browser has laid out
// and painted the off-screen card before capture.
export function waitForRender(): Promise<void> {
  // oxlint-disable-next-line promise/avoid-new -- wrapping requestAnimationFrame callback API
  return new Promise<void>((resolve) => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => resolve());
    });
  });
}

async function captureCardPng(element: HTMLElement): Promise<Blob> {
  resolveClipPaths(element);
  const canvas = await html2canvas(element, {
    width: element.offsetWidth,
    height: element.offsetHeight,
    scale: 2,
    useCORS: true,
    backgroundColor: null,
  });
  // oxlint-disable-next-line promise/avoid-new -- wrapping the canvas.toBlob callback API
  const blob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob(resolve, "image/png");
  });
  if (!blob) {
    throw new Error("Failed to rasterize the card.");
  }
  return blob;
}

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

async function copyImageToClipboard(blob: Blob): Promise<boolean> {
  if (typeof ClipboardItem === "undefined" || !navigator.clipboard?.write) {
    return false;
  }
  const result = await navigator.clipboard
    .write([new ClipboardItem({ "image/png": blob })])
    .then(() => true)
    .catch(() => false);
  return result;
}

// Copy falls back to a download when the clipboard is unavailable.
export async function exportCardImage(
  element: HTMLElement,
  action: ExportAction,
  filename: string,
): Promise<ExportOutcome> {
  await (document.fonts?.ready ?? Promise.resolve());
  const blob = await captureCardPng(element);
  if (action === "copy" && (await copyImageToClipboard(blob))) {
    return "copied";
  }
  downloadBlob(blob, filename);
  return "downloaded";
}
