import { PlusIcon, SearchIcon, UploadIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { DatePicker } from "@/components/ui/date-picker";
import { Dropzone } from "@/components/ui/dropzone";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { Kbd, KbdGroup } from "@/components/ui/kbd";
import { Label } from "@/components/ui/label";
import { QuantityStepper, QuantityStepperField } from "@/components/ui/quantity-stepper";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";

import { Demo, DemoGrid, DemoSection } from "./demo-primitives";

export function FormControlsSection() {
  const [date, setDate] = useState<string | undefined>();
  const [energy, setEnergy] = useState("any");
  const [copies, setCopies] = useState(2);
  const energyItems = [
    { value: "any", label: "Any energy" },
    { value: "low", label: "0–2 energy" },
    { value: "high", label: "6+ energy" },
  ];
  return (
    <DemoSection
      id="form-controls"
      title="Form controls"
      note="Date entry always via DatePicker. Selects pass items when values differ from labels."
    >
      <DemoGrid>
        <Demo
          name="Field + Input"
          hint="Label, control, helper text. The standard form row."
          spec="input h-8 · text-base mobile, md:text-sm"
        >
          <Field>
            <FieldLabel htmlFor="design-name">Deck name</FieldLabel>
            <Input id="design-name" placeholder="Jinx Aggro" />
            <FieldDescription>Shown on your public deck page.</FieldDescription>
          </Field>
        </Demo>
        <Demo name="Field (invalid)" hint="aria-invalid on the control drives the error styling.">
          <Field data-invalid>
            <FieldLabel htmlFor="design-code">Deck code</FieldLabel>
            <Input id="design-code" aria-invalid placeholder="RIFT-…" />
            <FieldError>That code doesn&apos;t look right.</FieldError>
          </Field>
        </Demo>
        <Demo name="Textarea" hint="Multi-line free text, auto-growing.">
          <Field>
            <FieldLabel htmlFor="design-notes">Notes</FieldLabel>
            <Textarea id="design-notes" placeholder="Mulligan aggressively for early units…" />
          </Field>
        </Demo>
        <Demo
          name="Select"
          hint="Pass items when values differ from labels (BaseUI quirk)."
          spec="trigger h-8 · keep the default size in top bars, never size=sm"
        >
          <Select
            items={energyItems}
            value={energy}
            onValueChange={(v) => {
              if (v !== null) {
                setEnergy(v);
              }
            }}
          >
            <SelectTrigger aria-label="Energy cost">
              <SelectValue placeholder="Pick a range" />
            </SelectTrigger>
            <SelectContent>
              {energyItems.map((item) => (
                <SelectItem key={item.value} value={item.value}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Demo>
        <Demo name="DatePicker" hint="The only sanctioned date entry. Never a raw date input.">
          <DatePicker value={date} onChange={setDate} onClear={() => setDate(undefined)} />
        </Demo>
        <Demo
          name="QuantityStepper"
          hint="How many copies an action touches. `editable` swaps the value for a typable field, for bounds too large to click to. The Field form adds the boxed label row the dialogs use."
          spec="icon buttons size-8 · value w-8 tabular-nums (or w-16 input) · clamped to min/max"
        >
          <div className="w-full space-y-3">
            <QuantityStepper value={copies} onValueChange={setCopies} max={4} />
            <QuantityStepper value={copies} onValueChange={setCopies} max={4} editable />
            <QuantityStepperField
              label="Copies to move"
              value={copies}
              onValueChange={setCopies}
              max={4}
            />
          </div>
        </Demo>
        <Demo name="Checkbox" hint="Binary option in forms and filter panels.">
          <Label className="flex items-center gap-2">
            <Checkbox defaultChecked /> Foils only
          </Label>
        </Demo>
        <Demo name="RadioGroup" hint="Exclusive choice when all options should stay visible.">
          <RadioGroup defaultValue="all" className="flex items-center gap-4">
            <Label className="flex items-center gap-2">
              <RadioGroupItem value="all" /> All
            </Label>
            <Label className="flex items-center gap-2">
              <RadioGroupItem value="owned" /> Owned
            </Label>
          </RadioGroup>
        </Demo>
        <Demo name="Switch" hint="Instant-effect setting, not a form field.">
          <Label className="flex items-center gap-2">
            <Switch defaultChecked /> Show prices
          </Label>
        </Demo>
        <Demo name="Slider" hint="Numeric range entry (e.g. column count, max energy).">
          <Slider defaultValue={[3]} max={10} className="w-40" aria-label="Max energy" />
        </Demo>
        <Demo name="InputGroup" hint="Input with addon slots. SearchInput builds on this.">
          <InputGroup className="w-56">
            <InputGroupAddon>
              <SearchIcon />
            </InputGroupAddon>
            <InputGroupInput placeholder="Search cards…" />
          </InputGroup>
        </Demo>
        <Demo name="InputOTP" hint="Verification-code entry (email codes).">
          <InputOTP maxLength={6}>
            <InputOTPGroup>
              {[0, 1, 2, 3, 4, 5].map((index) => (
                <InputOTPSlot key={index} index={index} />
              ))}
            </InputOTPGroup>
          </InputOTP>
        </Demo>
        <Demo name="Kbd" hint="Keyboard shortcut hints in menus and palettes.">
          <KbdGroup>
            <Kbd>Ctrl</Kbd>
            <Kbd>K</Kbd>
          </KbdGroup>
        </Demo>
        <Demo
          name="Dropzone"
          hint="Drag-and-drop file target over a hidden file input. The panel is the click target too."
          spec="dashed border · primary tint while dragging"
          className="sm:col-span-2"
        >
          <Dropzone
            className="w-full"
            multiple
            accept="image/*"
            icon={<UploadIcon className="text-muted-foreground size-5" />}
            label="Drop photos here or click to choose"
            hint="JPG, PNG or WebP, up to 50 MB each."
            onFiles={(files) => toast.success(`${files.length} file(s) picked`)}
          />
        </Demo>
        <Demo
          name="Control row"
          hint="Boxed controls in one row share the h-8 tier: default Select, Input, and Button align. Never mix in sm/xs boxes."
          spec="all boxed controls h-8 · compact sizes never mix in (docs/design-language.md)"
          className="sm:col-span-2"
        >
          <div className="flex w-full items-center gap-2">
            <Select
              items={energyItems}
              value={energy}
              onValueChange={(v) => {
                if (v !== null) {
                  setEnergy(v);
                }
              }}
            >
              <SelectTrigger className="w-36 shrink-0" aria-label="Kind">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {energyItems.map((item) => (
                  <SelectItem key={item.value} value={item.value}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input placeholder="Value…" className="flex-1" aria-label="Value" />
            <Button variant="outline">
              <PlusIcon /> Add
            </Button>
          </div>
        </Demo>
      </DemoGrid>
    </DemoSection>
  );
}
