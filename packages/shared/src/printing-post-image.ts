export const POST_IMAGE_LABELS = ["announced", "released", "collected"] as const;

export type PostImageLabel = (typeof POST_IMAGE_LABELS)[number];

export const POST_IMAGE_LABEL_TEXT: Record<PostImageLabel, string> = {
  announced: "Announced",
  released: "Released",
  collected: "Collected",
};

export const POST_IMAGE_ASPECTS = {
  square: { w: 1080, h: 1080 },
  portrait: { w: 1080, h: 1350 },
  story: { w: 1080, h: 1920 },
} as const;

export type PostImageAspect = keyof typeof POST_IMAGE_ASPECTS;

export const MAX_POST_IMAGE_SCALE = 2;

export function postImageLabelFromQuery(value: string | undefined | null): PostImageLabel {
  return (POST_IMAGE_LABELS as readonly string[]).includes(value ?? "")
    ? (value as PostImageLabel)
    : "released";
}

export function postImageAspectFromQuery(value: string | undefined | null): PostImageAspect {
  return value !== null && value !== undefined && Object.hasOwn(POST_IMAGE_ASPECTS, value)
    ? (value as PostImageAspect)
    : "square";
}

export function postImageScaleFromQuery(value: string | undefined | null): number {
  return Number(value) === MAX_POST_IMAGE_SCALE ? MAX_POST_IMAGE_SCALE : 1;
}
