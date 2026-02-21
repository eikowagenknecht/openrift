import { Settings } from "lucide-react";

import type { CardFields } from "@/components/cards/CardThumbnail";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface DisplaySettingsMenuProps {
  showImages: boolean;
  onShowImagesChange: (show: boolean) => void;
  cardFields: CardFields;
  onCardFieldsChange: (update: Partial<CardFields>) => void;
  darkMode: boolean;
  onDarkModeChange: (dark: boolean) => void;
}

export function DisplaySettingsMenu({
  showImages,
  onShowImagesChange,
  cardFields,
  onCardFieldsChange,
  darkMode,
  onDarkModeChange,
}: DisplaySettingsMenuProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Display settings">
          <Settings className="size-5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuCheckboxItem
          checked={showImages}
          onCheckedChange={onShowImagesChange}
          onSelect={(e) => e.preventDefault()}
        >
          Show card images
        </DropdownMenuCheckboxItem>
        <DropdownMenuCheckboxItem
          checked={cardFields.number}
          onCheckedChange={(v) => onCardFieldsChange({ number: v })}
          onSelect={(e) => e.preventDefault()}
        >
          Show ID
        </DropdownMenuCheckboxItem>
        <DropdownMenuCheckboxItem
          checked={cardFields.title}
          onCheckedChange={(v) => onCardFieldsChange({ title: v })}
          onSelect={(e) => e.preventDefault()}
        >
          Show title
        </DropdownMenuCheckboxItem>
        <DropdownMenuCheckboxItem
          checked={cardFields.type}
          onCheckedChange={(v) => onCardFieldsChange({ type: v })}
          onSelect={(e) => e.preventDefault()}
        >
          Show type
        </DropdownMenuCheckboxItem>
        <DropdownMenuCheckboxItem
          checked={cardFields.supertype}
          onCheckedChange={(v) => onCardFieldsChange({ supertype: v })}
          onSelect={(e) => e.preventDefault()}
        >
          Show supertype
        </DropdownMenuCheckboxItem>
        <DropdownMenuCheckboxItem
          checked={cardFields.rarity}
          onCheckedChange={(v) => onCardFieldsChange({ rarity: v })}
          onSelect={(e) => e.preventDefault()}
        >
          Show rarity
        </DropdownMenuCheckboxItem>
        <DropdownMenuSeparator />
        <DropdownMenuCheckboxItem
          checked={darkMode}
          onCheckedChange={onDarkModeChange}
          onSelect={(e) => e.preventDefault()}
        >
          Dark mode
        </DropdownMenuCheckboxItem>
        <DropdownMenuSeparator />
        <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
          v{__COMMIT_HASH__}
        </DropdownMenuLabel>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
