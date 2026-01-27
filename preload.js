// Preload script for Electron
// This runs in the renderer process before the web page loads

const { contextBridge, ipcRenderer } = require('electron')

// Expose a limited API to the renderer process
contextBridge.exposeInMainWorld('electronAPI', {
  // Get app version
  getVersion: () => ipcRenderer.invoke('get-app-version'),

  // Platform info
  platform: process.platform,

  // Show native notification
  showNotification: (title, body) => ipcRenderer.invoke('show-notification', { title, body }),

  // Listen for window shown event (for reconnecting calls when restored from tray)
  onWindowShown: (callback) => {
    ipcRenderer.on('window-shown', () => callback())
  },

  // Check if running in Electron
  isElectron: true,

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

  // Auto-updater controls
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
  }
})

// Override the browser Notification API with native notifications
window.addEventListener('DOMContentLoaded', () => {
  // Store original Notification
  const OriginalNotification = window.Notification

  // Create custom Notification class that uses Electron's native notifications
  class ElectronNotification {
    constructor(title, options = {}) {
      this.title = title
      this.body = options.body || ''

      // Show native notification
      ipcRenderer.invoke('show-notification', {
        title: this.title,
        body: this.body
      })
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
})

// Log that preload script loaded
console.log('Aetherium Desktop preload script loaded')
