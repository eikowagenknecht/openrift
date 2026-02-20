const GLYPH_PATTERN = /:rb_(\w+):/g;

export function CardText({ text }: { text: string }) {
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;

  for (const match of text.matchAll(GLYPH_PATTERN)) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }
    const glyph = match[1];
    parts.push(
      <img
        key={`${match.index}-${glyph}`}
        src={`/icons/glyphs/${glyph}.svg`}
        alt={glyph.replaceAll("_", " ")}
        className="inline-block size-4 align-text-bottom brightness-0 dark:invert"
      />,
    );
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return <>{parts}</>;
}
