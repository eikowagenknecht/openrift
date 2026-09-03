import { imageUrl } from "@openrift/shared";

import { ImgWithFallback } from "@/components/ui/img-with-fallback";

/**
 * A legend's splash beside a record. The crop is pulled toward the top third,
 * which is where the character sits on every Riftbound legend, and fades into the
 * card from the text side so the counters stay readable over it.
 *
 * @returns The artwork layer, or null when the card has no usable image.
 */
export function MetaHeroArt({ imageId, alt }: { imageId: string | null; alt: string }) {
  if (imageId === null) {
    return null;
  }
  return (
    <div className="pointer-events-none absolute inset-y-0 right-0 w-1/2 overflow-hidden sm:w-2/5">
      <ImgWithFallback
        src={imageUrl(imageId, "400w")}
        alt={alt}
        draggable={false}
        className="h-full w-full object-cover"
        style={{ objectPosition: "50% 18%" }}
        fallback={null}
      />
      <div className="from-card via-card/85 absolute inset-0 bg-linear-to-r to-transparent to-70%" />
      <div className="from-card absolute inset-0 bg-linear-to-t from-0% to-transparent to-35% sm:hidden" />
    </div>
  );
}

/** One number an archive hero states about what the page's record holds. */
export function MetaHeroCounter({ value, label }: { value: number; label: string }) {
  return (
    <p className="flex flex-col gap-0.5">
      <span className="font-heading text-2xl leading-none font-bold tabular-nums">
        {/* Pinned grouping: the page is server-rendered, and a server on another
            default locale would send "1.247" into a browser rendering "1,247". */}
        {value.toLocaleString("en-US")}
      </span>
      <span className="text-muted-foreground text-xs">{label}</span>
    </p>
  );
}
