import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron'
import {
  AppConfig,
  MotorFeedback,
  FaultEvent,
  ConnectionStatus,
  SerialPortInfo,
  MotorAPI
} from '../shared/types'

const motorAPI: MotorAPI = {
  // Serial
  listPorts: (): Promise<SerialPortInfo[]> => ipcRenderer.invoke('serial:listPorts'),
  connect: (port: string): Promise<void> => ipcRenderer.invoke('serial:connect', port),
  disconnect: (): Promise<void> => ipcRenderer.invoke('serial:disconnect'),

  // Motor Control
  enableMotor: (motorId: number): Promise<void> =>
    ipcRenderer.invoke('motor:enable', motorId),
  disableMotor: (motorId: number): Promise<void> =>
    ipcRenderer.invoke('motor:disable', motorId),
  eStop: (): Promise<void> => ipcRenderer.invoke('motor:eStop'),
  writeParam: (
    motorId: number,
    index: number,
    format: string,
    value: number
  ): Promise<void> =>
    ipcRenderer.invoke('motor:writeParam', motorId, index, format, value),
  readParam: (motorId: number, index: number): Promise<number> =>
    ipcRenderer.invoke('motor:readParam', motorId, index),
  setMode: (motorId: number, mode: number): Promise<void> =>
    ipcRenderer.invoke('motor:setMode', motorId, mode),
  home: (): Promise<void> => ipcRenderer.invoke('motor:home'),

  // Motion Control Paradigms
  moveJ: (theta1: number, theta2: number): Promise<any> =>
    ipcRenderer.invoke('motor:moveJ', theta1, theta2),
  moveL: (x: number, y: number, elbow: 'up' | 'down' = 'down', l1 = 0.4, l2 = 0.3): Promise<any> =>
    ipcRenderer.invoke('motor:moveL', x, y, elbow, l1, l2),

  // Kinematics via Python Backend
  calculateIK: (x: number, y: number, elbow: 'up' | 'down' = 'down', l1 = 0.4, l2 = 0.3): Promise<any> =>
    ipcRenderer.invoke('motor:calculateIK', x, y, elbow, l1, l2),
  calculateFK: (theta1: number, theta2: number, l1 = 0.4, l2 = 0.3): Promise<any> =>
    ipcRenderer.invoke('motor:calculateFK', theta1, theta2, l1, l2),

  // Config
  getConfig: (): Promise<AppConfig> => ipcRenderer.invoke('config:get'),
  saveConfig: (config: AppConfig): Promise<void> =>
    ipcRenderer.invoke('config:save', config),

  // Events (from main to renderer)
  onFeedback: (cb: (data: MotorFeedback[]) => void): (() => void) => {
    const handler = (_event: IpcRendererEvent, data: MotorFeedback[]) => cb(data)
    ipcRenderer.on('motor:feedback', handler)
    return () => {
      ipcRenderer.removeListener('motor:feedback', handler)
    }
  },

  onFault: (cb: (data: FaultEvent) => void): (() => void) => {
    const handler = (_event: IpcRendererEvent, data: FaultEvent) => cb(data)
    ipcRenderer.on('motor:fault', handler)
    return () => {
      ipcRenderer.removeListener('motor:fault', handler)
    }
  },

  onConnectionChange: (cb: (status: ConnectionStatus) => void): (() => void) => {
    const handler = (_event: IpcRendererEvent, status: ConnectionStatus) => cb(status)
    ipcRenderer.on('motor:connectionChange', handler)
    return () => {
      ipcRenderer.removeListener('motor:connectionChange', handler)
    }
  }
}

const api = {
  // Serial
  listPorts: async () => {
    const ports = await ipcRenderer.invoke('serial:listPorts')
    return (ports || []).map((p: any) => ({
      port: p.path || p.port,
      name: p.manufacturer || p.name
    }))
  },
  connectSerial: async (port: string, _baud = 921600) => {
    try {
      await ipcRenderer.invoke('serial:connect', port)
      return { success: true }
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  },
  disconnectSerial: async () => {
    try {
      await ipcRenderer.invoke('serial:disconnect')
      return { success: true }
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  },

  // Motors
  enableMotor: async (motorId: number) => {
    await ipcRenderer.invoke('motor:enable', motorId)
    return true
  },
  disableMotor: async (motorId: number) => {
    await ipcRenderer.invoke('motor:disable', motorId)
    return true
  },
  setRunMode: async (motorId: number, mode: string | number) => {
    let modeNum = 0
    if (typeof mode === 'number') {
      modeNum = mode
    } else if (mode === 'position') {
      modeNum = 0
    } else if (mode === 'current') {
      modeNum = 1
    } else if (mode === 'velocity') {
      modeNum = 2
    } else if (mode === 'mit') {
      modeNum = 3
    }
    await ipcRenderer.invoke('motor:setMode', motorId, modeNum)
    return true
  },
  sendVelocityCommand: async (motorId: number, speedRadS: number) => {
    await ipcRenderer.invoke('motor:writeParam', motorId, 0x700a, '<f', speedRadS)
    return true
  },
  sendPositionCommand: async (motorId: number, positionRad: number, _maxSpeedRadS?: number) => {
    await ipcRenderer.invoke('motor:writeParam', motorId, 0x7016, '<f', positionRad)
    return true
  },
  sendCurrentCommand: async (motorId: number, currentA: number) => {
    await ipcRenderer.invoke('motor:writeParam', motorId, 0x7006, '<f', currentA)
    return true
  },
  sendMitCommand: async (
    motorId: number,
    _pDes: number,
    _vDes: number,
    _kp: number,
    _kd: number,
    _tFf: number
  ) => {
    await ipcRenderer.invoke('motor:enable', motorId)
    return true
  },
  writeMotorParam: async (motorId: number, index: number, format: string, value: number) => {
    await ipcRenderer.invoke('motor:writeParam', motorId, index, format, value)
    return true
  },
  readMotorParam: async (motorId: number, index: number) => {
    return await ipcRenderer.invoke('motor:readParam', motorId, index)
  },

  // E-STOP & Home
  emergencyStop: async () => {
    await ipcRenderer.invoke('motor:eStop')
    return true
  },
  home: async () => {
    await ipcRenderer.invoke('motor:home')
    return true
  },

  // Motion Control & Kinematics
  moveJ: async (theta1: number, theta2: number) => {
    return await ipcRenderer.invoke('motor:moveJ', theta1, theta2)
  },
  moveL: async (x: number, y: number, elbow = 'down', l1 = 0.4, l2 = 0.3) => {
    return await ipcRenderer.invoke('motor:moveL', x, y, elbow, l1, l2)
  },
  calculateIK: async (x: number, y: number, elbow = 'down', l1 = 0.4, l2 = 0.3) => {
    return await ipcRenderer.invoke('motor:calculateIK', x, y, elbow, l1, l2)
  },
  calculateFK: async (theta1: number, theta2: number, l1 = 0.4, l2 = 0.3) => {
    return await ipcRenderer.invoke('motor:calculateFK', theta1, theta2, l1, l2)
  },

  // Config
  getConfig: async () => {
    return await ipcRenderer.invoke('config:get')
  },
  saveConfig: async (cfg: Partial<AppConfig>) => {
    await ipcRenderer.invoke('config:save', cfg)
    return true
  },

  // Event Listeners
  onMotorFeedback: (cb: (data: any) => void) => {
    const handler = (_event: IpcRendererEvent, data: any) => {
      if (Array.isArray(data)) {
        for (const item of data) {
          cb({
            motorId: item.motorId,
            positionRad: item.position,
            velocityRads: item.velocity,
            currentA: item.current,
            torqueNm: item.torque,
            temperatureC: item.temperature,
            faultCode: item.faultCode
          })
        }
      } else {
        cb(data)
      }
    }
    ipcRenderer.on('motor:feedback', handler)
    return () => ipcRenderer.removeListener('motor:feedback', handler)
  },
  onMotorFault: (cb: (data: any) => void) => {
    const handler = (_event: IpcRendererEvent, data: any) => cb(data)
    ipcRenderer.on('motor:fault', handler)
    return () => ipcRenderer.removeListener('motor:fault', handler)
  },
  onConnectionChange: (cb: (data: any) => void) => {
    const handler = (_event: IpcRendererEvent, data: any) => {
      cb({
        status: data.connected ? 'connected' : data.error ? 'error' : 'disconnected',
        port: data.port,
        error: data.error
      })
    }
    ipcRenderer.on('motor:connectionChange', handler)
    return () => ipcRenderer.removeListener('motor:connectionChange', handler)
  },
  onAvailablePorts: (cb: (ports: any[]) => void) => {
    const handler = (_event: IpcRendererEvent, data: any[]) => cb(data)
    ipcRenderer.on('serial:availablePorts', handler)
    return () => ipcRenderer.removeListener('serial:availablePorts', handler)
  },
  onJointLimitViolation: (cb: (data: any) => void) => {
    const handler = (_event: IpcRendererEvent, data: any) => cb(data)
    ipcRenderer.on('safety:jointLimitViolation', handler)
    return () => ipcRenderer.removeListener('safety:jointLimitViolation', handler)
  },

  // Generic IPC Bridge
  on: (channel: string, callback: (...args: any[]) => void) => {
    const handler = (_event: IpcRendererEvent, ...args: any[]) => callback(...args)
    ipcRenderer.on(channel, handler)
    return () => ipcRenderer.removeListener(channel, handler)
  },
  send: (channel: string, ...args: any[]) => ipcRenderer.send(channel, ...args),
  invoke: (channel: string, ...args: any[]) => ipcRenderer.invoke(channel, ...args)
}

// Expose APIs in main world
try {
  contextBridge.exposeInMainWorld('motorAPI', motorAPI)
  contextBridge.exposeInMainWorld('api', api)
  contextBridge.exposeInMainWorld('electron', {
    ipcRenderer: {
      on: (channel: string, listener: (event: any, ...args: any[]) => void) => {
        ipcRenderer.on(channel, listener)
      },
      removeListener: (channel: string, listener: (event: any, ...args: any[]) => void) => {
        ipcRenderer.removeListener(channel, listener)
      },
      send: (channel: string, ...args: any[]) => {
        ipcRenderer.send(channel, ...args)
      },
      invoke: (channel: string, ...args: any[]) => {
        return ipcRenderer.invoke(channel, ...args)
      }
    }
  })
} catch (error) {
  console.error('[Preload] Failed to expose APIs in main world:', error)
}
