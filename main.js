const { app, BrowserWindow, shell, Menu, Tray, nativeImage, globalShortcut, Notification, ipcMain } = require('electron')
const path = require('path')
const { autoUpdater } = require('electron-updater')

// The URL of the deployed Aetherium web app
const AETHERIUM_URL = 'https://aetherium-89dr.onrender.com/'

let mainWindow
let tray = null

// Prevent multiple instances
const gotTheLock = app.requestSingleInstanceLock()

if (!gotTheLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.focus()
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
    titleBarStyle: 'default',
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
      }
    }
  })
}

// Auto-updater events
autoUpdater.on('update-available', () => {
  console.log('Update available')
})

autoUpdater.on('update-downloaded', () => {
  console.log('Update downloaded')
  // Prompt user to restart
  autoUpdater.quitAndInstall()
})

autoUpdater.on('error', (err) => {
  console.error('Auto-updater error:', err)
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
