import { contextBridge, ipcRenderer } from "electron";

const apiHost = process.env.TAGSTUDIO_API_HOST ?? "127.0.0.1";
const apiPort = process.env.TAGSTUDIO_API_PORT ?? "5987";
const apiToken = process.env.TAGSTUDIO_API_TOKEN;
const PICK_DIRECTORY_CHANNEL = "tagstudio:pick-directory";

contextBridge.exposeInMainWorld("tagstudioNative", {
  apiBaseUrl: `http://${apiHost}:${apiPort}`,
  apiToken,
  pickDirectory: async (): Promise<string | null> => {
    const selectedPath = await ipcRenderer.invoke(PICK_DIRECTORY_CHANNEL);
    return typeof selectedPath === "string" ? selectedPath : null;
  }
});
