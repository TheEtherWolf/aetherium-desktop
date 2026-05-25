'use strict';

const { app, nativeImage } = require('electron');
const { getMainWindow } = require('./window-manager');

function createBadgeOverlay(count) {
  const text = count > 99 ? '99+' : String(count);
  const fontSize = text.length > 2 ? 8 : text.length > 1 ? 10 : 12;
  const y = fontSize > 8 ? 12 : 11;
  const svg = `<svg width="16" height="16" xmlns="http://www.w3.org/2000/svg">
    <circle cx="8" cy="8" r="8" fill="#ed4245"/>
    <text x="8" y="${y}" text-anchor="middle" font-size="${fontSize}" font-family="sans-serif" fill="white" font-weight="bold">${text}</text>
  </svg>`;
  return nativeImage.createFromDataURL(
    `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
  );
}

function setBadgeCount(count) {
  if (process.platform === 'win32') {
    const win = getMainWindow();
    if (!win) return;
    if (count === 0) {
      win.setOverlayIcon(null, '');
    } else {
      win.setOverlayIcon(createBadgeOverlay(count), `${count} unread messages`);
    }
    return;
  }

  // macOS dock badge / Linux Unity
  app.setBadgeCount(count);
}

module.exports = { setBadgeCount };
