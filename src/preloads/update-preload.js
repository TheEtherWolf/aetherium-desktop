'use strict';

const { contextBridge, ipcRenderer } = require('electron');

// Channel names match IPC.* constants in src/constants.js
contextBridge.exposeInMainWorld('updateAPI', {
  // Receive events from main process
  onUpdateInfo: (callback) => {
    // IPC.UPDATE_INFO = 'update-info'
    ipcRenderer.on('update-info', (_event, data) => callback(data));
  },
  onDownloadProgress: (callback) => {
    // IPC.DOWNLOAD_PROGRESS = 'download-progress'
    ipcRenderer.on('download-progress', (_event, data) => callback(data));
  },
  onUpdateDownloaded: (callback) => {
    // IPC.UPDATE_DOWNLOADED = 'update-downloaded'
    ipcRenderer.on('update-downloaded', (_event, data) => callback(data));
  },
  onUpdateError: (callback) => {
    // IPC.UPDATE_ERROR = 'update-error'
    ipcRenderer.on('update-error', (_event, data) => callback(data));
  },

  // Send events to main process
  startDownload: () => {
    // IPC.START_UPDATE_DOWNLOAD = 'start-update-download'
    ipcRenderer.send('start-update-download');
  },
  installUpdate: () => {
    // IPC.INSTALL_UPDATE = 'install-update'
    ipcRenderer.send('install-update');
  },
  later: () => {
    // IPC.UPDATE_LATER = 'update-later'
    ipcRenderer.send('update-later');
  },
});
