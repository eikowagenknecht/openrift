import { Card, CardContent } from "@/components/ui/card";

interface ScanNoticesProps {
  unavailableMessage: string | null;
  scanError: string | null;
  cameraAvailable: boolean | null;
}

export function ScanNotices({ unavailableMessage, scanError, cameraAvailable }: ScanNoticesProps) {
  return (
    <>
      {unavailableMessage && (
        <Card className="border-destructive mt-4">
          <CardContent className="pt-6">
            <p className="font-medium">Scanning is not available right now.</p>
            <p className="text-muted-foreground mt-2">{unavailableMessage}</p>
          </CardContent>
        </Card>
      )}

      {scanError && <p className="text-destructive mt-4">{scanError}</p>}

      {cameraAvailable === false && (
        <p className="text-muted-foreground mt-4">
          The camera needs a secure connection, so scanning only works over https.
        </p>
      )}
    </>
  );
}
