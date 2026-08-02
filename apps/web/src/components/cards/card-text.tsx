import type { CardTextToken, KeywordsResponse } from "@openrift/shared";
import { tokenizeCardText } from "@openrift/shared";

import { useKeywordReverseMap } from "@/hooks/use-keyword-reverse-map";
import { useKeywordStyles } from "@/hooks/use-keyword-styles";
import { getKeywordStyle } from "@/lib/keywords";
import { cn } from "@/lib/utils";

// Default shape: slanted parallelogram (left edge angled right, right edge angled left).
// pointedRight: right edge becomes an arrow pointing right.
// pointedLeft: left edge becomes an arrow pointing right (upgrade marker).
// Clip paths traced clockwise from top-left:
//
// Default (parallelogram):
//   polygon(0.3em 0%, 100% 0%, calc(100% - 0.3em) 100%, 0% 100%)
//   TL shifted right, TR at corner, BR shifted left, BL at corner → / / shape
//
// pointedRight (arrow on right):
//   ...same left, but right edge becomes: TR → tip at mid-right → BR
//   polygon(0.3em 0%, calc(100% - 0.3em) 0%, 100% 50%, calc(100% - 0.3em) 100%, 0% 100%)
//
// pointedLeft (arrow on left, upgrade marker):
//   Left edge becomes: TL at 0,0 → tip at 0.3em,50% → BL at 0,100%
//   polygon(0% 0%, ...right..., 0% 100%, 0.3em 50%)
function keywordClipPath(pointedRight?: boolean, pointedLeft?: boolean): string {
  if (pointedLeft && pointedRight) {
    // Both arrows: > shape on left, > shape on right
    return "polygon(0% 0%, calc(100% - 0.3em) 0%, 100% 50%, calc(100% - 0.3em) 100%, 0% 100%, 0.3em 50%)";
  }
  if (pointedLeft) {
    // Arrow on left, slanted right
    return "polygon(0% 0%, 100% 0%, calc(100% - 0.3em) 100%, 0% 100%, 0.3em 50%)";
  }
  if (pointedRight) {
    // Slanted left, arrow on right
    return "polygon(0.3em 0%, calc(100% - 0.3em) 0%, 100% 50%, calc(100% - 0.3em) 100%, 0% 100%)";
  }
  // Default parallelogram
  return "polygon(0.3em 0%, 100% 0%, calc(100% - 0.3em) 100%, 0% 100%)";
}

interface CardTextProps {
  text: string;
  onKeywordClick?: (keyword: string) => void;
  interactive?: boolean;
  /**
   * When true, glyphs render in their always-light treatment (white energy
   * badge, white-inverted might/exhaust). Use on dark backgrounds where the
   * default theme-aware tokens would render dark on dark.
   */
  onDark?: boolean;
}

export function CardText({
  text,
  onKeywordClick,
  interactive = true,
  onDark = false,
}: CardTextProps) {
  const styles = useKeywordStyles();
  const reverseMap = useKeywordReverseMap();
  return renderTokens(
    tokenizeCardText(text),
    styles,
    interactive ? onKeywordClick : undefined,
    interactive,
    reverseMap,
    onDark,
  );
}

function renderTokens(
  tokens: CardTextToken[],
  styles: KeywordsResponse["items"],
  onKeywordClick?: (keyword: string) => void,
  interactive = true,
  reverseMap?: Map<string, string>,
  onDark = false,
): React.ReactNode[] {
  return tokens.map((token, i) => {
    switch (token.type) {
      case "glyph": {
        const energyMatch = /^energy_?(?<level>\d+)$/u.exec(token.name);
        if (energyMatch) {
          return (
            <span
              key={`${i}-${token.name}`}
              aria-label={`energy ${energyMatch[1]}`}
              className={cn(
                // inline-block + overflow-hidden anchors align at the box bottom (an inline-flex baseline
                // is the digit's, hanging the circle ~4px low); leading-[1.45em] = the box height centers
                // the digit, and -0.179em of the own 0.7em font-size = the glyph images' -0.125em offset
                "inline-block size-[1.45em] overflow-hidden rounded-full text-center align-[-0.179em] text-[0.7em] leading-[1.45em] font-bold not-italic",
                onDark ? "bg-white text-black" : "bg-foreground text-background",
              )}
            >
              {energyMatch[1]}
            </span>
          );
        }
        const monoWhite = token.name === "might" || token.name === "exhaust";
        return (
          <img
            key={`${i}-${token.name}`}
            src={`/images/glyphs/${token.name.replaceAll("_", "-")}.svg`}
            alt={token.name.replaceAll("_", " ")}
            className={cn(
              "inline-block size-[1em] align-[-0.125em]",
              monoWhite && (onDark ? "brightness-0 invert" : "brightness-0 dark:invert"),
            )}
          />
        );
      }
      case "keyword": {
        const kw = getKeywordStyle(token.name, styles, reverseMap);
        const Tag = interactive ? "button" : "span";
        return (
          <Tag
            key={`${i}-kw`}
            {...(interactive ? { type: "button" as const } : {})}
            className={cn(
              "relative inline-flex items-center pr-2.5 pl-2 align-baseline",
              interactive && "cursor-pointer",
              onKeywordClick && "hover:brightness-125",
            )}
            onClick={
              interactive ? () => onKeywordClick?.(token.name.replace(/\s+\d+$/u, "")) : undefined
            }
          >
            <span
              className="absolute inset-0"
              style={{
                backgroundColor: kw.bg,
                clipPath: keywordClipPath(token.pointedRight, token.pointedLeft),
              }}
            />
            <span
              className={cn(
                "relative text-[0.8em] font-semibold tracking-tight uppercase italic",
                kw.dark ? "text-black" : "text-white",
              )}
            >
              {renderTokens(
                token.children,
                styles,
                onKeywordClick,
                interactive,
                reverseMap,
                onDark,
              )}
            </span>
          </Tag>
        );
      }
      case "paren": {
        return (
          <span key={`${i}-paren`} className="italic">
            ({renderTokens(token.children, styles, onKeywordClick, interactive, reverseMap, onDark)}
            )
          </span>
        );
      }
      case "italic": {
        return (
          <span key={`${i}-italic`} className="italic">
            {renderTokens(token.children, styles, onKeywordClick, interactive, reverseMap, onDark)}
          </span>
        );
      }
      case "newline": {
        return <span key={`${i}-br`} className="block h-2" />;
      }
      case "text": {
        return token.value;
      }
      default: {
        return null;
      }
    }
  });
}
