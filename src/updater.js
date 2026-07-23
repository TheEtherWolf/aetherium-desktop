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
// Download-state guard: autoDownload starts a download on update-available, and the update
// window's button can call downloadUpdate() again — racing the first and leaving state stuck.
// Track in-flight / finished so a second START_DOWNLOAD is a no-op (or routes to install).
let downloadStarted = false;
let downloadFinished = false;

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

  // Cover the ENTIRE main window with a modal so the app behind is fully hidden/dimmed while
  // updating (no visible or clickable app underneath). Fall back to the work area if the main
  // window is gone. The dim backdrop + centered card is done in update-window.html's body.
  let ux, uy, uw, uh;
  if (mainWin && !mainWin.isDestroyed()) {
    const b = mainWin.getBounds();
    ux = b.x;
    uy = b.y;
    uw = b.width;
    uh = b.height;
  } else {
    ux = workX;
    uy = workY;
    uw = workW;
    uh = workH;
  }

  console.log('[UpdateWindow] Creating on display:', display.id, 'covering', uw, 'x', uh, 'at', ux, uy);

  updateWindow = new BrowserWindow({
    width: uw,
    height: uh,
    x: ux,
    y: uy,
    parent: mainWin || undefined,
    modal: true,
    frame: false,
    transparent: true,
    resizable: false,
    minimizable: false,
    maximizable: false,
    skipTaskbar: true,
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
    if (updateWindow.isDestroyed()) return;
    if (updateInfo) {
      updateWindow.webContents.send(IPC.UPDATE_INFO, {
        currentVersion: app.getVersion(),
        newVersion: updateInfo.version,
        releaseNotes: updateInfo.releaseNotes,
      });
    }
    // If the download already finished before the window loaded, replay it so the button
    // reliably lands on Install (instead of being stuck on Download).
    if (downloadFinished) {
      updateWindow.webContents.send(IPC.UPDATE_DOWNLOADED, {
        version: updateInfo ? updateInfo.version : app.getVersion(),
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
/**
 * Starts the download unless one is already in-flight or finished.
 * Returns true if a fresh download was kicked off, false if it was a no-op.
 */
function beginDownload() {
  if (downloadFinished || downloadStarted) {
    debugLog(
      '[AutoUpdater] Download request ignored — already',
      downloadFinished ? 'downloaded' : 'in progress'
    );
    return false;
  }
  downloadStarted = true;
  autoUpdater.downloadUpdate().catch((err) => {
    downloadStarted = false; // allow retry
    debugLog('[AutoUpdater] downloadUpdate failed:', err.message);
  });
  return true;
}

function isUpdateDownloaded() {
  return downloadFinished;
}

function installAndRestart() {
  // isSilent MUST be true: electron-updater IGNORES isForceRunAfter when isSilent is false, so
  // quitAndInstall(false, true) installed correctly but never relaunched (user had to reopen the
  // app manually). Silent install + force-run-after gives a seamless update-and-reopen.
  autoUpdater.quitAndInstall(true, true);
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
    // autoDownload is on, so electron-updater begins downloading now. Mark it so nothing
    // kicks off a second, racing download.
    downloadStarted = true;

    // Premium flow: download SILENTLY in the background (Chrome/Discord-style) rather than
    // hijacking the whole app with the full-screen modal on every check. The user is
    // prompted only once the update is ready, via the in-app "Major Update" banner
    // (rendered on 'update-downloaded'). The modal (createUpdateWindow / SHOW_UPDATE_WINDOW)
    // stays available for an on-demand "downloading…" view but is no longer auto-opened.

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
    downloadStarted = false;
    downloadFinished = true;

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
    downloadStarted = false; // allow the user to retry after a failed download

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
  beginDownload,
  isUpdateDownloaded,
};
