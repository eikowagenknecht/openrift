Review code changes for AI-generated code smells.

How to get the diff based on `$ARGUMENTS`:

- Empty → `git diff` (unstaged) + `git diff --cached` (staged)
- `staged` → `git diff --cached` only
- `unstaged` → `git diff` only
- File path → scope `git diff` to that file
- PR number → `gh pr diff $ARGUMENTS`
- Commit SHA or ref (e.g. `abc1234`, `HEAD~3`) → `git show $ARGUMENTS`

For each violation, quote the offending line(s) and state what's wrong. At the end, list clean categories as "All clear".

## Patterns to look for

**React**

- Component over ~150 lines → split it
- More than 5-6 props → compose with `children` or split
- Multi-line ternaries, chained `&&`, or inline functions in JSX → extract
- `useState` for derivable values → make it a `const`
- `useEffect` that computes/syncs derived data → compute during render
- `useMemo` / `useCallback` / `React.memo` → remove (React Compiler is on) or add a justifying comment when it's actually needed
- Duplicating logic from existing hooks (`useCardFilters`, `useCards`, etc.) → use the hook

**CSS**

- No-op Tailwind classes: `w-full` on block elements, `flex-col` without a `flex-row` counterpart, `bg-transparent`, `border-0` (already defaults) → remove
- Resets already handled by preflight, contradictory classes → remove or fix
- Conditional classes via template literals → use `cn()` instead

**Dead branches**

- `?.` on values that are never nullish, `?? fallback` on required/guaranteed values → remove
- `else` / default cases that are unreachable (e.g. exhaustive switches, early returns that already cover all paths) → remove
- Type guards or `instanceof` checks that TypeScript's control flow already narrows → remove
- Trace the types: if the type system proves a branch can't run, delete it

**Dead / unused code**

- Commented-out code → remove (git history preserves it)
- `// removed`, `// deprecated`, or re-exports kept for backwards compatibility → remove unless there are external consumers

**Over-engineering**

- Helper/utility used only once → inline
- try/catch on code that can't throw → remove
- UI, behavior, or config not in the original request → flag as feature creep

**Test coverage**

- New or changed logic (hooks, utilities, non-trivial components) without corresponding tests → flag as missing coverage

**Linting**

- `bun lint` on changed files reports any remaining warnings or errors → fix them, don't suppress without very good justification

**Project conventions**

- Changes to `components/ui/` files missing `// custom: <reason>` on each changed line → add the comment with a brief justification
- `eslint-disable` instead of `oxlint-disable`, or missing `-- reason` → fix to `oxlint-disable` with a reason
- user facing `feat:`/`fix:` change without a `CHANGELOG.md` entry → add an entry

## Beyond the checklist

The patterns above are known repeat offenders. After checking them, read the diff fresh and think: is there anything else — a bug, a race condition, a naming choice, a simpler way to express the same logic, a missing edge case — that would make this code better? If so, flag it in a separate "Other observations" section.
