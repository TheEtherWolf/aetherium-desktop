'use strict';

const { contextBridge, ipcRenderer } = require('electron');

// Channel names match IPC.* constants in src/constants.js
contextBridge.exposeInMainWorld('overlayAPI', {
  // Receive events from main process
  onShowOverlay: (callback) => {
    // IPC.SHOW_OVERLAY = 'show-overlay'
    ipcRenderer.removeAllListeners('show-overlay');
    ipcRenderer.on('show-overlay', (_event, data) => callback(data));
  },
  onShowActiveCall: (callback) => {
    // IPC.SHOW_ACTIVE_CALL = 'show-active-call'
    ipcRenderer.removeAllListeners('show-active-call');
    ipcRenderer.on('show-active-call', (_event, data) => callback(data));
  },
  onUpdateActiveCall: (callback) => {
    // IPC.UPDATE_ACTIVE_CALL = 'update-active-call'
    ipcRenderer.removeAllListeners('update-active-call');
    ipcRenderer.on('update-active-call', (_event, data) => callback(data));
  },
  onHideActiveCall: (callback) => {
    // IPC.HIDE_ACTIVE_CALL = 'hide-active-call'
    ipcRenderer.removeAllListeners('hide-active-call');
    ipcRenderer.on('hide-active-call', (_event) => callback());
  },
  onThemeUpdate: (callback) => {
    // IPC.OVERLAY_THEME_UPDATE = 'overlay-theme-update'
    ipcRenderer.removeAllListeners('overlay-theme-update');
    ipcRenderer.on('overlay-theme-update', (_event, theme) => callback(theme));
  },

  // Send events to main process
  sendOverlayClicked: (data) => {
    // IPC.OVERLAY_CLICKED = 'overlay-clicked'
    ipcRenderer.send('overlay-clicked', data);
  },
  sendAnswerCall: () => {
    // IPC.OVERLAY_ANSWER_CALL = 'overlay-answer-call'
    ipcRenderer.send('overlay-answer-call');
  },
  sendDeclineCall: () => {
    // IPC.OVERLAY_DECLINE_CALL = 'overlay-decline-call'
    ipcRenderer.send('overlay-decline-call');
  },
  sendDismiss: () => {
    // IPC.OVERLAY_DISMISS = 'overlay-dismiss'
    ipcRenderer.send('overlay-dismiss');
  },
  setInteractive: (interactive) => {
    // IPC.SET_OVERLAY_INTERACTIVE = 'set-overlay-interactive'
    ipcRenderer.send('set-overlay-interactive', !!interactive);
  },
  sendActiveCallClicked: () => {
    // IPC.ACTIVE_CALL_CLICKED = 'active-call-clicked'
    ipcRenderer.send('active-call-clicked');
  },
  sendMute: () => {
    // IPC.ACTIVE_CALL_MUTE = 'active-call-mute'
    ipcRenderer.send('active-call-mute');
  },
  sendHangup: () => {
    // IPC.ACTIVE_CALL_HANGUP = 'active-call-hangup'
    ipcRenderer.send('active-call-hangup');
  },
});
