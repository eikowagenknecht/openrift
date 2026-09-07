import type { ShareImageAspect } from "@openrift/shared/share-image-params";

import type { DeckImageInput } from "./deck-image-parts.js";
import type { ShareImageInput, ShareImageOptions } from "./share-image.js";
import type { TierListImageInput } from "./tier-list-image.js";

/**
 * Type-only, so importing a job shape never pulls satori or resvg into the
 * main thread's module graph. Every payload must survive structured clone:
 * repositories and `Io` stay on the caller's side, the worker builds its own.
 */
export type RenderJob =
  | { kind: "share"; input: ShareImageInput; scale: number; options: ShareImageOptions }
  | { kind: "deck"; input: DeckImageInput; scale: number; aspect: ShareImageAspect }
  | { kind: "tierList"; input: TierListImageInput; scale: number; aspect: ShareImageAspect };

export type RenderResponse =
  | { id: number; ok: true; png: Uint8Array }
  | { id: number; ok: false; message: string; stack?: string };
