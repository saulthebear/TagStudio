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

export const apiBaseUrl =
  normalizeApiBaseUrl(window.tagstudioNative?.apiBaseUrl) ?? DEFAULT_API_BASE_URL;

const apiToken = normalizeApiToken(window.tagstudioNative?.apiToken);

export const api = new TagStudioApiClient({
  baseUrl: apiBaseUrl,
  token: apiToken
});
