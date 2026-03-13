import { Link, useMatches } from "@tanstack/react-router";
import {
  ArrowLeftIcon,
  ChevronRightIcon,
  GalleryVerticalIcon,
  DatabaseIcon,
  FlagIcon,
  LayoutDashboardIcon,
  LayersIcon,
  MapIcon,
  SettingsIcon,
} from "lucide-react";

import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
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
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarSeparator,
} from "@/components/ui/sidebar";

const topPages = [{ to: "/admin" as const, icon: LayoutDashboardIcon, title: "Overview" }];

const catalogPages = [
  { to: "/admin/sets" as const, icon: DatabaseIcon, title: "Sets" },
  { to: "/admin/cards" as const, icon: GalleryVerticalIcon, title: "Cards" },
];

const marketplaces = [
  {
    label: "TCGplayer",
    prefixes: ["/admin/tcgplayer-"],
    pages: [
      { to: "/admin/tcgplayer-groups" as const, icon: LayersIcon, title: "Groups" },
      { to: "/admin/tcgplayer-mappings" as const, icon: MapIcon, title: "Mappings" },
    ],
  },
  {
    label: "Cardmarket",
    prefixes: ["/admin/cardmarket-"],
    pages: [
      { to: "/admin/cardmarket-groups" as const, icon: LayersIcon, title: "Groups" },
      { to: "/admin/cardmarket-mappings" as const, icon: MapIcon, title: "Mappings" },
    ],
  },
];

const systemPages = [
  { to: "/admin/feature-flags" as const, icon: FlagIcon, title: "Feature Flags" },
];

export function AdminSidebar() {
  const matches = useMatches();
  const currentPath = matches.at(-1)?.fullPath;

  return (
    <Sidebar className="sticky! top-14 h-[calc(100svh-3.5rem-1px)]! overflow-hidden! border-l-0! group-data-[collapsible=offcanvas]:w-0!">
      <SidebarHeader>
        <Link to="/admin" className="px-2 py-1 text-lg font-semibold tracking-tight">
          Admin
        </Link>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarMenu>
            {topPages.map((page) => (
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

        <SidebarGroup>
          <SidebarGroupLabel>Catalog</SidebarGroupLabel>
          <SidebarMenu>
            {catalogPages.map((page) => (
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

        <SidebarGroup>
          <SidebarGroupLabel>Marketplaces</SidebarGroupLabel>
          <SidebarMenu>
            {marketplaces.map((marketplace) => {
              const isActive = marketplace.prefixes.some((p) => currentPath?.startsWith(p));
              return (
                <Collapsible key={marketplace.label} defaultOpen={isActive}>
                  <SidebarMenuItem>
                    <CollapsibleTrigger
                      render={
                        <SidebarMenuButton>
                          <span>{marketplace.label}</span>
                          <ChevronRightIcon className="ml-auto transition-transform duration-200 group-data-[panel-open]/collapsible:rotate-90" />
                        </SidebarMenuButton>
                      }
                    />
                    <CollapsibleContent>
                      <SidebarMenuSub>
                        {marketplace.pages.map((page) => (
                          <SidebarMenuSubItem key={page.to}>
                            <SidebarMenuSubButton
                              isActive={currentPath === page.to}
                              render={<Link to={page.to} />}
                            >
                              <page.icon />
                              <span>{page.title}</span>
                            </SidebarMenuSubButton>
                          </SidebarMenuSubItem>
                        ))}
                      </SidebarMenuSub>
                    </CollapsibleContent>
                  </SidebarMenuItem>
                </Collapsible>
              );
            })}
          </SidebarMenu>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel>System</SidebarGroupLabel>
          <SidebarMenu>
            {systemPages.map((page) => (
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
      </SidebarContent>
      <SidebarFooter>
        <SidebarSeparator />
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              isActive={currentPath === "/admin/settings"}
              render={<Link to="/admin/settings" />}
            >
              <SettingsIcon />
              <span>Settings</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton render={<Link to="/cards" />}>
              <ArrowLeftIcon />
              <span>Back to site</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
