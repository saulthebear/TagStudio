import { randomBytes } from "node:crypto";
import { spawn, type ChildProcess } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { existsSync } from "node:fs";

import { app, BrowserWindow, dialog, ipcMain, type OpenDialogOptions } from "electron";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const apiHost = process.env.TAGSTUDIO_API_HOST ?? "127.0.0.1";
const apiPort = Number(process.env.TAGSTUDIO_API_PORT ?? "5987");
const apiToken = process.env.TAGSTUDIO_API_TOKEN ?? randomBytes(24).toString("hex");
const apiBaseUrl = `http://${apiHost}:${apiPort}`;
const webUrl = process.env.TAGSTUDIO_WEB_URL;
const bundledIndexPath = path.resolve(__dirname, "../../web/dist/index.html");
const PICK_DIRECTORY_CHANNEL = "tagstudio:pick-directory";

let apiProcess: ChildProcess | undefined;

function registerIpcHandlers(): void {
  ipcMain.handle(PICK_DIRECTORY_CHANNEL, async () => {
    const focusedWindow = BrowserWindow.getFocusedWindow();
    const options: OpenDialogOptions = { properties: ["openDirectory", "createDirectory"] };
    const result = focusedWindow
      ? await dialog.showOpenDialog(focusedWindow, options)
      : await dialog.showOpenDialog(options);

    if (result.canceled || result.filePaths.length < 1) {
      return null;
    }

    return result.filePaths[0] ?? null;
  });
}

function startBackend(): void {
  const command = process.env.TAGSTUDIO_API_CMD ?? "tagstudio-api";
  apiProcess = spawn(
    command,
    ["--host", apiHost, "--port", String(apiPort), "--token", apiToken],
    {
      env: {
        ...process.env,
        TAGSTUDIO_API_BASE_URL: apiBaseUrl,
        TAGSTUDIO_API_TOKEN: apiToken,
        TAGSTUDIO_API_PORT: String(apiPort)
      },
      shell: true,
      stdio: "inherit"
    }
  );
}

function stopBackend(): void {
  if (apiProcess && !apiProcess.killed) {
    apiProcess.kill("SIGTERM");
  }
}

function createWindow(): void {
  const mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      sandbox: true
    }
  });

  if (webUrl) {
    void mainWindow.loadURL(webUrl);
    return;
  }

  if (existsSync(bundledIndexPath)) {
    void mainWindow.loadFile(bundledIndexPath);
    return;
  }

  void mainWindow.loadURL("http://127.0.0.1:5173");
}

app.on("before-quit", () => stopBackend());
app.on("window-all-closed", () => {
  stopBackend();
  app.quit();
});
app.on("will-quit", () => {
  ipcMain.removeHandler(PICK_DIRECTORY_CHANNEL);
});

app.whenReady().then(() => {
  startBackend();
  registerIpcHandlers();
  createWindow();
});
