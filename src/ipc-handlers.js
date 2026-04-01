'use strict';

const { ipcMain, BrowserWindow, Notification, shell, app } = require('electron');
const path = require('path');
const { debugLog } = require('./logger');
const { getMainWindow } = require('./window-manager');
const {
  showOverlay,
  dismissOverlay,
  showActiveCallOverlay,
  updateActiveCallOverlay,
  hideActiveCallOverlay,
  getOverlayEnabled,
  setOverlayEnabled,
} = require('./overlay');
const { createUpdateWindow, getUpdateWindow, installAndRestart } = require('./updater');
const { rebuildTrayMenu } = require('./tray');
const { IPC } = require('./constants');

// ---------------------------------------------------------------------------
// Input validation helpers
// ---------------------------------------------------------------------------
function isString(v) {
  return typeof v === 'string' && v.length <= 512;
}
function isBool(v) {
  return typeof v === 'boolean';
}
function isObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

/**
 * Registers all IPC handlers for the main process.
 * Must be called once during app.whenReady().
 */
function registerIpcHandlers() {
  // -------------------------------------------------------------------------
  // Overlay system
  // -------------------------------------------------------------------------

  ipcMain.on(IPC.OVERLAY_CLICKED, (_event, data) => {
    const win = getMainWindow();
    if (!win) return;
    win.show();
    win.focus();
    win.webContents.send(IPC.WINDOW_SHOWN);
    if (isObject(data) && isString(data.conversationId)) {
      win.webContents.send(IPC.NAVIGATE_TO_CONVERSATION, data.conversationId);
    }
  });

  ipcMain.on(IPC.OVERLAY_ANSWER_CALL, () => {
    dismissOverlay();
    const win = getMainWindow();
    if (win) {
      win.show();
      win.focus();
      win.webContents.send(IPC.WINDOW_SHOWN);
      win.webContents.send(IPC.OVERLAY_ACTION, { action: 'answer-call' });
    }
  });

  ipcMain.on(IPC.OVERLAY_DECLINE_CALL, () => {
    dismissOverlay();
    const win = getMainWindow();
    if (win) {
      win.webContents.send(IPC.OVERLAY_ACTION, { action: 'decline-call' });
    }
  });

  ipcMain.on(IPC.OVERLAY_DISMISS, () => {
    dismissOverlay();
  });

  ipcMain.handle(IPC.DISMISS_OVERLAY, () => {
    dismissOverlay();
    return true;
  });

  ipcMain.on(IPC.ACTIVE_CALL_CLICKED, () => {
    const win = getMainWindow();
    if (win) {
      win.show();
      win.focus();
      win.webContents.send(IPC.WINDOW_SHOWN);
    }
  });

  ipcMain.on(IPC.ACTIVE_CALL_MUTE, () => {
    const win = getMainWindow();
    if (win) {
      win.webContents.send(IPC.OVERLAY_ACTION, { action: 'toggle-mute' });
    }
  });

  ipcMain.on(IPC.ACTIVE_CALL_HANGUP, () => {
    hideActiveCallOverlay();
    const win = getMainWindow();
    if (win) {
      win.webContents.send(IPC.OVERLAY_ACTION, { action: 'hangup' });
    }
  });

  ipcMain.handle(IPC.SHOW_ACTIVE_CALL_OVERLAY, (_event, data) => {
    if (!isObject(data)) return false;
    const win = getMainWindow();
    if (win && (!win.isVisible() || win.isMinimized() || !win.isFocused())) {
      showActiveCallOverlay(data);
      return true;
    }
    return false;
  });

  ipcMain.handle(IPC.UPDATE_ACTIVE_CALL_OVERLAY, (_event, data) => {
    if (!isObject(data)) return false;
    updateActiveCallOverlay(data);
    return true;
  });

  ipcMain.handle(IPC.HIDE_ACTIVE_CALL_OVERLAY, () => {
    hideActiveCallOverlay();
    return true;
  });

  ipcMain.handle(IPC.SHOW_OVERLAY_NOTIFICATION, (_event, data) => {
    debugLog('[Overlay] === show-overlay-notification ===');
    debugLog('[Overlay] data:', JSON.stringify(data));
    debugLog('[Overlay] overlayEnabled:', getOverlayEnabled());

    if (!isObject(data)) {
      debugLog('[Overlay] ERROR: invalid data payload');
      return false;
    }

    const win = getMainWindow();
    if (!win) {
      debugLog('[Overlay] ERROR: mainWindow is null!');
      return false;
    }

    const isVisible = win.isVisible();
    const isMinimized = win.isMinimized();
    const isFocused = win.isFocused();

    debugLog(
      '[Overlay] isVisible:',
      isVisible,
      'isMinimized:',
      isMinimized,
      'isFocused:',
      isFocused
    );

    const shouldShow = !isVisible || isMinimized || !isFocused;
    debugLog('[Overlay] shouldShow:', shouldShow);

    if (shouldShow) {
      showOverlay(data);
      return true;
    }

    debugLog('[Overlay] NOT showing - window is visible and focused');
    return false;
  });

  ipcMain.handle(IPC.SET_OVERLAY_ENABLED, (_event, enabled) => {
    if (!isBool(enabled)) return false;
    setOverlayEnabled(enabled);
    rebuildTrayMenu(enabled);
    return getOverlayEnabled();
  });

  ipcMain.handle(IPC.GET_OVERLAY_ENABLED, () => getOverlayEnabled());

  // -------------------------------------------------------------------------
  // Auto-updater
  // -------------------------------------------------------------------------

  ipcMain.on(IPC.START_UPDATE_DOWNLOAD, () => {
    console.log('[AutoUpdater] Starting download from update window');
    const { autoUpdater } = require('electron-updater');
    autoUpdater.downloadUpdate();
  });

  ipcMain.on(IPC.UPDATE_LATER, () => {
    console.log('[AutoUpdater] User chose to update later');
    const win = getUpdateWindow();
    if (win && !win.isDestroyed()) {
      win.close();
    }
  });

  ipcMain.on(IPC.SHOW_UPDATE_WINDOW, () => {
    createUpdateWindow();
  });

  ipcMain.on(IPC.INSTALL_UPDATE, () => {
    console.log('[AutoUpdater] Installing update...');
    debugLog('[AutoUpdater] User clicked install-update, calling quitAndInstall');

    // 1. Destroy tray (prevents app staying alive)
    const trayModule = require('./tray');
    trayModule.destroyTray();

    // 2. Destroy all windows
    BrowserWindow.getAllWindows().forEach((win) => {
      if (!win.isDestroyed()) win.destroy();
    });

    // 3. Small delay, then install
    setTimeout(() => {
      debugLog('[AutoUpdater] Windows destroyed, calling quitAndInstall');
      installAndRestart();
      // Force exit if quitAndInstall doesn't terminate the process
      setTimeout(() => {
        debugLog('[AutoUpdater] Force exiting with app.exit(0)...');
        app.exit(0);
      }, 500);
    }, 100);
  });

  // NOTE: only ipcMain.handle (not ipcMain.on) is registered for check-for-updates.
  // Registering both on the same channel causes a runtime error in Electron.
  ipcMain.handle(IPC.CHECK_FOR_UPDATES, async () => {
    try {
      const { autoUpdater } = require('electron-updater');
      const result = await autoUpdater.checkForUpdates();
      return { success: true, updateInfo: result?.updateInfo };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // -------------------------------------------------------------------------
  // Window controls
  // -------------------------------------------------------------------------

  ipcMain.on(IPC.WINDOW_MINIMIZE, () => {
    const win = getMainWindow();
    if (win) win.minimize();
  });

  ipcMain.on(IPC.WINDOW_MAXIMIZE, () => {
    const win = getMainWindow();
    if (win) {
      if (win.isMaximized()) win.unmaximize();
      else win.maximize();
    }
  });

  ipcMain.on(IPC.WINDOW_CLOSE, () => {
    const win = getMainWindow();
    if (win) win.close();
  });

  ipcMain.handle(IPC.WINDOW_IS_MAXIMIZED, () => {
    const win = getMainWindow();
    return win ? win.isMaximized() : false;
  });

  // -------------------------------------------------------------------------
  // Miscellaneous
  // -------------------------------------------------------------------------

  ipcMain.handle(IPC.SHOW_NOTIFICATION, (_event, payload) => {
    if (!isObject(payload)) return false;
    const { title, body } = payload;
    if (!Notification.isSupported()) return false;
    const notification = new Notification({
      title: isString(title) ? title : 'Aetherium',
      body: isString(body) ? body : '',
      icon: path.join(__dirname, '..', 'resources', 'icon.png'),
    });
    notification.on('click', () => {
      const win = getMainWindow();
      if (win) {
        win.show();
        win.focus();
      }
    });
    notification.show();
    return true;
  });

  ipcMain.handle(IPC.OPEN_EXTERNAL, (_event, url) => {
    if (typeof url === 'string' && (url.startsWith('http://') || url.startsWith('https://'))) {
      shell.openExternal(url);
      return true;
    }
    return false;
  });

  ipcMain.handle(IPC.GET_APP_VERSION, () => app.getVersion());

  ipcMain.handle(IPC.CLEAR_CACHE_AND_RELOAD, async () => {
    const win = getMainWindow();
    if (!win) return { success: false, error: 'No window' };
    try {
      await win.webContents.session.clearCache();
      await win.webContents.session.clearStorageData({
        storages: ['cachestorage', 'serviceworkers'],
      });
      win.webContents.reloadIgnoringCache();
      return { success: true };
    } catch (err) {
      console.error('Failed to clear cache:', err);
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle(IPC.RETRY_CONNECTION, () => {
    const { AETHERIUM_URL } = require('./constants');
    const win = getMainWindow();
    if (win) {
      win.loadURL(AETHERIUM_URL);
      return true;
    }
    return false;
  });
}

module.exports = { registerIpcHandlers };
