export {};

declare global {
  interface Window {
    tagstudioNative?: {
      apiBaseUrl: string;
      apiToken?: string;
    };
  }
}
