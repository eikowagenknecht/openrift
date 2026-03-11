import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function EditField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-8 w-full text-sm"
      />
    </div>
  );
}
