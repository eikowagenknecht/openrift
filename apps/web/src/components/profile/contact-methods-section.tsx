import { CONTACT_METHOD_LABELS, CONTACT_METHOD_TYPES } from "@openrift/shared";
import type { ContactMethod, ContactMethodType } from "@openrift/shared";
import { PlusIcon, Trash2Icon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  useContactMethods,
  useCreateContactMethod,
  useDeleteContactMethod,
  useUpdateContactMethod,
} from "@/hooks/use-contact-methods";

const TYPE_ITEMS: { value: ContactMethodType; label: string }[] = CONTACT_METHOD_TYPES.map(
  (value) => ({ value, label: CONTACT_METHOD_LABELS[value] }),
);

const PLACEHOLDER: Record<ContactMethodType, string> = {
  discord: "username or invite link",
  signal: "+49 151 …",
  telegram: "@handle",
  whatsapp: "+49 151 …",
  phone: "+49 151 …",
  email: "you@example.com",
  in_person: "Fridays at the LGS",
  other: "however people reach you",
};

function TypeSelect({
  value,
  onValueChange,
  id,
}: {
  value: ContactMethodType;
  onValueChange: (value: ContactMethodType) => void;
  id?: string;
}) {
  return (
    <Select
      items={TYPE_ITEMS}
      value={value}
      onValueChange={(next) => onValueChange(next as ContactMethodType)}
    >
      <SelectTrigger id={id} className="w-40 shrink-0">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {TYPE_ITEMS.map((item) => (
          <SelectItem key={item.value} value={item.value}>
            {item.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

// One saved method, editable in place; saves on the explicit button when dirty.
function ContactMethodRow({ method }: { method: ContactMethod }) {
  const [type, setType] = useState<ContactMethodType>(method.type);
  const [value, setValue] = useState(method.value);
  const update = useUpdateContactMethod();
  const remove = useDeleteContactMethod();

  const dirty = type !== method.type || value.trim() !== method.value;
  const canSave = dirty && value.trim().length > 0;

  async function handleSave() {
    try {
      await update.mutateAsync({ id: method.id, type, value: value.trim() });
      toast.success("Contact method saved");
    } catch {
      /* Reported by the global mutation error toast. */
    }
  }

  return (
    <div className="flex items-center gap-2">
      <TypeSelect value={type} onValueChange={setType} />
      <Input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={PLACEHOLDER[type]}
        maxLength={200}
        className="flex-1"
        aria-label="Contact value"
      />
      {canSave ? (
        <Button disabled={update.isPending} onClick={() => void handleSave()}>
          Save
        </Button>
      ) : null}
      <Button
        size="icon-sm"
        variant="ghost"
        aria-label="Remove contact method"
        disabled={remove.isPending}
        onClick={() => remove.mutate({ id: method.id })}
      >
        <Trash2Icon className="size-4" />
      </Button>
    </div>
  );
}

function AddContactMethod() {
  const [type, setType] = useState<ContactMethodType>("discord");
  const [value, setValue] = useState("");
  const create = useCreateContactMethod();

  const canAdd = value.trim().length > 0;

  async function handleAdd() {
    try {
      await create.mutateAsync({ type, value: value.trim() });
      setValue("");
    } catch {
      /* Reported by the global mutation error toast. */
    }
  }

  return (
    <div className="flex items-center gap-2">
      <TypeSelect value={type} onValueChange={setType} id="contact-add-type" />
      <Input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={PLACEHOLDER[type]}
        maxLength={200}
        className="flex-1"
        aria-label="New contact value"
      />
      <Button
        variant="outline"
        disabled={!canAdd || create.isPending}
        onClick={() => void handleAdd()}
      >
        <PlusIcon />
        Add
      </Button>
    </div>
  );
}

export function ContactMethodsSection() {
  const { contactMethods } = useContactMethods();

  return (
    <Card>
      <CardHeader>
        <CardTitle>Trade contacts</CardTitle>
        <CardDescription>
          Choose which to share in each group&apos;s settings. Nothing is visible until you share
          it.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {contactMethods.map((method) => (
          <ContactMethodRow key={method.id} method={method} />
        ))}
        <AddContactMethod />
      </CardContent>
    </Card>
  );
}
