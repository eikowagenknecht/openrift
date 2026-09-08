import type { AdminSignupDay } from "@openrift/shared/contracts/admin/dashboard";
import { useState } from "react";
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts";

import { ChartContainer, ChartTooltip } from "@/components/ui/chart";
import type { ChartConfig } from "@/components/ui/chart";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import type { UserGrowthPoint, UserGrowthRange } from "@/features/admin/lib/user-growth";
import {
  USER_GROWTH_RANGES,
  USER_GROWTH_RANGE_LABELS,
  countSignups,
  toUserGrowthSeries,
} from "@/features/admin/lib/user-growth";

const chartConfig = {
  users: { label: "Users", color: "var(--chart-1)" },
} satisfies ChartConfig;

function GrowthTooltipContent({
  active,
  payload,
}: {
  active?: boolean;
  payload?: { payload: UserGrowthPoint }[];
}) {
  const [firstEntry] = payload ?? [];
  if (!active || firstEntry === undefined) {
    return null;
  }
  const point = firstEntry.payload;
  return (
    <div className="border-border/50 bg-background rounded-lg border px-2.5 py-1.5 text-xs shadow-md">
      <p className="mb-1 font-medium">{point.date}</p>
      <div className="space-y-0.5">
        <div className="flex items-center gap-2">
          <span className="size-2 rounded-full" style={{ backgroundColor: "var(--color-users)" }} />
          <span className="text-muted-foreground">Users</span>
          <span className="ml-auto font-mono font-medium tabular-nums">
            {point.users.toLocaleString()}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="size-2" />
          <span className="text-muted-foreground">New</span>
          <span className="ml-auto font-mono font-medium tabular-nums">
            +{point.signups.toLocaleString()}
          </span>
        </div>
      </div>
    </div>
  );
}

export function UserGrowthChart({ signups }: { signups: AdminSignupDay[] }) {
  const [range, setRange] = useState<UserGrowthRange>("30d");

  const series = toUserGrowthSeries(signups, range);
  const newUsers = countSignups(series);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <p className="text-muted-foreground text-sm">
          {newUsers === 0
            ? "No new users in this range"
            : `+${newUsers.toLocaleString()} ${newUsers === 1 ? "user" : "users"} in this range`}
        </p>
        <ToggleGroup
          variant="outline"
          size="sm"
          spacing={0}
          value={[range]}
          onValueChange={([next]) => {
            const match = USER_GROWTH_RANGES.find((r) => r === next);
            if (match) {
              setRange(match);
            }
          }}
          aria-label="Time range"
          className="ml-auto"
        >
          {USER_GROWTH_RANGES.map((value) => (
            <ToggleGroupItem key={value} value={value}>
              {USER_GROWTH_RANGE_LABELS[value]}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>

      {series.length === 0 ? (
        <p className="text-muted-foreground py-8 text-center text-sm">No signups yet.</p>
      ) : (
        <ChartContainer config={chartConfig} className="aspect-[3/1] w-full">
          <AreaChart data={series} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
            <defs>
              <linearGradient id="userGrowthFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--color-users)" stopOpacity={0.2} />
                <stop offset="100%" stopColor="var(--color-users)" stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis
              dataKey="date"
              tick={{ fontSize: 11 }}
              interval={Math.max(0, Math.ceil(series.length / 4) - 1)}
            />
            {/* Not zero-based: a running total dwarfs a month of growth, and the ticks carry the real count. */}
            <YAxis
              tickFormatter={(v: number) => v.toLocaleString()}
              tick={{ fontSize: 11 }}
              width={48}
              domain={["dataMin", "dataMax"]}
              padding={{ top: 8 }}
            />
            <ChartTooltip content={<GrowthTooltipContent />} />
            <Area
              dataKey="users"
              type="monotone"
              stroke="var(--color-users)"
              strokeWidth={2}
              fill="url(#userGrowthFill)"
              baseValue="dataMin"
              dot={false}
              isAnimationActive={false}
            />
          </AreaChart>
        </ChartContainer>
      )}
    </div>
  );
}
