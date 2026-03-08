import { type CSSProperties } from "react";

import { type TagColorNamespaceResponse, type TagResponse } from "@tagstudio/api-client";

type ColorDefinition = {
  primary: string;
  secondary: string | null;
};

export type TagColorLookup = ReadonlyMap<string, ColorDefinition>;

export function createTagColorLookup(
  groups: TagColorNamespaceResponse[] | undefined
): TagColorLookup {
  const lookup = new Map<string, ColorDefinition>();
  for (const group of groups ?? []) {
    for (const color of group.colors) {
      lookup.set(`${color.namespace}/${color.slug}`, {
        primary: color.primary,
        secondary: color.secondary
      });
    }
  }
  return lookup;
}

function resolveTagColor(
  tag: Pick<TagResponse, "color_namespace" | "color_slug">,
  lookup: TagColorLookup
): ColorDefinition | null {
  if (!tag.color_namespace || !tag.color_slug) {
    return null;
  }
  return lookup.get(`${tag.color_namespace}/${tag.color_slug}`) ?? null;
}

export function resolveTagChipStyle(
  tag: Pick<TagResponse, "color_namespace" | "color_slug">,
  lookup: TagColorLookup
): CSSProperties | undefined {
  const color = resolveTagColor(tag, lookup);
  if (!color) {
    return undefined;
  }

  const accent = color.secondary ?? color.primary;
  return {
    backgroundColor: `color-mix(in oklab, ${color.primary} 16%, white 84%)`,
    borderColor: `color-mix(in oklab, ${accent} 45%, #cbd5e1 55%)`,
    color: `color-mix(in oklab, ${accent} 58%, #0f172a 42%)`
  };
}
