import { useQuery } from "@tanstack/react-query";

import { api } from "@/api/client";

const TAG_COLORS_STALE_TIME_MS = 5 * 60 * 1000;

export function useTagColors(enabled = true) {
  return useQuery({
    queryKey: ["tag-colors"],
    queryFn: () => api.getTagColors(),
    enabled,
    staleTime: TAG_COLORS_STALE_TIME_MS
  });
}
