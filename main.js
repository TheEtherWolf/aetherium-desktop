const { app, BrowserWindow, shell, Menu, Tray, nativeImage, globalShortcut, Notification, ipcMain } = require('electron')
const path = require('path')
const { autoUpdater } = require('electron-updater')

// The URL of the deployed Aetherium web app
const AETHERIUM_URL = 'https://aetherium-89dr.onrender.com/'

let mainWindow
let tray = null

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
  tray = new Tray(trayIcon.resize({ width: 16, height: 16 }))

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

// Auto-updater configuration
// Always download the latest version (skips intermediate versions automatically)
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

