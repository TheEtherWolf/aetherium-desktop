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
let periodicCheckInterval = null;

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

  // Center over the MAIN WINDOW so the update prompt lands on the app — not on whatever monitor
  // getDisplayMatching/primary resolves to (the cause of it opening on the other monitor).
  let ux, uy;
  if (mainWin && !mainWin.isDestroyed()) {
    const b = mainWin.getBounds();
    ux = Math.round(b.x + (b.width - UPDATE_WINDOW_WIDTH) / 2);
    uy = Math.round(b.y + (b.height - UPDATE_WINDOW_HEIGHT) / 2);
  } else {
    ux = workX + Math.round((workW - UPDATE_WINDOW_WIDTH) / 2);
    uy = workY + Math.round((workH - UPDATE_WINDOW_HEIGHT) / 2);
  }
  // Clamp fully on-screen within the target display's work area.
  ux = Math.max(workX, Math.min(ux, workX + workW - UPDATE_WINDOW_WIDTH));
  uy = Math.max(workY, Math.min(uy, workY + workH - UPDATE_WINDOW_HEIGHT));

  console.log('[UpdateWindow] Creating on display:', display.id, 'at', ux, uy);

  updateWindow = new BrowserWindow({
    width: UPDATE_WINDOW_WIDTH,
    height: UPDATE_WINDOW_HEIGHT,
    x: ux,
    y: uy,
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
      sandbox: true,
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
 * Performs an initial update check with retry/backoff, then starts a single
 * periodic interval (hourly). Guards against double-invocation.
 * Only runs if the app is packaged (not in development).
 */
function startPeriodicCheck() {
  if (!app.isPackaged) return;
  // Guard: only start once
  if (periodicCheckInterval !== null) return;

  // Initial check with backoff: retry at 5 min then 15 min on failure before
  // settling into the regular hourly interval.
  const RETRY_DELAYS_MS = [5 * 60 * 1000, 15 * 60 * 1000];
  let retryIndex = 0;

  function attemptCheck() {
    console.log('[AutoUpdater] Checking for updates...');
    autoUpdater.checkForUpdates().catch((err) => {
      debugLog('[AutoUpdater] Check failed:', err.message);
      if (retryIndex < RETRY_DELAYS_MS.length) {
        const delay = RETRY_DELAYS_MS[retryIndex++];
        debugLog(`[AutoUpdater] Retrying in ${delay / 60000} min...`);
        setTimeout(attemptCheck, delay);
      }
      // After retries exhausted, fall through to the periodic interval below
    });
  }

  attemptCheck();

  periodicCheckInterval = setInterval(() => {
    console.log('[AutoUpdater] Periodic update check...');
    autoUpdater.checkForUpdates().catch((err) => {
      debugLog('[AutoUpdater] Periodic check failed:', err.message);
    });
  }, UPDATE_CHECK_INTERVAL_MS);

  app.once('before-quit', () => {
    if (periodicCheckInterval !== null) {
      clearInterval(periodicCheckInterval);
      periodicCheckInterval = null;
    }
  });
}

/**
 * Configures autoUpdater settings and registers all event handlers.
 * Must be called once during app.whenReady().
 */
function configureAutoUpdater() {
  // Auto-download updates in the background and install them on quit, so the desktop app keeps
  // itself up to date without the user having to click through the update window every time.
  // (The update window still opens on update-available to show progress + an install-now option.)
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

    // Open the update window so the user can review and consent to the download.
    createUpdateWindow();

    const mainWin = getMainWindow();
    if (mainWin) {
      // Notify the web app renderer via IPC (safe — no executeJavaScript)
      mainWin.webContents.send(IPC.UPDATE_AVAILABLE, {
        version: info.version,
        releaseNotes: info.releaseNotes,
        downloading: false,
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
