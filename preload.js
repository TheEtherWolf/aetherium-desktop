// Preload script for Aetherium Desktop
// Bridges Electron main process with the web app renderer

const { contextBridge, ipcRenderer } = require('electron');

// Expose API to renderer
contextBridge.exposeInMainWorld('electronAPI', {
  // Get app version
  getVersion: () => ipcRenderer.invoke('get-app-version'),

  // Platform info
  platform: process.platform,
  isElectron: true,

  // ============================================
  // Overlay System
  // ============================================

  // Show overlay notification (gaming style, appears when app is minimized/hidden)
  showOverlayNotification: (data) => ipcRenderer.invoke('show-overlay-notification', data),
  dismissOverlay: () => ipcRenderer.invoke('dismiss-overlay'),

  // Toggle overlay on/off
  setOverlayEnabled: (enabled) => ipcRenderer.invoke('set-overlay-enabled', enabled),
  getOverlayEnabled: () => ipcRenderer.invoke('get-overlay-enabled'),

  // Listen for overlay state changes (from tray menu)
  onOverlayEnabledChange: (callback) => {
    ipcRenderer.removeAllListeners('overlay-enabled-change');
    ipcRenderer.on('overlay-enabled-change', (event, enabled) => callback(enabled));
  },

  // Listen for overlay actions (answer/decline call, mute, hangup from overlay)
  onOverlayAction: (callback) => {
    ipcRenderer.removeAllListeners('overlay-action');
    ipcRenderer.on('overlay-action', (event, data) => callback(data));
  },

  // Active call overlay (shows when in call and app is unfocused)
  showActiveCallOverlay: (data) => ipcRenderer.invoke('show-active-call-overlay', data),
  updateActiveCallOverlay: (data) => ipcRenderer.invoke('update-active-call-overlay', data),
  hideActiveCallOverlay: () => ipcRenderer.invoke('hide-active-call-overlay'),
  updateOverlayTheme: (theme) => ipcRenderer.invoke('overlay-theme-update', theme),

  // Listen for navigation requests (clicking overlay card)
  onNavigateToConversation: (callback) => {
    ipcRenderer.removeAllListeners('navigate-to-conversation');
    ipcRenderer.on('navigate-to-conversation', (event, conversationId) => callback(conversationId));
  },

  // ============================================
  // Native Notifications (fallback when overlay disabled)
  // ============================================
  showNotification: (title, body) => ipcRenderer.invoke('show-notification', { title, body }),

  // ============================================
  // Window Events
  // ============================================
  onWindowShown: (callback) => {
    ipcRenderer.removeAllListeners('window-shown');
    ipcRenderer.on('window-shown', () => callback());
  },

  // Window controls for custom title bar
  windowControls: {
    minimize: () => ipcRenderer.send('window-minimize'),
    maximize: () => ipcRenderer.send('window-maximize'),
    close: () => ipcRenderer.send('window-close'),
    isMaximized: () => ipcRenderer.invoke('window-is-maximized'),
    onMaximizedChange: (callback) => {
      ipcRenderer.removeAllListeners('window-maximized-change');
      ipcRenderer.on('window-maximized-change', (event, isMaximized) => callback(isMaximized));
    },
  },

  // ============================================
  // External Links
  // ============================================
  openExternal: (url) => ipcRenderer.invoke('open-external', url),

  // ============================================
  // Auto-updater
  // ============================================
  autoUpdater: {
    checkForUpdates: () => ipcRenderer.invoke('check-for-updates'),
    installUpdate: () => ipcRenderer.send('install-update'),
    onUpdateAvailable: (callback) => {
      ipcRenderer.removeAllListeners('update-available');
      ipcRenderer.on('update-available', (event, info) => callback(info));
    },
    onUpdateProgress: (callback) => {
      ipcRenderer.removeAllListeners('update-progress');
      ipcRenderer.on('update-progress', (event, progress) => callback(progress));
    },
    onUpdateDownloaded: (callback) => {
      ipcRenderer.removeAllListeners('update-downloaded');
      ipcRenderer.on('update-downloaded', (event, info) => callback(info));
    },
    onUpdateError: (callback) => {
      ipcRenderer.removeAllListeners('update-error');
      ipcRenderer.on('update-error', (event, error) => callback(error));
    },
  },

  // ============================================
  // Screen Sharing
  // ============================================
  screenShare: {
    getSources: () => ipcRenderer.invoke('get-screen-sources'),
    openPicker: () => ipcRenderer.invoke('open-screen-picker'),
    isAvailable:
      process.platform === 'win32' || process.platform === 'darwin' || process.platform === 'linux',
  },

  // ============================================
  // Badge / unread count
  // ============================================
  setBadgeCount: (count) => ipcRenderer.invoke('set-badge-count', count),

  // ============================================
  // Hardware acceleration
  // ============================================
  hardwareAcceleration: {
    isEnabled: () => ipcRenderer.invoke('get-hardware-acceleration'),
    setEnabled: (enabled) => ipcRenderer.invoke('set-hardware-acceleration', enabled),
  },

  // ============================================
  // Global keybinds / push-to-talk
  // ============================================
  keybinds: {
    get: () => ipcRenderer.invoke('get-keybinds'),
    set: (keybinds) => ipcRenderer.invoke('set-keybinds', keybinds),
  },
  onPTTKeyDown: (callback) => {
    ipcRenderer.removeAllListeners('ptt-key-down');
    ipcRenderer.on('ptt-key-down', () => callback());
  },
  onPTTKeyUp: (callback) => {
    ipcRenderer.removeAllListeners('ptt-key-up');
    ipcRenderer.on('ptt-key-up', () => callback());
  },
  onGlobalShortcutAction: (callback) => {
    ipcRenderer.removeAllListeners('global-shortcut-action');
    ipcRenderer.on('global-shortcut-action', (event, data) => callback(data));
  },

  // ============================================
  // Auto-launch (start on login)
  // ============================================
  autoLaunch: {
    isEnabled: () => ipcRenderer.invoke('get-auto-launch'),
    setEnabled: (enabled) => ipcRenderer.invoke('set-auto-launch', enabled),
  },

  // ============================================
  // Deep links
  // ============================================
  onDeepLink: (callback) => {
    ipcRenderer.removeAllListeners('deep-link-navigate');
    ipcRenderer.on('deep-link-navigate', (event, data) => callback(data));
  },

  // Clear cache and reload (for web app updates)
  clearCacheAndReload: () => ipcRenderer.invoke('clear-cache-and-reload'),
});

// ============================================
// Override Browser Notification API (via contextBridge)
// ============================================
// Expose a factory function so the renderer can replace window.Notification
// without the preload ever touching ipcRenderer outside contextBridge.
contextBridge.exposeInMainWorld('__aetheriumNotificationShim', {
  // Called by the renderer shim below to fire an overlay notification.
  // This delegates to the already-validated showOverlayNotification handler.
  show: (data) => ipcRenderer.invoke('show-overlay-notification', data).catch(() => {}),
});

// Install the shim into the renderer world via contextBridge-safe injection.
// We use a script element so it runs in the renderer JS context (not preload),
// meaning it has access to window.Notification but can only call through the
// contextBridge surface (__aetheriumNotificationShim) â€” never ipcRenderer.
window.addEventListener('DOMContentLoaded', () => {
  const script = document.createElement('script');
  script.textContent = `
    (function () {
      var _shim = window.__aetheriumNotificationShim;
      if (!_shim) return;

      function ElectronNotification(title, options) {
        // Guard against being called without 'new' (would bind 'this' to window).
        if (!(this instanceof ElectronNotification)) {
          return new ElectronNotification(title, options);
        }
        options = options || {};
        this.title = title;
        this.body = options.body || '';
        this.icon = options.icon || null;
        this.tag = options.tag || null;
        this.data = options.data || {};

        // Skip if the window is focused â€” main process also checks, but avoid IPC.
        if (document.hasFocus()) return;

        _shim.show({
          type: (this.data && this.data.type) || 'message',
          title: this.title,
          body: this.body,
          avatar: this.icon,
          conversationId: this.data && this.data.conversationId,
          duration: this.data && this.data.duration,
        });
      }

      ElectronNotification.prototype.close = function () {};
      Object.defineProperty(ElectronNotification, 'permission', {
        get: function () { return 'granted'; },
      });
      ElectronNotification.requestPermission = function () {
        return Promise.resolve('granted');
      };

      Object.defineProperty(window, 'Notification', {
        value: ElectronNotification,
        writable: true,
        configurable: true,
      });

      // Clean up the bridge helper â€” no longer needed after install.
      try { delete window.__aetheriumNotificationShim; } catch (_) {}
    })();
  `;
  document.head.appendChild(script);
  script.remove();
});

