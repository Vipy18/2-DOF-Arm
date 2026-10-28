import { ipcMain, BrowserWindow, dialog } from 'electron'
import * as fs from 'fs/promises'
import { CanBridge } from './canBridge'
import { ConfigStore } from './configStore'
import { AppConfig } from '../shared/types'

export function registerIpcHandlers(
  mainWindow: BrowserWindow,
  canBridge: CanBridge,
  configStore: ConfigStore
): void {
  // Serial Port Handlers
  ipcMain.handle('serial:listPorts', async () => {
    try {
      return await canBridge.listPorts()
    } catch (err: any) {
      console.error('[IPC] Error in serial:listPorts:', err)
      throw new Error(err.message || 'Failed to list serial ports')
    }
  })

  ipcMain.handle('serial:connect', async (_event, port: string) => {
    try {
      if (!port) {
        throw new Error('Port path is required')
      }
      await canBridge.open(port)
      // Save last used port to config
      const cfg = configStore.getConfig()
      cfg.lastPort = port
      configStore.saveConfig(cfg)
      return { success: true }
    } catch (err: any) {
      console.error(`[IPC] Error in serial:connect (${port}):`, err)
      throw new Error(err.message || `Failed to connect to ${port}`)
    }
  })

  ipcMain.handle('serial:disconnect', async () => {
    try {
      await canBridge.close()
      return { success: true }
    } catch (err: any) {
      console.error('[IPC] Error in serial:disconnect:', err)
      throw new Error(err.message || 'Failed to disconnect')
    }
  })

  // Motor Control Handlers
  ipcMain.handle('motor:enable', async (_event, motorId: number) => {
    try {
      await canBridge.enableMotor(motorId)
      return true
    } catch (err: any) {
      console.error(`[IPC] Error in motor:enable (ID: ${motorId}):`, err)
      throw new Error(err.message || `Failed to enable motor ${motorId}`)
    }
  })

  ipcMain.handle('motor:disable', async (_event, motorId: number) => {
    try {
      await canBridge.disableMotor(motorId)
      return true
    } catch (err: any) {
      console.error(`[IPC] Error in motor:disable (ID: ${motorId}):`, err)
      throw new Error(err.message || `Failed to disable motor ${motorId}`)
    }
  })

  ipcMain.handle('motor:eStop', async () => {
    try {
      await canBridge.eStop()
      return true
    } catch (err: any) {
      console.error('[IPC] Error in motor:eStop:', err)
      throw new Error(err.message || 'Failed to execute E-Stop')
    }
  })

  ipcMain.handle(
    'motor:writeParam',
    async (
      _event,
      motorId: number,
      index: number,
      format: string,
      value: number
    ) => {
      try {
        await canBridge.writeParam(motorId, index, format, value)
        return true
      } catch (err: any) {
        console.error(
          `[IPC] Error in motor:writeParam (ID: ${motorId}, idx: 0x${index.toString(16)}):`,
          err
        )
        throw new Error(err.message || 'Failed to write parameter')
      }
    }
  )

  ipcMain.handle(
    'motor:readParam',
    async (_event, motorId: number, index: number) => {
      try {
        return await canBridge.readParam(motorId, index)
      } catch (err: any) {
        console.error(
          `[IPC] Error in motor:readParam (ID: ${motorId}, idx: 0x${index.toString(16)}):`,
          err
        )
        throw new Error(err.message || 'Failed to read parameter')
      }
    }
  )

  ipcMain.handle('motor:setMode', async (_event, motorId: number, mode: number) => {
    try {
      await canBridge.setMode(motorId, mode)
      return true
    } catch (err: any) {
      console.error(
        `[IPC] Error in motor:setMode (ID: ${motorId}, mode: ${mode}):`,
        err
      )
      throw new Error(err.message || 'Failed to set motor mode')
    }
  })

  ipcMain.handle('motor:home', async () => {
    try {
      await canBridge.home()
      return true
    } catch (err: any) {
      console.error('[IPC] Error in motor:home:', err)
      throw new Error(err.message || 'Failed to home motors')
    }
  })

  // Motion Control Paradigms via Python Backend
  ipcMain.handle('motor:moveJ', async (_event, theta1: number, theta2: number) => {
    try {
      return await canBridge.moveJ(theta1, theta2)
    } catch (err: any) {
      console.error('[IPC] Error in motor:moveJ:', err)
      throw new Error(err.message || 'Failed to execute move_j')
    }
  })

  ipcMain.handle(
    'motor:moveL',
    async (_event, x: number, y: number, elbow = 'down', l1 = 0.4, l2 = 0.3) => {
      try {
        return await canBridge.moveL(x, y, elbow, l1, l2)
      } catch (err: any) {
        console.error('[IPC] Error in motor:moveL:', err)
        throw new Error(err.message || 'Failed to execute move_l')
      }
    }
  )

  // Kinematics Handlers via Python Backend
  ipcMain.handle('motor:calculateIK', async (_event, x: number, y: number, elbow = 'down', l1 = 0.4, l2 = 0.3) => {
    try {
      return await canBridge.calculateIK(x, y, elbow, l1, l2)
    } catch (err: any) {
      console.error('[IPC] Error in motor:calculateIK:', err)
      throw new Error(err.message || 'Failed to calculate IK')
    }
  })

  ipcMain.handle('motor:calculateFK', async (_event, theta1: number, theta2: number, l1 = 0.4, l2 = 0.3) => {
    try {
      return await canBridge.calculateFK(theta1, theta2, l1, l2)
    } catch (err: any) {
      console.error('[IPC] Error in motor:calculateFK:', err)
      throw new Error(err.message || 'Failed to calculate FK')
    }
  })

  // Config Handlers
  ipcMain.handle('config:get', async () => {
    try {
      return configStore.getConfig()
    } catch (err: any) {
      console.error('[IPC] Error in config:get:', err)
      throw new Error(err.message || 'Failed to get config')
    }
  })

  ipcMain.handle('config:save', async (_event, config: AppConfig) => {
    try {
      configStore.saveConfig(config)
      return true
    } catch (err: any) {
      console.error('[IPC] Error in config:save:', err)
      throw new Error(err.message || 'Failed to save config')
    }
  })

  // Program Save / Load Handlers
  ipcMain.handle('program:save', async (_event, payload: any) => {
    try {
      const result = await dialog.showSaveDialog(mainWindow, {
        title: 'Save Teach Program',
        defaultPath: `${payload.name || 'robot_program'}.json`,
        filters: [{ name: 'JSON Programs', extensions: ['json'] }]
      })

      if (!result.canceled && result.filePath) {
        await fs.writeFile(result.filePath, JSON.stringify(payload, null, 2), 'utf-8')
        return { success: true, filePath: result.filePath }
      }
      return { success: false, canceled: true }
    } catch (err: any) {
      console.error('[IPC] Error saving program:', err)
      return { success: false, error: err.message }
    }
  })

  ipcMain.handle('program:load', async () => {
    try {
      const result = await dialog.showOpenDialog(mainWindow, {
        title: 'Open Teach Program',
        filters: [{ name: 'JSON Programs', extensions: ['json'] }],
        properties: ['openFile']
      })

      if (!result.canceled && result.filePaths.length > 0) {
        const raw = await fs.readFile(result.filePaths[0], 'utf-8')
        const program = JSON.parse(raw)
        return { success: true, program, filePath: result.filePaths[0] }
      }
      return { success: false, canceled: true }
    } catch (err: any) {
      console.error('[IPC] Error loading program:', err)
      return { success: false, error: err.message }
    }
  })

  // Bridge Event Forwarding to Renderer
  canBridge.on('feedback', (data) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('motor:feedback', data)
    }
  })

  canBridge.on('fault', (data) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('motor:fault', data)
    }
  })

  canBridge.on('connectionChange', (status) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('motor:connectionChange', status)
      mainWindow.webContents.send('serial:connectionChange', status)
    }
  })
}
