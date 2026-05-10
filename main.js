const { app, BrowserWindow } = require("electron");
const express = require("express");
const cors = require("cors");
const os = require("os");
const fs = require("fs");
const { exec } = require("child_process");

const SITE_URL = "https://brasilxmaster.com.br";
const HOST = "127.0.0.1";
const PORT = 9999;

let mainWindow = null;

function runCommand(command) {
  return new Promise((resolve) => {
    exec(command, { windowsHide: true }, (error, stdout, stderr) => {
      resolve({
        ok: !error,
        stdout: stdout || "",
        stderr: stderr || "",
        error: error ? error.message : null
      });
    });
  });
}

async function detectJ2534() {
  if (process.platform !== "win32") {
    return { ok: false, message: "Disponivel apenas no Windows", devices: [] };
  }

  const keys = [
    "HKLM\\SOFTWARE\\PassThruSupport.04.04",
    "HKLM\\SOFTWARE\\WOW6432Node\\PassThruSupport.04.04"
  ];

  const devices = [];

  for (const key of keys) {
    const result = await runCommand("reg query \"" + key + "\" /s");
    if (result.ok && result.stdout) {
      devices.push({ registryKey: key, raw: result.stdout });
    }
  }

  return { ok: true, devices: devices };
}

function detectRP1210() {
  if (process.platform !== "win32") {
    return { ok: false, message: "Disponivel apenas no Windows", devices: [] };
  }

  const iniPath = "C:\\Windows\\RP121032.ini";

  if (!fs.existsSync(iniPath)) {
    return { ok: true, devices: [], message: "RP121032.ini nao encontrado" };
  }

  const content = fs.readFileSync(iniPath, "utf8");
  const devices = [];
  const lines = content.split(/\r?\n/);

  for (const line of lines) {
    if (line.toLowerCase().startsWith("apiimplementations")) {
      const value = line.split("=")[1] || "";
      value.split(",").map(x => x.trim()).filter(Boolean).forEach(name => {
        devices.push({ name: name, type: "RP1210" });
      });
    }
  }

  return { ok: true, iniPath: iniPath, devices: devices };
}

function detectDrives() {
  if (process.platform !== "win32") {
    return { ok: false, message: "Disponivel apenas no Windows", drives: [] };
  }

  const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");
  const drives = [];

  for (const letter of letters) {
    const drive = letter + ":\\";
    try {
      if (fs.existsSync(drive)) {
        drives.push({ drive: drive, available: true });
      }
    } catch (e) {}
  }

  return { ok: true, drives: drives };
}

function startBridge() {
  const api = express();

  api.use(cors({ origin: true }));
  api.use(express.json({ limit: "50mb" }));

  api.get("/", (req, res) => {
    res.json({
      ok: true,
      software: "BrasilXMaster Bridge",
      version: "1.0.0",
      status: "online",
      port: PORT
    });
  });

  api.get("/detect", (req, res) => {
    res.json({
      ok: true,
      software: "BrasilXMaster Bridge",
      version: "1.0.0",
      status: "online",
      site: SITE_URL,
      machine: {
        hostname: os.hostname(),
        platform: os.platform(),
        arch: os.arch()
      }
    });
  });

  api.get("/health", (req, res) => {
    res.json({ ok: true, status: "online" });
  });

  api.get("/j2534", async (req, res) => {
    res.json(await detectJ2534());
  });

  api.get("/rp1210", (req, res) => {
    res.json(detectRP1210());
  });

  api.get("/drives", (req, res) => {
    res.json(detectDrives());
  });

  api.get("/interfaces", async (req, res) => {
    res.json({
      ok: true,
      j2534: await detectJ2534(),
      rp1210: detectRP1210(),
      drives: detectDrives()
    });
  });

  api.post("/hardware/connect", (req, res) => {
    res.json({
      ok: true,
      message: "Comando recebido pela ponte local.",
      received: req.body || {}
    });
  });

  api.listen(PORT, HOST, () => {
    console.log("BrasilXMaster Bridge online em http://" + HOST + ":" + PORT);
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    title: "BrasilXMaster Bridge",
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true
    }
  });

  mainWindow.maximize();
  mainWindow.loadURL(SITE_URL);
}

const gotLock = app.requestSingleInstanceLock();

if (!gotLock) {
  app.quit();
} else {
  app.whenReady().then(() => {
    startBridge();
    createWindow();
  });

  app.on("second-instance", () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") app.quit();
  });
}