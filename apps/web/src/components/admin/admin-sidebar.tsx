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
  KeyRoundIcon,
  LanguagesIcon,
  LayoutDashboardIcon,
  LayoutListIcon,
  ListChecksIcon,
  PackageIcon,
  PaintbrushIcon,
  PaletteIcon,
  LayersIcon,
  ScrollTextIcon,
  SendIcon,
  ShapesIcon,
  SparklesIcon,
  SwordsIcon,
  MapIcon,
  SettingsIcon,
  SpellCheckIcon,
  SwatchBookIcon,
  TagIcon,
  TagsIcon,
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
import { useAdminAccess } from "@/hooks/use-admin";
import { adminSectionForPathname } from "@/lib/admin-sections";

const catalogPages = [
  { to: "/admin/sets" as const, icon: DatabaseIcon, title: "Sets" },
  { to: "/admin/cards" as const, icon: GalleryVerticalIcon, title: "Cards" },
  { to: "/admin/sources" as const, icon: DatabaseIcon, title: "Sources" },
  { to: "/admin/images" as const, icon: ImageIcon, title: "Images" },
  { to: "/admin/ignored-sources" as const, icon: BanIcon, title: "Ignored Sources" },
  { to: "/admin/products" as const, icon: PackageIcon, title: "Products" },
];

const taxonomyPages = [
  { to: "/admin/markers" as const, icon: TagIcon, title: "Markers" },
  { to: "/admin/card-tags" as const, icon: TagsIcon, title: "Card Tags" },
  { to: "/admin/custom-tags" as const, icon: TagIcon, title: "Custom Tags" },
  { to: "/admin/distribution-channels" as const, icon: MapIcon, title: "Distribution Channels" },
  { to: "/admin/domains" as const, icon: PaletteIcon, title: "Domains" },
  { to: "/admin/card-types" as const, icon: ShapesIcon, title: "Card Types" },
  { to: "/admin/super-types" as const, icon: CrownIcon, title: "Supertypes" },
  { to: "/admin/deck-zones" as const, icon: LayoutListIcon, title: "Deck Zones" },
  { to: "/admin/deck-formats" as const, icon: SwordsIcon, title: "Deck Formats" },
  { to: "/admin/rarities" as const, icon: SparklesIcon, title: "Rarities" },
  { to: "/admin/finishes" as const, icon: PaintbrushIcon, title: "Finishes" },
  { to: "/admin/art-variants" as const, icon: ImageIcon, title: "Art Variants" },
  { to: "/admin/languages" as const, icon: LanguagesIcon, title: "Languages" },
  { to: "/admin/keywords" as const, icon: HashIcon, title: "Keywords" },
];

const contentPages = [
  { to: "/admin/design" as const, icon: SwatchBookIcon, title: "Design" },
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
  { to: "/admin/audit" as const, icon: ScrollTextIcon, title: "Audit Log" },
  { to: "/admin/job-runs" as const, icon: ListChecksIcon, title: "Job Runs" },
  { to: "/admin/printing-events" as const, icon: SendIcon, title: "Printing Events" },
  { to: "/admin/users" as const, icon: UsersIcon, title: "Users" },
  { to: "/admin/organizations" as const, icon: CrownIcon, title: "Organizations" },
  { to: "/admin/feature-flags" as const, icon: FlagIcon, title: "Feature Flags" },
  { to: "/admin/site-settings" as const, icon: GlobeIcon, title: "Site Settings" },
  { to: "/admin/api-keys" as const, icon: KeyRoundIcon, title: "API Keys" },
  { to: "/admin/cache" as const, icon: CloudIcon, title: "Cache" },
  { to: "/admin/scan" as const, icon: CameraIcon, title: "Scan Test" },
];

const groups = [
  { label: "Catalog", pages: catalogPages },
  { label: "Taxonomy", pages: taxonomyPages },
  { label: "Content", pages: contentPages },
  { label: "Marketplaces", pages: marketplacePages },
  { label: "System", pages: systemPages },
];

export function AdminSidebar() {
  const matches = useMatches();
  const currentPath = matches.at(-1)?.fullPath;
  const { data: access } = useAdminAccess();

  // Partial admins (per-section grants, no full admin role) only see the
  // sections they hold; groups left empty disappear entirely.
  const isAdmin = access?.isAdmin === true;
  const sections = access?.sections ?? [];
  const visibleGroups = groups
    .map((group) => ({
      ...group,
      pages: isAdmin
        ? group.pages
        : group.pages.filter((page) =>
            sections.some((section) => section === adminSectionForPathname(page.to)),
          ),
    }))
    .filter((group) => group.pages.length > 0);

  return (
    <NestedSidebar className="ml-safe">
      <SidebarContent>
        {visibleGroups.map((group) => (
          <SidebarGroup key={group.label}>
            <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
            <SidebarMenu className="gap-1">
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
      {isAdmin && (
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
      )}
    </NestedSidebar>
  );
}
