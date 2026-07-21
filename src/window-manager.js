'use strict';

const { app, BrowserWindow, Menu, shell, screen } = require('electron');
const path = require('path');
const { debugLog } = require('./logger');
const settings = require('./settings');
const {
  AETHERIUM_URL,
  MAIN_WINDOW_WIDTH,
  MAIN_WINDOW_HEIGHT,
  ALLOWED_PERMISSIONS,
  IPC,
} = require('./constants');

let mainWindow = null;
let persistTimer = null;

/**
 * Returns the current main BrowserWindow instance (or null).
 */
function getMainWindow() {
  return mainWindow;
}

/**
 * Returns the display that the given window is currently on.
 * Falls back to the primary display when win is null/destroyed.
 */
function getTargetDisplay(win) {
  let display = screen.getPrimaryDisplay();
  if (win && !win.isDestroyed()) {
    display = screen.getDisplayMatching(win.getBounds());
  }
  return display;
}

/**
 * True if the given bounds at least partially overlap some connected display's
 * work area — guards against restoring a window onto an unplugged monitor.
 */
function isVisibleOnSomeDisplay(bounds) {
  return screen.getAllDisplays().some((d) => {
    const wa = d.workArea;
    return (
      bounds.x < wa.x + wa.width &&
      bounds.x + bounds.width > wa.x &&
      bounds.y < wa.y + wa.height &&
      bounds.y + bounds.height > wa.y
    );
  });
}

/**
 * Returns the window size/position to open with. Restores the persisted bounds
 * when valid and still on-screen; otherwise falls back to the default size,
 * centered (x/y left undefined so Electron centers the window).
 */
function getSavedBounds() {
  const b = settings.get('windowBounds', null);
  const out = { width: MAIN_WINDOW_WIDTH, height: MAIN_WINDOW_HEIGHT, x: undefined, y: undefined };
  if (!b || typeof b.width !== 'number' || typeof b.height !== 'number') return out;
  out.width = b.width;
  out.height = b.height;
  if (typeof b.x === 'number' && typeof b.y === 'number' && isVisibleOnSomeDisplay(b)) {
    out.x = b.x;
    out.y = b.y;
  }
  return out;
}

/**
 * Persists the window's current size/position + maximized state so the next
 * launch reopens exactly where the user left it. Skips saving bounds while
 * maximized/minimized/fullscreen (those would clobber the "restored" size).
 */
function persistWindowState() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  const isMax = mainWindow.isMaximized();
  settings.set('windowMaximized', isMax);
  if (!isMax && !mainWindow.isMinimized() && !mainWindow.isFullScreen()) {
    settings.set('windowBounds', mainWindow.getBounds());
  }
}

function schedulePersist() {
  clearTimeout(persistTimer);
  persistTimer = setTimeout(persistWindowState, 400);
}

/**
 * Clamp + apply a zoom factor and persist it. Ctrl +/-/0 use this.
 */
function setZoom(factor) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  const z = Math.max(0.3, Math.min(3, Math.round(factor * 10) / 10));
  mainWindow.webContents.setZoomFactor(z);
  settings.set('zoomFactor', z);
}

/**
 * Creates the main application window.
 * @param {Function} onReadyCallback - Called when the window emits 'ready-to-show'.
 */
function createWindow(onReadyCallback) {
  const savedBounds = getSavedBounds();
  mainWindow = new BrowserWindow({
    width: savedBounds.width,
    height: savedBounds.height,
    x: savedBounds.x,
    y: savedBounds.y,
    minWidth: 800,
    minHeight: 600,
    icon: path.join(__dirname, '..', 'resources', 'icon.png'),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      preload: path.join(__dirname, '..', 'preload.js'),
      webSecurity: true,
      allowRunningInsecureContent: false,
      spellcheck: true,
    },
    frame: false,
    titleBarStyle: 'hidden',
    show: false,
    backgroundColor: '#0e0d18',
  });

  // Log network errors for debugging
  mainWindow.webContents.session.webRequest.onErrorOccurred((details) => {
    if (details.error !== 'net::ERR_ABORTED') {
      debugLog('Network error:', details.url, details.error);
    }
  });

  Menu.setApplicationMenu(null);

  // Handle permission requests (media, notifications, etc.)
  mainWindow.webContents.session.setPermissionRequestHandler(
    (_webContents, permission, callback) => {
      callback(ALLOWED_PERMISSIONS.includes(permission));
    }
  );

  mainWindow.webContents.session.setPermissionCheckHandler((_webContents, permission) =>
    ALLOWED_PERMISSIONS.includes(permission)
  );

  let mainFrameLoadRetries = 0;
  mainWindow.loadURL(AETHERIUM_URL);

  // Show a friendly error screen on connection failure
  mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription, validatedURL, isMainFrame) => {
    // A failed SUBFRAME (link-preview iframe, YouTube embed, MEGA preview…) or an
    // aborted load (ERR_ABORTED, -3) must NEVER replace the whole app with the
    // error screen. This handler not gating on isMainFrame was the root cause of
    // "the app goes blank when a message with a link is sent/rendered": the embed
    // iframe fails to load and the old code wiped document.body for the whole app.
    if (!isMainFrame || errorCode === -3) {
      debugLog('Ignoring non-fatal did-fail-load:', errorCode, errorDescription, 'isMainFrame=', isMainFrame);
      return;
    }
    debugLog('Page load failed:', errorCode, errorDescription);

    // Transient network drop: auto-retry a couple times before the error screen.
    if (mainFrameLoadRetries < 2) {
      mainFrameLoadRetries++;
      setTimeout(() => {
        if (mainWindow && !mainWindow.isDestroyed()) mainWindow.loadURL(AETHERIUM_URL);
      }, 2000 * mainFrameLoadRetries);
      return;
    }
    mainFrameLoadRetries = 0;

    mainWindow.webContents
      .executeJavaScript(
        `
      document.body.style.margin = '0';
      document.body.style.padding = '0';
      document.body.style.overflow = 'hidden';
      document.body.innerHTML = \`
        <div style="
          display: flex;
          flex-direction: column;
          height: 100vh;
          background: linear-gradient(135deg, #0e0d18 0%, #14121f 50%, #0a0913 100%);
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          color: white;
        ">
          <div style="
            display: flex;
            align-items: center;
            justify-content: space-between;
            height: 32px;
            padding: 0 8px;
            -webkit-app-region: drag;
            background: rgba(0,0,0,0.2);
          ">
            <span style="font-size: 12px; color: #9b96b8; margin-left: 8px;">Aetherium</span>
            <div style="display: flex; -webkit-app-region: no-drag;">
              <button id="minimize-btn" style="
                width: 46px; height: 32px; border: none; background: transparent;
                color: #9b96b8; cursor: pointer; font-size: 16px;
              " onmouseover="this.style.background='rgba(255,255,255,0.1)'" onmouseout="this.style.background='transparent'">─</button>
              <button id="close-btn" style="
                width: 46px; height: 32px; border: none; background: transparent;
                color: #9b96b8; cursor: pointer; font-size: 16px;
              " onmouseover="this.style.background='#e81123'; this.style.color='white'" onmouseout="this.style.background='transparent'; this.style.color='#9b96b8'">✕</button>
            </div>
          </div>
          <div style="
            flex: 1;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            text-align: center;
            padding: 20px;
            box-sizing: border-box;
            -webkit-app-region: drag;
          ">
            <div style="-webkit-app-region: no-drag;">
              <div style="
                width: 100px; height: 100px; margin: 0 auto 24px;
                background: linear-gradient(135deg, #f97c93 0%, #e05c77 100%);
                border-radius: 24px; display: flex; align-items: center;
                justify-content: center; box-shadow: 0 8px 32px rgba(249, 124, 147, 0.3);
              ">
                <svg width="50" height="50" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <circle cx="12" cy="12" r="10"/>
                  <line x1="12" y1="8" x2="12" y2="12"/>
                  <line x1="12" y1="16" x2="12.01" y2="16"/>
                </svg>
              </div>
              <h1 style="margin: 0 0 12px; font-size: 28px; font-weight: 600;">Connection Failed</h1>
              <p style="margin: 0 0 8px; color: #9b96b8; font-size: 16px; max-width: 400px;">
                Unable to connect to Aetherium servers.
              </p>
              <p style="margin: 0 0 32px; color: #716c8c; font-size: 14px;">
                Check your internet connection or firewall settings.
              </p>
              <button id="retry-btn" style="
                background: linear-gradient(135deg, #8b78ff 0%, #6a55d6 100%);
                border: none; color: white; padding: 14px 48px; font-size: 16px;
                font-weight: 600; border-radius: 12px; cursor: pointer;
                box-shadow: 0 4px 16px rgba(139, 120, 255, 0.4);
                transition: transform 0.2s, box-shadow 0.2s; margin-bottom: 16px;
              " onmouseover="this.style.transform='scale(1.05)'; this.style.boxShadow='0 6px 20px rgba(139, 120, 255, 0.5)';"
                 onmouseout="this.style.transform='scale(1)'; this.style.boxShadow='0 4px 16px rgba(139, 120, 255, 0.4)';">
                Retry Connection
              </button>
              <p style="margin: 0; color: #56516e; font-size: 12px;">
                Error: ${errorDescription} (${errorCode})
              </p>
            </div>
          </div>
        </div>
      \`;
      document.getElementById('retry-btn').addEventListener('click', () => location.reload());
      document.getElementById('minimize-btn').addEventListener('click', () => window.electronAPI?.windowControls?.minimize());
      document.getElementById('close-btn').addEventListener('click', () => window.electronAPI?.windowControls?.close());
    `
      )
      .catch((err) => debugLog('Failed to show error screen:', err));
  });

  mainWindow.webContents.on('did-finish-load', () => {
    debugLog('Page loaded successfully');
    mainFrameLoadRetries = 0;
    // Restore persisted zoom level.
    const savedZoom = settings.get('zoomFactor', 1);
    if (typeof savedZoom === 'number' && savedZoom !== 1) {
      mainWindow.webContents.setZoomFactor(savedZoom);
    }
  });

  // Native right-click context menu (Electron ships none by default). Gives a
  // chat app the expected Cut/Copy/Paste/Select-All plus spellcheck suggestions.
  mainWindow.webContents.on('context-menu', (_event, params) => {
    const { editFlags, isEditable, misspelledWord, dictionarySuggestions, selectionText } = params;
    const template = [];

    for (const suggestion of dictionarySuggestions || []) {
      template.push({
        label: suggestion,
        click: () => mainWindow.webContents.replaceMisspelling(suggestion),
      });
    }
    if (misspelledWord) {
      if (template.length) template.push({ type: 'separator' });
      template.push({
        label: 'Add to dictionary',
        click: () =>
          mainWindow.webContents.session.addWordToSpellCheckerDictionary(misspelledWord),
      });
    }

    if (isEditable || selectionText) {
      if (template.length) template.push({ type: 'separator' });
      template.push(
        { label: 'Cut', role: 'cut', enabled: editFlags.canCut },
        { label: 'Copy', role: 'copy', enabled: editFlags.canCopy },
        { label: 'Paste', role: 'paste', enabled: editFlags.canPaste },
        { type: 'separator' },
        { label: 'Select All', role: 'selectAll', enabled: editFlags.canSelectAll }
      );
    }

    if (template.length) {
      Menu.buildFromTemplate(template).popup({ window: mainWindow });
    }
  });

  // ponytail: local zoom (Ctrl +/-/0) + reload (Ctrl+R) via before-input-event —
  // keeps them window-scoped instead of stealing the combos system-wide like
  // globalShortcut would. DevTools reload stays dev-only via main.js.
  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown') return;
    const ctrl = input.control || input.meta;
    if (!ctrl) return;
    const wc = mainWindow.webContents;
    if (input.key === '+' || input.key === '=') {
      setZoom(wc.getZoomFactor() + 0.1);
      event.preventDefault();
    } else if (input.key === '-') {
      setZoom(wc.getZoomFactor() - 0.1);
      event.preventDefault();
    } else if (input.key === '0') {
      setZoom(1);
      event.preventDefault();
    } else if (input.key === 'r' || input.key === 'R') {
      wc.reload();
      event.preventDefault();
    }
  });

  // Renderer crash recovery. did-fail-load only covers network load failures — it does
  // NOT fire when the renderer process itself dies (crash / OOM / GPU process gone),
  // which left the window blank with no way back except a full app restart. Auto-reload
  // so the app self-heals. Throttled so a crash-on-load can't spin an infinite reload loop.
  let lastCrashReload = 0;
  let rapidCrashes = 0;
  mainWindow.webContents.on('render-process-gone', (_event, details) => {
    debugLog('Renderer process gone:', details.reason, details.exitCode);
    if (details.reason === 'clean-exit') return;
    const now = Date.now();
    if (now - lastCrashReload < 5000) {
      // Crashed again within 5s of the last recovery — likely a reload loop.
      if (++rapidCrashes >= 3) {
        debugLog('Renderer crashed repeatedly — leaving did-fail-load recovery UI to show.');
        return;
      }
    } else {
      rapidCrashes = 0;
    }
    lastCrashReload = now;
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.reload();
  });

  // A brief main-thread jank — rendering a message (avatars, cosmetics, profile effects,
  // image/embed decode) — fires 'unresponsive', but the renderer almost always recovers on
  // its own within a moment. Reloading immediately nuked the whole app on essentially every
  // message. Wait out a grace period and cancel if the renderer reports 'responsive' again;
  // only reload if it's genuinely stuck.
  let unresponsiveTimer = null;
  mainWindow.webContents.on('unresponsive', () => {
    if (unresponsiveTimer) return;
    debugLog('Renderer unresponsive — waiting to see if it recovers');
    unresponsiveTimer = setTimeout(() => {
      unresponsiveTimer = null;
      debugLog('Renderer still unresponsive after grace period — reloading');
      if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.reload();
    }, 10000);
  });
  mainWindow.webContents.on('responsive', () => {
    if (unresponsiveTimer) {
      clearTimeout(unresponsiveTimer);
      unresponsiveTimer = null;
      debugLog('Renderer responsive again — no reload needed');
    }
  });

  mainWindow.once('ready-to-show', () => {
    if (settings.get('windowMaximized', false)) mainWindow.maximize();
    mainWindow.show();
    if (typeof onReadyCallback === 'function') {
      onReadyCallback();
    }
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (!url.startsWith(AETHERIUM_URL)) {
      if (/^https?:\/\//i.test(url)) {
        shell.openExternal(url);
      } else {
        debugLog('[Security] Blocked non-http URL in setWindowOpenHandler:', url);
      }
      return { action: 'deny' };
    }
    return { action: 'allow' };
  });

  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith(AETHERIUM_URL)) {
      event.preventDefault();
      if (/^https?:\/\//i.test(url)) {
        shell.openExternal(url);
      } else {
        debugLog('[Security] Blocked non-http URL in will-navigate:', url);
      }
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  mainWindow.on('close', (event) => {
    if (!app.isQuitting) {
      event.preventDefault();
      mainWindow.hide();
    }
    return false;
  });

  mainWindow.on('show', () => mainWindow.webContents.send(IPC.WINDOW_SHOWN));
  mainWindow.on('restore', () => mainWindow.webContents.send(IPC.WINDOW_SHOWN));
  mainWindow.on('maximize', () => mainWindow.webContents.send(IPC.WINDOW_MAXIMIZED_CHANGE, true));
  mainWindow.on('unmaximize', () =>
    mainWindow.webContents.send(IPC.WINDOW_MAXIMIZED_CHANGE, false)
  );

  // Persist window size/position/maximized state so the next launch restores it.
  mainWindow.on('resize', schedulePersist);
  mainWindow.on('move', schedulePersist);
  mainWindow.on('maximize', persistWindowState);
  mainWindow.on('unmaximize', persistWindowState);
  mainWindow.on('close', persistWindowState);
}

module.exports = { createWindow, getMainWindow, getTargetDisplay };
