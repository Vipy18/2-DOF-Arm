import { app, shell, BrowserWindow, dialog } from 'electron'
import { join } from 'path'
import { is } from '@electron-toolkit/utils'
import { registerIpcHandlers } from './ipcHandlers'
import { canBridge } from './canBridge'
import { configStore } from './configStore'
import { pythonManager } from './pythonManager'

let mainWindow: BrowserWindow | null = null

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1100,
    minHeight: 700,
    show: true, // forced true
    autoHideMenuBar: true,
    backgroundColor: '#131318',
    title: 'Robstride 2-DOF Arm Control',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  mainWindow.webContents.openDevTools()

  mainWindow.on('ready-to-show', () => {
    mainWindow?.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  // Register all IPC handlers and bridge events
  registerIpcHandlers(mainWindow, canBridge, configStore)

  // Start the Python backend process eagerly
  pythonManager.start().catch((err) => {
    console.warn('[Main] Python backend initial start notice:', err.message)
  })

  // Load the remote URL for development or the local html file for production.
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

// Ensure single instance lock
const gotTheLock = app.requestSingleInstanceLock()
if (!gotTheLock) {
  console.error('[Main] Another instance of Robstride Arm Control is already running or holding the process lock. Exiting.')
  dialog.showErrorBox(
    'Robstride Arm Control - Process Already Running',
    'Another instance of the application is already running or holding the single-instance lock.\n\nIf the application window is not visible, check Task Manager for orphaned electron.exe or Robstride processes and end them before restarting.'
  )
  app.quit()
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.focus()
    }
  })

  app.whenReady().then(() => {
    createWindow()

    app.on('activate', function () {
      if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
  })
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('before-quit', async () => {
  try {
    if (canBridge.isConnected()) {
      await canBridge.eStop()
      await canBridge.close()
    }
    await pythonManager.stop()
  } catch (err) {
    console.error('[Main] Cleanup error on quit:', err)
  }
})
