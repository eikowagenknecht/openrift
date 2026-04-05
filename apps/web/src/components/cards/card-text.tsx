import type { KeywordStylesResponse } from "@openrift/shared";

import { useKeywordStyles } from "@/hooks/use-keyword-styles";
import { getKeywordStyle } from "@/lib/keywords";
import { cn } from "@/lib/utils";

// Matches glyph tokens (:rb_xxx:), bracketed keywords ([Keyword]),
// parenthesized text ((reminder text)), italic markdown (_text_), and newlines.
// Italic allows glyph tokens inside so underscores in :rb_xxx: don't break it.
const TOKEN_PATTERN = /:rb_(\w+):|\[([^\]]+)\]|\(([^)]+)\)|_((?::rb_\w+:|[^_])+)_|\n/g;

export type CardTextToken =
  | { type: "text"; value: string }
  | { type: "glyph"; name: string }
  | {
      type: "keyword";
      name: string;
      children: CardTextToken[];
      pointedRight?: boolean;
      pointedLeft?: boolean;
    }
  | { type: "paren"; children: CardTextToken[] }
  | { type: "italic"; children: CardTextToken[] }
  | { type: "newline" };

export function tokenizeCardText(text: string): CardTextToken[] {
  const tokens: CardTextToken[] = [];
  let lastIndex = 0;

  for (const match of text.matchAll(TOKEN_PATTERN)) {
    if (match.index > lastIndex) {
      tokens.push({ type: "text", value: text.slice(lastIndex, match.index) });
    }

    if (match[1]) {
      tokens.push({ type: "glyph", name: match[1] });
    } else if (match[2]) {
      const raw = match[2];
      const name = raw.replaceAll(/:rb_\w+:/g, "").trim();
      tokens.push({ type: "keyword", name, children: tokenizeCardText(raw) });
    } else if (match[3]) {
      tokens.push({ type: "paren", children: tokenizeCardText(match[3]) });
    } else if (match[4]) {
      tokens.push({ type: "italic", children: tokenizeCardText(match[4]) });
    } else {
      tokens.push({ type: "newline" });
    }

    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    tokens.push({ type: "text", value: text.slice(lastIndex) });
  }

  // Merge [>] into the preceding keyword as a shape modifier (pointed right edge).
  // Merge [>>] into the following keyword as a shape modifier (pointed left edge).
  for (let i = tokens.length - 1; i >= 0; i--) {
    const tok = tokens[i];
    if (tok.type !== "keyword") {
      continue;
    }
    if (tok.name === ">" && i > 0 && tokens[i - 1].type === "keyword") {
      (tokens[i - 1] as Extract<CardTextToken, { type: "keyword" }>).pointedRight = true;
      tokens.splice(i, 1);
    } else if (tok.name === ">>" && i < tokens.length - 1 && tokens[i + 1].type === "keyword") {
      (tokens[i + 1] as Extract<CardTextToken, { type: "keyword" }>).pointedLeft = true;
      tokens.splice(i, 1);
    }
  }

  return tokens;
}

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
}

export function CardText({ text, onKeywordClick, interactive = true }: CardTextProps) {
  const styles = useKeywordStyles();
  return renderTokens(
    tokenizeCardText(text),
    styles,
    interactive ? onKeywordClick : undefined,
    interactive,
  );
}

function renderTokens(
  tokens: CardTextToken[],
  styles: KeywordStylesResponse["items"],
  onKeywordClick?: (keyword: string) => void,
  interactive = true,
): React.ReactNode[] {
  return tokens.map((token, i) => {
    switch (token.type) {
      case "glyph": {
        const monoWhite = token.name === "might" || token.name === "exhaust";
        const energy = token.name.startsWith("energy");
        return (
          <img
            key={`${i}-${token.name}`}
            src={`/images/glyphs/${token.name.replaceAll("_", "-")}.svg`}
            alt={token.name.replaceAll("_", " ")}
            className={cn(
              "inline-block size-4 align-text-bottom",
              monoWhite && "brightness-0 dark:invert",
              energy && "invert dark:invert-0",
            )}
          />
        );
      }
      case "keyword": {
        const kw = getKeywordStyle(token.name, styles);
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
              interactive ? () => onKeywordClick?.(token.name.replace(/\s+\d+$/, "")) : undefined
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
              {renderTokens(token.children, styles, onKeywordClick, interactive)}
            </span>
          </Tag>
        );
      }
      case "paren": {
        return (
          <span key={`${i}-paren`} className="italic">
            ({renderTokens(token.children, styles, onKeywordClick, interactive)})
          </span>
        );
      }
      case "italic": {
        return (
          <span key={`${i}-italic`} className="italic">
            {renderTokens(token.children, styles, onKeywordClick, interactive)}
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
