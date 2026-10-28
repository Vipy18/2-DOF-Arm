import { MotorAPI, AppConfig } from '../shared/types'
import { WindowElectronAPI } from '../renderer/src/store/types'

declare global {
  interface Window {
    motorAPI?: MotorAPI
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
