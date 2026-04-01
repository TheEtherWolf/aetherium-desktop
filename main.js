'use strict';

const { app, BrowserWindow, globalShortcut } = require('electron');
const logger = require('./src/logger');
const windowManager = require('./src/window-manager');
const trayModule = require('./src/tray');
const overlay = require('./src/overlay');
const updater = require('./src/updater');
const screenShare = require('./src/screen-share');
const ipcHandlers = require('./src/ipc-handlers');
const { IPC, FLASH_FRAME_DURATION_MS } = require('./src/constants');

// Handle certificate errors (log but do not bypass)
app.on('certificate-error', (_event, _webContents, url, error, _certificate, callback) => {
  logger.debugLog('Certificate error:', url, error);
  callback(false); // Reject invalid certificates
});

// Prevent multiple instances
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    const win = windowManager.getMainWindow();
    if (win) {
      win.setSkipTaskbar(false);
      win.show();
      if (win.isMinimized()) win.restore();
      win.setAlwaysOnTop(true);
      win.focus();
      win.setAlwaysOnTop(false);
      win.flashFrame(true);
      setTimeout(() => {
        const w = windowManager.getMainWindow();
        if (w) w.flashFrame(false);
      }, FLASH_FRAME_DURATION_MS);
      win.webContents.send(IPC.WINDOW_SHOWN);
    }
  });
}

app.whenReady().then(() => {
  logger.initLog();

  // Create main window; start update checks once it is ready to show
  windowManager.createWindow(() => {
    updater.startPeriodicCheck();
  });

  // Create tray; wire toggle callback back into overlay + tray modules
  trayModule.createTray(overlay.getOverlayEnabled(), (enabled) => {
    overlay.setOverlayEnabled(enabled);
    const win = windowManager.getMainWindow();
    if (win) win.webContents.send(IPC.OVERLAY_ENABLED_CHANGE, enabled);
    trayModule.rebuildTrayMenu(enabled);
  });

  updater.configureAutoUpdater();
  screenShare.initScreenShareHandlers();
  ipcHandlers.registerIpcHandlers();

  // Global shortcuts
  globalShortcut.register('F11', () => {
    const win = windowManager.getMainWindow();
    if (win) win.setFullScreen(!win.isFullScreen());
  });

  globalShortcut.register('F12', () => {
    const win = windowManager.getMainWindow();
    if (win) win.webContents.toggleDevTools();
  });

  globalShortcut.register('CommandOrControl+Shift+I', () => {
    const win = windowManager.getMainWindow();
    if (win) win.webContents.toggleDevTools();
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      windowManager.createWindow(() => updater.startPeriodicCheck());
    } else {
      const win = windowManager.getMainWindow();
      if (win) win.show();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  app.isQuitting = true;
  globalShortcut.unregisterAll();
});
