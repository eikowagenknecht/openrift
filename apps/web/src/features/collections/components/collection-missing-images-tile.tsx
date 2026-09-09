import { Link } from "@tanstack/react-router";
import { ImageOffIcon } from "lucide-react";

import { CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CardLink } from "@/components/ui/card-link";
import { useMyMissingImages } from "@/features/contribute/hooks/use-missing-images";

export function CollectionMissingImagesTile() {
  const { data } = useMyMissingImages();

  const count = data?.items.length ?? 0;
  if (count === 0) {
    return null;
  }

  return (
    <CardLink render={<Link to="/contribute" />}>
      <CardHeader>
        <CardTitle className="text-muted-foreground flex items-center gap-1.5">
          <ImageOffIcon className="size-4" />
          Without an image
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="font-heading text-2xl font-semibold tabular-nums">{count.toLocaleString()}</p>
        <p className="text-muted-foreground text-xs">
          Owned cards the catalogue has no picture for yet
        </p>
      </CardContent>
    </CardLink>
  );
}
