import { fixTypography } from "@openrift/shared/fix-typography";
import { ArrowRightLeftIcon, XIcon } from "lucide-react";
import { useRef } from "react";

import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ImageUrlCell,
  renderLabeledValue,
} from "@/features/admin/components/candidate-cell-display";
import {
  MultiSelectCell,
  SuggestionCombobox,
  TagChipCell,
} from "@/features/admin/components/candidate-cell-editors";
import type { FieldDef } from "@/features/admin/components/candidate-field-defs";
import {
  dropdownOptions,
  hasDropdown,
  isMultiSelect,
  resolveLabel,
} from "@/features/admin/components/candidate-field-defs";
import { CardTextExpandDialog } from "@/features/admin/components/card-text-expand-dialog";
import { formatValue, hasValue } from "@/features/admin/lib/candidate-cell-values";
import { CardText } from "@/features/cards/components/card-text";
import { cn } from "@/lib/utils";

export function CandidateActiveCell<TKey extends string>({
  field,
  activeRow,
  activeValue,
  isRequired,
  editingField,
  setEditingField,
  onActiveChange,
  activeImageUrl,
  costKeywords,
}: {
  field: FieldDef<TKey>;
  activeRow: Record<string, unknown> | null;
  activeValue: unknown;
  isRequired: boolean;
  editingField: string | null;
  setEditingField: (key: string | null) => void;
  onActiveChange?: (field: TKey, value: unknown | null) => void;
  activeImageUrl?: string | null;
  costKeywords: readonly string[];
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const isMissing = isRequired && !hasValue(activeValue);
  const canReverseActive =
    field.array === true && Array.isArray(activeValue) && activeValue.length > 1;

  function commitEdit(raw: string) {
    setEditingField(null);
    if (!onActiveChange) {
      return;
    }
    const trimmed = raw.trim();
    if (field.array) {
      const items = trimmed
        ? trimmed
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean)
        : [];
      onActiveChange(field.key, items.length > 0 ? items : null);
      return;
    }
    if (field.type === "number") {
      if (!trimmed) {
        onActiveChange(field.key, null);
        return;
      }
      // oxlint-disable-next-line unicorn/prefer-number-coercion -- lenient parse of a pasted cell; Number() would yield NaN on trailing text
      const parsed = Number.parseInt(trimmed, 10);
      onActiveChange(field.key, Number.isFinite(parsed) ? parsed : null);
      return;
    }
    onActiveChange(field.key, trimmed || null);
  }

  return (
    <td
      className={cn(
        "group/active relative border-l px-3 py-1.5 break-words",
        field.multiline && "whitespace-pre-wrap",
        field.readOnly && "bg-muted/30",
        isMissing && "bg-destructive-soft",
        onActiveChange &&
          !field.readOnly &&
          (field.type === "boolean" || hasDropdown(field)
            ? "hover:bg-muted/50 cursor-pointer"
            : "hover:bg-muted/50 cursor-text"),
      )}
      onClick={() => {
        if (!onActiveChange || field.readOnly || field.richText || editingField === field.key) {
          return;
        }
        if (field.type === "boolean") {
          onActiveChange(field.key, activeValue === null ? false : !activeValue);
          return;
        }
        if (hasDropdown(field)) {
          setEditingField(field.key);
          return;
        }
        setEditingField(field.key);
        requestAnimationFrame(() => {
          if (field.multiline) {
            textareaRef.current?.focus();
          } else {
            inputRef.current?.focus();
          }
        });
      }}
    >
      {field.richText ? (
        <div className="flex items-start justify-between gap-1">
          <div className="min-w-0 flex-1 break-words whitespace-normal">
            {hasValue(activeValue) ? (
              field.richTextVariant === "flavor" ? (
                // Flavor is a plain span, not CardText; whitespace-pre-line keeps its line breaks.
                <span className="text-muted-foreground/80 whitespace-pre-line italic">
                  {String(activeValue)}
                </span>
              ) : (
                <CardText text={String(activeValue)} interactive={false} />
              )
            ) : (
              <span className={isMissing ? "text-destructive" : "text-muted-foreground"}>
                {isMissing ? "required" : "—"}
              </span>
            )}
          </div>
          {onActiveChange && !field.readOnly && (
            <CardTextExpandDialog
              label={field.label}
              value={hasValue(activeValue) ? String(activeValue) : ""}
              imageUrl={activeImageUrl}
              variant={field.richTextVariant}
              reformat={(value) =>
                field.richTextVariant === "flavor"
                  ? fixTypography(value, { italicParens: false, keywordGlyphs: false })
                  : fixTypography(value, { costKeywords })
              }
              onSave={(next) => onActiveChange(field.key, next.trim() || null)}
              triggerClassName="text-muted-foreground shrink-0"
            />
          )}
        </div>
      ) : editingField === field.key && isMultiSelect(field) ? (
        <MultiSelectCell
          label={field.label}
          options={dropdownOptions(field)}
          value={Array.isArray(activeValue) ? (activeValue as string[]) : []}
          onCommit={(next) => onActiveChange?.(field.key, next)}
          onClose={() => setEditingField(null)}
        />
      ) : editingField === field.key && hasDropdown(field) ? (
        <Select
          value={hasValue(activeValue) ? String(activeValue) : ""}
          onValueChange={(v) => {
            setEditingField(null);
            onActiveChange?.(field.key, v || null);
          }}
          defaultOpen
          onOpenChange={(open) => {
            if (!open) {
              setEditingField(null);
            }
          }}
          items={{
            "": "— clear —",
            ...Object.fromEntries(
              field.labeledOptions
                ? field.labeledOptions.map((opt) => [opt.value, opt.label])
                : (field.options?.map((opt) => [opt, opt]) ?? []),
            ),
          }}
        >
          <SelectTrigger
            className="w-full gap-1 rounded-md border-none px-1 text-sm shadow-none"
            onClick={(e: React.MouseEvent) => e.stopPropagation()}
          >
            <SelectValue placeholder="— select —" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="">— clear —</SelectItem>
            {field.labeledOptions
              ? field.labeledOptions.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))
              : field.options?.map((opt) => (
                  <SelectItem key={opt} value={opt}>
                    {opt}
                  </SelectItem>
                ))}
          </SelectContent>
        </Select>
      ) : editingField === field.key && field.suggestions ? (
        <SuggestionCombobox
          suggestions={field.suggestions}
          defaultValue={hasValue(activeValue) ? String(activeValue) : ""}
          onCommit={(value) => commitEdit(value)}
          onCancel={() => setEditingField(null)}
        />
      ) : editingField === field.key && field.multiline ? (
        <textarea
          ref={textareaRef}
          aria-label={field.label}
          defaultValue={hasValue(activeValue) ? String(activeValue) : ""}
          rows={4}
          className="border-primary w-full resize-y rounded-md border bg-transparent p-1 text-sm outline-none"
          // oxlint-disable-next-line jsx-a11y/no-autofocus -- intentional: inline editor should grab focus immediately
          autoFocus
          onBlur={(e) => commitEdit(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              setEditingField(null);
            }
          }}
          onClick={(e) => e.stopPropagation()}
        />
      ) : editingField === field.key && field.array && !hasDropdown(field) ? (
        <TagChipCell
          value={Array.isArray(activeValue) ? (activeValue as string[]) : []}
          placeholder={`Add ${field.label.toLowerCase()}`}
          onChange={(next) => onActiveChange?.(field.key, next.length > 0 ? next : null)}
          onDone={() => setEditingField(null)}
        />
      ) : editingField === field.key ? (
        <input
          ref={inputRef}
          type="text"
          aria-label={field.label}
          inputMode={field.type === "number" ? "numeric" : undefined}
          defaultValue={
            hasValue(activeValue)
              ? Array.isArray(activeValue)
                ? activeValue.join(", ")
                : String(activeValue)
              : ""
          }
          className="border-primary w-full border-b bg-transparent text-sm outline-none"
          // oxlint-disable-next-line jsx-a11y/no-autofocus -- intentional: inline editor should grab focus immediately
          autoFocus
          onBlur={(e) => commitEdit(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              commitEdit(e.currentTarget.value);
            } else if (e.key === "Escape") {
              setEditingField(null);
            }
          }}
          onClick={(e) => e.stopPropagation()}
        />
      ) : field.key === "imageUrl" && typeof activeValue === "string" ? (
        <ImageUrlCell url={activeValue} alt="Active" />
      ) : (
        <span
          className={cn(
            isMissing ? "text-destructive" : "text-muted-foreground",
            (hasDropdown(field) || field.array) && "block truncate",
          )}
          title={
            (hasDropdown(field) || field.array) && activeRow && hasValue(activeValue)
              ? resolveLabel(field, activeValue)
              : undefined
          }
        >
          {activeRow
            ? field.labeledOptions
              ? renderLabeledValue(field, activeValue)
              : formatValue(activeValue, field.suffixKey ? activeRow[field.suffixKey] : undefined)
            : isMissing
              ? "required"
              : "—"}
        </span>
      )}
      {onActiveChange &&
        !field.readOnly &&
        !field.richText &&
        editingField !== field.key &&
        (canReverseActive || (!isRequired && hasValue(activeValue))) && (
          <div className="absolute top-1 right-1 flex gap-0.5 md:hidden md:group-hover/active:flex">
            {canReverseActive && (
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                aria-label={`Reverse ${field.label} order`}
                title="Reverse order"
                className="text-muted-foreground"
                onClick={(e) => {
                  e.stopPropagation();
                  onActiveChange(field.key, (activeValue as unknown[]).toReversed());
                }}
              >
                <ArrowRightLeftIcon className="size-3" />
              </Button>
            )}
            {!isRequired && hasValue(activeValue) && (
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                aria-label={`Clear ${field.label}`}
                className="text-muted-foreground"
                onClick={(e) => {
                  e.stopPropagation();
                  onActiveChange(field.key, null);
                }}
              >
                <XIcon className="size-3" />
              </Button>
            )}
          </div>
        )}
    </td>
  );
}
