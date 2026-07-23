'use strict';

const { app } = require('electron');
const fs = require('fs');
const path = require('path');

const logFile = path.join(app.getPath('userData'), 'overlay-debug.log');

function debugLog(...args) {
  const timestamp = new Date().toISOString();
  const message = `[${timestamp}] ${args.join(' ')}\n`;
  fs.appendFile(logFile, message, (err) => {
    if (err) console.error('[Logger] Failed to write log:', err.message);
  });
  console.log(...args);
}

// Persistent crash log — APPENDED, never truncated on start, so crash history
// survives across sessions/reloads for diagnosis.
const crashFile = path.join(app.getPath('userData'), 'crashes.log');

function crashLog(...args) {
  const timestamp = new Date().toISOString();
  const line = `[${timestamp}] ${args.join(' ')}\n`;
  try { fs.appendFileSync(crashFile, line); } catch { /* best effort */ }
  debugLog('CRASH:', ...args);
}

function initLog() {
  fs.writeFileSync(logFile, `=== Aetherium Desktop Started ${new Date().toISOString()} ===\n`);
  debugLog('Log file:', logFile);
  debugLog('Crash log:', crashFile);
  debugLog('App version:', app.getVersion());
}

module.exports = { debugLog, initLog, crashLog };
