'use strict';

const { Tray, Menu, nativeImage } = require('electron');
const path = require('path');
const { getMainWindow } = require('./window-manager');
const { IPC } = require('./constants');

let tray = null;
let _overlayEnabled = true;
let _onToggle = null;

/**
 * Builds the tray context menu template.
 */
function buildMenu() {
  return Menu.buildFromTemplate([
    {
      label: 'Open Aetherium',
      click: () => {
        const win = getMainWindow();
        if (win) {
          win.show();
          win.focus();
          win.webContents.send(IPC.WINDOW_SHOWN);
        }
      },
    },
    {
      label: 'Toggle Overlay',
      type: 'checkbox',
      checked: _overlayEnabled,
      click: (menuItem) => {
        if (typeof _onToggle === 'function') {
          _onToggle(menuItem.checked);
        }
      },
    },
    { type: 'separator' },
    {
      label: 'Toggle Fullscreen',
      accelerator: 'F11',
      click: () => {
        const win = getMainWindow();
        if (win) {
          win.setFullScreen(!win.isFullScreen());
          win.show();
          win.focus();
        }
      },
    },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => {
        const { app } = require('electron');
        app.isQuitting = true;
        app.quit();
      },
    },
  ]);
}

/**
 * Creates the system tray icon.
 * @param {boolean} overlayEnabled - Initial overlay enabled state.
 * @param {Function} onToggle - Called with the new boolean when the overlay checkbox is toggled.
 */
function createTray(overlayEnabled, onToggle) {
  _overlayEnabled = overlayEnabled;
  _onToggle = onToggle;

  if (tray && !tray.isDestroyed()) {
    tray.setContextMenu(buildMenu());
    return;
  }

  const iconPath = path.join(__dirname, '..', 'resources', 'icon.png');
  const trayIcon = nativeImage.createFromPath(iconPath);
  tray = new Tray(trayIcon.resize({ width: 32, height: 32 }));

  tray.setToolTip('Aetherium');
  tray.setContextMenu(buildMenu());

  tray.on('click', () => {
    const win = getMainWindow();
    if (win) {
      if (win.isVisible() && win.isFocused()) {
        win.hide();
      } else {
        win.show();
        win.focus();
        win.webContents.send(IPC.WINDOW_SHOWN);
      }
    }
  });
}

/**
 * Rebuilds the tray context menu to reflect a new overlay enabled state.
 */
function rebuildTrayMenu(overlayEnabled) {
  _overlayEnabled = overlayEnabled;
  if (tray && !tray.isDestroyed()) {
    tray.setContextMenu(buildMenu());
  }
}

/**
 * Destroys the tray icon (used during update installation).
 */
function destroyTray() {
  if (tray && !tray.isDestroyed()) {
    tray.destroy();
    tray = null;
  }
}

function getTray() {
  return tray;
}

module.exports = { createTray, rebuildTrayMenu, destroyTray, getTray };
