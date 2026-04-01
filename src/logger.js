'use strict';

const { app } = require('electron');
const fs = require('fs');
const path = require('path');

const logFile = path.join(app.getPath('userData'), 'overlay-debug.log');

function debugLog(...args) {
  const timestamp = new Date().toISOString();
  const message = `[${timestamp}] ${args.join(' ')}\n`;
  fs.appendFileSync(logFile, message);
  console.log(...args);
}

function initLog() {
  fs.writeFileSync(logFile, `=== Aetherium Desktop Started ${new Date().toISOString()} ===\n`);
  debugLog('Log file:', logFile);
  debugLog('App version:', app.getVersion());
}

module.exports = { debugLog, initLog };
