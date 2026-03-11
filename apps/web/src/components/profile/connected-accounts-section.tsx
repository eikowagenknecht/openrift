import { useEffect, useState } from "react";
import { siDiscord, siGoogle } from "simple-icons";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { authClient } from "@/lib/auth-client";

const SOCIAL_PROVIDERS = [
  { id: "google", name: "Google", icon: siGoogle },
  { id: "discord", name: "Discord", icon: siDiscord },
] as const;

export function ConnectedAccountsSection() {
  const [accounts, setAccounts] = useState<{ providerId: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchAccounts() {
      const { data, error: fetchError } = await authClient.listAccounts();
      if (fetchError) {
        setError(fetchError.message ?? "Failed to load connected accounts.");
      } else {
        setAccounts(data ?? []);
      }
      setLoading(false);
    }
    fetchAccounts();
  }, []);

  async function handleLink(provider: string) {
    setActionLoading(provider);
    setError(null);
    await authClient.linkSocial({
      provider: provider as "google" | "discord",
      callbackURL: "/profile",
    });
  }

  async function handleUnlink(providerId: string) {
    setActionLoading(providerId);
    setError(null);
    const { error: unlinkError } = await authClient.unlinkAccount({ providerId });
    setActionLoading(null);
    if (unlinkError) {
      setError(unlinkError.message ?? "Failed to unlink account.");
      return;
    }
    setAccounts((prev) => prev.filter((a) => a.providerId !== providerId));
  }

  const linkedProviderIds = new Set(accounts.map((a) => a.providerId));

  return (
    <Card>
      <CardHeader>
        <CardTitle>Connected Accounts</CardTitle>
        <CardDescription>Link your social accounts for faster sign-in.</CardDescription>
      </CardHeader>
      <CardContent>
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading...</p>
        ) : (
          <div className="grid gap-3">
            {error && <p className="text-sm text-destructive">{error}</p>}
            {SOCIAL_PROVIDERS.map((provider) => {
              const isLinked = linkedProviderIds.has(provider.id);
              const isOnlyAccount = accounts.length <= 1;
              return (
                <div
                  key={provider.id}
                  className="flex items-center justify-between rounded-md border p-3"
                >
                  <div className="flex items-center gap-3">
                    <svg viewBox="0 0 24 24" className="size-5" aria-hidden="true">
                      <path d={provider.icon.path} fill="currentColor" />
                    </svg>
                    <span className="text-sm font-medium">{provider.name}</span>
                  </div>
                  {isLinked ? (
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={isOnlyAccount || actionLoading === provider.id}
                      onClick={() => handleUnlink(provider.id)}
                      title={
                        isOnlyAccount ? "You must have at least one linked account" : undefined
                      }
                    >
                      {actionLoading === provider.id ? "Unlinking..." : "Unlink"}
                    </Button>
                  ) : (
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={actionLoading === provider.id}
                      onClick={() => handleLink(provider.id)}
                    >
                      {actionLoading === provider.id ? "Connecting..." : "Connect"}
                    </Button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
