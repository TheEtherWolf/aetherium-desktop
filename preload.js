// Preload script for Aetherium Desktop
// Bridges Electron main process with the web app renderer

const { contextBridge, ipcRenderer } = require('electron')

// Track overlay state
let overlayEnabled = true

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

  // Toggle overlay on/off
  setOverlayEnabled: (enabled) => ipcRenderer.invoke('set-overlay-enabled', enabled),
  getOverlayEnabled: () => ipcRenderer.invoke('get-overlay-enabled'),

  // Listen for overlay state changes (from tray menu)
  onOverlayEnabledChange: (callback) => {
    ipcRenderer.on('overlay-enabled-change', (event, enabled) => callback(enabled))
  },

  // Listen for overlay actions (answer/decline call from overlay)
  onOverlayAction: (callback) => {
    ipcRenderer.on('overlay-action', (event, data) => callback(data))
  },

  // Listen for navigation requests (clicking overlay card)
  onNavigateToConversation: (callback) => {
    ipcRenderer.on('navigate-to-conversation', (event, conversationId) => callback(conversationId))
  },

  // ============================================
  // Native Notifications (fallback when overlay disabled)
  // ============================================
  showNotification: (title, body) => ipcRenderer.invoke('show-notification', { title, body }),

  // ============================================
  // Window Events
  // ============================================
  onWindowShown: (callback) => {
    ipcRenderer.on('window-shown', () => callback())
  },

  // Window controls for custom title bar
  windowControls: {
    minimize: () => ipcRenderer.send('window-minimize'),
    maximize: () => ipcRenderer.send('window-maximize'),
    close: () => ipcRenderer.send('window-close'),
    isMaximized: () => ipcRenderer.invoke('window-is-maximized'),
    onMaximizedChange: (callback) => {
      ipcRenderer.on('window-maximized-change', (event, isMaximized) => callback(isMaximized))
    }
  },

  // ============================================
  // Auto-updater
  // ============================================
  autoUpdater: {
    checkForUpdates: () => ipcRenderer.invoke('check-for-updates'),
    installUpdate: () => ipcRenderer.send('install-update'),
    onUpdateAvailable: (callback) => {
      ipcRenderer.on('update-available', (event, info) => callback(info))
    },
    onUpdateProgress: (callback) => {
      ipcRenderer.on('update-progress', (event, progress) => callback(progress))
    },
    onUpdateDownloaded: (callback) => {
      ipcRenderer.on('update-downloaded', (event, info) => callback(info))
    },
    onUpdateError: (callback) => {
      ipcRenderer.on('update-error', (event, error) => callback(error))
    }
  },

  // ============================================
  // Screen Sharing
  // ============================================
  screenShare: {
    getSources: () => ipcRenderer.invoke('get-screen-sources'),
    openPicker: () => ipcRenderer.invoke('open-screen-picker'),
    isAvailable: true
  },

  // Clear cache and reload (for web app updates)
  clearCacheAndReload: () => ipcRenderer.invoke('clear-cache-and-reload')
})

// ============================================
// Override Browser Notification API
// ============================================
window.addEventListener('DOMContentLoaded', () => {
  // Custom Notification class that uses overlay when enabled
  class ElectronNotification {
    constructor(title, options = {}) {
      this.title = title
      this.body = options.body || ''
      this.icon = options.icon || null
      this.tag = options.tag || null
      this.data = options.data || {}

      // Don't show notification if window is focused
      // The main process handles this check too, but we can skip the IPC
      if (document.hasFocus()) {
        return
      }

      // Show overlay notification
      ipcRenderer.invoke('show-overlay-notification', {
        type: this.data.type || 'message',
        title: this.title,
        body: this.body,
        avatar: this.icon,
        conversationId: this.data.conversationId,
        duration: this.data.duration
      })
    }

    close() {
      // Overlay handles auto-dismiss
    }

    static get permission() {
      return 'granted'
    }

    static requestPermission() {
      return Promise.resolve('granted')
    }
  }

  // Replace browser Notification with our Electron version
  window.Notification = ElectronNotification

  // Also intercept any calls to the Notification API that might bypass our class
  Object.defineProperty(window, 'Notification', {
    value: ElectronNotification,
    writable: false,
    configurable: false
  })
})

console.log('Aetherium Desktop preload script loaded')
