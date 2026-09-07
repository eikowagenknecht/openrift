import type { ImageVariant } from "@openrift/shared";

import { CardArtThumb } from "@/components/cards/card-art-thumb";
import { getPipBackgroundStyle } from "@/lib/domain";
import { getFilterIconPath } from "@/lib/icons";
import { cn } from "@/lib/utils";

interface CardMiniRowProps {
  src?: string | null;
  imageId?: string | null;
  variant?: ImageVariant;
  alt?: string;
  landscape?: boolean;
  domains?: string[];
  domainColors?: Record<string, string>;
  rarity?: string | null;
  foil?: boolean;
  rarityLabels?: Record<string, string>;
  shortCode?: string | null;
  loading?: "eager" | "lazy";
  className?: string;
  artClassName?: string;
  metaClassName?: string;
  hideMetaOnMobile?: boolean;
}

export function CardMiniRow({
  src,
  imageId,
  variant = "120w",
  alt = "",
  landscape = false,
  domains,
  domainColors,
  rarity,
  foil = false,
  rarityLabels,
  shortCode,
  loading,
  className,
  artClassName,
  metaClassName = "w-20",
  hideMetaOnMobile = false,
}: CardMiniRowProps) {
  const rarityIcon = rarity ? getFilterIconPath("rarities", rarity) : undefined;
  const showMeta = Boolean(rarityIcon) || Boolean(shortCode);
  const showBar = domains !== undefined && domains.length > 0;

  return (
    <span className={cn("flex min-w-0 items-stretch gap-1.5", className)}>
      <CardArtThumb
        shape="strip"
        src={src}
        imageId={imageId}
        variant={variant}
        alt={alt}
        landscape={landscape}
        rarity={rarity}
        domains={domains}
        foil={foil}
        loading={loading}
        className={artClassName}
      />

      {showBar && (
        <span
          aria-hidden
          className="w-0.5 shrink-0 self-stretch rounded-full"
          style={getPipBackgroundStyle(domains, domainColors)}
        />
      )}

      {showMeta && (
        <span
          className={cn(
            "shrink-0 items-center gap-1.5",
            hideMetaOnMobile ? "hidden sm:flex" : "flex",
            metaClassName,
          )}
        >
          {rarityIcon && (
            <img
              src={rarityIcon}
              alt=""
              title={rarity && rarityLabels ? rarityLabels[rarity] : undefined}
              className="size-3.5 shrink-0"
            />
          )}
          {shortCode && (
            <span className="text-muted-foreground truncate font-mono text-xs">{shortCode}</span>
          )}
        </span>
      )}
    </span>
  );
}
