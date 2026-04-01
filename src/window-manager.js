'use strict';

const { app, BrowserWindow, Menu, shell, screen } = require('electron');
const path = require('path');
const { debugLog } = require('./logger');
const {
  AETHERIUM_URL,
  MAIN_WINDOW_WIDTH,
  MAIN_WINDOW_HEIGHT,
  ALLOWED_PERMISSIONS,
  IPC,
} = require('./constants');

let mainWindow = null;

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
 * Creates the main application window.
 * @param {Function} onReadyCallback - Called when the window emits 'ready-to-show'.
 */
function createWindow(onReadyCallback) {
  mainWindow = new BrowserWindow({
    width: MAIN_WINDOW_WIDTH,
    height: MAIN_WINDOW_HEIGHT,
    minWidth: 800,
    minHeight: 600,
    icon: path.join(__dirname, '..', 'resources', 'icon.png'),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, '..', 'preload.js'),
      webSecurity: true,
      allowRunningInsecureContent: false,
    },
    frame: false,
    titleBarStyle: 'hidden',
    show: false,
    backgroundColor: '#1a1a2e',
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

  mainWindow.loadURL(AETHERIUM_URL);

  // Show a friendly error screen on connection failure
  mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription) => {
    debugLog('Page load failed:', errorCode, errorDescription);

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
          background: linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f0f23 100%);
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
            <span style="font-size: 12px; color: #8b8ba0; margin-left: 8px;">Aetherium</span>
            <div style="display: flex; -webkit-app-region: no-drag;">
              <button id="minimize-btn" style="
                width: 46px; height: 32px; border: none; background: transparent;
                color: #a0a0b8; cursor: pointer; font-size: 16px;
              " onmouseover="this.style.background='rgba(255,255,255,0.1)'" onmouseout="this.style.background='transparent'">─</button>
              <button id="close-btn" style="
                width: 46px; height: 32px; border: none; background: transparent;
                color: #a0a0b8; cursor: pointer; font-size: 16px;
              " onmouseover="this.style.background='#e81123'; this.style.color='white'" onmouseout="this.style.background='transparent'; this.style.color='#a0a0b8'">✕</button>
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
                background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%);
                border-radius: 24px; display: flex; align-items: center;
                justify-content: center; box-shadow: 0 8px 32px rgba(239, 68, 68, 0.3);
              ">
                <svg width="50" height="50" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <circle cx="12" cy="12" r="10"/>
                  <line x1="12" y1="8" x2="12" y2="12"/>
                  <line x1="12" y1="16" x2="12.01" y2="16"/>
                </svg>
              </div>
              <h1 style="margin: 0 0 12px; font-size: 28px; font-weight: 600;">Connection Failed</h1>
              <p style="margin: 0 0 8px; color: #a0a0b8; font-size: 16px; max-width: 400px;">
                Unable to connect to Aetherium servers.
              </p>
              <p style="margin: 0 0 32px; color: #6b6b80; font-size: 14px;">
                Check your internet connection or firewall settings.
              </p>
              <button id="retry-btn" style="
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                border: none; color: white; padding: 14px 48px; font-size: 16px;
                font-weight: 600; border-radius: 12px; cursor: pointer;
                box-shadow: 0 4px 16px rgba(102, 126, 234, 0.4);
                transition: transform 0.2s, box-shadow 0.2s; margin-bottom: 16px;
              " onmouseover="this.style.transform='scale(1.05)'; this.style.boxShadow='0 6px 20px rgba(102, 126, 234, 0.5)';"
                 onmouseout="this.style.transform='scale(1)'; this.style.boxShadow='0 4px 16px rgba(102, 126, 234, 0.4)';">
                Retry Connection
              </button>
              <p style="margin: 0; color: #4a4a5c; font-size: 12px;">
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
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    if (typeof onReadyCallback === 'function') {
      onReadyCallback();
    }
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (!url.startsWith(AETHERIUM_URL)) {
      shell.openExternal(url);
      return { action: 'deny' };
    }
    return { action: 'allow' };
  });

  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith(AETHERIUM_URL)) {
      event.preventDefault();
      shell.openExternal(url);
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
}

module.exports = { createWindow, getMainWindow, getTargetDisplay };
