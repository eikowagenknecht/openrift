import type { ReactNode } from "react";
import { useRef, useState } from "react";

import { cn } from "@/lib/utils";

interface DropzoneProps {
  onFiles: (files: File[]) => void;
  accept?: string;
  multiple?: boolean;
  disabled?: boolean;
  label: string;
  hint?: ReactNode;
  icon?: ReactNode;
  className?: string;
}

function Dropzone({
  onFiles,
  accept,
  multiple = false,
  disabled = false,
  label,
  hint,
  icon,
  className,
}: DropzoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isOver, setIsOver] = useState(false);

  function emit(list: FileList | null) {
    const files = [...(list ?? [])];
    if (files.length > 0) {
      onFiles(multiple ? files : files.slice(0, 1));
    }
  }

  return (
    <div
      data-slot="dropzone"
      data-dragging={isOver || undefined}
      onDragOver={(event) => {
        event.preventDefault();
        if (!disabled) {
          setIsOver(true);
        }
      }}
      onDragLeave={() => setIsOver(false)}
      onDrop={(event) => {
        event.preventDefault();
        setIsOver(false);
        if (!disabled) {
          emit(event.dataTransfer.files);
        }
      }}
      className={cn(
        "border-input data-[dragging]:border-primary data-[dragging]:bg-primary/5 rounded-lg border border-dashed transition-colors",
        disabled && "opacity-60",
        className,
      )}
    >
      <button
        type="button"
        disabled={disabled}
        onClick={() => inputRef.current?.click()}
        className="focus-visible:ring-ring/50 flex w-full cursor-pointer flex-col items-center gap-1 rounded-lg px-4 py-8 text-center focus-visible:ring-2 focus-visible:outline-none disabled:cursor-not-allowed"
      >
        {icon}
        <span className="text-sm font-medium">{label}</span>
        {hint && <span className="text-muted-foreground text-xs">{hint}</span>}
      </button>
      <input
        ref={inputRef}
        type="file"
        aria-label={label}
        accept={accept}
        multiple={multiple}
        disabled={disabled}
        className="hidden"
        onChange={(event) => {
          emit(event.target.files);
          event.target.value = "";
        }}
      />
    </div>
  );
}

export { Dropzone };
