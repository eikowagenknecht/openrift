import { Eye } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { CardFields } from "@/lib/card-fields";

interface DisplaySettingsProps {
  showImages: boolean;
  onShowImagesChange: (v: boolean) => void;
  richEffects: boolean;
  onRichEffectsChange: (v: boolean) => void;
  cardFields: CardFields;
  onCardFieldsChange: (update: Partial<CardFields>) => void;
}

export function DisplaySettingsDropdown({
  showImages,
  onShowImagesChange,
  richEffects,
  onRichEffectsChange,
  cardFields: fields,
  onCardFieldsChange,
}: DisplaySettingsProps) {
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

export function DisplaySettingsInline({
  showImages,
  onShowImagesChange,
  richEffects,
  onRichEffectsChange,
  cardFields: fields,
  onCardFieldsChange,
}: DisplaySettingsProps) {
  return (
    <div className="flex flex-wrap gap-2">
      <Badge
        variant={showImages ? "default" : "outline"}
        className="cursor-pointer"
        onClick={() => onShowImagesChange(!showImages)}
      >
        Card images
      </Badge>
      <Badge
        variant={richEffects ? "default" : "outline"}
        className="cursor-pointer"
        onClick={() => onRichEffectsChange(!richEffects)}
      >
        Rich effects
      </Badge>
      <Badge
        variant={fields.number ? "default" : "outline"}
        className="cursor-pointer"
        onClick={() => onCardFieldsChange({ number: !fields.number })}
      >
        ID
      </Badge>
      <Badge
        variant={fields.title ? "default" : "outline"}
        className="cursor-pointer"
        onClick={() => onCardFieldsChange({ title: !fields.title })}
      >
        Title
      </Badge>
      <Badge
        variant={fields.type ? "default" : "outline"}
        className="cursor-pointer"
        onClick={() => onCardFieldsChange({ type: !fields.type })}
      >
        Type
      </Badge>
      <Badge
        variant={fields.rarity ? "default" : "outline"}
        className="cursor-pointer"
        onClick={() => onCardFieldsChange({ rarity: !fields.rarity })}
      >
        Rarity
      </Badge>
      <Badge
        variant={fields.price ? "default" : "outline"}
        className="cursor-pointer"
        onClick={() => onCardFieldsChange({ price: !fields.price })}
      >
        Price
      </Badge>
    </div>
  );
}
