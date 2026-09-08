export interface PostSlide {
  printingId: string;
  imageFileId: string;
}

const SLIDE_SEPARATOR = ",";
const PART_SEPARATOR = ":";

function slideKey(slide: PostSlide): string {
  return `${slide.printingId}${PART_SEPARATOR}${slide.imageFileId}`;
}

export function encodePostSlides(slides: readonly PostSlide[]): string {
  return slides.map((slide) => slideKey(slide)).join(SLIDE_SEPARATOR);
}

export function decodePostSlides(value: string | undefined): PostSlide[] {
  if (value === undefined || value.length === 0) {
    return [];
  }
  const slides: PostSlide[] = [];
  const seen = new Set<string>();
  for (const entry of value.split(SLIDE_SEPARATOR)) {
    const [rawPrintingId, rawImageFileId, ...extra] = entry.split(PART_SEPARATOR);
    if (rawPrintingId === undefined || rawImageFileId === undefined || extra.length > 0) {
      continue;
    }
    const printingId = rawPrintingId.trim();
    const imageFileId = rawImageFileId.trim();
    if (printingId.length === 0 || imageFileId.length === 0) {
      continue;
    }
    const slide = { printingId, imageFileId };
    const key = slideKey(slide);
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    slides.push(slide);
  }
  return slides;
}

export function addSlide(slides: readonly PostSlide[], slide: PostSlide): PostSlide[] {
  if (slides.some((entry) => slideKey(entry) === slideKey(slide))) {
    return [...slides];
  }
  return [...slides, slide];
}

export function removeSlide(slides: readonly PostSlide[], index: number): PostSlide[] {
  if (index < 0 || index >= slides.length) {
    return [...slides];
  }
  return slides.filter((_, position) => position !== index);
}

export function moveSlide(slides: readonly PostSlide[], from: number, to: number): PostSlide[] {
  if (from < 0 || from >= slides.length || to < 0 || to >= slides.length || from === to) {
    return [...slides];
  }
  const next = [...slides];
  const [moved] = next.splice(from, 1);
  if (moved === undefined) {
    return next;
  }
  next.splice(to, 0, moved);
  return next;
}
