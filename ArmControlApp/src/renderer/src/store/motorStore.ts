import { create } from 'zustand'
import {
  ConnectionState,
  ConnectionStatus,
  MotorState,
  ArmState,
  SafetyState,
  AppConfig,
  TelemetryPoint,
  AvailablePort
} from './types'

const MAX_TELEMETRY_POINTS = 200

export interface AppStore {
  // Connection slice
  connection: ConnectionState
  setConnectionStatus: (status: ConnectionStatus, error?: string) => void
  setAvailablePorts: (ports: AvailablePort[]) => void
  setConnectedPort: (port: string) => void

  // Motor slice
  motors: [MotorState, MotorState]
  updateMotor: (id: number, data: Partial<MotorState>) => void
  setMotorEnabled: (id: number, enabled: boolean) => void

  // Arm slice  
  arm: ArmState
  updateArm: (state: Partial<ArmState>) => void

  // Safety slice
  safety: SafetyState
  triggerEStop: () => void
  clearEStop: () => void
  setSafetyFlag: (flag: keyof SafetyState, value: boolean) => void

  // Config slice
  config: AppConfig
  updateConfig: (config: Partial<AppConfig>) => void

  // Telemetry history (last 200 points per motor)
  telemetry: [TelemetryPoint[], TelemetryPoint[]]
  pushTelemetry: (motorIndexOrId: number, point: TelemetryPoint) => void
  clearTelemetry: () => void
}

const initialMotors: [MotorState, MotorState] = [
  {
    id: 1,
    enabled: false,
    mode: 'velocity',
    position: 0,
    velocity: 0,
    current: 0,
    torque: 0,
    temperature: 0,
    faultCode: 0,
    faultDescription: 'No fault'
  },
  {
    id: 2,
    enabled: false,
    mode: 'velocity',
    position: 0,
    velocity: 0,
    current: 0,
    torque: 0,
    temperature: 0,
    faultCode: 0,
    faultDescription: 'No fault'
  }
]

const initialConfig: AppConfig = {
  lastPort: '',
  motor1Limits: {
    minDeg: -170,
    maxDeg: 170,
    maxCurrentA: 5.0
  },
  motor2Limits: {
    minDeg: -150,
    maxDeg: 150,
    maxCurrentA: 5.0
  },
  armGeometry: {
    l1: 0.4,
    l2: 0.3
  }
}

const initialSafety: SafetyState = {
  eStopActive: false,
  jointLimitViolation: false,
  singularityWarning: false,
  outOfWorkspace: false,
  connectionLost: false
}

const initialArm: ArmState = {
  theta1: 0,
  theta2: 0,
  elbow: { x: 0.40, y: 0.0 },
  endEffector: { x: 0.70, y: 0.0 }
}

export const useAppStore = create<AppStore>((set) => ({
  // Connection state & actions
  connection: {
    port: '',
    status: 'disconnected',
    availablePorts: []
  },
  setConnectionStatus: (status: ConnectionStatus, error?: string) =>
    set((state) => ({
      connection: {
        ...state.connection,
        status,
        error: error !== undefined ? error : status === 'connected' ? undefined : state.connection.error
      },
      safety: {
        ...state.safety,
        connectionLost: status === 'disconnected' || status === 'error'
      }
    })),
  setAvailablePorts: (ports: AvailablePort[]) =>
    set((state) => ({
      connection: {
        ...state.connection,
        availablePorts: ports
      }
    })),
  setConnectedPort: (port: string) =>
    set((state) => ({
      connection: {
        ...state.connection,
        port,
        status: 'connected',
        error: undefined
      },
      config: {
        ...state.config,
        lastPort: port
      },
      safety: {
        ...state.safety,
        connectionLost: false
      }
    })),

  // Motor state & actions
  motors: initialMotors,
  updateMotor: (id: number, data: Partial<MotorState>) =>
    set((state) => {
      const idx = id === 1 ? 0 : id === 2 ? 1 : -1
      if (idx === -1) return state

      const updated = { ...state.motors[idx], ...data }
      const newMotors: [MotorState, MotorState] =
        idx === 0 ? [updated, state.motors[1]] : [state.motors[0], updated]

      return { motors: newMotors }
    }),
  setMotorEnabled: (id: number, enabled: boolean) =>
    set((state) => {
      const idx = id === 1 ? 0 : id === 2 ? 1 : -1
      if (idx === -1) return state

      const updated = { ...state.motors[idx], enabled }
      const newMotors: [MotorState, MotorState] =
        idx === 0 ? [updated, state.motors[1]] : [state.motors[0], updated]

      return { motors: newMotors }
    }),

  // Arm state & actions
  arm: initialArm,
  updateArm: (newState: Partial<ArmState>) =>
    set((state) => ({
      arm: {
        ...state.arm,
        ...newState
      }
    })),

  // Safety state & actions
  safety: initialSafety,
  triggerEStop: () =>
    set((state) => {
      const disabledMotors: [MotorState, MotorState] = [
        { ...state.motors[0], enabled: false, velocity: 0, torque: 0 },
        { ...state.motors[1], enabled: false, velocity: 0, torque: 0 }
      ]
      return {
        safety: {
          ...state.safety,
          eStopActive: true
        },
        motors: disabledMotors
      }
    }),
  clearEStop: () =>
    set((state) => ({
      safety: {
        ...state.safety,
        eStopActive: false
      }
    })),
  setSafetyFlag: (flag: keyof SafetyState, value: boolean) =>
    set((state) => ({
      safety: {
        ...state.safety,
        [flag]: value
      }
    })),

  // Config state & actions
  config: initialConfig,
  updateConfig: (newConfig: Partial<AppConfig>) =>
    set((state) => ({
      config: {
        ...state.config,
        ...newConfig,
        motor1Limits: newConfig.motor1Limits
          ? { ...state.config.motor1Limits, ...newConfig.motor1Limits }
          : state.config.motor1Limits,
        motor2Limits: newConfig.motor2Limits
          ? { ...state.config.motor2Limits, ...newConfig.motor2Limits }
          : state.config.motor2Limits,
        armGeometry: newConfig.armGeometry
          ? { ...state.config.armGeometry, ...newConfig.armGeometry }
          : state.config.armGeometry
      }
    })),

  // Telemetry state & actions (ring buffer max 200 entries per motor)
  telemetry: [[], []],
  pushTelemetry: (motorIndexOrId: number, point: TelemetryPoint) =>
    set((state) => {
      // Allow 0-indexed (0, 1) or 1-indexed Motor IDs (1, 2)
      const targetIdx = motorIndexOrId === 2 || motorIndexOrId === 1 ? motorIndexOrId - 1 : motorIndexOrId === 0 ? 0 : 1
      if (targetIdx !== 0 && targetIdx !== 1) return state

      const currentBuffer = state.telemetry[targetIdx]
      const updatedBuffer = [...currentBuffer, point]
      const trimmedBuffer =
        updatedBuffer.length > MAX_TELEMETRY_POINTS
          ? updatedBuffer.slice(updatedBuffer.length - MAX_TELEMETRY_POINTS)
          : updatedBuffer

      const newTelemetry: [TelemetryPoint[], TelemetryPoint[]] =
        targetIdx === 0
          ? [trimmedBuffer, state.telemetry[1]]
          : [state.telemetry[0], trimmedBuffer]

      return { telemetry: newTelemetry }
    }),
  clearTelemetry: () =>
    set(() => ({
      telemetry: [[], []]
    }))
}))
