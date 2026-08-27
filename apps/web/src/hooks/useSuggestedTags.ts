import { useQuery } from "@tanstack/react-query";
import { type TagSuggestionItem } from "@tagstudio/api-client";

import { api } from "@/api/client";

type UseSuggestedTagsArgs = {
  tagIds: number[];
  excludeTagIds?: number[];
  limit?: number;
  enabled?: boolean;
};

export function useSuggestedTags({
  tagIds,
  excludeTagIds = [],
  limit = 12,
  enabled = true
}: UseSuggestedTagsArgs) {
  const sortedTagIds = [...tagIds].sort((a, b) => a - b);
  const sortedExcludeIds = [...excludeTagIds].sort((a, b) => a - b);

  return useQuery<TagSuggestionItem[]>({
    queryKey: ["suggested-tags", sortedTagIds.join(","), sortedExcludeIds.join(","), limit],
    queryFn: async () => {
      if (sortedTagIds.length === 0) {
        return [];
      }
      const response = await api.getSuggestedTags({
        tag_ids: sortedTagIds,
        exclude_tag_ids: sortedExcludeIds,
        limit
      });
      return response.suggestions;
    },
    enabled: enabled && sortedTagIds.length > 0
  });
}
