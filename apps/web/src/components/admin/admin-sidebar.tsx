import { Link, useMatches } from "@tanstack/react-router";
import {
  BanIcon,
  BookOpenIcon,
  ActivityIcon,
  CameraIcon,
  CloudIcon,
  CrownIcon,
  FileWarningIcon,
  GalleryVerticalIcon,
  DatabaseIcon,
  FlagIcon,
  GlobeIcon,
  HashIcon,
  ImageIcon,
  LanguagesIcon,
  LayoutDashboardIcon,
  LayoutListIcon,
  ListChecksIcon,
  PaintbrushIcon,
  PaletteIcon,
  LayersIcon,
  SendIcon,
  ShapesIcon,
  SparklesIcon,
  SwordsIcon,
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
];

const taxonomyPages = [
  { to: "/admin/markers" as const, icon: TagIcon, title: "Markers" },
  { to: "/admin/distribution-channels" as const, icon: MapIcon, title: "Distribution Channels" },
  { to: "/admin/domains" as const, icon: PaletteIcon, title: "Domains" },
  { to: "/admin/card-types" as const, icon: ShapesIcon, title: "Card Types" },
  { to: "/admin/super-types" as const, icon: CrownIcon, title: "Super Types" },
  { to: "/admin/deck-zones" as const, icon: LayoutListIcon, title: "Deck Zones" },
  { to: "/admin/deck-formats" as const, icon: SwordsIcon, title: "Deck Formats" },
  { to: "/admin/rarities" as const, icon: SparklesIcon, title: "Rarities" },
  { to: "/admin/finishes" as const, icon: PaintbrushIcon, title: "Finishes" },
  { to: "/admin/art-variants" as const, icon: ImageIcon, title: "Art Variants" },
  { to: "/admin/languages" as const, icon: LanguagesIcon, title: "Languages" },
  { to: "/admin/keywords" as const, icon: HashIcon, title: "Keywords" },
];

const contentPages = [
  { to: "/admin/typography-review" as const, icon: SpellCheckIcon, title: "Typography" },
  { to: "/admin/rules" as const, icon: BookOpenIcon, title: "Rules" },
  { to: "/admin/errata" as const, icon: FileWarningIcon, title: "Errata" },
];

const marketplacePages = [
  { to: "/admin/marketplace-overview" as const, icon: LayoutDashboardIcon, title: "Overview" },
  { to: "/admin/marketplace-groups" as const, icon: LayersIcon, title: "Groups" },
  { to: "/admin/ignored-products" as const, icon: BanIcon, title: "Ignored Products" },
];

const systemPages = [
  { to: "/admin/status" as const, icon: ActivityIcon, title: "Status" },
  { to: "/admin/job-runs" as const, icon: ListChecksIcon, title: "Job Runs" },
  { to: "/admin/printing-events" as const, icon: SendIcon, title: "Printing Events" },
  { to: "/admin/users" as const, icon: UsersIcon, title: "Users" },
  { to: "/admin/feature-flags" as const, icon: FlagIcon, title: "Feature Flags" },
  { to: "/admin/site-settings" as const, icon: GlobeIcon, title: "Site Settings" },
  { to: "/admin/cache" as const, icon: CloudIcon, title: "Cache" },
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
          <SidebarMenu className="gap-1">
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
          <SidebarGroupLabel>Taxonomy</SidebarGroupLabel>
          <SidebarMenu className="gap-1">
            {taxonomyPages.map((page) => (
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
          <SidebarGroupLabel>Content</SidebarGroupLabel>
          <SidebarMenu className="gap-1">
            {contentPages.map((page) => (
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
          <SidebarMenu className="gap-1">
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
          <SidebarMenu className="gap-1">
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
        <SidebarMenu className="gap-1">
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
