import { HelpCircleIcon, ItalicIcon, WandSparklesIcon } from "lucide-react";
import { useId, useRef, useState } from "react";

import { CardText } from "@/components/cards/card-text";
import { Button } from "@/components/ui/button";
import { ButtonGroup } from "@/components/ui/button-group";
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
  ComboboxTrigger,
} from "@/components/ui/combobox";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useKeywordStyles } from "@/hooks/use-keyword-styles";

const ENERGY_GLYPHS = [0, 1, 2, 3, 4, 5, 6, 7] as const;

const RUNE_GLYPHS: { token: string; label: string }[] = [
  { token: "rune_body", label: "Body" },
  { token: "rune_calm", label: "Calm" },
  { token: "rune_chaos", label: "Chaos" },
  { token: "rune_fury", label: "Fury" },
  { token: "rune_mind", label: "Mind" },
  { token: "rune_order", label: "Order" },
  { token: "rune_rainbow", label: "Rainbow" },
];

const UTILITY_GLYPHS: { token: string; label: string }[] = [
  { token: "might", label: "Might" },
  { token: "exhaust", label: "Exhaust" },
];

export function insertAtCaret(
  value: string,
  selectionStart: number,
  selectionEnd: number,
  token: string,
): { value: string; caret: number } {
  const start = Math.max(0, Math.min(selectionStart, value.length));
  const end = Math.max(start, Math.min(selectionEnd, value.length));
  const before = value.slice(0, start);
  const after = value.slice(end);
  return { value: before + token + after, caret: start + token.length };
}

export function wrapAtCaret(
  value: string,
  selectionStart: number,
  selectionEnd: number,
  prefix: string,
  suffix: string,
): { value: string; caret: number } {
  const start = Math.max(0, Math.min(selectionStart, value.length));
  const end = Math.max(start, Math.min(selectionEnd, value.length));
  const before = value.slice(0, start);
  const selected = value.slice(start, end);
  const after = value.slice(end);
  const wrapped = prefix + selected + suffix;
  const caret = selected.length === 0 ? start + prefix.length : start + wrapped.length;
  return { value: before + wrapped + after, caret };
}

/**
 * "rules": full card-syntax toolbar and a CardText-rendered preview.
 * "flavor": punctuation-only toolbar and a plain italic preview.
 */
export type CardTextVariant = "rules" | "flavor";

interface CardTextInputProps {
  label: string;
  value: string;
  onChange: (next: string) => void;
  rows?: number;
  placeholder?: string;
  variant?: CardTextVariant;
  /** When provided, shows a "Fix" button that reformats the value through this transform. */
  reformat?: (value: string) => string;
}

export function CardTextInput({
  label,
  value,
  onChange,
  rows = 2,
  placeholder,
  variant = "rules",
  reformat,
}: CardTextInputProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const id = useId();

  const insert = (token: string) => {
    const ta = textareaRef.current;
    const start = ta?.selectionStart ?? value.length;
    const end = ta?.selectionEnd ?? value.length;
    const next = insertAtCaret(value, start, end, token);
    onChange(next.value);
    queueMicrotask(() => {
      const el = textareaRef.current;
      if (!el) {
        return;
      }
      el.focus();
      el.setSelectionRange(next.caret, next.caret);
    });
  };

  const wrap = (prefix: string, suffix: string) => {
    const ta = textareaRef.current;
    const start = ta?.selectionStart ?? value.length;
    const end = ta?.selectionEnd ?? value.length;
    const next = wrapAtCaret(value, start, end, prefix, suffix);
    onChange(next.value);
    queueMicrotask(() => {
      const el = textareaRef.current;
      if (!el) {
        return;
      }
      el.focus();
      el.setSelectionRange(next.caret, next.caret);
    });
  };

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between gap-2">
        <Label htmlFor={id}>{label}</Label>
        {variant === "rules" && <SyntaxHelpPopover />}
      </div>
      <SyntaxToolbar
        onInsert={insert}
        onWrap={wrap}
        variant={variant}
        onReformat={reformat ? () => onChange(reformat(value)) : undefined}
      />
      <Textarea
        id={id}
        ref={textareaRef}
        rows={rows}
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
      />
      <CardTextPreview text={value} variant={variant} />
    </div>
  );
}

function SyntaxToolbar({
  onInsert,
  onWrap,
  variant,
  onReformat,
}: {
  onInsert: (token: string) => void;
  onWrap: (prefix: string, suffix: string) => void;
  variant: CardTextVariant;
  onReformat?: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {variant === "rules" && (
        <ButtonGroup aria-label="Text formatting">
          <Button
            type="button"
            variant="outline"
            size="icon-sm"
            title="Italic (_text_)"
            aria-label="Italic"
            onClick={() => onWrap("_", "_")}
          >
            <ItalicIcon className="size-4" />
          </Button>
        </ButtonGroup>
      )}
      <ButtonGroup aria-label="Punctuation">
        <PunctuationButton
          label="Curly double quotes"
          title="Curly double quotes (“ ”)"
          onClick={() => onWrap("“", "”")}
        >
          “”
        </PunctuationButton>
        <PunctuationButton label="Apostrophe" title="Apostrophe (’)" onClick={() => onInsert("’")}>
          ’
        </PunctuationButton>
        <PunctuationButton label="Em dash" title="Em dash (—)" onClick={() => onInsert("—")}>
          —
        </PunctuationButton>
        <PunctuationButton label="Ellipsis" title="Ellipsis (…)" onClick={() => onInsert("…")}>
          …
        </PunctuationButton>
        <PunctuationButton label="Bullet" title="Bullet (•)" onClick={() => onInsert("•")}>
          •
        </PunctuationButton>
      </ButtonGroup>
      {onReformat && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          title="Reformat typography (curly quotes, ellipsis, minus signs, spacing)"
          onClick={onReformat}
        >
          <WandSparklesIcon className="size-3.5" />
          Fix
        </Button>
      )}
      {variant === "flavor" ? null : (
        <>
          <ButtonGroup aria-label="Energy glyphs">
            {ENERGY_GLYPHS.map((n) => (
              <GlyphButton
                key={`energy_${n.toString()}`}
                token={`:rb_energy_${n.toString()}:`}
                label={`Insert ${n.toString()} energy`}
                onInsert={onInsert}
              >
                <span
                  className="bg-foreground text-background text-2xs inline-flex size-4 items-center justify-center rounded-full font-bold"
                  aria-hidden
                >
                  {n}
                </span>
              </GlyphButton>
            ))}
          </ButtonGroup>
          <ButtonGroup aria-label="Rune glyphs">
            {RUNE_GLYPHS.map((rune) => (
              <GlyphButton
                key={rune.token}
                token={`:rb_${rune.token}:`}
                label={`Insert ${rune.label} rune`}
                onInsert={onInsert}
              >
                <img
                  src={`/images/glyphs/${rune.token.replaceAll("_", "-")}.svg`}
                  alt=""
                  className="size-4"
                />
              </GlyphButton>
            ))}
          </ButtonGroup>
          <ButtonGroup aria-label="Utility glyphs">
            {UTILITY_GLYPHS.map((g) => (
              <GlyphButton
                key={g.token}
                token={`:rb_${g.token}:`}
                label={`Insert ${g.label}`}
                onInsert={onInsert}
              >
                <img
                  src={`/images/glyphs/${g.token.replaceAll("_", "-")}.svg`}
                  alt=""
                  className="size-4 brightness-0 dark:invert"
                />
              </GlyphButton>
            ))}
          </ButtonGroup>
          <KeywordPicker onInsert={onInsert} />
        </>
      )}
    </div>
  );
}

function PunctuationButton({
  label,
  title,
  onClick,
  children,
}: {
  label: string;
  title: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <Button
      type="button"
      variant="outline"
      size="icon-sm"
      title={title}
      aria-label={label}
      onClick={onClick}
    >
      <span aria-hidden className="text-sm">
        {children}
      </span>
    </Button>
  );
}

function GlyphButton({
  token,
  label,
  onInsert,
  children,
}: {
  token: string;
  label: string;
  onInsert: (token: string) => void;
  children: React.ReactNode;
}) {
  return (
    <Button
      type="button"
      variant="outline"
      size="icon-sm"
      title={`${label} (${token})`}
      aria-label={label}
      onClick={() => onInsert(token)}
    >
      {children}
    </Button>
  );
}

type KeywordShape = "plain" | "right" | "left" | "both";

const SHAPE_OPTIONS: { id: KeywordShape; label: string; sample: (name: string) => string }[] = [
  { id: "plain", label: "Plain", sample: (name) => `[${name}]` },
  { id: "right", label: "Pointed right", sample: (name) => `[${name}][>]` },
  { id: "left", label: "Pointed left", sample: (name) => `[>>][${name}]` },
  { id: "both", label: "Both ends", sample: (name) => `[>>][${name}][>]` },
];

function KeywordPicker({ onInsert }: { onInsert: (token: string) => void }) {
  const styles = useKeywordStyles();
  const [shape, setShape] = useState<KeywordShape>("plain");
  const names = Object.keys(styles).toSorted((a, b) => a.localeCompare(b));
  const tokenFor = (name: string) =>
    SHAPE_OPTIONS.find((option) => option.id === shape)?.sample(name) ?? `[${name}]`;
  return (
    <Combobox<string, false>
      items={names}
      value={null}
      onValueChange={(name) => {
        if (name) {
          onInsert(tokenFor(name));
        }
      }}
      itemToStringLabel={(name) => name}
    >
      <ComboboxTrigger render={<Button variant="outline" size="sm" />}>Keyword</ComboboxTrigger>
      <ComboboxContent className="w-72">
        <div className="flex flex-col gap-1.5 p-1">
          <span className="text-muted-foreground px-1 text-xs">Shape</span>
          <ToggleGroup
            variant="outline"
            size="sm"
            spacing={0}
            value={[shape]}
            onValueChange={([next]) => {
              if (next === "plain" || next === "right" || next === "left" || next === "both") {
                setShape(next);
              }
            }}
            aria-label="Keyword shape"
          >
            {SHAPE_OPTIONS.map((option) => (
              <ToggleGroupItem key={option.id} value={option.id} aria-label={option.label}>
                <CardText text={option.sample("Tag")} interactive={false} />
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </div>
        <ComboboxInput placeholder="Search keywords…" showTrigger={false} />
        <ComboboxEmpty>No matches.</ComboboxEmpty>
        <ComboboxList>
          {(name: string) => (
            <ComboboxItem key={name} value={name}>
              <CardText text={tokenFor(name)} interactive={false} />
            </ComboboxItem>
          )}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  );
}

function SyntaxHelpPopover() {
  return (
    <Popover>
      <PopoverTrigger
        render={<Button type="button" variant="ghost" size="sm" />}
        aria-label="Syntax help"
      >
        <HelpCircleIcon className="size-3.5" />
        Syntax
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80">
        <p className="font-medium">Rules &amp; effect text syntax</p>
        <ul className="text-muted-foreground flex flex-col gap-1.5">
          <li>
            <code className="text-foreground">[Keyword]</code> renders a styled keyword chip. Use
            the Keyword button to pick from known keywords. Pick a shape to add an arrow on the left
            (<code className="text-foreground">[&gt;&gt;][Keyword]</code>), right (
            <code className="text-foreground">[Keyword][&gt;]</code>), or both.
          </li>
          <li>
            <code className="text-foreground">:rb_energy_2:</code>,{" "}
            <code className="text-foreground">:rb_rune_fury:</code>,{" "}
            <code className="text-foreground">:rb_might:</code> insert glyphs. Use the toolbar
            buttons.
          </li>
          <li>
            <code className="text-foreground">(reminder text)</code> renders italic in parens. No
            need to add underscores; the renderer italicises parens automatically.
          </li>
          <li>
            <code className="text-foreground">_emphasis_</code> wraps text in italics. Use the
            Italic button to wrap the selected text.
          </li>
          <li>Press Enter for a line break.</li>
        </ul>
        <p className="text-muted-foreground">
          Example:{" "}
          <code className="text-foreground">
            [Equip :rb_energy_1: :rb_rune_mind:] (Attach this to a unit you control.)
          </code>
        </p>
      </PopoverContent>
    </Popover>
  );
}

function CardTextPreview({ text, variant }: { text: string; variant: CardTextVariant }) {
  const trimmed = text.trim();
  if (!trimmed) {
    return (
      <p className="text-muted-foreground border-input rounded-md border border-dashed px-2.5 py-1.5">
        Live preview appears here as you type.
      </p>
    );
  }
  return (
    <div className="border-input bg-muted/30 text-foreground rounded-md border px-2.5 py-1.5 text-sm">
      {variant === "flavor" ? (
        <p className="text-muted-foreground/80 whitespace-pre-wrap italic">{text}</p>
      ) : (
        <CardText text={text} interactive={false} />
      )}
    </div>
  );
}
