'use strict';

const { BrowserWindow, desktopCapturer, ipcMain, screen } = require('electron');
const path = require('path');
const { getMainWindow } = require('./window-manager');
const { IPC, SCREEN_PICKER_WIDTH, SCREEN_PICKER_HEIGHT } = require('./constants');

let screenPickerWindow = null;

async function getScreenSources() {
  try {
    const sources = await desktopCapturer.getSources({
      types: ['screen', 'window'],
      thumbnailSize: { width: 320, height: 180 },
      fetchWindowIcons: true,
    });
    return sources.map((source) => ({
      id: source.id,
      name: source.name,
      thumbnail: source.thumbnail.toDataURL(),
      appIcon: source.appIcon ? source.appIcon.toDataURL() : null,
      type: source.id.startsWith('screen:') ? 'screen' : 'window',
    }));
  } catch (err) {
    console.error('Failed to get screen sources:', err);
    return [];
  }
}

function createScreenPickerWindow() {
  return new Promise((resolve) => {
    if (screenPickerWindow && !screenPickerWindow.isDestroyed()) {
      screenPickerWindow.close();
    }

    const display = screen.getPrimaryDisplay();
    const { width: screenW, height: screenH } = display.workAreaSize;

    screenPickerWindow = new BrowserWindow({
      width: SCREEN_PICKER_WIDTH,
      height: SCREEN_PICKER_HEIGHT,
      x: Math.round((screenW - SCREEN_PICKER_WIDTH) / 2),
      y: Math.round((screenH - SCREEN_PICKER_HEIGHT) / 2),
      parent: getMainWindow() || undefined,
      modal: true,
      frame: false,
      transparent: false,
      resizable: false,
      backgroundColor: '#1e1f22',
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        preload: path.join(__dirname, 'preloads', 'picker-preload.js'),
      },
    });

    screenPickerWindow.loadFile(path.join(__dirname, '..', 'screen-picker.html'));

    const pickerWebContentsId = screenPickerWindow.webContents.id;

    // Keep handler refs so we can remove them precisely
    function onSelect(event, sourceId) {
      // Ignore messages from unexpected senders (e.g. injected from main window)
      if (event.sender.id !== pickerWebContentsId) return;
      cleanup();
      resolve(sourceId);
    }
    function onCancel(event) {
      if (event.sender.id !== pickerWebContentsId) return;
      cleanup();
      resolve(null);
    }
    function cleanup() {
      ipcMain.removeListener(IPC.SCREEN_PICKER_SELECT, onSelect);
      ipcMain.removeListener(IPC.SCREEN_PICKER_CANCEL, onCancel);
      if (screenPickerWindow && !screenPickerWindow.isDestroyed()) {
        screenPickerWindow.close();
      }
      screenPickerWindow = null;
    }

    ipcMain.on(IPC.SCREEN_PICKER_SELECT, onSelect);
    ipcMain.on(IPC.SCREEN_PICKER_CANCEL, onCancel);

    screenPickerWindow.on('closed', () => {
      // Window closed by user (e.g. OS close button) without sending IPC
      ipcMain.removeListener(IPC.SCREEN_PICKER_SELECT, onSelect);
      ipcMain.removeListener(IPC.SCREEN_PICKER_CANCEL, onCancel);
      screenPickerWindow = null;
      resolve(null);
    });
  });
}

/**
 * Registers the three screen-sharing IPC handlers.
 * Must be called once during app.whenReady().
 */
function initScreenShareHandlers() {
  ipcMain.handle(IPC.GET_SCREEN_SOURCES, async () => await getScreenSources());
  ipcMain.handle(IPC.OPEN_SCREEN_PICKER, async () => await createScreenPickerWindow());
  ipcMain.handle(IPC.GET_SOURCE_STREAM, async (_event, sourceId, constraints) => ({
    sourceId,
    constraints,
  }));
}

module.exports = { getScreenSources, createScreenPickerWindow, initScreenShareHandlers };
