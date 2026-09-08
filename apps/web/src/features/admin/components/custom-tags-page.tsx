import { AdminPageTopBar } from "@/features/admin/components/admin-page-top-bar";
import { CardTagEditor } from "@/features/admin/components/card-tag-editor";
import { CategoriesSection } from "@/features/admin/components/custom-tag-categories-section";
import { BulkImport } from "@/features/admin/components/custom-tags-bulk-import";
import { TagsSection } from "@/features/admin/components/custom-tags-section";
import {
  useCustomTagCategories,
  useCustomTags,
} from "@/features/collections/hooks/use-custom-tags";

export function CustomTagsPage() {
  const { data: tagsData } = useCustomTags();
  const { data: categoriesData } = useCustomTagCategories();
  const tags = tagsData.tags;
  const categories = categoriesData.categories;

  return (
    <div className="space-y-8">
      <AdminPageTopBar title="Custom Tags" />
      <CategoriesSection categories={categories} />

      <TagsSection tags={tags} categories={categories} />

      <CardTagEditor tags={tags} />

      <BulkImport tags={tags} />
    </div>
  );
}
