import { Link, useMatches } from "@tanstack/react-router";
import {
  ArrowLeftIcon,
  BanIcon,
  CameraIcon,
  GalleryVerticalIcon,
  DatabaseIcon,
  FlagIcon,
  LayoutDashboardIcon,
  LayersIcon,
  MapIcon,
  SettingsIcon,
} from "lucide-react";

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

const topPages = [{ to: "/admin" as const, icon: LayoutDashboardIcon, title: "Overview" }];

const catalogPages = [
  { to: "/admin/sets" as const, icon: DatabaseIcon, title: "Sets" },
  { to: "/admin/cards" as const, icon: GalleryVerticalIcon, title: "Cards" },
];

const marketplacePages = [
  { to: "/admin/marketplace-overview" as const, icon: LayoutDashboardIcon, title: "Overview" },
  { to: "/admin/marketplace-groups" as const, icon: LayersIcon, title: "Groups" },
  { to: "/admin/marketplace-mappings" as const, icon: MapIcon, title: "Mappings" },
  { to: "/admin/ignored-products" as const, icon: BanIcon, title: "Ignored Products" },
];

const systemPages = [
  { to: "/admin/feature-flags" as const, icon: FlagIcon, title: "Feature Flags" },
  { to: "/admin/scan" as const, icon: CameraIcon, title: "Scan Test" },
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
            {marketplacePages.map((page) => (
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
