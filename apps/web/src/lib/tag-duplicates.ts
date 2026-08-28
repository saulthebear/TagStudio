import { type TagStatResponse } from "@tagstudio/api-client";

export type DuplicateCluster = {
  id: string;
  tags: TagStatResponse[];
  reason: string;
  suggestedTargetId: number;
};

function normalizeForComparison(str: string): string {
  return str
    .toLowerCase()
    .trim()
    .replace(/[-_\s.]+/g, "");
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  const matrix: number[][] = [];
  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // substitution
          matrix[i][j - 1] + 1,     // insertion
          matrix[i - 1][j] + 1      // deletion
        );
      }
    }
  }

  return matrix[b.length][a.length];
}

function isPluralVariation(normA: string, normB: string): boolean {
  if (normA.length < 3 || normB.length < 3) return false;
  if (normA + "s" === normB || normB + "s" === normA) return true;
  if (normA + "es" === normB || normB + "es" === normA) return true;
  if (normA.endsWith("y") && normA.slice(0, -1) + "ies" === normB) return true;
  if (normB.endsWith("y") && normB.slice(0, -1) + "ies" === normA) return true;
  return false;
}

export function detectDuplicateTags(tags: TagStatResponse[]): DuplicateCluster[] {
  if (tags.length < 2) {
    return [];
  }

  const clusters: DuplicateCluster[] = [];
  const assigned = new Set<number>();

  for (let i = 0; i < tags.length; i++) {
    const tagA = tags[i];
    if (assigned.has(tagA.id)) continue;

    const normA = normalizeForComparison(tagA.name);
    const clusterTags: TagStatResponse[] = [tagA];
    let detectedReason = "";

    for (let j = i + 1; j < tags.length; j++) {
      const tagB = tags[j];
      if (assigned.has(tagB.id)) continue;

      // Disambiguation check: tags with different disambiguators represent intentionally distinct concepts
      if (tagA.disambiguation_id !== tagB.disambiguation_id) {
        continue;
      }

      const normB = normalizeForComparison(tagB.name);

      if (normA === normB) {
        clusterTags.push(tagB);
        detectedReason = tagA.name.toLowerCase() === tagB.name.toLowerCase() ? "Casing / separator difference" : "Punctuation difference";
      } else if (isPluralVariation(normA, normB)) {
        clusterTags.push(tagB);
        detectedReason = "Plural / singular variation";
      } else if (Math.min(normA.length, normB.length) >= 4 && levenshtein(normA, normB) <= 1) {
        clusterTags.push(tagB);
        detectedReason = "Typo / close spelling";
      }
    }

    if (clusterTags.length > 1) {
      for (const t of clusterTags) {
        assigned.add(t.id);
      }
      // Sort cluster tags by entry count descending (the most used tag is suggested target)
      clusterTags.sort((a, b) => b.entry_count - a.entry_count || a.id - b.id);

      clusters.push({
        id: `cluster-${clusterTags.map((t) => t.id).join("-")}`,
        tags: clusterTags,
        reason: detectedReason,
        suggestedTargetId: clusterTags[0].id
      });
    }
  }

  return clusters;
}
