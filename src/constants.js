'use strict';

// The URL of the deployed Aetherium web app
const AETHERIUM_URL = 'https://aetherium-89dr.onrender.com/';

// IPC channel names — single source of truth shared by main process modules.
// Preload scripts (renderer-side) use matching inline string literals with comments.
const IPC = Object.freeze({
  // Overlay system (main ↔ renderer via preload.js)
  SHOW_OVERLAY_NOTIFICATION: 'show-overlay-notification',
  DISMISS_OVERLAY: 'dismiss-overlay',
  SET_OVERLAY_ENABLED: 'set-overlay-enabled',
  GET_OVERLAY_ENABLED: 'get-overlay-enabled',
  OVERLAY_ENABLED_CHANGE: 'overlay-enabled-change',
  OVERLAY_ACTION: 'overlay-action',
  NAVIGATE_TO_CONVERSATION: 'navigate-to-conversation',

  // Overlay window IPC (overlay.html ↔ main via overlay-preload.js)
  OVERLAY_CLICKED: 'overlay-clicked',
  OVERLAY_ANSWER_CALL: 'overlay-answer-call',
  OVERLAY_DECLINE_CALL: 'overlay-decline-call',
  OVERLAY_DISMISS: 'overlay-dismiss',

  // Overlay window receives these from main process
  SHOW_OVERLAY: 'show-overlay',

  // Active call overlay (main ↔ renderer via preload.js)
  SHOW_ACTIVE_CALL_OVERLAY: 'show-active-call-overlay',
  UPDATE_ACTIVE_CALL_OVERLAY: 'update-active-call-overlay',
  HIDE_ACTIVE_CALL_OVERLAY: 'hide-active-call-overlay',

  // Overlay window IPC for active call
  ACTIVE_CALL_CLICKED: 'active-call-clicked',
  ACTIVE_CALL_MUTE: 'active-call-mute',
  ACTIVE_CALL_HANGUP: 'active-call-hangup',

  // Overlay window receives these from main process
  SHOW_ACTIVE_CALL: 'show-active-call',
  UPDATE_ACTIVE_CALL: 'update-active-call',
  HIDE_ACTIVE_CALL: 'hide-active-call',

  // Theme sync (main → overlay)
  OVERLAY_THEME_UPDATE: 'overlay-theme-update',

  // Auto-updater (main ↔ renderer via preload.js)
  CHECK_FOR_UPDATES: 'check-for-updates',
  INSTALL_UPDATE: 'install-update',
  SHOW_UPDATE_WINDOW: 'show-update-window',
  UPDATE_AVAILABLE: 'update-available',
  UPDATE_PROGRESS: 'update-progress',
  UPDATE_DOWNLOADED: 'update-downloaded',
  UPDATE_ERROR: 'update-error',

  // Update window IPC (update-window.html ↔ main via update-preload.js)
  START_UPDATE_DOWNLOAD: 'start-update-download',
  UPDATE_LATER: 'update-later',
  UPDATE_INFO: 'update-info',
  DOWNLOAD_PROGRESS: 'download-progress',

  // Screen sharing (main ↔ renderer via preload.js)
  GET_SCREEN_SOURCES: 'get-screen-sources',
  OPEN_SCREEN_PICKER: 'open-screen-picker',
  GET_SOURCE_STREAM: 'get-source-stream',

  // Screen picker window IPC (screen-picker.html ↔ main via picker-preload.js)
  SCREEN_PICKER_SELECT: 'screen-picker-select',
  SCREEN_PICKER_CANCEL: 'screen-picker-cancel',

  // Window controls (main ↔ renderer via preload.js)
  WINDOW_MINIMIZE: 'window-minimize',
  WINDOW_MAXIMIZE: 'window-maximize',
  WINDOW_CLOSE: 'window-close',
  WINDOW_IS_MAXIMIZED: 'window-is-maximized',
  WINDOW_SHOWN: 'window-shown',
  WINDOW_MAXIMIZED_CHANGE: 'window-maximized-change',

  // Auto-launch (start on login)
  GET_AUTO_LAUNCH: 'get-auto-launch',
  SET_AUTO_LAUNCH: 'set-auto-launch',

  // Badge / unread count
  SET_BADGE_COUNT: 'set-badge-count',

  // Hardware acceleration
  GET_HARDWARE_ACCELERATION: 'get-hardware-acceleration',
  SET_HARDWARE_ACCELERATION: 'set-hardware-acceleration',

  // Global push-to-talk & keybinds
  PTT_KEY_DOWN: 'ptt-key-down',
  PTT_KEY_UP: 'ptt-key-up',
  GLOBAL_SHORTCUT_ACTION: 'global-shortcut-action',
  GET_KEYBINDS: 'get-keybinds',
  SET_KEYBINDS: 'set-keybinds',

  // Deep links
  DEEP_LINK_NAVIGATE: 'deep-link-navigate',

  // Miscellaneous
  SHOW_NOTIFICATION: 'show-notification',
  OPEN_EXTERNAL: 'open-external',
  GET_APP_VERSION: 'get-app-version',
  CLEAR_CACHE_AND_RELOAD: 'clear-cache-and-reload',
  RETRY_CONNECTION: 'retry-connection',
});

// Window dimensions
const OVERLAY_WIDTH = 400;
const UPDATE_WINDOW_WIDTH = 450;
const UPDATE_WINDOW_HEIGHT = 480;
const SCREEN_PICKER_WIDTH = 800;
const SCREEN_PICKER_HEIGHT = 600;
const MAIN_WINDOW_WIDTH = 1200;
const MAIN_WINDOW_HEIGHT = 800;

// Timing
const UPDATE_CHECK_INTERVAL_MS = 60 * 60 * 1000; // 1 hour
const FLASH_FRAME_DURATION_MS = 3000;

// Permissions allowed in the main window
const ALLOWED_PERMISSIONS = [
  'media',
  'mediaKeySystem',
  'notifications',
  'fullscreen',
  'pointerLock',
  'clipboard-read',
  'clipboard-write',
];

module.exports = {
  AETHERIUM_URL,
  IPC,
  OVERLAY_WIDTH,
  UPDATE_WINDOW_WIDTH,
  UPDATE_WINDOW_HEIGHT,
  SCREEN_PICKER_WIDTH,
  SCREEN_PICKER_HEIGHT,
  MAIN_WINDOW_WIDTH,
  MAIN_WINDOW_HEIGHT,
  UPDATE_CHECK_INTERVAL_MS,
  FLASH_FRAME_DURATION_MS,
  ALLOWED_PERMISSIONS,
};
