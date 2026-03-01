export {};

declare global {
  interface Window {
    tagstudioNative?: {
      apiBaseUrl: string;
      apiToken?: string;
      pickDirectory?: () => Promise<string | null>;
    };
  }
}
