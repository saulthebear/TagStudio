import { contextBridge } from "electron";

const apiHost = process.env.TAGSTUDIO_API_HOST ?? "127.0.0.1";
const apiPort = process.env.TAGSTUDIO_API_PORT ?? "5987";
const apiToken = process.env.TAGSTUDIO_API_TOKEN;

contextBridge.exposeInMainWorld("tagstudioNative", {
  apiBaseUrl: `http://${apiHost}:${apiPort}`,
  apiToken
});
