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
  | { type: "keyword"; name: string }
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
      tokens.push({ type: "keyword", name: match[2] });
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

  return tokens;
}

interface CardTextProps {
  text: string;
  onKeywordClick?: (keyword: string) => void;
}

export function CardText({ text, onKeywordClick }: CardTextProps) {
  const styles = useKeywordStyles();
  return renderTokens(tokenizeCardText(text), styles, onKeywordClick);
}

function renderTokens(
  tokens: CardTextToken[],
  styles: KeywordStylesResponse,
  onKeywordClick?: (keyword: string) => void,
): React.ReactNode[] {
  return tokens.map((token, i) => {
    switch (token.type) {
      case "glyph": {
        return (
          <img
            key={`${i}-${token.name}`}
            src={`/images/glyphs/${token.name.replaceAll("_", "-")}.svg`}
            alt={token.name.replaceAll("_", " ")}
            className="inline-block size-4 align-text-bottom"
          />
        );
      }
      case "keyword": {
        const kw = getKeywordStyle(token.name, styles);
        return (
          <button
            key={`${i}-kw`}
            type="button"
            className={cn(
              "relative inline-flex cursor-pointer items-center px-1 align-baseline",
              onKeywordClick && "hover:brightness-125",
            )}
            onClick={() => onKeywordClick?.(token.name)}
          >
            <span className="absolute inset-0 -skew-x-[15deg]" style={{ backgroundColor: kw.bg }} />
            <span
              className={cn(
                "relative text-[0.8em] font-semibold uppercase italic tracking-tight",
                kw.dark ? "text-black" : "text-white",
              )}
            >
              {token.name}
            </span>
          </button>
        );
      }
      case "paren": {
        return (
          <span key={`${i}-paren`} className="italic">
            ({renderTokens(token.children, styles, onKeywordClick)})
          </span>
        );
      }
      case "italic": {
        return (
          <span key={`${i}-italic`} className="italic">
            {renderTokens(token.children, styles, onKeywordClick)}
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
