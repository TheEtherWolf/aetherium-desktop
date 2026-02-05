const { app, BrowserWindow, shell, Menu, Tray, nativeImage, globalShortcut, Notification, ipcMain, screen, desktopCapturer } = require('electron')
const path = require('path')
const { autoUpdater } = require('electron-updater')

// The URL of the deployed Aetherium web app
const AETHERIUM_URL = 'https://aetherium-chat.onrender.com/'

let mainWindow
let tray = null
let overlayWindow = null

// Prevent multiple instances - but show window when second instance tries to launch
const gotTheLock = app.requestSingleInstanceLock()

if (!gotTheLock) {
  // Second instance - quit immediately, first instance will handle showing window
  app.quit()
} else {
  // First instance - handle when second instance tries to launch
  app.on('second-instance', (event, commandLine, workingDirectory) => {
    // Always show and focus the window when user runs the EXE again
    if (mainWindow) {
      // Ensure window is not hidden in taskbar
      mainWindow.setSkipTaskbar(false)
      // Show window (even if in tray)
      mainWindow.show()
      // Restore if minimized
      if (mainWindow.isMinimized()) {
        mainWindow.restore()
      }
      // Bring to front and focus
      mainWindow.setAlwaysOnTop(true)
      mainWindow.focus()
      mainWindow.setAlwaysOnTop(false)
      // Flash taskbar to get attention
      mainWindow.flashFrame(true)
      setTimeout(() => {
        if (mainWindow) mainWindow.flashFrame(false)
      }, 3000)
      // Notify renderer that window is visible (for call reconnection)
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
    frame: false,              // Remove native frame for custom title bar
    titleBarStyle: 'hidden',   // Hide default title bar
    show: false,
    backgroundColor: '#1a1a2e'
  })

  // Remove the menu bar
  Menu.setApplicationMenu(null)

  // Load the Aetherium web app
  mainWindow.loadURL(AETHERIUM_URL)

  // Show window when ready
  mainWindow.once('ready-to-show', () => {
    mainWindow.show()

    // Check for updates after window is shown
    if (app.isPackaged) {
      autoUpdater.checkForUpdatesAndNotify()
    }
  })

  // Open external links in browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (!url.startsWith(AETHERIUM_URL)) {
      shell.openExternal(url)
      return { action: 'deny' }
    }
    return { action: 'allow' }
  })

  // Handle navigation to external sites
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith(AETHERIUM_URL)) {
      event.preventDefault()
      shell.openExternal(url)
    }
  })

  mainWindow.on('closed', () => {
    mainWindow = null
  })

  // Minimize to tray
  mainWindow.on('minimize', () => {
    // Don't hide to tray on minimize for now
  })

  mainWindow.on('close', (event) => {
    if (!app.isQuitting) {
      event.preventDefault()
      mainWindow.hide()
    }
    return false
  })

  // Notify renderer when window becomes visible (for call reconnection)
  mainWindow.on('show', () => {
    mainWindow.webContents.send('window-shown')
  })

  mainWindow.on('restore', () => {
    mainWindow.webContents.send('window-shown')
  })

  // Notify renderer of maximize state changes for title bar button
  mainWindow.on('maximize', () => {
    mainWindow.webContents.send('window-maximized-change', true)
  })
  mainWindow.on('unmaximize', () => {
    mainWindow.webContents.send('window-maximized-change', false)
  })
}

function createTray() {
  const iconPath = path.join(__dirname, 'resources', 'icon.png')
  const trayIcon = nativeImage.createFromPath(iconPath)
  // Use 32x32 for better clarity on high DPI displays (Windows scales down as needed)
  tray = new Tray(trayIcon.resize({ width: 32, height: 32 }))

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Open Aetherium',
      click: () => {
        if (mainWindow) {
          mainWindow.show()
          mainWindow.focus()
          // Notify renderer that window is now visible (for call reconnection)
          mainWindow.webContents.send('window-shown')
        }
      }
    },
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
      if (mainWindow.isVisible()) {
        mainWindow.hide()
      } else {
        mainWindow.show()
        mainWindow.focus()
        // Notify renderer that window is now visible (for call reconnection)
        mainWindow.webContents.send('window-shown')
      }
    }
  })
}

// ============================================
// Notification Overlay System
// ============================================

function showOverlay(data) {
  // Close existing overlay
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    overlayWindow.close()
    overlayWindow = null
  }

  const display = screen.getPrimaryDisplay()
  const { width: screenW, height: screenH } = display.workAreaSize

  const overlayW = 380
  const overlayH = data.type === 'call' ? 80 : 70

  overlayWindow = new BrowserWindow({
    width: overlayW,
    height: overlayH,
    x: screenW - overlayW - 16,
    y: screenH - overlayH - 16,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    focusable: false,
    show: false,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  })

  overlayWindow.loadFile(path.join(__dirname, 'overlay.html'))

  overlayWindow.once('ready-to-show', () => {
    overlayWindow.showInactive()
    overlayWindow.webContents.send('show-overlay', data)
  })

  overlayWindow.on('closed', () => {
    overlayWindow = null
  })
}

function dismissOverlay() {
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    overlayWindow.close()
    overlayWindow = null
  }
}

// Overlay IPC handlers
ipcMain.on('overlay-clicked', () => {
  dismissOverlay()
  if (mainWindow) {
    mainWindow.show()
    mainWindow.focus()
    mainWindow.webContents.send('window-shown')
  }
})

ipcMain.on('overlay-answer-call', () => {
  dismissOverlay()
  if (mainWindow) {
    mainWindow.show()
    mainWindow.focus()
    mainWindow.webContents.send('window-shown')
    mainWindow.webContents.send('overlay-action', { action: 'answer-call' })
  }
})

ipcMain.on('overlay-decline-call', () => {
  dismissOverlay()
  if (mainWindow) {
    mainWindow.webContents.send('overlay-action', { action: 'decline-call' })
  }
})

ipcMain.on('overlay-dismiss', () => {
  dismissOverlay()
})

// Handler for renderer to show overlay notifications
ipcMain.handle('show-overlay-notification', (event, data) => {
  // Only show overlay when window is hidden or minimized
  if (mainWindow && (!mainWindow.isVisible() || mainWindow.isMinimized() || !mainWindow.isFocused())) {
    showOverlay(data)
    return true
  }
  return false
})

// ============================================
// Auto-updater configuration
// ============================================
autoUpdater.autoDownload = true
autoUpdater.autoInstallOnAppQuit = true

// Auto-updater events
autoUpdater.on('checking-for-update', () => {
  console.log('Checking for updates...')
})

autoUpdater.on('update-available', (info) => {
  console.log('Update available:', info.version)
  // Notify user that an update is downloading
  if (mainWindow) {
    mainWindow.webContents.send('update-available', {
      version: info.version,
      releaseNotes: info.releaseNotes
    })
  }
  // Show system notification
  if (Notification.isSupported()) {
    new Notification({
      title: 'Aetherium Update Available',
      body: `Version ${info.version} is downloading...`,
      icon: path.join(__dirname, 'resources', 'icon.png')
    }).show()
  }
})

autoUpdater.on('update-not-available', () => {
  console.log('App is up to date')
})

autoUpdater.on('download-progress', (progress) => {
  console.log(`Download progress: ${Math.round(progress.percent)}%`)
  if (mainWindow) {
    mainWindow.webContents.send('update-progress', {
      percent: progress.percent,
      transferred: progress.transferred,
      total: progress.total
    })
  }
})

autoUpdater.on('update-downloaded', (info) => {
  console.log('Update downloaded:', info.version)
  // Notify user and let them choose when to restart
  if (mainWindow) {
    mainWindow.webContents.send('update-downloaded', {
      version: info.version
    })
  }
  // Show system notification with action
  if (Notification.isSupported()) {
    const notification = new Notification({
      title: 'Aetherium Update Ready',
      body: `Version ${info.version} is ready to install. Click to restart now.`,
      icon: path.join(__dirname, 'resources', 'icon.png')
    })
    notification.on('click', () => {
      autoUpdater.quitAndInstall(false, true)
    })
    notification.show()
  }
})

autoUpdater.on('error', (err) => {
  console.error('Auto-updater error:', err)
  if (mainWindow) {
    mainWindow.webContents.send('update-error', {
      message: err.message
    })
  }
})

// ============================================
// Custom Screen Picker for Screen Sharing
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

    const pickerW = 800
    const pickerH = 600

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
      webPreferences: {
        nodeIntegration: true,
        contextIsolation: false
      }
    })

    screenPickerWindow.loadFile(path.join(__dirname, 'screen-picker.html'))

    // Handle source selection
    ipcMain.once('screen-picker-select', (event, sourceId) => {
      screenPickerWindow.close()
      screenPickerWindow = null
      resolve(sourceId)
    })

    // Handle cancel
    ipcMain.once('screen-picker-cancel', () => {
      screenPickerWindow.close()
      screenPickerWindow = null
      resolve(null)
    })

    screenPickerWindow.on('closed', () => {
      screenPickerWindow = null
      // Clean up listeners if window closed without selection
      ipcMain.removeAllListeners('screen-picker-select')
      ipcMain.removeAllListeners('screen-picker-cancel')
      resolve(null)
    })
  })
}

// IPC handler to get screen sources
ipcMain.handle('get-screen-sources', async () => {
  return await getScreenSources()
})

// IPC handler to open screen picker
ipcMain.handle('open-screen-picker', async () => {
  const sourceId = await createScreenPickerWindow()
  return sourceId
})

// IPC handler to get stream from source ID
ipcMain.handle('get-source-stream', async (event, sourceId, constraints) => {
  // This will be handled by the renderer using the sourceId
  // The main process just returns the sourceId, renderer uses navigator.mediaDevices.getUserMedia
  return { sourceId, constraints }
})

app.whenReady().then(() => {
  createWindow()
  createTray()

  // Register F11 for fullscreen toggle
  globalShortcut.register('F11', () => {
    if (mainWindow) {
      mainWindow.setFullScreen(!mainWindow.isFullScreen())
    }
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
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('before-quit', () => {
  app.isQuitting = true
  globalShortcut.unregisterAll()
})

// Handle notification requests from renderer
ipcMain.handle('show-notification', (event, { title, body }) => {
  if (Notification.isSupported()) {
    const notification = new Notification({
      title: title || 'Aetherium',
      body: body || '',
      icon: path.join(__dirname, 'resources', 'icon.png')
    })

    notification.on('click', () => {
      if (mainWindow) {
        mainWindow.show()
        mainWindow.focus()
      }
    })

    notification.show()
    return true
  }
  return false
})

// Custom title bar window controls
ipcMain.on('window-minimize', () => {
  if (mainWindow) mainWindow.minimize()
})

ipcMain.on('window-maximize', () => {
  if (mainWindow) {
    if (mainWindow.isMaximized()) {
      mainWindow.unmaximize()
    } else {
      mainWindow.maximize()
    }
  }
})

ipcMain.on('window-close', () => {
  if (mainWindow) mainWindow.close()
})

ipcMain.handle('window-is-maximized', () => {
  return mainWindow ? mainWindow.isMaximized() : false
})

// IPC handler for manual update install
ipcMain.on('install-update', () => {
  autoUpdater.quitAndInstall(false, true)
})

// IPC handler for manual update check
ipcMain.handle('check-for-updates', async () => {
  try {
    const result = await autoUpdater.checkForUpdates()
    return { success: true, updateInfo: result?.updateInfo }
  } catch (err) {
    return { success: false, error: err.message }
  }
})

// Get current app version
ipcMain.handle('get-app-version', () => {
  return app.getVersion()
})
