const { app, BrowserWindow, shell, Menu, Tray, nativeImage, globalShortcut, Notification, ipcMain, screen, desktopCapturer } = require('electron')
const path = require('path')
const { autoUpdater } = require('electron-updater')

// The URL of the deployed Aetherium web app
const AETHERIUM_URL = 'https://aetherium-89dr.onrender.com/'

let mainWindow
let tray = null
let overlayWindow = null
let overlayEnabled = true // Can be toggled from settings

// Prevent multiple instances
const gotTheLock = app.requestSingleInstanceLock()

if (!gotTheLock) {
  app.quit()
} else {
  app.on('second-instance', (event, commandLine, workingDirectory) => {
    if (mainWindow) {
      mainWindow.setSkipTaskbar(false)
      mainWindow.show()
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.setAlwaysOnTop(true)
      mainWindow.focus()
      mainWindow.setAlwaysOnTop(false)
      mainWindow.flashFrame(true)
      setTimeout(() => { if (mainWindow) mainWindow.flashFrame(false) }, 3000)
      mainWindow.webContents.send('window-shown')
    }
  })
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    icon: path.join(__dirname, 'resources', 'icon.png'),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    },
    frame: false,
    titleBarStyle: 'hidden',
    show: false,
    backgroundColor: '#1a1a2e'
  })

  Menu.setApplicationMenu(null)
  mainWindow.loadURL(AETHERIUM_URL)

  mainWindow.once('ready-to-show', () => {
    mainWindow.show()
    if (app.isPackaged) {
      autoUpdater.checkForUpdatesAndNotify()
    }
  })

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (!url.startsWith(AETHERIUM_URL)) {
      shell.openExternal(url)
      return { action: 'deny' }
    }
    return { action: 'allow' }
  })

  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith(AETHERIUM_URL)) {
      event.preventDefault()
      shell.openExternal(url)
    }
  })

  mainWindow.on('closed', () => { mainWindow = null })

  mainWindow.on('close', (event) => {
    if (!app.isQuitting) {
      event.preventDefault()
      mainWindow.hide()
    }
    return false
  })

  mainWindow.on('show', () => mainWindow.webContents.send('window-shown'))
  mainWindow.on('restore', () => mainWindow.webContents.send('window-shown'))
  mainWindow.on('maximize', () => mainWindow.webContents.send('window-maximized-change', true))
  mainWindow.on('unmaximize', () => mainWindow.webContents.send('window-maximized-change', false))
}

function createTray() {
  const iconPath = path.join(__dirname, 'resources', 'icon.png')
  const trayIcon = nativeImage.createFromPath(iconPath)
  tray = new Tray(trayIcon.resize({ width: 32, height: 32 }))

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Open Aetherium',
      click: () => {
        if (mainWindow) {
          mainWindow.show()
          mainWindow.focus()
          mainWindow.webContents.send('window-shown')
        }
      }
    },
    {
      label: 'Toggle Overlay',
      type: 'checkbox',
      checked: overlayEnabled,
      click: (menuItem) => {
        overlayEnabled = menuItem.checked
        if (mainWindow) {
          mainWindow.webContents.send('overlay-enabled-change', overlayEnabled)
        }
      }
    },
    { type: 'separator' },
    {
      label: 'Toggle Fullscreen',
      accelerator: 'F11',
      click: () => {
        if (mainWindow) {
          mainWindow.setFullScreen(!mainWindow.isFullScreen())
          mainWindow.show()
          mainWindow.focus()
        }
      }
    },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => {
        app.isQuitting = true
        app.quit()
      }
    }
  ])

  tray.setToolTip('Aetherium')
  tray.setContextMenu(contextMenu)

  tray.on('click', () => {
    if (mainWindow) {
      if (mainWindow.isVisible() && mainWindow.isFocused()) {
        mainWindow.hide()
      } else {
        mainWindow.show()
        mainWindow.focus()
        mainWindow.webContents.send('window-shown')
      }
    }
  })
}

// ============================================
// Gaming Overlay System
// ============================================

function createOverlayWindow() {
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    return overlayWindow
  }

  const display = screen.getPrimaryDisplay()
  const { width: screenW, height: screenH } = display.workAreaSize

  overlayWindow = new BrowserWindow({
    width: 400,
    height: screenH,
    x: screenW - 400,
    y: 0,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    focusable: false,
    hasShadow: false,
    show: false,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  })

  // Make click-through except on actual UI elements
  overlayWindow.setIgnoreMouseEvents(true, { forward: true })

  overlayWindow.loadFile(path.join(__dirname, 'overlay.html'))

  overlayWindow.on('closed', () => {
    overlayWindow = null
  })

  return overlayWindow
}

function showOverlay(data) {
  if (!overlayEnabled) {
    // Overlay disabled, use native notification instead
    if (Notification.isSupported()) {
      const notification = new Notification({
        title: data.title || 'Aetherium',
        body: data.body || '',
        icon: path.join(__dirname, 'resources', 'icon.png')
      })
      notification.on('click', () => {
        if (mainWindow) {
          mainWindow.show()
          mainWindow.focus()
        }
      })
      notification.show()
    }
    return
  }

  const overlay = createOverlayWindow()
  
  if (!overlay.isVisible()) {
    overlay.showInactive()
  }

  // Enable mouse events on overlay cards
  overlay.setIgnoreMouseEvents(false)

  overlay.webContents.send('show-overlay', data)
}

function dismissOverlay() {
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    overlayWindow.hide()
    // Re-enable click-through when no notifications
    overlayWindow.setIgnoreMouseEvents(true, { forward: true })
  }
}

// Overlay IPC handlers
ipcMain.on('overlay-clicked', (event, data) => {
  if (mainWindow) {
    mainWindow.show()
    mainWindow.focus()
    mainWindow.webContents.send('window-shown')
    if (data?.conversationId) {
      mainWindow.webContents.send('navigate-to-conversation', data.conversationId)
    }
  }
})

ipcMain.on('overlay-answer-call', () => {
  if (mainWindow) {
    mainWindow.show()
    mainWindow.focus()
    mainWindow.webContents.send('window-shown')
    mainWindow.webContents.send('overlay-action', { action: 'answer-call' })
  }
})

ipcMain.on('overlay-decline-call', () => {
  if (mainWindow) {
    mainWindow.webContents.send('overlay-action', { action: 'decline-call' })
  }
})

ipcMain.on('overlay-dismiss', () => {
  dismissOverlay()
})

// ============================================
// Active Call Overlay
// ============================================
let activeCallData = null

function showActiveCallOverlay(data) {
  if (!overlayEnabled) return
  
  activeCallData = data
  const overlay = createOverlayWindow()
  
  if (!overlay.isVisible()) {
    overlay.showInactive()
  }
  overlay.setIgnoreMouseEvents(false)
  overlay.webContents.send('show-active-call', data)
}

function updateActiveCallOverlay(data) {
  if (!overlayWindow || overlayWindow.isDestroyed()) return
  activeCallData = { ...activeCallData, ...data }
  overlayWindow.webContents.send('update-active-call', data)
}

function hideActiveCallOverlay() {
  activeCallData = null
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    overlayWindow.webContents.send('hide-active-call')
  }
}

// Active call IPC handlers
ipcMain.on('active-call-clicked', () => {
  if (mainWindow) {
    mainWindow.show()
    mainWindow.focus()
    mainWindow.webContents.send('window-shown')
  }
})

ipcMain.on('active-call-mute', () => {
  if (mainWindow) {
    mainWindow.webContents.send('overlay-action', { action: 'toggle-mute' })
  }
})

ipcMain.on('active-call-hangup', () => {
  hideActiveCallOverlay()
  if (mainWindow) {
    mainWindow.webContents.send('overlay-action', { action: 'hangup' })
  }
})

// Handlers for renderer to control active call overlay
ipcMain.handle('show-active-call-overlay', (event, data) => {
  // Only show when window is not focused
  if (mainWindow && (!mainWindow.isVisible() || mainWindow.isMinimized() || !mainWindow.isFocused())) {
    showActiveCallOverlay(data)
    return true
  }
  return false
})

ipcMain.handle('update-active-call-overlay', (event, data) => {
  updateActiveCallOverlay(data)
  return true
})

ipcMain.handle('hide-active-call-overlay', () => {
  hideActiveCallOverlay()
  return true
})

// Handler for renderer to show overlay notifications
ipcMain.handle('show-overlay-notification', (event, data) => {
  console.log('[Overlay] show-overlay-notification called:', data)
  console.log('[Overlay] overlayEnabled:', overlayEnabled)
  console.log('[Overlay] mainWindow exists:', !!mainWindow)
  if (mainWindow) {
    console.log('[Overlay] isVisible:', mainWindow.isVisible())
    console.log('[Overlay] isMinimized:', mainWindow.isMinimized())
    console.log('[Overlay] isFocused:', mainWindow.isFocused())
  }
  
  // Only show overlay when window is hidden/minimized/unfocused
  if (mainWindow && (!mainWindow.isVisible() || mainWindow.isMinimized() || !mainWindow.isFocused())) {
    console.log('[Overlay] Showing overlay!')
    showOverlay(data)
    return true
  }
  console.log('[Overlay] NOT showing overlay - window is focused/visible')
  return false
})

// Toggle overlay from renderer
ipcMain.handle('set-overlay-enabled', (event, enabled) => {
  overlayEnabled = enabled
  // Update tray menu
  if (tray) {
    const menu = tray.getContextMenu ? tray.getContextMenu() : null
    // Rebuild tray menu with new state
    createTray()
  }
  return overlayEnabled
})

ipcMain.handle('get-overlay-enabled', () => {
  return overlayEnabled
})

// ============================================
// Auto-updater
// ============================================
autoUpdater.autoDownload = true
autoUpdater.autoInstallOnAppQuit = true

autoUpdater.on('checking-for-update', () => console.log('Checking for updates...'))

autoUpdater.on('update-available', (info) => {
  console.log('Update available:', info.version)
  if (mainWindow) {
    mainWindow.webContents.send('update-available', { version: info.version, releaseNotes: info.releaseNotes })
  }
  if (Notification.isSupported()) {
    new Notification({
      title: 'Aetherium Update Available',
      body: `Version ${info.version} is downloading...`,
      icon: path.join(__dirname, 'resources', 'icon.png')
    }).show()
  }
})

autoUpdater.on('update-not-available', () => console.log('App is up to date'))

autoUpdater.on('download-progress', (progress) => {
  console.log(`Download progress: ${Math.round(progress.percent)}%`)
  if (mainWindow) {
    mainWindow.webContents.send('update-progress', { percent: progress.percent, transferred: progress.transferred, total: progress.total })
  }
})

autoUpdater.on('update-downloaded', (info) => {
  console.log('Update downloaded:', info.version)
  if (mainWindow) {
    mainWindow.webContents.send('update-downloaded', { version: info.version })
  }
  if (Notification.isSupported()) {
    const notification = new Notification({
      title: 'Aetherium Update Ready',
      body: `Version ${info.version} is ready. Click to restart.`,
      icon: path.join(__dirname, 'resources', 'icon.png')
    })
    notification.on('click', () => autoUpdater.quitAndInstall(false, true))
    notification.show()
  }
})

autoUpdater.on('error', (err) => {
  console.error('Auto-updater error:', err)
  if (mainWindow) mainWindow.webContents.send('update-error', { message: err.message })
})

// ============================================
// Screen Sharing
// ============================================
let screenPickerWindow = null

async function getScreenSources() {
  try {
    const sources = await desktopCapturer.getSources({
      types: ['screen', 'window'],
      thumbnailSize: { width: 320, height: 180 },
      fetchWindowIcons: true
    })
    return sources.map(source => ({
      id: source.id,
      name: source.name,
      thumbnail: source.thumbnail.toDataURL(),
      appIcon: source.appIcon ? source.appIcon.toDataURL() : null,
      type: source.id.startsWith('screen:') ? 'screen' : 'window'
    }))
  } catch (err) {
    console.error('Failed to get screen sources:', err)
    return []
  }
}

function createScreenPickerWindow() {
  return new Promise((resolve) => {
    if (screenPickerWindow && !screenPickerWindow.isDestroyed()) {
      screenPickerWindow.close()
    }

    const display = screen.getPrimaryDisplay()
    const { width: screenW, height: screenH } = display.workAreaSize
    const pickerW = 800, pickerH = 600

    screenPickerWindow = new BrowserWindow({
      width: pickerW,
      height: pickerH,
      x: Math.round((screenW - pickerW) / 2),
      y: Math.round((screenH - pickerH) / 2),
      parent: mainWindow,
      modal: true,
      frame: false,
      transparent: false,
      resizable: false,
      backgroundColor: '#1e1f22',
      webPreferences: { nodeIntegration: true, contextIsolation: false }
    })

    screenPickerWindow.loadFile(path.join(__dirname, 'screen-picker.html'))

    ipcMain.once('screen-picker-select', (event, sourceId) => {
      screenPickerWindow.close()
      screenPickerWindow = null
      resolve(sourceId)
    })

    ipcMain.once('screen-picker-cancel', () => {
      screenPickerWindow.close()
      screenPickerWindow = null
      resolve(null)
    })

    screenPickerWindow.on('closed', () => {
      screenPickerWindow = null
      ipcMain.removeAllListeners('screen-picker-select')
      ipcMain.removeAllListeners('screen-picker-cancel')
      resolve(null)
    })
  })
}

ipcMain.handle('get-screen-sources', async () => await getScreenSources())
ipcMain.handle('open-screen-picker', async () => await createScreenPickerWindow())
ipcMain.handle('get-source-stream', async (event, sourceId, constraints) => ({ sourceId, constraints }))

// ============================================
// Auto-Updater Events
// ============================================
autoUpdater.autoDownload = true
autoUpdater.autoInstallOnAppQuit = true

autoUpdater.on('checking-for-update', () => {
  console.log('[AutoUpdater] Checking for updates...')
})

autoUpdater.on('update-available', (info) => {
  console.log('[AutoUpdater] Update available:', info.version)
  // Notify the renderer about the update
  if (mainWindow) {
    mainWindow.webContents.send('update-available', {
      currentVersion: app.getVersion(),
      newVersion: info.version
    })
  }
  // Show system notification
  if (Notification.isSupported()) {
    const notification = new Notification({
      title: 'Aetherium Update Available',
      body: `Version ${info.version} is available. Downloading...`,
      icon: path.join(__dirname, 'resources', 'icon.png')
    })
    notification.show()
  }
})

autoUpdater.on('update-not-available', () => {
  console.log('[AutoUpdater] App is up to date')
})

autoUpdater.on('download-progress', (progress) => {
  console.log(`[AutoUpdater] Download progress: ${Math.round(progress.percent)}%`)
  if (mainWindow) {
    mainWindow.webContents.send('update-progress', progress.percent)
  }
})

autoUpdater.on('update-downloaded', (info) => {
  console.log('[AutoUpdater] Update downloaded:', info.version)
  // Notify user and offer to restart
  if (Notification.isSupported()) {
    const notification = new Notification({
      title: 'Aetherium Update Ready',
      body: `Version ${info.version} has been downloaded. Click to restart and update.`,
      icon: path.join(__dirname, 'resources', 'icon.png')
    })
    notification.on('click', () => {
      autoUpdater.quitAndInstall(false, true)
    })
    notification.show()
  }
  // Also notify renderer
  if (mainWindow) {
    mainWindow.webContents.send('update-ready', info.version)
  }
})

autoUpdater.on('error', (err) => {
  console.error('[AutoUpdater] Error:', err)
})

// IPC handler for manual update install
ipcMain.on('install-update', () => {
  autoUpdater.quitAndInstall(false, true)
})

// ============================================
// App Lifecycle
// ============================================
app.whenReady().then(() => {
  createWindow()
  createTray()

  globalShortcut.register('F11', () => {
    if (mainWindow) mainWindow.setFullScreen(!mainWindow.isFullScreen())
  })

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    } else if (mainWindow) {
      mainWindow.show()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', () => {
  app.isQuitting = true
  globalShortcut.unregisterAll()
})

// ============================================
// IPC Handlers
// ============================================
ipcMain.handle('show-notification', (event, { title, body }) => {
  if (Notification.isSupported()) {
    const notification = new Notification({
      title: title || 'Aetherium',
      body: body || '',
      icon: path.join(__dirname, 'resources', 'icon.png')
    })
    notification.on('click', () => {
      if (mainWindow) { mainWindow.show(); mainWindow.focus() }
    })
    notification.show()
    return true
  }
  return false
})

// Window controls
ipcMain.on('window-minimize', () => { if (mainWindow) mainWindow.minimize() })
ipcMain.on('window-maximize', () => {
  if (mainWindow) {
    if (mainWindow.isMaximized()) mainWindow.unmaximize()
    else mainWindow.maximize()
  }
})
ipcMain.on('window-close', () => { if (mainWindow) mainWindow.close() })
ipcMain.handle('window-is-maximized', () => mainWindow ? mainWindow.isMaximized() : false)

// Updates
ipcMain.on('install-update', () => autoUpdater.quitAndInstall(false, true))
ipcMain.handle('check-for-updates', async () => {
  try {
    const result = await autoUpdater.checkForUpdates()
    return { success: true, updateInfo: result?.updateInfo }
  } catch (err) {
    return { success: false, error: err.message }
  }
})

ipcMain.handle('get-app-version', () => app.getVersion())

ipcMain.handle('clear-cache-and-reload', async () => {
  if (mainWindow) {
    try {
      await mainWindow.webContents.session.clearCache()
      await mainWindow.webContents.session.clearStorageData({ storages: ['cachestorage', 'serviceworkers'] })
      mainWindow.webContents.reloadIgnoringCache()
      return { success: true }
    } catch (err) {
      console.error('Failed to clear cache:', err)
      return { success: false, error: err.message }
    }
  }
  return { success: false, error: 'No window' }
})
