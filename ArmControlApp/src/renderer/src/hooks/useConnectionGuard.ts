import { useEffect, useRef } from 'react'
import { useAppStore } from '../store/motorStore'
import { ConnectionStatus } from '../store/types'
import { useToast } from '../components/ToastProvider'

export function useConnectionGuard(): void {
  const connectionStatus = useAppStore((state) => state.connection.status)
  const motors = useAppStore((state) => state.motors)
  const safety = useAppStore((state) => state.safety)
  const triggerEStop = useAppStore((state) => state.triggerEStop)
  const setSafetyFlag = useAppStore((state) => state.setSafetyFlag)
  const { showToast } = useToast()

  const prevStatusRef = useRef<ConnectionStatus>(connectionStatus)
  const prevMotorsEnabledRef = useRef<boolean>(motors[0]?.enabled || motors[1]?.enabled)

  useEffect(() => {
    prevMotorsEnabledRef.current = Boolean(motors[0]?.enabled || motors[1]?.enabled)
  }, [motors])

  useEffect(() => {
    const prevStatus = prevStatusRef.current
    const currentStatus = connectionStatus

    // Check for disconnect or error after being connected
    if (prevStatus === 'connected' && (currentStatus === 'disconnected' || currentStatus === 'error')) {
      // Disconnect detected while previously connected
      try {
        setSafetyFlag('connectionLost', true)
        triggerEStop()

        if (window.api && typeof window.api.emergencyStop === 'function') {
          window.api.emergencyStop().catch((err) => console.warn('Best-effort E-STOP on disconnect failed:', err))
        } else if ((window as any).motorAPI && typeof (window as any).motorAPI.eStop === 'function') {
          (window as any).motorAPI.eStop().catch((err: any) => console.warn('Best-effort E-STOP on disconnect failed:', err))
        }
      } catch (err) {
        console.error('Error during connection loss safety routine:', err)
      }

      showToast({
        message: 'Connection lost — motors disabled',
        type: 'error',
        durationMs: 5000
      })
    }

    // Check for reconnection after connection loss
    if ((prevStatus === 'disconnected' || prevStatus === 'error' || prevStatus === 'connecting') && currentStatus === 'connected') {
      if (safety.connectionLost) {
        setSafetyFlag('connectionLost', false)
      }
      showToast({
        message: 'Connection restored',
        type: 'success',
        durationMs: 3000
      })
    }

    prevStatusRef.current = currentStatus
  }, [connectionStatus, safety.connectionLost, triggerEStop, setSafetyFlag, showToast])
}

export default useConnectionGuard
