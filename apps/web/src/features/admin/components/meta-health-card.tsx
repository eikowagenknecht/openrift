import type { JobStatus } from "@openrift/shared/contracts/admin/job-runs";
import type { MetaSource } from "@openrift/shared/contracts/admin/meta-catalog";
import { Link } from "@tanstack/react-router";
import { CircleAlertIcon } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { MetaAdminTarget } from "@/features/admin/lib/meta-admin-triggers";
import { catalogueSource, JOB_KIND_PREFIX } from "@/features/admin/lib/meta-admin-triggers";
import type { MetaSyncAlert, MetaSyncAlertTarget } from "@/features/meta/lib/meta-catalog-display";
import { META_SOURCE_LABELS } from "@/features/meta/lib/meta-catalog-display";

/** A union, not an optional `target`: a forgotten one must fail to compile, not link nowhere. */
type AlertDestination =
  | { kind: "runs"; label: string; status?: JobStatus }
  | { kind: "link"; label: string; target: MetaAdminTarget };

const ALERT_TARGETS: Record<MetaSyncAlertTarget, AlertDestination> = {
  runs: { kind: "runs", label: "Recent runs" },
  "failed-runs": { kind: "runs", label: "The failed runs", status: "failed" },
  "catalogue-accepted": {
    kind: "link",
    label: "Accepted events",
    target: { tab: "catalogue", triage: "accepted" },
  },
  "catalogue-accepted-missing": {
    kind: "link",
    label: "The missing events",
    target: { tab: "catalogue", triage: "accepted", missing: true },
  },
  review: { kind: "link", label: "Review queue", target: { tab: "review" } },
};

function AlertAction({ alert, source }: { alert: MetaSyncAlert; source: MetaSource }) {
  const destination = ALERT_TARGETS[alert.target];
  if (destination.kind === "runs") {
    return (
      <Button
        variant="ghost"
        size="sm"
        render={
          <Link
            to="/admin/job-runs"
            search={{ runPrefix: JOB_KIND_PREFIX[source], runStatus: destination.status }}
          />
        }
      >
        {destination.label}
      </Button>
    );
  }
  return (
    <Button
      variant="ghost"
      size="sm"
      render={
        <Link
          from="/admin/meta"
          to="/admin/meta"
          search={(prev) => ({ ...prev, source: catalogueSource(source), ...destination.target })}
        />
      }
    >
      {destination.label}
    </Button>
  );
}

export type SourcedAlert = MetaSyncAlert & { source: MetaSource };

export function HealthCard({ alerts }: { alerts: SourcedAlert[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Health</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {alerts.length === 0 && (
          <p className="text-muted-foreground">Every source looks healthy.</p>
        )}
        {alerts.map((alert) => (
          <div key={`${alert.source}-${alert.id}`} className="flex items-center gap-2">
            <CircleAlertIcon className="text-destructive size-4 shrink-0" />
            <Badge variant="muted">{META_SOURCE_LABELS[alert.source]}</Badge>
            <span className="flex-1">{alert.message}</span>
            <AlertAction alert={alert} source={alert.source} />
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
