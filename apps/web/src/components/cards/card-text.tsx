import { getKeywordStyle } from "@/lib/keywords";
import { cn } from "@/lib/utils";

// Matches glyph tokens (:rb_xxx:), bracketed keywords ([Keyword]),
// parenthesized text ((reminder text)), and newlines
const TOKEN_PATTERN = /:rb_(\w+):|\[([^\]]+)\]|\(([^)]+)\)|\n/g;

interface CardTextProps {
  text: string;
  onKeywordClick?: (keyword: string) => void;
}

export function CardText({ text, onKeywordClick }: CardTextProps) {
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;

  for (const match of text.matchAll(TOKEN_PATTERN)) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }

    if (match[1]) {
      // Glyph match
      const glyph = match[1];
      parts.push(
        <img
          key={`${match.index}-${glyph}`}
          src={`/images/glyphs/${glyph.replaceAll("_", "-")}.svg`}
          alt={glyph.replaceAll("_", " ")}
          className="inline-block size-4 align-text-bottom"
        />,
      );
    } else if (match[2]) {
      // Keyword match
      const keyword = match[2];
      const kw = getKeywordStyle(keyword);
      parts.push(
        <button
          key={`${match.index}-kw`}
          type="button"
          className={cn(
            "relative inline-flex cursor-pointer items-center px-1 align-baseline",
            onKeywordClick && "hover:brightness-125",
          )}
          onClick={() => onKeywordClick?.(keyword)}
        >
          <span className="absolute inset-0 -skew-x-[15deg]" style={{ backgroundColor: kw.bg }} />
          <span
            className={cn(
              "relative text-[0.8em] font-semibold uppercase italic tracking-tight",
              kw.dark ? "text-black" : "text-white",
            )}
          >
            {keyword}
          </span>
        </button>,
      );
    } else if (match[3]) {
      // Parenthesized text — render italic with parens, recurse for inner glyphs
      parts.push(
        <span key={`${match.index}-paren`} className="italic">
          (<CardText text={match[3]} onKeywordClick={onKeywordClick} />)
        </span>,
      );
    } else {
      // Newline match — use a block spacer for visual separation
      parts.push(<span key={`${match.index}-br`} className="block h-2" />);
    }

    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return parts;
}
