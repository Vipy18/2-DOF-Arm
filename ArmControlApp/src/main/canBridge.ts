import { EventEmitter } from 'events'
import { pythonManager } from './pythonManager'
import {
  MotorFeedback,
  FaultEvent,
  ConnectionStatus,
  SerialPortInfo,
  RobstrideParamIndex,
  MotorMode
} from '../shared/types'

const HOST_ID = 0xFD
const BAUD = 921600
const PACKET_HEADER = [0x41, 0x54] // 'A', 'T'
const PACKET_TAIL = [0x0D, 0x0A]   // '\r', '\n'
const PACKET_LEN = 17

export function makePacket(canId: number, dataBytes: Buffer | number[]): Buffer {
  const serialId = ((canId << 3) | 0x04) >>> 0
  const packet = Buffer.alloc(PACKET_LEN, 0)

  // Header [0x41, 0x54]
  packet[0] = PACKET_HEADER[0]
  packet[1] = PACKET_HEADER[1]

  // 4-byte Serial ID (Big Endian)
  packet.writeUInt32BE(serialId, 2)

  // DLC (Data Length)
  const len = Math.min(dataBytes.length, 8)
  packet[6] = len

  // Payload
  if (Buffer.isBuffer(dataBytes)) {
    dataBytes.copy(packet, 7, 0, len)
  } else {
    for (let i = 0; i < len; i++) {
      packet[7 + i] = dataBytes[i]
    }
  }

  // Frame Tail [0x0D, 0x0A]
  packet[15] = PACKET_TAIL[0]
  packet[16] = PACKET_TAIL[1]

  return packet
}

export class CanBridge extends EventEmitter {
  private connected: boolean = false
  private currentPortPath: string = ''

  constructor() {
    super()
    this.setupSubscriptions()
  }

  private setupSubscriptions(): void {
    pythonManager.on('feedback', (feedbacks: MotorFeedback[]) => {
      this.emit('feedback', feedbacks)
    })

    pythonManager.on('fault', (fault: FaultEvent) => {
      this.emit('fault', fault)
    })

    pythonManager.on('connectionChange', (status: ConnectionStatus) => {
      this.connected = !!status.connected
      this.currentPortPath = status.port || ''
      this.emit('connectionChange', status)
    })

    pythonManager.on('exit', () => {
      if (this.connected) {
        this.connected = false
        this.currentPortPath = ''
        this.emit('connectionChange', {
          connected: false,
          error: 'Python backend disconnected'
        } as ConnectionStatus)
      }
    })
  }

  public isConnected(): boolean {
    return this.connected
  }

  public async listPorts(): Promise<SerialPortInfo[]> {
    try {
      const res = await pythonManager.sendCommand<{ data: SerialPortInfo[] }>({
        cmd: 'listPorts'
      })
      return res.data || []
    } catch (err) {
      console.error('[CanBridge] Error listing ports:', err)
      return []
    }
  }

  public async open(portPath: string): Promise<void> {
    try {
      await pythonManager.sendCommand({
        cmd: 'open',
        port: portPath
      }, 5000)
    } catch (err: any) {
      this.emit('connectionChange', {
        connected: false,
        port: portPath,
        error: err.message || 'Failed to open serial port'
      } as ConnectionStatus)
      throw err
    }
  }

  public async close(): Promise<void> {
    try {
      await pythonManager.sendCommand({
        cmd: 'close'
      }, 3000)
    } catch (err) {
      console.error('[CanBridge] Error closing port:', err)
    } finally {
      this.connected = false
      this.currentPortPath = ''
    }
  }

  public async enableMotor(motorId: number): Promise<void> {
    await pythonManager.sendCommand({
      cmd: 'enable',
      motorId
    })
  }

  public async disableMotor(motorId: number): Promise<void> {
    await pythonManager.sendCommand({
      cmd: 'disable',
      motorId
    })
  }

  /**
   * E-Stop: Disables both motors atomically without delay
   */
  public async eStop(): Promise<void> {
    await pythonManager.sendCommand({
      cmd: 'eStop'
    }, 2000)
  }

  public async setMode(motorId: number, mode: number): Promise<void> {
    await pythonManager.sendCommand({
      cmd: 'setMode',
      motorId,
      mode
    })
  }

  public async home(): Promise<void> {
    await pythonManager.sendCommand({
      cmd: 'home'
    })
  }

  public async writeParam(
    motorId: number,
    index: number,
    format: string,
    value: number
  ): Promise<void> {
    await pythonManager.sendCommand({
      cmd: 'writeParam',
      motorId,
      index,
      format,
      value
    })
  }

  public async readParam(motorId: number, index: number, timeoutMs = 600): Promise<number> {
    const res = await pythonManager.sendCommand<{ value: number }>({
      cmd: 'readParam',
      motorId,
      index,
      timeout: timeoutMs / 1000
    }, timeoutMs + 500)
    return res.value
  }

  /**
   * Joint-space motion control (move_j)
   */
  public async moveJ(theta1: number, theta2: number): Promise<any> {
    return await pythonManager.sendCommand({
      cmd: 'move_j',
      theta1,
      theta2
    })
  }

  /**
   * Cartesian motion control (move_l)
   */
  public async moveL(
    x: number,
    y: number,
    elbow: 'up' | 'down' = 'down',
    l1: number = 0.4,
    l2: number = 0.3
  ): Promise<any> {
    return await pythonManager.sendCommand({
      cmd: 'move_l',
      x,
      y,
      elbow,
      l1,
      l2
    })
  }

  /**
   * Inverse Kinematics calculation via Python backend
   */
  public async calculateIK(
    x: number,
    y: number,
    elbow: 'up' | 'down' = 'down',
    l1: number = 0.4,
    l2: number = 0.3
  ): Promise<any> {
    return await pythonManager.sendCommand({
      cmd: 'ik',
      x,
      y,
      elbow,
      l1,
      l2
    })
  }

  /**
   * Forward Kinematics calculation via Python backend
   */
  public async calculateFK(
    theta1: number,
    theta2: number,
    l1: number = 0.4,
    l2: number = 0.3
  ): Promise<any> {
    return await pythonManager.sendCommand({
      cmd: 'fk',
      theta1,
      theta2,
      l1,
      l2
    })
  }
}

export const canBridge = new CanBridge()
