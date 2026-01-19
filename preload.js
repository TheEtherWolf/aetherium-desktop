// Preload script for Electron
// This runs in the renderer process before the web page loads

const { contextBridge, ipcRenderer } = require('electron')

// Expose a limited API to the renderer process
contextBridge.exposeInMainWorld('electronAPI', {
  // Get app version
  getVersion: () => process.env.npm_package_version || '1.0.0',

  // Platform info
  platform: process.platform,

  // Notification support
  isNotificationsSupported: () => true
})

// Log that preload script loaded
console.log('Aetherium Desktop preload script loaded')
