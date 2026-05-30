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

// Valid Electron accelerator pattern:
// Optional modifiers (Command/Ctrl/Alt/Shift/Super/Meta) joined by '+',
// followed by a key name. We allow a reasonable subset; globalShortcut.register
// will be the final arbiter but we reject obviously bad values first.
const ACCELERATOR_RE = /^((?:(?:Command|Cmd|Control|Ctrl|CommandOrControl|CmdOrCtrl|Alt|Option|AltGr|Shift|Super|Meta)\+)+)[A-Za-z0-9][\w]*$/;

/**
 * Returns true if `value` is a non-empty string that looks like a valid
 * Electron accelerator.  Empty string is accepted (means "unset").
 */
function isValidAccelerator(value) {
  if (typeof value !== 'string') return false;
  if (value === '') return true; // empty = disabled, always OK
  return ACCELERATOR_RE.test(value);
}

function getKeybinds() {
  return settings.get('keybinds', DEFAULT_KEYBINDS);
}

function saveKeybinds(keybinds) {
  const validated = {};
  for (const [key, value] of Object.entries(keybinds)) {
    if (!isValidAccelerator(value)) {
      console.warn(`[Keybinds] Ignoring invalid accelerator for "${key}":`, value);
      validated[key] = '';
    } else {
      validated[key] = value;
    }
  }
  settings.set('keybinds', validated);
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
