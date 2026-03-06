import { Link, useMatches } from "@tanstack/react-router";
import { ArrowLeftIcon, DatabaseIcon, LayersIcon, MapIcon } from "lucide-react";

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarSeparator,
} from "@/components/ui/sidebar";

const groups = [
  {
    label: "Catalog",
    pages: [{ to: "/admin/sets" as const, icon: DatabaseIcon, title: "Sets" }],
  },
  {
    label: "TCGplayer",
    pages: [
      { to: "/admin/tcgplayer-groups" as const, icon: LayersIcon, title: "Groups" },
      { to: "/admin/tcgplayer-mappings" as const, icon: MapIcon, title: "Mappings" },
    ],
  },
  {
    label: "Cardmarket",
    pages: [
      { to: "/admin/cardmarket-expansions" as const, icon: LayersIcon, title: "Expansions" },
      { to: "/admin/cm-mappings" as const, icon: MapIcon, title: "Mappings" },
    ],
  },
];

export function AdminSidebar() {
  const matches = useMatches();
  const currentPath = matches.at(-1)?.fullPath;

  return (
    <Sidebar className="sticky! top-14 h-[calc(100svh-3.5rem-1px)]! border-l-0!">
      <SidebarHeader>
        <Link to="/admin" className="px-2 py-1 text-lg font-semibold tracking-tight">
          Admin
        </Link>
      </SidebarHeader>
      <SidebarContent>
        {groups.map((group) => (
          <SidebarGroup key={group.label}>
            <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
            <SidebarMenu>
              {group.pages.map((page) => (
                <SidebarMenuItem key={page.to}>
                  <SidebarMenuButton
                    isActive={currentPath === page.to}
                    render={<Link to={page.to} />}
                  >
                    <page.icon />
                    <span>{page.title}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroup>
        ))}
      </SidebarContent>
      <SidebarFooter>
        <SidebarSeparator />
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton render={<Link to="/" />}>
              <ArrowLeftIcon />
              <span>Back to site</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
