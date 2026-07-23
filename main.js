'use strict';

const { app, BrowserWindow, globalShortcut } = require('electron');
const path = require('path');
const logger = require('./src/logger');
const windowManager = require('./src/window-manager');
const trayModule = require('./src/tray');
const overlay = require('./src/overlay');
const updater = require('./src/updater');
const screenShare = require('./src/screen-share');
const ipcHandlers = require('./src/ipc-handlers');
const settings = require('./src/settings');
const keybindsModule = require('./src/keybinds');
const { IPC, FLASH_FRAME_DURATION_MS } = require('./src/constants');

// Disable hardware acceleration only if the user explicitly turned it off. The
// message-time 0xC0000005 crash happens with acceleration BOTH on and off (confirmed
// via crashes.log), so it is NOT a GPU-accel fault — auto-disabling it only made
// rendering laggy (CPU compositing) with no crash benefit, so we don't do that.
if (settings.get('hardwareAcceleration', true) === false) {
  app.disableHardwareAcceleration();
}
// One-time cleanup: clear the stale auto-disable flag a prior build set, so users
// aren't stuck on CPU rendering from that experiment.
if (settings.get('gpuCrashDetected', false)) settings.set('gpuCrashDetected', false);

// Run the Chromium audio service IN-PROCESS instead of as a separate sandboxed
// utility process. On Windows the out-of-process audio service can crash when
// audio starts (Web Audio notification sounds), and that crash cascades into a
// 'render-process-gone' event — which our crash-recovery reloads, so the whole
// app appeared to reload "whenever a sound plays." In-process audio avoids that
// cross-process crash path. Must run before app.whenReady().
app.commandLine.appendSwitch('disable-features', 'AudioServiceOutOfProcess,AudioServiceSandbox');

// Register aetherium:// deep link protocol
if (process.defaultApp) {
  if (process.argv.length >= 2) {
    app.setAsDefaultProtocolClient('aetherium', process.execPath, [
      path.resolve(process.argv[1]),
    ]);
  }
} else {
  app.setAsDefaultProtocolClient('aetherium');
}

// Only these link types are routed, and ids must be simple tokens
// (uuid/slug) — anything else is dropped before reaching the renderer.
const DEEP_LINK_TYPES = new Set(['user', 'group', 'channel', 'server', 'invite']);
const DEEP_LINK_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

function handleDeepLink(url) {
  if (!url || typeof url !== 'string' || url.length > 256 || !url.startsWith('aetherium://')) return;
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    console.error('Invalid deep link URL:', url);
    return;
  }
  const type = parsed.hostname; // e.g. 'user', 'group', 'channel'
  const id = parsed.pathname.replace(/^\//, '');
  if (!DEEP_LINK_TYPES.has(type) || !DEEP_LINK_ID_PATTERN.test(id)) {
    console.error('Rejected deep link with unexpected shape:', type, id);
    return;
  }
  const win = windowManager.getMainWindow();
  if (win) {
    win.show();
    if (win.isMinimized()) win.restore();
    win.focus();
    win.webContents.send(IPC.DEEP_LINK_NAVIGATE, { type, id });
  }
}

// Handle certificate errors (log but do not bypass)
app.on('certificate-error', (_event, _webContents, url, error, _certificate, callback) => {
  logger.debugLog('Certificate error:', url, error);
  callback(false); // Reject invalid certificates
});

// Capture GPU / utility (incl. audio-service) child-process crashes. These do NOT
// fire 'render-process-gone', so a crash there (a strong suspect for the sound- and
// message-time reloads) would otherwise go unrecorded. Persisted to crashes.log.
app.on('child-process-gone', (_event, details) => {
  logger.crashLog(
    'child-process-gone',
    'type=' + details.type,
    'reason=' + details.reason,
    'exitCode=' + details.exitCode,
    'name=' + (details.name || ''),
    'service=' + (details.serviceName || '')
  );
});

// Prevent multiple instances
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', (_event, argv) => {
    // On Windows/Linux, deep link URL comes as last argv element
    const deepLinkUrl = argv.find((arg) => arg.startsWith('aetherium://'));
    if (deepLinkUrl) {
      handleDeepLink(deepLinkUrl);
      return;
    }
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
        if (w && !w.isDestroyed()) w.flashFrame(false);
      }, FLASH_FRAME_DURATION_MS);
      win.webContents.send(IPC.WINDOW_SHOWN);
    }
  });
}

// macOS: handle deep links via open-url event
app.on('open-url', (event, url) => {
  event.preventDefault();
  handleDeepLink(url);
});

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
  keybindsModule.registerKeybinds();

  // Global shortcuts
  globalShortcut.register('F11', () => {
    const win = windowManager.getMainWindow();
    if (win) win.setFullScreen(!win.isFullScreen());
  });

  // Only register DevTools shortcuts in development builds
  if (!app.isPackaged) {
    globalShortcut.register('F12', () => {
      const win = windowManager.getMainWindow();
      if (win) win.webContents.toggleDevTools();
    });

    globalShortcut.register('CommandOrControl+Shift+I', () => {
      const win = windowManager.getMainWindow();
      if (win) win.webContents.toggleDevTools();
    });
  }

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
