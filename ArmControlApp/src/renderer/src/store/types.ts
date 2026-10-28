// Connection
export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error'

export interface AvailablePort {
  path: string
  manufacturer?: string
}

export interface ConnectionState {
  port: string
  status: ConnectionStatus
  error?: string
  availablePorts: AvailablePort[]
}

// Motor
export type RunMode = 'position' | 'velocity' | 'current' | 'MIT'

export interface MotorState {
  id: number           // 1 or 2
  enabled: boolean
  mode: RunMode
  position: number     // degrees (converted from radians for display)
  velocity: number     // rad/s
  current: number      // Amps
  torque: number       // Nm
  temperature: number  // Celsius
  faultCode: number    // 0 = no fault
  faultDescription: string
}

// Arm kinematics state
export interface Point2D {
  x: number  // meters
  y: number  // meters
}

export interface ArmState {
  theta1: number       // radians (Motor 1 angle)
  theta2: number       // radians (Motor 2 angle)
  elbow: Point2D       // meters
  endEffector: Point2D // meters
}

// Program step
export type ElbowConfig = 'up' | 'down'
export type MoveType = 'MOVE_J'   // only joint-space for MVP

export interface ProgramStep {
  id: string           // uuid
  index: number        // display order (0-indexed)
  moveType: MoveType
  targetAngles: { theta1: number; theta2: number }  // radians
  targetXY: Point2D    // meters (computed from FK)
  elbowConfig: ElbowConfig   // stored per-step
  speed: number        // 0-1 fraction of max speed
  dwellMs: number      // dwell time after reaching target in ms
  label?: string       // optional user label
}

// Program
export interface ProgramState {
  name: string
  steps: ProgramStep[]
  isPlaying: boolean
  currentStepIndex: number
  editingStepId: string | null   // null = no step being edited
  dirty: boolean                 // unsaved changes
}

// Safety
export interface SafetyState {
  eStopActive: boolean
  jointLimitViolation: boolean
  singularityWarning: boolean
  outOfWorkspace: boolean
  connectionLost: boolean
}

// App config (mirrors main process configStore)
export interface JointLimits {
  minDeg: number
  maxDeg: number
  maxCurrentA: number
}

export interface ArmGeometry {
  l1: number  // link 1 length in meters (default 0.4)
  l2: number  // link 2 length in meters (default 0.3)
}

export interface AppConfig {
  lastPort: string
  motor1Limits: JointLimits
  motor2Limits: JointLimits
  armGeometry: ArmGeometry
}

// Telemetry history (ring buffer for charts)
export interface TelemetryPoint {
  timestamp: number
  position: number     // degrees
  velocity: number     // rad/s
  current: number      // Amps
}

// Feedback payload received from main process CAN Bridge
export interface MotorFeedback {
  motorId: number       // 1 or 2
  positionRad: number   // raw radians from motor
  velocityRads: number  // rad/s
  currentA: number      // Amps
  torqueNm: number      // Nm
  temperatureC: number  // Celsius
  faultCode: number     // 0 = OK
}

export interface MotorFaultPayload {
  motorId: number
  faultCode: number
  faultDescription?: string
}

export interface SerialConnectionPayload {
  status: ConnectionStatus
  port?: string
  error?: string
}

// Window Electron API definition
export interface WindowElectronAPI {
  // Serial
  listPorts: () => Promise<AvailablePort[]>
  connectSerial: (port: string, baud?: number) => Promise<{ success: boolean; error?: string }>
  disconnectSerial: () => Promise<{ success: boolean; error?: string }>
  
  // Motors
  enableMotor: (motorId: number) => Promise<boolean>
  disableMotor: (motorId: number) => Promise<boolean>
  setRunMode: (motorId: number, mode: RunMode) => Promise<boolean>
  sendVelocityCommand: (motorId: number, speedRadS: number) => Promise<boolean>
  sendPositionCommand: (motorId: number, positionRad: number, maxSpeedRadS?: number) => Promise<boolean>
  sendCurrentCommand: (motorId: number, currentA: number) => Promise<boolean>
  sendMitCommand: (motorId: number, pDes: number, vDes: number, kp: number, kd: number, tFf: number) => Promise<boolean>
  writeMotorParam: (motorId: number, index: number, format: string, value: number) => Promise<boolean>
  
  // E-STOP & Home
  emergencyStop: () => Promise<boolean>
  home?: () => Promise<boolean | void>
  
  // Config
  getConfig: () => Promise<AppConfig>
  saveConfig: (config: Partial<AppConfig>) => Promise<boolean>
  
  // Events
  onMotorFeedback: (callback: (data: MotorFeedback) => void) => () => void
  onMotorFault: (callback: (data: MotorFaultPayload) => void) => () => void
  onConnectionChange: (callback: (data: SerialConnectionPayload) => void) => () => void
  onAvailablePorts: (callback: (ports: AvailablePort[]) => void) => () => void
  onJointLimitViolation: (callback: (data: { motorId: number; angleDeg: number; limitDeg: number }) => void) => () => void
  
  // Generic IPC listeners
  on: (channel: string, callback: (...args: any[]) => void) => () => void
  send: (channel: string, ...args: any[]) => void
  invoke: (channel: string, ...args: any[]) => Promise<any>
}

declare global {
  interface Window {
    api?: WindowElectronAPI
    electron?: {
      ipcRenderer: {
        on: (channel: string, listener: (event: any, ...args: any[]) => void) => void
        removeListener: (channel: string, listener: (event: any, ...args: any[]) => void) => void
        send: (channel: string, ...args: any[]) => void
        invoke: (channel: string, ...args: any[]) => Promise<any>
      }
    }
  }
}
