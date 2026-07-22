'use strict';

const { app, BrowserWindow, Notification, screen } = require('electron');
const path = require('path');
const { getMainWindow, getTargetDisplay } = require('./window-manager');
const { IPC } = require('./constants');
const settings = require('./settings');

let overlayWindow = null;
let overlayEnabled = settings.get('overlayEnabled', true);
let activeCallData = null;
let displayMetricsListener = null;

// Content state — the window is shared between message cards and the active-call
// card. Track each independently and only hide the window when BOTH are empty.
let hasMessages = false;
let hasActiveCall = false;
// Last theme pushed from the web app; replayed on (re)create so a fresh overlay
// isn't stuck on the hardcoded-dark defaults for light-mode users.
let lastTheme = null;

/**
 * Sends an IPC message to the overlay window.
 * If the window is still loading, queues the send until did-finish-load fires.
 */
function sendWhenReady(win, channel, data) {
  if (!win || win.isDestroyed()) return;
  if (win.webContents.isLoading()) {
    win.webContents.once('did-finish-load', () => {
      if (!win.isDestroyed()) {
        win.webContents.send(channel, data);
      }
    });
  } else {
    win.webContents.send(channel, data);
  }
}

// Cover the whole work area of the display the main window is on.
function positionOverlayFullWorkArea() {
  if (!overlayWindow || overlayWindow.isDestroyed()) return;
  const display = getTargetDisplay(getMainWindow());
  const { x, y, width, height } = display.workArea;
  overlayWindow.setBounds({ x, y, width, height });
  overlayWindow.webContents.setZoomFactor(1 / (display.scaleFactor || 1));
}

// Show the window if anything is visible, hide (and reset to click-through) otherwise.
function refreshOverlayVisibility() {
  if (!overlayWindow || overlayWindow.isDestroyed()) return;
  if (hasMessages || hasActiveCall) {
    if (!overlayWindow.isVisible()) overlayWindow.showInactive();
  } else {
    overlayWindow.hide();
    // Reset to fully click-through so a stale interactive region can't linger.
    overlayWindow.setIgnoreMouseEvents(true, { forward: true });
  }
}

function createOverlayWindow() {
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    return overlayWindow;
  }

  const display = getTargetDisplay(getMainWindow());
  const { x: workX, y: workY, width: workW, height: workH } = display.workArea;

  console.log(
    '[Overlay] Creating on display:',
    display.id,
    'covering workArea',
    workX,
    workY,
    workW,
    workH
  );

  const scaleFactor = display.scaleFactor || 1;

  overlayWindow = new BrowserWindow({
    width: workW,
    height: workH,
    x: workX,
    y: workY,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    focusable: false,
    hasShadow: false,
    show: false,
    level: 'screen-saver',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      preload: path.join(__dirname, 'preloads', 'overlay-preload.js'),
      zoomFactor: 1 / scaleFactor,
    },
  });

  // Whole window is click-through by default; the renderer re-enables mouse
  // events only while the cursor is over a card (SET_OVERLAY_INTERACTIVE).
  overlayWindow.setIgnoreMouseEvents(true, { forward: true });
  overlayWindow.loadFile(path.join(__dirname, '..', 'overlay.html'));

  // Replay the last known theme once the page is ready so a freshly-created
  // overlay adopts the user's current (possibly light) theme immediately.
  if (lastTheme) {
    sendWhenReady(overlayWindow, IPC.OVERLAY_THEME_UPDATE, lastTheme);
  }

  overlayWindow.on('closed', () => {
    overlayWindow = null;
  });

  // Reposition overlay when display metrics change (resolution, DPI, etc.)
  if (!displayMetricsListener) {
    displayMetricsListener = () => {
      if (!overlayWindow || overlayWindow.isDestroyed() || !overlayWindow.isVisible()) return;
      positionOverlayFullWorkArea();
      console.log('[Overlay] Repositioned after display-metrics-changed');
    };
    screen.on('display-metrics-changed', displayMetricsListener);

    app.once('before-quit', () => {
      if (displayMetricsListener) {
        screen.removeListener('display-metrics-changed', displayMetricsListener);
        displayMetricsListener = null;
      }
    });
  }

  return overlayWindow;
}

function showOverlay(data) {
  if (!overlayEnabled) {
    // Overlay disabled — fall back to native notification
    if (Notification.isSupported()) {
      const notification = new Notification({
        title: data.title || 'Aetherium',
        body: data.body || '',
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
    }
    return;
  }

  createOverlayWindow();
  // Reposition to current display in case the main window moved
  positionOverlayFullWorkArea();

  hasMessages = true;
  refreshOverlayVisibility();
  sendWhenReady(overlayWindow, IPC.SHOW_OVERLAY, data);
}

function dismissOverlay() {
  console.log('[Overlay] dismissOverlay called');
  hasMessages = false;
  refreshOverlayVisibility();
}

function showActiveCallOverlay(data) {
  if (!overlayEnabled) return;

  activeCallData = data;
  createOverlayWindow();
  positionOverlayFullWorkArea();

  hasActiveCall = true;
  refreshOverlayVisibility();
  sendWhenReady(overlayWindow, IPC.SHOW_ACTIVE_CALL, data);
}

function updateActiveCallOverlay(data) {
  if (!overlayWindow || overlayWindow.isDestroyed()) return;
  activeCallData = { ...activeCallData, ...data };
  sendWhenReady(overlayWindow, IPC.UPDATE_ACTIVE_CALL, data);
}

function hideActiveCallOverlay() {
  console.log(
    '[Overlay] hideActiveCallOverlay called, activeCallData was:',
    activeCallData ? 'set' : 'null'
  );
  activeCallData = null;
  hasActiveCall = false;
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    sendWhenReady(overlayWindow, IPC.HIDE_ACTIVE_CALL);
  }
  refreshOverlayVisibility();
}

// Toggle mouse-event pass-through for the overlay window. The renderer calls
// this (via SET_OVERLAY_INTERACTIVE) as the cursor enters/leaves a card, so the
// rest of the screen stays click-through.
function setOverlayInteractive(interactive) {
  if (!overlayWindow || overlayWindow.isDestroyed()) return;
  overlayWindow.setIgnoreMouseEvents(!interactive, { forward: true });
}

function getOverlayEnabled() {
  return overlayEnabled;
}

function setOverlayEnabled(val) {
  overlayEnabled = val;
  settings.set('overlayEnabled', val);
}

function updateOverlayTheme(theme) {
  // Persist so (re)created overlays can replay it on load.
  lastTheme = theme;
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    sendWhenReady(overlayWindow, IPC.OVERLAY_THEME_UPDATE, theme);
  }
}

function getOverlayWindow() {
  return overlayWindow;
}

module.exports = {
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
};
