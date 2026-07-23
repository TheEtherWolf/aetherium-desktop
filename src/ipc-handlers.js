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
  updateOverlayTheme,
  setOverlayInteractive,
  getOverlayEnabled,
  setOverlayEnabled,
  getOverlayWindow,
} = require('./overlay');
const {
  createUpdateWindow,
  getUpdateWindow,
  installAndRestart,
  beginDownload,
  isUpdateDownloaded,
} = require('./updater');
const { rebuildTrayMenu, destroyTray } = require('./tray');
const { IPC } = require('./constants');
const { setBadgeCount } = require('./badge');
const settings = require('./settings');
const keybinds = require('./keybinds');

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
// Only the trusted local overlay window should be able to trigger call actions
// (answer/decline/mute/hangup) — reject events from any other webContents.
function fromOverlay(event) {
  const ow = getOverlayWindow();
  return !!ow && !ow.isDestroyed() && event.sender === ow.webContents;
}

/**
 * Registers all IPC handlers for the main process.
 * Must be called once during app.whenReady().
 */
function registerIpcHandlers() {
  // -------------------------------------------------------------------------
  // Overlay system
  // -------------------------------------------------------------------------

  ipcMain.on(IPC.OVERLAY_CLICKED, (event, data) => {
    if (!fromOverlay(event)) return;
    const win = getMainWindow();
    if (!win) return;
    win.show();
    win.focus();
    win.webContents.send(IPC.WINDOW_SHOWN);
    if (isObject(data) && isString(data.conversationId)) {
      win.webContents.send(IPC.NAVIGATE_TO_CONVERSATION, data.conversationId);
    }
  });

  ipcMain.on(IPC.OVERLAY_ANSWER_CALL, (event) => {
    if (!fromOverlay(event)) return;
    dismissOverlay();
    const win = getMainWindow();
    if (win) {
      win.show();
      win.focus();
      win.webContents.send(IPC.WINDOW_SHOWN);
      win.webContents.send(IPC.OVERLAY_ACTION, { action: 'answer-call' });
    }
  });

  ipcMain.on(IPC.OVERLAY_DECLINE_CALL, (event) => {
    if (!fromOverlay(event)) return;
    dismissOverlay();
    const win = getMainWindow();
    if (win) {
      win.webContents.send(IPC.OVERLAY_ACTION, { action: 'decline-call' });
    }
  });

  ipcMain.on(IPC.OVERLAY_DISMISS, (event) => {
    if (!fromOverlay(event)) return;
    dismissOverlay();
  });

  ipcMain.on(IPC.SET_OVERLAY_INTERACTIVE, (event, interactive) => {
    if (!fromOverlay(event)) return;
    setOverlayInteractive(!!interactive);
  });

  ipcMain.handle(IPC.DISMISS_OVERLAY, () => {
    dismissOverlay();
    return true;
  });

  ipcMain.on(IPC.ACTIVE_CALL_CLICKED, (event) => {
    if (!fromOverlay(event)) return;
    const win = getMainWindow();
    if (win) {
      win.show();
      win.focus();
      win.webContents.send(IPC.WINDOW_SHOWN);
    }
  });

  ipcMain.on(IPC.ACTIVE_CALL_MUTE, (event) => {
    if (!fromOverlay(event)) return;
    const win = getMainWindow();
    if (win) {
      win.webContents.send(IPC.OVERLAY_ACTION, { action: 'toggle-mute' });
    }
  });

  ipcMain.on(IPC.ACTIVE_CALL_HANGUP, (event) => {
    if (!fromOverlay(event)) return;
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

  ipcMain.handle(IPC.OVERLAY_THEME_UPDATE, (_event, theme) => {
    if (!isObject(theme)) return false;
    updateOverlayTheme(theme);
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

  function performInstall() {
    console.log('[AutoUpdater] Installing update...');
    debugLog('[AutoUpdater] Calling quitAndInstall');

    // Mark the app as quitting so the hide-to-tray close guard (window-manager.js) can't
    // veto the quit and leave quitAndInstall hanging. Belt-and-suspenders with destroy().
    app.isQuitting = true;

    // 1. Destroy tray so nothing keeps the process alive once windows close.
    destroyTray();

    // 2. Destroy all windows (destroy() bypasses the close-event hide guard).
    BrowserWindow.getAllWindows().forEach((win) => {
      if (!win.isDestroyed()) win.destroy();
    });

    // 3. Next tick (let teardown settle), then silent-install + relaunch.
    //    quitAndInstall(true, true) spawns a DETACHED NSIS installer that runs the
    //    silent install and relaunches the app, then quits us. Give that hand-off room.
    setImmediate(() => {
      debugLog('[AutoUpdater] Windows destroyed, calling quitAndInstall');
      installAndRestart();
      // Safety net ONLY if the updater fails to terminate us. The old 500ms was too
      // short on slow disks — force-exiting mid-hand-off could kill the relaunch (app
      // closed but never reopened). 8s lets the detached installer take over first.
      setTimeout(() => {
        debugLog('[AutoUpdater] Force exiting with app.exit(0)...');
        app.exit(0);
      }, 8000);
    });
  }

  ipcMain.on(IPC.START_UPDATE_DOWNLOAD, () => {
    // Already downloaded (autoDownload finished first) — the button means "install" now.
    if (isUpdateDownloaded()) {
      console.log('[AutoUpdater] Already downloaded — installing instead of re-downloading');
      performInstall();
      return;
    }
    // Guarded: no-op if a download is already in flight (prevents the double-download race).
    console.log('[AutoUpdater] Download requested from update window');
    beginDownload();
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
    debugLog('[AutoUpdater] User clicked install-update');
    performInstall();
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
  // Auto-launch (start on login)
  // -------------------------------------------------------------------------

  ipcMain.handle(IPC.GET_AUTO_LAUNCH, () => {
    const loginSettings = app.getLoginItemSettings();
    return loginSettings.openAtLogin;
  });

  ipcMain.handle(IPC.SET_AUTO_LAUNCH, (_event, enabled) => {
    if (!isBool(enabled)) return false;
    app.setLoginItemSettings({ openAtLogin: enabled });
    return app.getLoginItemSettings().openAtLogin;
  });

  // -------------------------------------------------------------------------
  // Hardware acceleration
  // -------------------------------------------------------------------------

  ipcMain.handle(IPC.GET_HARDWARE_ACCELERATION, () => {
    return settings.get('hardwareAcceleration', true);
  });

  ipcMain.handle(IPC.SET_HARDWARE_ACCELERATION, (_event, enabled) => {
    if (!isBool(enabled)) return false;
    settings.set('hardwareAcceleration', enabled);
    // Re-enabling is an explicit override — clear the auto-disable-after-crash flag
    // so the user's choice takes effect on next launch.
    if (enabled) settings.set('gpuCrashDetected', false);
    return enabled;
  });

  // -------------------------------------------------------------------------
  // Global keybinds / push-to-talk
  // -------------------------------------------------------------------------

  ipcMain.handle(IPC.GET_KEYBINDS, () => {
    return keybinds.getKeybinds();
  });

  ipcMain.handle(IPC.SET_KEYBINDS, (_event, newKeybinds) => {
    if (!isObject(newKeybinds)) return false;
    keybinds.saveKeybinds(newKeybinds);
    keybinds.registerKeybinds();
    return keybinds.getKeybinds();
  });

  // -------------------------------------------------------------------------
  // Badge / unread count
  // -------------------------------------------------------------------------

  ipcMain.handle(IPC.SET_BADGE_COUNT, (_event, count) => {
    if (typeof count !== 'number' || count < 0) return false;
    setBadgeCount(Math.floor(count));
    return true;
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

  // NOTE: IPC.RETRY_CONNECTION ('retry-connection') was removed — it had no caller.
  // The error screen's "Retry Connection" button uses location.reload() directly.
}


module.exports = { registerIpcHandlers };
