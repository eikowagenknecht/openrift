import { ChevronDownIcon } from "lucide-react";
import { useState } from "react";
import { Area, AreaChart } from "recharts";

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ChartContainer } from "@/components/ui/chart";
import type { ChartConfig } from "@/components/ui/chart";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

import { CHAMPIONS } from "./demo-data";
import { Demo, DemoGrid, DemoSection } from "./demo-primitives";

const CHART_DATA = [
  { day: "Mon", value: 4.2 },
  { day: "Tue", value: 4.6 },
  { day: "Wed", value: 4.4 },
  { day: "Thu", value: 5.1 },
  { day: "Fri", value: 5.6 },
  { day: "Sat", value: 5.4 },
  { day: "Sun", value: 6 },
];

const CHART_CONFIG = {
  value: { label: "Price", color: "var(--chart-1)" },
} satisfies ChartConfig;

export function LayoutSection() {
  const [collapsibleOpen, setCollapsibleOpen] = useState(false);
  return (
    <DemoSection
      id="layout"
      title="Layout & data"
      note="Sidebar and NavigationMenu are app chrome; see the admin sidebar and the global header for the live examples."
    >
      <DemoGrid>
        <Demo name="Card" hint="Grouped content block: header, body, footer actions.">
          <Card className="w-full">
            <CardHeader>
              <CardTitle>Summoner Skirmish</CardTitle>
              <CardDescription>Saturday · 12 entrants</CardDescription>
            </CardHeader>
            <CardContent className="text-sm">Swiss, 4 rounds, then a cut to top 4.</CardContent>
            <CardFooter>
              <Button size="sm" variant="outline">
                Manage
              </Button>
            </CardFooter>
          </Card>
        </Demo>
        <Demo name="Tabs" hint="Peer views of one surface (not navigation).">
          <Tabs defaultValue="cards" className="w-full">
            <TabsList>
              <TabsTrigger value="cards">Cards</TabsTrigger>
              <TabsTrigger value="stats">Stats</TabsTrigger>
            </TabsList>
            <TabsContent value="cards" className="text-muted-foreground text-sm">
              Tab content renders here.
            </TabsContent>
            <TabsContent value="stats" className="text-muted-foreground text-sm">
              Energy curve, domains, formats.
            </TabsContent>
          </Tabs>
        </Demo>
        <Demo name="ChartContainer" hint="Recharts wrapper; config drives themed var(--color-*).">
          <ChartContainer config={CHART_CONFIG} className="aspect-auto h-16 w-full">
            <AreaChart data={CHART_DATA} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
              <Area
                dataKey="value"
                type="monotone"
                stroke="var(--color-value)"
                fill="var(--color-value)"
                fillOpacity={0.15}
                strokeWidth={1.5}
              />
            </AreaChart>
          </ChartContainer>
        </Demo>
        <Demo
          name="Table"
          hint="Static data table. Card browsers use the virtualized card table instead."
        >
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Card</TableHead>
                <TableHead>Set</TableHead>
                <TableHead className="text-right">Owned</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow>
                <TableCell>Teemo, Swift Scout</TableCell>
                <TableCell>Origins</TableCell>
                <TableCell className="text-right tabular-nums">4</TableCell>
              </TableRow>
              <TableRow>
                <TableCell>Jinx, Loose Cannon</TableCell>
                <TableCell>Origins</TableCell>
                <TableCell className="text-right tabular-nums">2</TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </Demo>
        <Demo name="Accordion" hint="Stacked disclosure list; one item open at a time.">
          <Accordion className="w-full">
            <AccordionItem value="rules">
              <AccordionTrigger>Deck rules</AccordionTrigger>
              <AccordionContent>40 cards minimum, 3 copies max.</AccordionContent>
            </AccordionItem>
            <AccordionItem value="legends">
              <AccordionTrigger>Legends</AccordionTrigger>
              <AccordionContent>Exactly one legend per deck.</AccordionContent>
            </AccordionItem>
          </Accordion>
        </Demo>
        <Demo name="Collapsible" hint="Single hide/show region behind its own trigger.">
          <Collapsible
            open={collapsibleOpen}
            onOpenChange={setCollapsibleOpen}
            className="w-full space-y-2"
          >
            <CollapsibleTrigger
              render={
                <Button variant="outline" size="sm">
                  {collapsibleOpen ? "Hide" : "Show"} advanced <ChevronDownIcon />
                </Button>
              }
            />
            <CollapsibleContent className="text-muted-foreground text-sm">
              Collapsed-by-default extras live here.
            </CollapsibleContent>
          </Collapsible>
        </Demo>
        <Demo name="ScrollArea" hint="Styled scrollbars for fixed-height overflow regions.">
          <ScrollArea className="h-24 w-48 rounded-md border p-2 text-sm">
            {[...CHAMPIONS, ...CHAMPIONS].map((name, index) => (
              <p key={index} className="py-0.5">
                {name}
              </p>
            ))}
          </ScrollArea>
        </Demo>
        <Demo name="Separator" hint="Hairline divider, horizontal or vertical.">
          <div className="w-full space-y-2 text-sm">
            <p>Above</p>
            <Separator />
            <div className="flex h-5 items-center gap-2">
              <span>Left</span>
              <Separator orientation="vertical" />
              <span>Right</span>
            </div>
          </div>
        </Demo>
        <Demo name="Calendar" hint="Month grid; usually reached through DatePicker.">
          <Calendar mode="single" className="rounded-md border" />
        </Demo>
      </DemoGrid>
    </DemoSection>
  );
}
