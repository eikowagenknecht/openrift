import { Link, useMatches } from "@tanstack/react-router";
import {
  BanIcon,
  CameraIcon,
  GalleryVerticalIcon,
  DatabaseIcon,
  FlagIcon,
  GlobeIcon,
  ImageIcon,
  LanguagesIcon,
  LayoutDashboardIcon,
  LayersIcon,
  MapIcon,
  SettingsIcon,
  SpellCheckIcon,
  TagIcon,
  UsersIcon,
} from "lucide-react";

import {
  NestedSidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarSeparator,
} from "@/components/ui/sidebar";

const catalogPages = [
  { to: "/admin/sets" as const, icon: DatabaseIcon, title: "Sets" },
  { to: "/admin/cards" as const, icon: GalleryVerticalIcon, title: "Cards" },
  { to: "/admin/sources" as const, icon: DatabaseIcon, title: "Sources" },
  { to: "/admin/images" as const, icon: ImageIcon, title: "Images" },
  { to: "/admin/ignored-sources" as const, icon: BanIcon, title: "Ignored Sources" },
  { to: "/admin/promo-types" as const, icon: TagIcon, title: "Promo Types" },
  { to: "/admin/languages" as const, icon: LanguagesIcon, title: "Languages" },
  { to: "/admin/typography-review" as const, icon: SpellCheckIcon, title: "Typography" },
];

const marketplacePages = [
  { to: "/admin/marketplace-overview" as const, icon: LayoutDashboardIcon, title: "Overview" },
  { to: "/admin/marketplace-groups" as const, icon: LayersIcon, title: "Groups" },
  { to: "/admin/marketplace-mappings" as const, icon: MapIcon, title: "Mappings" },
  { to: "/admin/ignored-products" as const, icon: BanIcon, title: "Ignored Products" },
];

const systemPages = [
  { to: "/admin/users" as const, icon: UsersIcon, title: "Users" },
  { to: "/admin/feature-flags" as const, icon: FlagIcon, title: "Feature Flags" },
  { to: "/admin/site-settings" as const, icon: GlobeIcon, title: "Site Settings" },
  { to: "/admin/scan" as const, icon: CameraIcon, title: "Scan Test" },
];

export function AdminSidebar() {
  const matches = useMatches();
  const currentPath = matches.at(-1)?.fullPath;

  return (
    <NestedSidebar>
      <SidebarContent>
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
              isActive={currentPath === "/admin/site-settings"}
              render={<Link to="/admin/site-settings" />}
            >
              <SettingsIcon />
              <span>Settings</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </NestedSidebar>
  );
}
