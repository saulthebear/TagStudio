export const UNTAGGED_QUERY_TOKEN = "special:untagged";

export const QUERY_TOKEN_FILTERS = [
  {
    key: "untagged",
    label: "Untagged",
    token: UNTAGGED_QUERY_TOKEN
  }
] as const;

const NEGATED_UNTAGGED_TOKEN_REGEX = /\bNOT\s+special:untagged\b/gi;
const POSITIVE_UNTAGGED_TOKEN_REGEX = /\bspecial:untagged\b/gi;
const TAG_CONSTRAINT_REGEX = /\b(?:tag|tag_id)\s*:/i;
const COMPLEX_QUERY_REGEX = /\(|\)|\bOR\b/i;

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function withoutNegatedUntagged(query: string): string {
  return query.replace(NEGATED_UNTAGGED_TOKEN_REGEX, " ");
}

function appendUntaggedToken(query: string): string {
  const normalized = normalizeWhitespace(query);
  if (normalized.length === 0) {
    return UNTAGGED_QUERY_TOKEN;
  }
  if (getUntaggedTokenState(normalized).positive) {
    return normalized;
  }
  return normalizeWhitespace(`${normalized} ${UNTAGGED_QUERY_TOKEN}`);
}

function removePositiveUntaggedTokenFlat(query: string): string {
  let placeholderIndex = 0;
  const placeholders = new Map<string, string>();

  const withPlaceholders = query.replace(NEGATED_UNTAGGED_TOKEN_REGEX, (match) => {
    const key = `__NEGATED_UNTAGGED_${placeholderIndex}__`;
    placeholderIndex += 1;
    placeholders.set(key, match);
    return key;
  });

  let next = withPlaceholders.replace(POSITIVE_UNTAGGED_TOKEN_REGEX, " ");
  for (const [key, value] of placeholders.entries()) {
    next = next.replace(key, value);
  }

  return normalizeWhitespace(next);
}

function removeTrailingPositiveUntaggedToken(query: string): string {
  const normalized = normalizeWhitespace(query);
  const trailingMatch = normalized.match(/(?:^|\s+)special:untagged\s*$/i);
  if (!trailingMatch) {
    return normalized;
  }

  const matchStart = trailingMatch.index ?? 0;
  const before = normalized.slice(0, matchStart).trimEnd();
  if (/\bNOT$/i.test(before)) {
    return normalized;
  }
  return normalizeWhitespace(before);
}

export function isFlatQuery(query: string): boolean {
  return !COMPLEX_QUERY_REGEX.test(query);
}

export function getUntaggedTokenState(
  query: string
): { positive: boolean; negated: boolean } {
  const negated = /\bNOT\s+special:untagged\b/i.test(query);
  const positive = /\bspecial:untagged\b/i.test(withoutNegatedUntagged(query));
  return { positive, negated };
}

export function toggleUntaggedInQuery(query: string, checked: boolean): string {
  const normalized = normalizeWhitespace(query);
  const flat = isFlatQuery(normalized);

  if (checked) {
    if (flat) {
      const cleared = normalizeWhitespace(
        normalized
          .replace(NEGATED_UNTAGGED_TOKEN_REGEX, " ")
          .replace(POSITIVE_UNTAGGED_TOKEN_REGEX, " ")
      );
      return appendUntaggedToken(cleared);
    }

    if (getUntaggedTokenState(normalized).positive) {
      return normalized;
    }
    return appendUntaggedToken(normalized);
  }

  if (flat) {
    return removePositiveUntaggedTokenFlat(normalized);
  }

  return removeTrailingPositiveUntaggedToken(normalized);
}

export function hasUntaggedTagConflict(query: string): boolean {
  const state = getUntaggedTokenState(query);
  if (!state.positive) {
    return false;
  }
  return TAG_CONSTRAINT_REGEX.test(query);
}

export function getActiveFilterCount(
  query: string,
  showHiddenEntries: boolean
): number {
  const untaggedCount = getUntaggedTokenState(query).positive ? 1 : 0;
  const hiddenCount = showHiddenEntries ? 1 : 0;
  return hiddenCount + untaggedCount;
}

export function formatAppliedFilterSummary(
  activeQuery: string,
  showHiddenEntries: boolean
): string {
  const segments: string[] = [];
  const normalizedQuery = normalizeWhitespace(activeQuery);
  if (normalizedQuery.length > 0) {
    segments.push(normalizedQuery);
  }
  if (showHiddenEntries) {
    segments.push("Show hidden entries");
  }
  return segments.length > 0 ? segments.join(" | ") : "none";
}
