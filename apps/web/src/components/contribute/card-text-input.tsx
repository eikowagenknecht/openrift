import { ChevronDownIcon, HelpCircleIcon } from "lucide-react";
import { useId, useRef, useState } from "react";

import { CardText } from "@/components/cards/card-text";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Textarea } from "@/components/ui/textarea";
import { useKeywordStyles } from "@/hooks/use-keyword-styles";
import { cn } from "@/lib/utils";

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

interface CardTextInputProps {
  label: string;
  value: string;
  onChange: (next: string) => void;
  rows?: number;
  placeholder?: string;
}

export function CardTextInput({
  label,
  value,
  onChange,
  rows = 2,
  placeholder,
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

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between gap-2">
        <Label htmlFor={id}>{label}</Label>
        <SyntaxHelpPopover />
      </div>
      <SyntaxToolbar onInsert={insert} />
      <Textarea
        id={id}
        ref={textareaRef}
        rows={rows}
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
      />
      <CardTextPreview text={value} />
    </div>
  );
}

function SyntaxToolbar({ onInsert }: { onInsert: (token: string) => void }) {
  return (
    <div className="border-input bg-muted/30 flex flex-wrap items-center gap-1.5 rounded-md border p-1.5">
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
      <span className="bg-input mx-0.5 h-5 w-px" aria-hidden />
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
      <span className="bg-input mx-0.5 h-5 w-px" aria-hidden />
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
      <span className="bg-input mx-0.5 h-5 w-px" aria-hidden />
      <KeywordPicker onInsert={onInsert} />
    </div>
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
    <button
      type="button"
      title={`${label} (${token})`}
      aria-label={label}
      onClick={() => onInsert(token)}
      className="border-input hover:bg-accent inline-flex size-7 items-center justify-center rounded-md border bg-transparent transition-colors"
    >
      {children}
    </button>
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
  const [open, setOpen] = useState(false);
  const [shape, setShape] = useState<KeywordShape>("plain");
  const names = Object.keys(styles).toSorted((a, b) => a.localeCompare(b));
  const tokenFor = (name: string) =>
    SHAPE_OPTIONS.find((option) => option.id === shape)?.sample(name) ?? `[${name}]`;
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        className={cn(
          "border-input bg-background hover:bg-accent inline-flex h-7 items-center gap-1.5 rounded-md border px-2 transition-colors",
        )}
      >
        Keyword
        <ChevronDownIcon className="size-3 opacity-60" />
      </PopoverTrigger>
      <PopoverContent align="start" className="max-h-96 w-64 overflow-auto p-2">
        <div className="mb-2 flex flex-col gap-1">
          <span className="text-muted-foreground">Shape</span>
          <div className="flex flex-wrap gap-1">
            {SHAPE_OPTIONS.map((option) => (
              <button
                key={option.id}
                type="button"
                onClick={() => setShape(option.id)}
                aria-pressed={shape === option.id}
                className={cn(
                  "border-input rounded-md border px-2 py-1 transition-colors",
                  shape === option.id
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-background hover:bg-accent",
                )}
              >
                <CardText text={option.sample("Tag")} interactive={false} />
              </button>
            ))}
          </div>
        </div>
        <div className="flex flex-col">
          {names.map((name) => (
            <button
              key={name}
              type="button"
              onClick={() => {
                onInsert(tokenFor(name));
                setOpen(false);
              }}
              className="hover:bg-accent flex w-full items-center justify-between gap-2 rounded-sm px-2 py-1.5 text-left text-sm"
            >
              <CardText text={tokenFor(name)} interactive={false} />
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function SyntaxHelpPopover() {
  return (
    <Popover>
      <PopoverTrigger
        className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
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
            <code className="text-foreground">_emphasis_</code> wraps text in italics.
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

function CardTextPreview({ text }: { text: string }) {
  const trimmed = text.trim();
  if (!trimmed) {
    return (
      <p className="text-muted-foreground border-input rounded-md border border-dashed px-2.5 py-1.5">
        Live preview appears here as you type.
      </p>
    );
  }
  return (
    <div className="border-input bg-muted/20 text-foreground rounded-md border px-2.5 py-1.5 text-sm">
      <CardText text={text} interactive={false} />
    </div>
  );
}
