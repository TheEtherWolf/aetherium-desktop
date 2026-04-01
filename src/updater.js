'use strict';

const { app, BrowserWindow } = require('electron');
const { autoUpdater } = require('electron-updater');
const path = require('path');
const { debugLog } = require('./logger');
const { getMainWindow, getTargetDisplay } = require('./window-manager');
const {
  IPC,
  UPDATE_WINDOW_WIDTH,
  UPDATE_WINDOW_HEIGHT,
  UPDATE_CHECK_INTERVAL_MS,
} = require('./constants');

let updateWindow = null;
let updateInfo = null;

// Semver validation — guard against a compromised update server
const SEMVER_RE = /^\d+\.\d+\.\d+(-[\w.]+)?(\+[\w.]+)?$/;
function isValidVersion(v) {
  return typeof v === 'string' && SEMVER_RE.test(v);
}

function createUpdateWindow() {
  if (updateWindow && !updateWindow.isDestroyed()) {
    updateWindow.focus();
    return;
  }

  const mainWin = getMainWindow();
  const display = getTargetDisplay(mainWin);
  const { x: workX, y: workY, width: workW, height: workH } = display.workArea;

  console.log('[UpdateWindow] Creating on display:', display.id, 'centered at', workX, workY);

  updateWindow = new BrowserWindow({
    width: UPDATE_WINDOW_WIDTH,
    height: UPDATE_WINDOW_HEIGHT,
    x: workX + Math.round((workW - UPDATE_WINDOW_WIDTH) / 2),
    y: workY + Math.round((workH - UPDATE_WINDOW_HEIGHT) / 2),
    parent: mainWin || undefined,
    modal: false,
    frame: false,
    transparent: true,
    resizable: false,
    minimizable: false,
    maximizable: false,
    skipTaskbar: false,
    backgroundColor: '#00000000',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preloads', 'update-preload.js'),
    },
  });

  updateWindow.loadFile(path.join(__dirname, '..', 'update-window.html'));

  // Send update-info after the page and preload have fully loaded
  updateWindow.webContents.once('did-finish-load', () => {
    if (updateInfo && !updateWindow.isDestroyed()) {
      updateWindow.webContents.send(IPC.UPDATE_INFO, {
        currentVersion: app.getVersion(),
        newVersion: updateInfo.version,
        releaseNotes: updateInfo.releaseNotes,
      });
    }
  });

  updateWindow.on('closed', () => {
    updateWindow = null;
  });
}

function getUpdateWindow() {
  return updateWindow;
}

/**
 * Calls autoUpdater.quitAndInstall — exported so ipc-handlers can call it
 * without importing electron-updater directly.
 */
function installAndRestart() {
  autoUpdater.quitAndInstall(false, true);
}

/**
 * Performs an initial update check and starts a single periodic interval.
 * Only runs if the app is packaged (not in development).
 */
function startPeriodicCheck() {
  if (!app.isPackaged) return;

  autoUpdater.checkForUpdates().catch((err) => {
    debugLog('[AutoUpdater] Initial check failed:', err.message);
  });

  setInterval(() => {
    console.log('[AutoUpdater] Periodic update check...');
    autoUpdater.checkForUpdates().catch((err) => {
      debugLog('[AutoUpdater] Periodic check failed:', err.message);
    });
  }, UPDATE_CHECK_INTERVAL_MS);
}

/**
 * Configures autoUpdater settings and registers all event handlers.
 * Must be called once during app.whenReady().
 */
function configureAutoUpdater() {
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on('checking-for-update', () => {
    console.log('[AutoUpdater] Checking for updates...');
  });

  autoUpdater.on('update-available', (info) => {
    if (!isValidVersion(info.version)) {
      debugLog('[AutoUpdater] Rejected update with invalid version string:', info.version);
      return;
    }

    console.log('[AutoUpdater] Update available:', info.version);
    updateInfo = info;

    const mainWin = getMainWindow();
    if (mainWin) {
      // Notify the web app renderer via IPC (safe — no executeJavaScript)
      mainWin.webContents.send(IPC.UPDATE_AVAILABLE, {
        version: info.version,
        releaseNotes: info.releaseNotes,
        downloading: true,
      });
    }
  });

  autoUpdater.on('update-not-available', () => {
    console.log('[AutoUpdater] App is up to date');
  });

  autoUpdater.on('download-progress', (progress) => {
    console.log(`[AutoUpdater] Download: ${Math.round(progress.percent)}%`);

    const mainWin = getMainWindow();
    if (mainWin) {
      mainWin.webContents.send(IPC.UPDATE_PROGRESS, {
        percent: progress.percent,
        transferred: progress.transferred,
        total: progress.total,
      });
    }

    if (updateWindow && !updateWindow.isDestroyed()) {
      updateWindow.webContents.send(IPC.DOWNLOAD_PROGRESS, {
        percent: progress.percent,
        transferred: progress.transferred,
        total: progress.total,
        bytesPerSecond: progress.bytesPerSecond,
      });
    }
  });

  autoUpdater.on('update-downloaded', (info) => {
    console.log('[AutoUpdater] Download complete:', info.version);

    const mainWin = getMainWindow();
    if (mainWin) {
      mainWin.webContents.send(IPC.UPDATE_DOWNLOADED, {
        version: info.version,
        readyToInstall: true,
      });
    }

    if (updateWindow && !updateWindow.isDestroyed()) {
      updateWindow.webContents.send(IPC.UPDATE_DOWNLOADED, { version: info.version });
    }
  });

  autoUpdater.on('error', (err) => {
    console.error('[AutoUpdater] Error:', err);

    if (updateWindow && !updateWindow.isDestroyed()) {
      updateWindow.webContents.send(IPC.UPDATE_ERROR, { message: err.message });
    }

    const mainWin = getMainWindow();
    if (mainWin) {
      mainWin.webContents.send(IPC.UPDATE_ERROR, { message: err.message });
    }
  });
}

module.exports = {
  createUpdateWindow,
  getUpdateWindow,
  configureAutoUpdater,
  startPeriodicCheck,
  installAndRestart,
};
