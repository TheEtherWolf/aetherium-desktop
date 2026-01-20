// Preload script for Electron
// This runs in the renderer process before the web page loads

const { contextBridge, ipcRenderer } = require('electron')

// Expose a limited API to the renderer process
contextBridge.exposeInMainWorld('electronAPI', {
  // Get app version
  getVersion: () => process.env.npm_package_version || '1.0.0',

  // Platform info
  platform: process.platform,

  // Show native notification
  showNotification: (title, body) => ipcRenderer.invoke('show-notification', { title, body }),

  // Listen for window shown event (for reconnecting calls when restored from tray)
  onWindowShown: (callback) => {
    ipcRenderer.on('window-shown', () => callback())
  },

  // Check if running in Electron
  isElectron: true
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
