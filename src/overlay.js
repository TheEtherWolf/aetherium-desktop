'use strict';

const { BrowserWindow, Notification } = require('electron');
const path = require('path');
const { getMainWindow, getTargetDisplay } = require('./window-manager');
const { IPC, OVERLAY_WIDTH } = require('./constants');

let overlayWindow = null;
let overlayEnabled = true;
let activeCallData = null;

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

function createOverlayWindow() {
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    return overlayWindow;
  }

  const display = getTargetDisplay(getMainWindow());
  const { x: displayX, y: displayY } = display.bounds;
  const { height: workH } = display.workArea;

  console.log(
    '[Overlay] Creating on display:',
    display.id,
    'at top-left',
    displayX,
    displayY,
    'height',
    workH
  );

  overlayWindow = new BrowserWindow({
    width: OVERLAY_WIDTH,
    height: workH,
    x: displayX,
    y: displayY,
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
      preload: path.join(__dirname, 'preloads', 'overlay-preload.js'),
    },
  });

  overlayWindow.setIgnoreMouseEvents(true, { forward: true });
  overlayWindow.loadFile(path.join(__dirname, '..', 'overlay.html'));

  overlayWindow.on('closed', () => {
    overlayWindow = null;
  });

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

  const overlay = createOverlayWindow();

  // Reposition to current display in case the main window moved
  const display = getTargetDisplay(getMainWindow());
  const { x: displayX, y: displayY } = display.bounds;
  const { height: workH } = display.workArea;
  overlay.setBounds({ x: displayX, y: displayY, width: OVERLAY_WIDTH, height: workH });
  console.log(
    '[Overlay] Repositioned for notification to display:',
    display.id,
    'at',
    displayX,
    displayY
  );

  if (!overlay.isVisible()) {
    overlay.showInactive();
  }
  overlay.setIgnoreMouseEvents(false);
  sendWhenReady(overlay, IPC.SHOW_OVERLAY, data);
}

function dismissOverlay() {
  console.log('[Overlay] dismissOverlay called');
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    overlayWindow.hide();
    overlayWindow.setIgnoreMouseEvents(true, { forward: true });
    console.log('[Overlay] Dismissed and hidden');
  } else {
    console.log('[Overlay] No overlay to dismiss');
  }
}

function showActiveCallOverlay(data) {
  if (!overlayEnabled) return;

  activeCallData = data;
  const overlay = createOverlayWindow();

  const display = getTargetDisplay(getMainWindow());
  const { x: displayX, y: displayY } = display.bounds;
  const { height: workH } = display.workArea;
  overlay.setBounds({ x: displayX, y: displayY, width: OVERLAY_WIDTH, height: workH });
  console.log('[Overlay] Repositioned to display:', display.id, 'at', displayX, displayY);

  if (!overlay.isVisible()) {
    overlay.showInactive();
  }
  overlay.setIgnoreMouseEvents(false);
  sendWhenReady(overlay, IPC.SHOW_ACTIVE_CALL, data);
}

function updateActiveCallOverlay(data) {
  if (!overlayWindow || overlayWindow.isDestroyed()) return;
  activeCallData = { ...activeCallData, ...data };
  overlayWindow.webContents.send(IPC.UPDATE_ACTIVE_CALL, data);
}

function hideActiveCallOverlay() {
  console.log(
    '[Overlay] hideActiveCallOverlay called, activeCallData was:',
    activeCallData ? 'set' : 'null'
  );
  activeCallData = null;
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    console.log('[Overlay] Sending hide-active-call to overlay window');
    overlayWindow.webContents.send(IPC.HIDE_ACTIVE_CALL);
    overlayWindow.hide();
    overlayWindow.setIgnoreMouseEvents(true, { forward: true });
    console.log('[Overlay] Window hidden');
  } else {
    console.log('[Overlay] No overlay window to hide');
  }
}

function getOverlayEnabled() {
  return overlayEnabled;
}

function setOverlayEnabled(val) {
  overlayEnabled = val;
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
  getOverlayEnabled,
  setOverlayEnabled,
  getOverlayWindow,
};
