import { TagStudioApiClient } from "@tagstudio/api-client";

const DEFAULT_API_BASE_URL = "http://127.0.0.1:5987";

function normalizeApiBaseUrl(raw: string | undefined): string | undefined {
  const trimmed = raw?.trim();
  return trimmed ? trimmed : undefined;
}

function normalizeApiToken(raw: string | undefined): string | undefined {
  const trimmed = raw?.trim();
  return trimmed ? trimmed : undefined;
}

function normalizeFlag(raw: string | undefined, fallback: boolean): boolean {
  const trimmed = raw?.trim().toLowerCase();
  if (!trimmed) {
    return fallback;
  }
  return ["1", "true", "yes", "on"].includes(trimmed);
}

export const apiBaseUrl =
  normalizeApiBaseUrl(import.meta.env.VITE_TAGSTUDIO_API_BASE_URL) ?? DEFAULT_API_BASE_URL;

const apiToken = normalizeApiToken(import.meta.env.VITE_TAGSTUDIO_API_TOKEN);
const allowQueryToken = normalizeFlag(import.meta.env.VITE_TAGSTUDIO_API_ALLOW_QUERY_TOKEN, false);

export const api = new TagStudioApiClient({
  baseUrl: apiBaseUrl,
  token: apiToken,
  allowQueryToken
});
