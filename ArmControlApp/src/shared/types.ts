export interface MotorConfig {
  jointLimitMin: number // in degrees
  jointLimitMax: number // in degrees
  maxCurrent: number    // in Amperes
}

export interface AppConfig {
  lastPort: string
  motor1: MotorConfig
  motor2: MotorConfig
}

export interface MotorFeedback {
  motorId: number
  position: number      // rad
  velocity: number      // rad/s
  current: number       // A
  torque: number        // Nm
  temperature: number   // °C
  faultCode: number     // 0 = OK, bitmask for faults
  timestamp: number
}

export interface FaultEvent {
  motorId: number
  faultCode: number
  message: string
  timestamp: number
}

export interface ConnectionStatus {
  connected: boolean
  port?: string
  error?: string
}

export interface SerialPortInfo {
  path: string
  manufacturer?: string
  pnpId?: string
  serialNumber?: string
}

export interface MotorAPI {
  // Serial
  listPorts: () => Promise<SerialPortInfo[]>
  connect: (port: string) => Promise<void>
  disconnect: () => Promise<void>

  // Motor control
  enableMotor: (motorId: number) => Promise<void>
  disableMotor: (motorId: number) => Promise<void>
  eStop: () => Promise<void>
  writeParam: (motorId: number, index: number, format: string, value: number) => Promise<void>
  readParam: (motorId: number, index: number) => Promise<number>
  setMode: (motorId: number, mode: number) => Promise<void>
  home: () => Promise<void>

  // Motion control paradigms
  moveJ?: (theta1: number, theta2: number) => Promise<any>
  moveL?: (x: number, y: number, elbow?: 'up' | 'down', l1?: number, l2?: number) => Promise<any>

  // Kinematics via Python backend
  calculateIK?: (x: number, y: number, elbow?: 'up' | 'down', l1?: number, l2?: number) => Promise<any>
  calculateFK?: (theta1: number, theta2: number, l1?: number, l2?: number) => Promise<any>

  // Config
  getConfig: () => Promise<AppConfig>
  saveConfig: (config: AppConfig) => Promise<void>

  // Events (from main to renderer)
  onFeedback: (cb: (data: MotorFeedback[]) => void) => () => void
  onFault: (cb: (data: FaultEvent) => void) => () => void
  onConnectionChange: (cb: (status: ConnectionStatus) => void) => () => void
}

export enum RobstrideParamIndex {
  CAN_TIMEOUT = 0x200C, // Uint32, 0=disable timeout
  RUN_MODE = 0x7005,    // Uint8: 0=pos, 1=cur, 2=vel, 3=MIT
  IQ_REF = 0x7006,      // Float: current command
  SPD_REF = 0x700A,     // Float: velocity command (rad/s)
  VEL_KP = 0x700B,      // Float
  VEL_KI = 0x700C,      // Float
  POS_KP = 0x7015,      // Float
  POS_REF = 0x7016,     // Float: position command (rad)
  LIMIT_CUR = 0x7018    // Float: max current (A)
}

export enum MotorMode {
  POSITION = 0,
  CURRENT = 1,
  VELOCITY = 2,
  MIT = 3
}
