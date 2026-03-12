import { CalendarIcon } from "lucide-react";
import { useState } from "react";

import { Calendar } from "@/components/ui/calendar";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

const ISO_RE = /^\d{4}-\d{2}-\d{2}$/;

function formatIso(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function parseIso(value: string): Date {
  const [y, m, d] = value.split("-").map(Number);
  return new Date(y, m - 1, d, 12);
}

function isValidIso(value: string): boolean {
  if (!ISO_RE.test(value)) {
    return false;
  }
  const d = parseIso(value);
  return !isNaN(d.getTime());
}

interface DatePickerProps {
  value?: string | null;
  onChange?: (iso: string) => void;
  onClear?: () => void;
  placeholder?: string;
  className?: string;
}

export function DatePicker({
  value,
  onChange,
  onClear,
  placeholder = "YYYY-MM-DD",
  className,
}: DatePickerProps) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState(value ?? "");
  const [month, setMonth] = useState<Date | undefined>(value ? parseIso(value) : undefined);

  const selected = value ? parseIso(value) : undefined;

  function handleTextChange(raw: string) {
    setText(raw);
    if (raw === "" && onClear) {
      onClear();
      return;
    }
    if (isValidIso(raw)) {
      const d = parseIso(raw);
      setMonth(d);
      onChange?.(formatIso(d));
    }
  }

  function handleCalendarSelect(day: Date | undefined) {
    if (day) {
      const iso = formatIso(day);
      setText(iso);
      onChange?.(iso);
      setOpen(false);
    }
  }

  return (
    <InputGroup className={className}>
      <InputGroupInput
        value={text}
        placeholder={placeholder}
        onChange={(e) => handleTextChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setOpen(true);
          }
        }}
      />
      <InputGroupAddon align="inline-end">
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger
            render={<InputGroupButton variant="ghost" size="icon-xs" aria-label="Select date" />}
          >
            <CalendarIcon />
          </PopoverTrigger>
          <PopoverContent
            className="w-auto overflow-hidden p-0"
            align="end"
            alignOffset={-8}
            sideOffset={10}
          >
            <Calendar
              mode="single"
              captionLayout="dropdown"
              selected={selected}
              month={month}
              onMonthChange={setMonth}
              onSelect={handleCalendarSelect}
              startMonth={new Date(2020, 0)}
              endMonth={new Date(2035, 11)}
            />
          </PopoverContent>
        </Popover>
      </InputGroupAddon>
    </InputGroup>
  );
}
