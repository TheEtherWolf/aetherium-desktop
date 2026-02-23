const { app, BrowserWindow, shell, Menu, Tray, nativeImage, globalShortcut, Notification, ipcMain, screen, desktopCapturer } = require('electron')
const path = require('path')
const fs = require('fs')
const { autoUpdater } = require('electron-updater')

// Debug logging to file
const logFile = path.join(app.getPath('userData'), 'overlay-debug.log')
function debugLog(...args) {
  const timestamp = new Date().toISOString()
  const message = `[${timestamp}] ${args.join(' ')}\n`
  fs.appendFileSync(logFile, message)
  console.log(...args)
}

// The URL of the deployed Aetherium web app
const AETHERIUM_URL = 'https://aetherium-89dr.onrender.com/'

let mainWindow
let tray = null
let overlayWindow = null
let overlayEnabled = true // Can be toggled from settings
let updateWindow = null
let updateInfo = null // Store update info for the update window

// Handle certificate errors (for debugging)
app.on('certificate-error', (event, webContents, url, error, certificate, callback) => {
  debugLog('Certificate error:', url, error)
  // In production, we should NOT ignore certificate errors
  // But log them for debugging
  callback(false) // Reject invalid certificates
})

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
      preload: path.join(__dirname, 'preload.js'),
      webSecurity: true,
      allowRunningInsecureContent: false
    },
    frame: false,
    titleBarStyle: 'hidden',
    show: false,
    backgroundColor: '#1a1a2e'
  })

  // Log network errors for debugging
  mainWindow.webContents.session.webRequest.onErrorOccurred((details) => {
    if (details.error !== 'net::ERR_ABORTED') {
      debugLog('Network error:', details.url, details.error)
    }
  })

  Menu.setApplicationMenu(null)

  // Handle permission requests (media, notifications, etc.)
  mainWindow.webContents.session.setPermissionRequestHandler((webContents, permission, callback) => {
    const allowedPermissions = ['media', 'mediaKeySystem', 'notifications', 'fullscreen', 'pointerLock', 'clipboard-read', 'clipboard-write']
    if (allowedPermissions.includes(permission)) {
      callback(true)
    } else {
      callback(false)
    }
  })

  // Handle permission check requests
  mainWindow.webContents.session.setPermissionCheckHandler((webContents, permission) => {
    const allowedPermissions = ['media', 'mediaKeySystem', 'notifications', 'fullscreen', 'pointerLock', 'clipboard-read', 'clipboard-write']
    return allowedPermissions.includes(permission)
  })

  mainWindow.loadURL(AETHERIUM_URL)

  // Handle connection failures with a nice error screen
  mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription, validatedURL) => {
    debugLog('Page load failed:', errorCode, errorDescription, validatedURL)
    
    // Show friendly error screen with window controls
    mainWindow.webContents.executeJavaScript(`
      document.body.style.margin = '0';
      document.body.style.padding = '0';
      document.body.style.overflow = 'hidden';
      document.body.innerHTML = \`
        <div style="
          display: flex;
          flex-direction: column;
          height: 100vh;
          background: linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f0f23 100%);
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          color: white;
        ">
          <!-- Title bar -->
          <div style="
            display: flex;
            align-items: center;
            justify-content: space-between;
            height: 32px;
            padding: 0 8px;
            -webkit-app-region: drag;
            background: rgba(0,0,0,0.2);
          ">
            <span style="font-size: 12px; color: #8b8ba0; margin-left: 8px;">Aetherium</span>
            <div style="display: flex; -webkit-app-region: no-drag;">
              <button id="minimize-btn" style="
                width: 46px; height: 32px; border: none; background: transparent;
                color: #a0a0b8; cursor: pointer; font-size: 16px;
              " onmouseover="this.style.background='rgba(255,255,255,0.1)'" onmouseout="this.style.background='transparent'">─</button>
              <button id="close-btn" style="
                width: 46px; height: 32px; border: none; background: transparent;
                color: #a0a0b8; cursor: pointer; font-size: 16px;
              " onmouseover="this.style.background='#e81123'; this.style.color='white'" onmouseout="this.style.background='transparent'; this.style.color='#a0a0b8'">✕</button>
            </div>
          </div>
          <!-- Content -->
          <div style="
            flex: 1;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            text-align: center;
            padding: 20px;
            box-sizing: border-box;
            -webkit-app-region: drag;
          ">
            <div style="-webkit-app-region: no-drag;">
              <div style="
                width: 100px;
                height: 100px;
                margin: 0 auto 24px;
                background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%);
                border-radius: 24px;
                display: flex;
                align-items: center;
                justify-content: center;
                box-shadow: 0 8px 32px rgba(239, 68, 68, 0.3);
              ">
                <svg width="50" height="50" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <circle cx="12" cy="12" r="10"/>
                  <line x1="12" y1="8" x2="12" y2="12"/>
                  <line x1="12" y1="16" x2="12.01" y2="16"/>
                </svg>
              </div>
              <h1 style="margin: 0 0 12px; font-size: 28px; font-weight: 600;">Connection Failed</h1>
              <p style="margin: 0 0 8px; color: #a0a0b8; font-size: 16px; max-width: 400px;">
                Unable to connect to Aetherium servers.
              </p>
              <p style="margin: 0 0 32px; color: #6b6b80; font-size: 14px;">
                Check your internet connection or firewall settings.
              </p>
              <button id="retry-btn" style="
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                border: none;
                color: white;
                padding: 14px 48px;
                font-size: 16px;
                font-weight: 600;
                border-radius: 12px;
                cursor: pointer;
                box-shadow: 0 4px 16px rgba(102, 126, 234, 0.4);
                transition: transform 0.2s, box-shadow 0.2s;
                margin-bottom: 16px;
              " onmouseover="this.style.transform='scale(1.05)'; this.style.boxShadow='0 6px 20px rgba(102, 126, 234, 0.5)';"
                 onmouseout="this.style.transform='scale(1)'; this.style.boxShadow='0 4px 16px rgba(102, 126, 234, 0.4)';">
                Retry Connection
              </button>
              <p style="margin: 0; color: #4a4a5c; font-size: 12px;">
                Error: ${errorDescription} (${errorCode})
              </p>
            </div>
          </div>
        </div>
      \`;
      document.getElementById('retry-btn').addEventListener('click', () => location.reload());
      document.getElementById('minimize-btn').addEventListener('click', () => window.electronAPI?.windowControls?.minimize());
      document.getElementById('close-btn').addEventListener('click', () => window.electronAPI?.windowControls?.close());
    `).catch(err => debugLog('Failed to show error screen:', err));
  })

  // Log successful load
  mainWindow.webContents.on('did-finish-load', () => {
    debugLog('Page loaded successfully')
  })

  mainWindow.once('ready-to-show', () => {
    mainWindow.show()
    if (app.isPackaged) {
      // Check for updates on startup
      autoUpdater.checkForUpdates()
      
      // Check for updates every hour (Discord-style)
      setInterval(() => {
        autoUpdater.checkForUpdates()
      }, 60 * 60 * 1000) // 1 hour
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

function buildTrayMenu() {
  return Menu.buildFromTemplate([
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
}

function createTray() {
  // Don't create duplicate trays
  if (tray && !tray.isDestroyed()) {
    tray.setContextMenu(buildTrayMenu())
    return
  }

  const iconPath = path.join(__dirname, 'resources', 'icon.png')
  const trayIcon = nativeImage.createFromPath(iconPath)
  tray = new Tray(trayIcon.resize({ width: 32, height: 32 }))

  tray.setToolTip('Aetherium')
  tray.setContextMenu(buildTrayMenu())

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

  // Get the display that the main window is on (not just primary)
  let display = screen.getPrimaryDisplay()
  if (mainWindow && !mainWindow.isDestroyed()) {
    const mainBounds = mainWindow.getBounds()
    display = screen.getDisplayMatching(mainBounds)
  }
  // Use workArea for proper positioning (accounts for taskbar) on the correct monitor
  const { x: workX, y: workY, width: workW, height: workH } = display.workArea
  console.log('[Overlay] Creating on display:', display.id, 'at', workX, workY, 'size', workW, workH)

  overlayWindow = new BrowserWindow({
    width: 400,
    height: workH,
    x: workX, // Top-left of work area on CURRENT display (not primary)
    y: workY,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    focusable: false,
    hasShadow: false,
    show: false,
    level: 'screen-saver', // Higher z-index to appear above main window
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
  dismissOverlay() // Hide overlay when answering
  if (mainWindow) {
    mainWindow.show()
    mainWindow.focus()
    mainWindow.webContents.send('window-shown')
    mainWindow.webContents.send('overlay-action', { action: 'answer-call' })
  }
})

ipcMain.on('overlay-decline-call', () => {
  dismissOverlay() // Hide overlay when declining
  if (mainWindow) {
    mainWindow.webContents.send('overlay-action', { action: 'decline-call' })
  }
})

ipcMain.on('overlay-dismiss', () => {
  dismissOverlay()
})

// Allow renderer to dismiss overlay (e.g., when answering call from web app)
ipcMain.handle('dismiss-overlay', () => {
  dismissOverlay()
  return true
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
    // Hide the overlay window after a short delay for animation
    setTimeout(() => {
      if (overlayWindow && !overlayWindow.isDestroyed()) {
        overlayWindow.hide()
        overlayWindow.setIgnoreMouseEvents(true, { forward: true })
      }
    }, 300)
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
  debugLog('[Overlay] === show-overlay-notification ===')
  debugLog('[Overlay] data:', JSON.stringify(data))
  debugLog('[Overlay] overlayEnabled:', overlayEnabled)
  
  if (!mainWindow) {
    debugLog('[Overlay] ERROR: mainWindow is null!')
    return false
  }
  
  const isVisible = mainWindow.isVisible()
  const isMinimized = mainWindow.isMinimized()
  const isFocused = mainWindow.isFocused()
  
  debugLog('[Overlay] isVisible:', isVisible)
  debugLog('[Overlay] isMinimized:', isMinimized)
  debugLog('[Overlay] isFocused:', isFocused)
  
  // Show overlay when window is hidden/minimized/unfocused
  const shouldShow = !isVisible || isMinimized || !isFocused
  debugLog('[Overlay] shouldShow:', shouldShow)
  
  if (shouldShow) {
    debugLog('[Overlay] Calling showOverlay()...')
    showOverlay(data)
    debugLog('[Overlay] showOverlay() completed')
    return true
  }
  
  debugLog('[Overlay] NOT showing - window is visible and focused')
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
// Styled Update Window
// ============================================
function createUpdateWindow() {
  if (updateWindow && !updateWindow.isDestroyed()) {
    updateWindow.focus()
    return
  }

  // Get the display that the main window is on (for multi-monitor support)
  let display = screen.getPrimaryDisplay()
  if (mainWindow && !mainWindow.isDestroyed()) {
    const mainBounds = mainWindow.getBounds()
    display = screen.getDisplayMatching(mainBounds)
  }
  const { x: workX, y: workY, width: workW, height: workH } = display.workArea
  console.log('[UpdateWindow] Creating on display:', display.id, 'centered at', workX, workY)

  updateWindow = new BrowserWindow({
    width: 450,
    height: 480,
    x: workX + Math.round((workW - 450) / 2),
    y: workY + Math.round((workH - 480) / 2),
    parent: mainWindow,
    modal: false,
    frame: false,
    transparent: true,
    resizable: false,
    minimizable: false,
    maximizable: false,
    skipTaskbar: false,
    backgroundColor: '#00000000',
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  })

  updateWindow.loadFile(path.join(__dirname, 'update-window.html'))

  updateWindow.once('ready-to-show', () => {
    if (updateInfo) {
      updateWindow.webContents.send('update-info', {
        currentVersion: app.getVersion(),
        newVersion: updateInfo.version,
        releaseNotes: updateInfo.releaseNotes
      })
    }
  })

  updateWindow.on('closed', () => {
    updateWindow = null
  })
}

// Update window IPC handlers
ipcMain.on('start-update-download', () => {
  console.log('[AutoUpdater] Starting download from update window')
  autoUpdater.downloadUpdate()
})

ipcMain.on('update-later', () => {
  console.log('[AutoUpdater] User chose to update later')
  if (updateWindow && !updateWindow.isDestroyed()) {
    updateWindow.close()
  }
})

// ============================================
// Auto-updater Configuration (Discord-style)
// ============================================
autoUpdater.autoDownload = true // Download automatically in background
autoUpdater.autoInstallOnAppQuit = true // Install on quit/restart

// Check for updates periodically (every 30 minutes)
const UPDATE_CHECK_INTERVAL = 30 * 60 * 1000 // 30 minutes in milliseconds
setInterval(() => {
  console.log('[AutoUpdater] Periodic update check...')
  autoUpdater.checkForUpdates()
}, UPDATE_CHECK_INTERVAL)

autoUpdater.on('checking-for-update', () => {
  console.log('[AutoUpdater] Checking for updates...')
})

autoUpdater.on('update-available', (info) => {
  console.log('[AutoUpdater] Update available:', info.version, '- showing full-screen update overlay')
  updateInfo = info
  
  // Show full-screen blocking overlay
  if (mainWindow) {
    mainWindow.webContents.executeJavaScript(`
      (function() {
        // Remove existing overlay if any
        const existing = document.getElementById('aetherium-update-overlay');
        if (existing) existing.remove();
        
        const overlay = document.createElement('div');
        overlay.id = 'aetherium-update-overlay';
        overlay.style.cssText = \`
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f0f23 100%);
          z-index: 999999;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          color: white;
          -webkit-app-region: drag;
        \`;
        
        overlay.innerHTML = \`
          <div style="text-align: center; -webkit-app-region: no-drag;">
            <div style="width: 80px; height: 80px; margin: 0 auto 24px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); border-radius: 20px; display: flex; align-items: center; justify-content: center; box-shadow: 0 8px 32px rgba(102, 126, 234, 0.3);">
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                <polyline points="7 10 12 15 17 10"/>
                <line x1="12" y1="15" x2="12" y2="3"/>
              </svg>
            </div>
            <h1 style="margin: 0 0 8px; font-size: 28px; font-weight: 600;">Update Available</h1>
            <p style="margin: 0 0 32px; color: #a0a0b8; font-size: 16px;">Version ${info.version} is downloading...</p>
            <div id="update-progress-container" style="width: 300px; margin: 0 auto;">
              <div style="background: rgba(255,255,255,0.1); border-radius: 8px; height: 8px; overflow: hidden;">
                <div id="update-progress-bar" style="width: 0%; height: 100%; background: linear-gradient(90deg, #667eea, #764ba2); border-radius: 8px; transition: width 0.3s ease;"></div>
              </div>
              <p id="update-progress-text" style="margin: 12px 0 0; color: #8b8ba0; font-size: 13px;">Starting download...</p>
            </div>
          </div>
        \`;
        
        document.body.appendChild(overlay);
      })();
    `).catch(err => console.error('Failed to inject update overlay:', err));
    
    mainWindow.webContents.send('update-available', { 
      version: info.version, 
      releaseNotes: info.releaseNotes,
      downloading: true
    })
  }
})

autoUpdater.on('update-not-available', () => {
  console.log('[AutoUpdater] App is up to date')
})

autoUpdater.on('download-progress', (progress) => {
  console.log(`[AutoUpdater] Download: ${Math.round(progress.percent)}%`)
  
  // Update the full-screen overlay progress
  if (mainWindow) {
    const percent = Math.round(progress.percent);
    const mbTransferred = (progress.transferred / 1024 / 1024).toFixed(1);
    const mbTotal = (progress.total / 1024 / 1024).toFixed(1);
    const speed = (progress.bytesPerSecond / 1024 / 1024).toFixed(1);
    
    mainWindow.webContents.executeJavaScript(`
      (function() {
        const bar = document.getElementById('update-progress-bar');
        const text = document.getElementById('update-progress-text');
        if (bar) bar.style.width = '${percent}%';
        if (text) text.textContent = '${mbTransferred} MB / ${mbTotal} MB (${speed} MB/s)';
      })();
    `).catch(() => {});
    
    mainWindow.webContents.send('update-progress', { 
      percent: progress.percent, 
      transferred: progress.transferred, 
      total: progress.total 
    })
  }
  
  // Send to update window
  if (updateWindow && !updateWindow.isDestroyed()) {
    updateWindow.webContents.send('download-progress', {
      percent: progress.percent,
      transferred: progress.transferred,
      total: progress.total,
      bytesPerSecond: progress.bytesPerSecond
    })
  }
})

autoUpdater.on('update-downloaded', (info) => {
  console.log('[AutoUpdater] Download complete:', info.version, '- showing restart prompt')
  
  // Update the overlay to show restart button
  if (mainWindow) {
    mainWindow.webContents.executeJavaScript(`
      (function() {
        const overlay = document.getElementById('aetherium-update-overlay');
        if (overlay) {
          overlay.innerHTML = \`
            <div style="text-align: center; -webkit-app-region: no-drag;">
              <div style="width: 80px; height: 80px; margin: 0 auto 24px; background: linear-gradient(135deg, #10b981 0%, #059669 100%); border-radius: 20px; display: flex; align-items: center; justify-content: center; box-shadow: 0 8px 32px rgba(16, 185, 129, 0.3);">
                <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <polyline points="20 6 9 17 4 12"/>
                </svg>
              </div>
              <h1 style="margin: 0 0 8px; font-size: 28px; font-weight: 600;">Update Ready!</h1>
              <p style="margin: 0 0 32px; color: #a0a0b8; font-size: 16px;">Version ${info.version} is ready to install</p>
              <button id="restart-update-btn" style="
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                border: none;
                color: white;
                padding: 14px 48px;
                font-size: 16px;
                font-weight: 600;
                border-radius: 12px;
                cursor: pointer;
                box-shadow: 0 4px 16px rgba(102, 126, 234, 0.4);
                transition: transform 0.2s, box-shadow 0.2s;
              " onmouseover="this.style.transform='scale(1.05)'; this.style.boxShadow='0 6px 20px rgba(102, 126, 234, 0.5)';"
                 onmouseout="this.style.transform='scale(1)'; this.style.boxShadow='0 4px 16px rgba(102, 126, 234, 0.4)';">
                Restart Now
              </button>
              <p style="margin: 16px 0 0; color: #6b6b80; font-size: 13px;">The app will restart to complete the update</p>
            </div>
          \`;
          
          document.getElementById('restart-update-btn').addEventListener('click', () => {
            window.electronAPI?.autoUpdater?.installUpdate?.();
          });
        }
      })();
    `).catch(err => console.error('Failed to update overlay:', err));
    
    mainWindow.webContents.send('update-downloaded', { 
      version: info.version,
      readyToInstall: true
    })
  }
  
  // Notify update window if it exists
  if (updateWindow && !updateWindow.isDestroyed()) {
    updateWindow.webContents.send('update-downloaded', { version: info.version })
  }
})

autoUpdater.on('error', (err) => {
  console.error('[AutoUpdater] Error:', err)
  
  // Notify update window
  if (updateWindow && !updateWindow.isDestroyed()) {
    updateWindow.webContents.send('update-error', { message: err.message })
  }
  
  // Notify main window
  if (mainWindow) {
    mainWindow.webContents.send('update-error', { message: err.message })
  }
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

// IPC handler for manual update install (from update window or main window)
ipcMain.on('install-update', () => {
  console.log('[AutoUpdater] Installing update...')
  debugLog('[AutoUpdater] User clicked install-update, calling quitAndInstall')
  
  // Close all windows first
  if (updateWindow && !updateWindow.isDestroyed()) {
    updateWindow.close()
  }
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    overlayWindow.close()
  }
  
  // Quit and install: isSilent = false (show installer), forceRunAfter = true (run app after)
  autoUpdater.quitAndInstall(false, true)
  
  // Force quit if quitAndInstall doesn't work
  setTimeout(() => {
    debugLog('[AutoUpdater] Force quitting app...')
    app.quit()
  }, 1000)
})

// IPC handler to manually check for updates
ipcMain.on('check-for-updates', () => {
  console.log('[AutoUpdater] Manual update check requested')
  autoUpdater.checkForUpdates()
})

// IPC handler to show update window manually
ipcMain.on('show-update-window', () => {
  if (updateInfo) {
    createUpdateWindow()
  }
})

// ============================================
// App Lifecycle
// ============================================
app.whenReady().then(() => {
  // Clear old log and start fresh
  fs.writeFileSync(logFile, `=== Aetherium Desktop Started ${new Date().toISOString()} ===\n`)
  debugLog('Log file:', logFile)
  debugLog('App version:', app.getVersion())
  
  createWindow()
  createTray()

  globalShortcut.register('F11', () => {
    if (mainWindow) mainWindow.setFullScreen(!mainWindow.isFullScreen())
  })

  // DevTools shortcut
  globalShortcut.register('F12', () => {
    if (mainWindow) mainWindow.webContents.toggleDevTools()
  })
  globalShortcut.register('CommandOrControl+Shift+I', () => {
    if (mainWindow) mainWindow.webContents.toggleDevTools()
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

// Open external URL in default browser
ipcMain.handle('open-external', (event, url) => {
  if (url && (url.startsWith('http://') || url.startsWith('https://'))) {
    shell.openExternal(url)
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

// Updates (check-for-updates handle version)
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

// Retry connection (reload the app URL)
ipcMain.handle('retry-connection', () => {
  if (mainWindow) {
    mainWindow.loadURL(AETHERIUM_URL)
    return true
  }
  return false
})
