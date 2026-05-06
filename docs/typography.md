# Typography

The web app uses a small, fixed type scale. Pick a token from this guide whenever you set text size — never invent a new one.

## Scale

| Role                         | Tailwind                         | Notes                                                                                                                                                                                                                            |
| ---------------------------- | -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Hero                         | `text-4xl md:text-5xl font-bold` | Landing page only.                                                                                                                                                                                                               |
| Page title (h1)              | `text-2xl font-bold`             | Top-of-page heading on every route.                                                                                                                                                                                              |
| Section (h2)                 | `text-lg font-semibold`          | Major divisions within a page (help articles, sidebars, dialog sections).                                                                                                                                                        |
| Subsection (h3) / Card title | `text-base font-medium`          | Card headers, sub-blocks. Matches the `CardTitle` default — don't override.                                                                                                                                                      |
| Body                         | _(no size class)_                | Default paragraphs and UI text. Inherits the responsive body size: `1.05rem` (≈16.8px) on phones, `15px` from `sm:` (640px) up. Set globally on `body` and `.prose` in `apps/web/src/index.css` — don't replicate per-component. |
| Compact UI                   | `text-sm`                        | Buttons, tables (header and cells), form labels, dialog chrome, dense lists.                                                                                                                                                     |
| Metadata                     | `text-xs`                        | Badges, timestamps, captions, inline labels next to data.                                                                                                                                                                        |
| Micro                        | `text-2xs`                       | Footer, chart axes, fine print. Defined as `--text-2xs: 0.6875rem` in `apps/web/src/index.css`.                                                                                                                                  |

## Rules

1. **Body text has no size class.** Don't add `text-base` or `text-sm` to a paragraph that's just body copy — leave it unstyled and let it inherit the root size. `text-sm` is for _compact_ surfaces (tables, buttons, dense forms), not for primary reading content.
2. **Don't add `text-xl`.** It has no role in the scale. The OpenRift wordmark in `apps/web/src/components/layout/header.tsx` is the one documented exception (brand identity, not a heading tier).
3. **No arbitrary pixel sizes in components.** Don't use `text-[10px]`, `text-[11px]`, or any `text-[Npx]`. If you need micro-typography, use `text-2xs`. If `text-2xs` is genuinely too large, that's a scale change — discuss before extending. The one exception is the body/prose responsive base in `index.css`; nothing component-level should use arbitrary px.
4. **Heading size and weight go together.** Always write the size _and_ weight together (`text-2xl font-bold`, `text-lg font-semibold`). The weight is part of the role.
5. **Don't override shadcn defaults to land back on the same size.** `CardTitle` is already `text-base font-medium`; writing `<CardTitle className="text-base">` is noise. Only override when the role genuinely changes.
6. **Prose pages map onto this scale.** When using the `prose` plugin (e.g. legal/privacy pages, markdown rules), set `prose-h1:text-2xl prose-h2:text-lg prose-h3:text-base` so prose matches the rest of the app.

## shadcn defaults (for reference)

- `CardTitle` → `text-base font-medium` (Subsection / Card title)
- `CardDescription` → `text-sm` (Compact UI)
- `Button` (default size) → `text-sm`
- `FieldLegend` (legend) → `text-base` · `FieldLegend` (label) → `text-sm`
- `FieldTitle` / `FieldDescription` / `FieldError` → `text-sm`
- `Input` / `Textarea` → `text-base` mobile, `md:text-sm` from medium screens up

These are aligned with the scale. Match them when scaffolding new components.

## Bordered info cards

For any "icon + title + description in a bordered tile" pattern (used heavily in help articles, feature grids, option pickers), use the shadcn `<Card>` primitive — never hand-roll a bordered `<div>` with your own typography. The defaults give you the canonical title/description sizes for free:

```tsx
<Card>
  <CardHeader>
    <CardTitle className="flex items-center gap-2">
      <span className="text-primary">{icon}</span>
      {title}
    </CardTitle>
    <CardDescription>{description}</CardDescription>
  </CardHeader>
</Card>
```

For variants with extra content (e.g. a numbered step circle on the left, a tag list below), use `<CardContent>` and put `<CardTitle>`/`<CardDescription>` inside a flex column:

```tsx
<Card>
  <CardContent className="flex gap-3">
    <span className="…step badge…">{step}</span>
    <div className="flex flex-col gap-1">
      <CardTitle>{title}</CardTitle>
      <CardDescription>{description}</CardDescription>
    </div>
  </CardContent>
</Card>
```

## Callouts (info / aside)

For inline callouts in prose — "the goal", "limitations", "this is useful when…", concept asides — use the shadcn `<Alert>` primitive. Don't hand-roll a bordered `<div>`. The icon goes as a direct child; `<Alert>` auto-positions it next to the title:

```tsx
<Alert>
  <TrophyIcon className="text-amber-600 dark:text-amber-400" />
  <AlertTitle>The goal</AlertTitle>
  <AlertDescription>Score 8 points to win. You score by controlling battlefields.</AlertDescription>
</Alert>
```

Multi-paragraph descriptions: wrap each paragraph in `<p>`. `AlertDescription` already spaces them.

For an emphasized aside (the rarer case where the callout should pop, not just inform), override with a primary tint and unset the muted text color:

```tsx
<Alert className="border-primary/20 bg-primary/5">
  <AlertDescription className="text-foreground">
    One thing the table can't show: I have a long list of ideas…
  </AlertDescription>
</Alert>
```

Container boxes for diagrams/mocks (e.g. the "Board layout" placeholder, the "Deck structure" grid) are not callouts — they keep their `bg-muted/30 rounded-lg border p-4` styling because they exist to frame visual content, not to deliver an aside.

## Icons next to text

Inline icons (in labels, badges, headings, buttons with a label) should match the line-height of the surrounding text. Icon-only buttons (`<Button size="icon" />` and friends) aren't typography — the Button scaffold sizes their child SVGs automatically by variant.

| Text size               | Icon size              |
| ----------------------- | ---------------------- |
| `text-2xs` / `text-xs`  | `size-3` or `size-3.5` |
| `text-sm` / `text-base` | `size-4`               |
| `text-lg` and larger    | `size-5` or `size-6`   |

## Examples

```tsx
// ✅ Page
<h1 className="text-2xl font-bold">Card Sets</h1>

// ✅ Section heading
<h2 className="text-lg font-semibold">Filters</h2>

// ✅ Card title (use the default)
<CardTitle>Display</CardTitle>

// ✅ Body paragraph — no size class
<p className="text-muted-foreground">
  Riftbound has six domains, each with its own colour and symbol.
</p>

// ✅ Compact UI — hand-rolled table that needs the smaller size set explicitly
<table className="w-full text-sm">…</table>

// ✅ Metadata label
<span className="text-muted-foreground text-xs">Edition</span>

// ✅ Micro — chart axis, footer
<span className="text-2xs">Last updated 5 min ago</span>

// ❌ Don't
<h1 className="text-xl font-semibold">…</h1>     // text-xl has no role
<p className="text-base">…</p>                   // body has no size class
<span className="text-[10px]">…</span>           // use text-2xs
<CardTitle className="text-base">…</CardTitle>   // already the default
```

## Recharts

Recharts components can't accept Tailwind classes, so size them inline. Use `fontSize: 11` (matching `--text-2xs`) for axis ticks and tick labels.
