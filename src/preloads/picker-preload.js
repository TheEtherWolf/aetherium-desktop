'use strict';

const { contextBridge, ipcRenderer } = require('electron');

// Channel names match IPC.* constants in src/constants.js
contextBridge.exposeInMainWorld('pickerAPI', {
  getSources: () => {
    // IPC.GET_SCREEN_SOURCES = 'get-screen-sources'
    return ipcRenderer.invoke('get-screen-sources');
  },
  selectSource: (sourceId) => {
    // IPC.SCREEN_PICKER_SELECT = 'screen-picker-select'
    ipcRenderer.send('screen-picker-select', sourceId);
  },
  cancel: () => {
    // IPC.SCREEN_PICKER_CANCEL = 'screen-picker-cancel'
    ipcRenderer.send('screen-picker-cancel');
  },
});
