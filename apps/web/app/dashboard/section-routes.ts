import type { ModuleGroup } from "@/lib/roles";

const SECTION_SLUGS: Record<ModuleGroup, string> = {
  "Leaf Handling": "leaf-handling",
  "Sales Handling": "sales-handling",
  "Dispatch Handling": "dispatch-handling",
};

export function sectionSlugForGroup(group: ModuleGroup) {
  return SECTION_SLUGS[group];
}

export function groupForSectionSlug(slug: string | null | undefined): ModuleGroup | null {
  return (Object.entries(SECTION_SLUGS).find(([, value]) => value === slug)?.[0] as ModuleGroup | undefined) ?? null;
}
