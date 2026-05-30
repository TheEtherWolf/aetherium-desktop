'use strict';

const fs = require('fs');
const path = require('path');
const { app } = require('electron');

const SETTINGS_FILE = path.join(app.getPath('userData'), 'aetherium-settings.json');

let cache = null;

function readSettings() {
  if (cache) return cache;
  try {
    cache = JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf-8'));
  } catch (err) {
    if (err.code !== 'ENOENT') {
      // File exists but could not be parsed — log and back up the corrupt file
      console.error('[Settings] Failed to parse settings file:', err.message);
      try {
        const backupPath = SETTINGS_FILE + '.corrupt.' + Date.now();
        fs.copyFileSync(SETTINGS_FILE, backupPath);
        console.error('[Settings] Corrupt file backed up to:', backupPath);
      } catch (backupErr) {
        console.error('[Settings] Could not back up corrupt file:', backupErr.message);
      }
    }
    cache = {};
  }
  return cache;
}

function writeSettings(settings) {
  cache = settings;
  try {
    fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2), 'utf-8');
  } catch (err) {
    console.error('Failed to write settings:', err);
  }
}

function get(key, defaultValue) {
  const settings = readSettings();
  return key in settings ? settings[key] : defaultValue;
}

function set(key, value) {
  const settings = readSettings();
  settings[key] = value;
  writeSettings(settings);
}

module.exports = { get, set, readSettings };
