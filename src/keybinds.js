'use strict';

const { globalShortcut } = require('electron');
const { getMainWindow } = require('./window-manager');
const { IPC } = require('./constants');
const settings = require('./settings');

const DEFAULT_KEYBINDS = {
  pushToTalk: '',
  toggleMute: '',
  toggleDeafen: '',
};

let registeredShortcuts = [];

function getKeybinds() {
  return settings.get('keybinds', DEFAULT_KEYBINDS);
}

function saveKeybinds(keybinds) {
  settings.set('keybinds', keybinds);
}

function unregisterAll() {
  for (const accel of registeredShortcuts) {
    try {
      globalShortcut.unregister(accel);
    } catch {
      // already unregistered
    }
  }
  registeredShortcuts = [];
}

function registerKeybinds() {
  unregisterAll();
  const keybinds = getKeybinds();
  const win = () => getMainWindow();

  if (keybinds.pushToTalk) {
    try {
      globalShortcut.register(keybinds.pushToTalk, () => {
        const w = win();
        if (w) w.webContents.send(IPC.PTT_KEY_DOWN);
      });
      registeredShortcuts.push(keybinds.pushToTalk);
    } catch (err) {
      console.error('Failed to register PTT shortcut:', err.message);
    }
  }

  if (keybinds.toggleMute) {
    try {
      globalShortcut.register(keybinds.toggleMute, () => {
        const w = win();
        if (w) w.webContents.send(IPC.GLOBAL_SHORTCUT_ACTION, { action: 'toggle-mute' });
      });
      registeredShortcuts.push(keybinds.toggleMute);
    } catch (err) {
      console.error('Failed to register toggleMute shortcut:', err.message);
    }
  }

  if (keybinds.toggleDeafen) {
    try {
      globalShortcut.register(keybinds.toggleDeafen, () => {
        const w = win();
        if (w) w.webContents.send(IPC.GLOBAL_SHORTCUT_ACTION, { action: 'toggle-deafen' });
      });
      registeredShortcuts.push(keybinds.toggleDeafen);
    } catch (err) {
      console.error('Failed to register toggleDeafen shortcut:', err.message);
    }
  }
}

module.exports = { getKeybinds, saveKeybinds, registerKeybinds, unregisterAll };
