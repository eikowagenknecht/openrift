import { Eye } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { CardFields } from "@/lib/card-fields";

export function DisplaySettingsDropdown({
  showImages,
  onShowImagesChange,
  richEffects,
  onRichEffectsChange,
  cardFields: fields,
  onCardFieldsChange,
}: {
  showImages: boolean;
  onShowImagesChange: (v: boolean) => void;
  richEffects: boolean;
  onRichEffectsChange: (v: boolean) => void;
  cardFields: CardFields;
  onCardFieldsChange: (update: Partial<CardFields>) => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={<Button variant="outline" size="icon" aria-label="Display settings" />}
      >
        <Eye className="size-4" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuCheckboxItem checked={showImages} onCheckedChange={onShowImagesChange}>
          Show card images
        </DropdownMenuCheckboxItem>
        <DropdownMenuCheckboxItem checked={richEffects} onCheckedChange={onRichEffectsChange}>
          Rich effects
        </DropdownMenuCheckboxItem>
        <DropdownMenuSeparator />
        <DropdownMenuCheckboxItem
          checked={fields.number}
          onCheckedChange={(v) => onCardFieldsChange({ number: v })}
        >
          Show ID
        </DropdownMenuCheckboxItem>
        <DropdownMenuCheckboxItem
          checked={fields.title}
          onCheckedChange={(v) => onCardFieldsChange({ title: v })}
        >
          Show title
        </DropdownMenuCheckboxItem>
        <DropdownMenuCheckboxItem
          checked={fields.type}
          onCheckedChange={(v) => onCardFieldsChange({ type: v })}
        >
          Show type
        </DropdownMenuCheckboxItem>
        <DropdownMenuCheckboxItem
          checked={fields.rarity}
          onCheckedChange={(v) => onCardFieldsChange({ rarity: v })}
        >
          Show rarity
        </DropdownMenuCheckboxItem>
        <DropdownMenuCheckboxItem
          checked={fields.price}
          onCheckedChange={(v) => onCardFieldsChange({ price: v })}
        >
          Show price
        </DropdownMenuCheckboxItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
