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
  } catch {
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
