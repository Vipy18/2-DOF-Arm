import { useAppStore } from './motorStore'
import { MotorFeedback, MotorFaultPayload, SerialConnectionPayload, AvailablePort } from './types'
import { decodeFault, isFault } from './faultDecoder'

/**
 * Forward Kinematics calculation helper
 * Computes elbow and end-effector 2D coordinates from joint angles (in radians).
 */
export function computeForwardKinematics(
  theta1Rad: number,
  theta2Rad: number,
  l1 = 0.4,
  l2 = 0.3
) {
  const elbowX = l1 * Math.cos(theta1Rad)
  const elbowY = l1 * Math.sin(theta1Rad)
  const endEffectorX = elbowX + l2 * Math.cos(theta1Rad + theta2Rad)
  const endEffectorY = elbowY + l2 * Math.sin(theta1Rad + theta2Rad)

  return {
    elbow: { x: elbowX, y: elbowY },
    endEffector: { x: endEffectorX, y: endEffectorY }
  }
}

/**
 * Handles incoming Motor Feedback from main process
 */
export function handleMotorFeedback(feedback: MotorFeedback | MotorFeedback[] | any): void {
  try {
    if (!feedback) return
    if (Array.isArray(feedback)) {
      for (const item of feedback) {
        handleMotorFeedback(item)
      }
      return
    }

    if (typeof feedback.motorId !== 'number') return

    const store = useAppStore.getState()
    const motorId = feedback.motorId
    const positionRad = feedback.positionRad !== undefined ? feedback.positionRad : (feedback.position ?? 0)
    const velocityRads = feedback.velocityRads !== undefined ? feedback.velocityRads : (feedback.velocity ?? 0)
    const currentA = feedback.currentA !== undefined ? feedback.currentA : (feedback.current ?? 0)
    const torqueNm = feedback.torqueNm !== undefined ? feedback.torqueNm : (feedback.torque ?? 0)
    const temperatureC = feedback.temperatureC !== undefined ? feedback.temperatureC : (feedback.temperature ?? 0)
    const faultCode = feedback.faultCode ?? 0

    const positionDeg = (positionRad * 180) / Math.PI
    const faultDesc = decodeFault(faultCode)

    // 1. Update motor store
    store.updateMotor(motorId, {
      position: positionDeg,
      velocity: velocityRads,
      current: currentA,
      torque: torqueNm,
      temperature: temperatureC,
      faultCode,
      faultDescription: faultDesc
    })

    // 2. Compute FK and update Arm state
    const currentMotors = store.motors
    const currentConfig = store.config
    const l1 = currentConfig.armGeometry?.l1 ?? 0.4
    const l2 = currentConfig.armGeometry?.l2 ?? 0.3

    let theta1 = (currentMotors[0].position * Math.PI) / 180
    let theta2 = (currentMotors[1].position * Math.PI) / 180

    if (motorId === 1) {
      theta1 = positionRad
    } else if (motorId === 2) {
      theta2 = positionRad
    }

    const { elbow, endEffector } = computeForwardKinematics(theta1, theta2, l1, l2)

    store.updateArm({
      theta1,
      theta2,
      elbow,
      endEffector
    })

    // 3. Push to Telemetry ring buffer (capped at 200 points)
    store.pushTelemetry(motorId, {
      timestamp: feedback.timestamp ?? Date.now(),
      position: positionDeg,
      velocity: velocityRads,
      current: currentA
    })
  } catch (error) {
    console.error('Error handling motor feedback:', error)
  }
}

/**
 * Handles incoming Motor Fault from main process
 */
export function handleMotorFault(payload: MotorFaultPayload | any): void {
  try {
    if (!payload || typeof payload.motorId !== 'number') return

    const store = useAppStore.getState()
    const faultDesc = payload.faultDescription || payload.message || decodeFault(payload.faultCode)

    store.updateMotor(payload.motorId, {
      faultCode: payload.faultCode,
      faultDescription: faultDesc
    })

    if (isFault(payload.faultCode)) {
      console.warn(`Motor ${payload.motorId} reported fault 0x${payload.faultCode.toString(16)}: ${faultDesc}`)
    }
  } catch (error) {
    console.error('Error handling motor fault:', error)
  }
}

/**
 * Handles serial connection status changes from main process
 */
export function handleConnectionChange(payload: SerialConnectionPayload | any): void {
  try {
    if (!payload) return

    const store = useAppStore.getState()
    // Support both { status: 'connected' } and { connected: true, port: 'COM3' }
    let status = payload.status
    if (!status && typeof payload.connected === 'boolean') {
      if (payload.connected) {
        status = 'connected'
      } else if (payload.error) {
        status = 'error'
      } else {
        status = 'disconnected'
      }
    }

    if (status === 'connected' && payload.port) {
      store.setConnectedPort(payload.port)
    } else {
      store.setConnectionStatus(status || 'disconnected', payload.error)
    }
  } catch (error) {
    console.error('Error handling connection change:', error)
  }
}

/**
 * Sets up all IPC listeners between Electron main process and Zustand stores.
 * Call this once in App.tsx or application root on mount.
 * @returns Cleanup function to remove all active listeners on unmount.
 */
export function setupIpcListeners(): () => void {
  const cleanups: (() => void)[] = []

  try {
    // 0. Preload window.motorAPI bridge
    if ((window as any).motorAPI) {
      const motorAPI = (window as any).motorAPI
      if (typeof motorAPI.onFeedback === 'function') {
        const unbind = motorAPI.onFeedback((data: any) => handleMotorFeedback(data))
        if (typeof unbind === 'function') cleanups.push(unbind)
      }
      if (typeof motorAPI.onFault === 'function') {
        const unbind = motorAPI.onFault((data: any) => handleMotorFault(data))
        if (typeof unbind === 'function') cleanups.push(unbind)
      }
      if (typeof motorAPI.onConnectionChange === 'function') {
        const unbind = motorAPI.onConnectionChange((data: any) => handleConnectionChange(data))
        if (typeof unbind === 'function') cleanups.push(unbind)
      }
    }

    // 1. Direct window.api typed listener bridges (preferred Electron preload pattern)
    if (window.api) {
      if (typeof window.api.onMotorFeedback === 'function') {
        const unbind = window.api.onMotorFeedback((data) => handleMotorFeedback(data))
        if (typeof unbind === 'function') cleanups.push(unbind)
      }

      if (typeof window.api.onMotorFault === 'function') {
        const unbind = window.api.onMotorFault((data) => handleMotorFault(data))
        if (typeof unbind === 'function') cleanups.push(unbind)
      }

      if (typeof window.api.onConnectionChange === 'function') {
        const unbind = window.api.onConnectionChange((data) => handleConnectionChange(data))
        if (typeof unbind === 'function') cleanups.push(unbind)
      }

      if (typeof window.api.onAvailablePorts === 'function') {
        const unbind = window.api.onAvailablePorts((ports: AvailablePort[]) => {
          try {
            useAppStore.getState().setAvailablePorts(ports)
          } catch (err) {
            console.error('Error updating available ports:', err)
          }
        })
        if (typeof unbind === 'function') cleanups.push(unbind)
      }

      if (typeof window.api.onJointLimitViolation === 'function') {
        const unbind = window.api.onJointLimitViolation((data) => {
          try {
            useAppStore.getState().setSafetyFlag('jointLimitViolation', true)
            console.warn(`Joint limit violation on Motor ${data.motorId}: ${data.angleDeg}° exceeds ${data.limitDeg}°`)
          } catch (err) {
            console.error('Error handling joint limit violation:', err)
          }
        })
        if (typeof unbind === 'function') cleanups.push(unbind)
      }
    }

    // 2. Generic window.api.on event listener fallback
    if (window.api && typeof window.api.on === 'function') {
      const unbindFeedback = window.api.on('motor:feedback', (data: MotorFeedback) => handleMotorFeedback(data))
      if (typeof unbindFeedback === 'function') cleanups.push(unbindFeedback)

      const unbindFault = window.api.on('motor:fault', (data: MotorFaultPayload) => handleMotorFault(data))
      if (typeof unbindFault === 'function') cleanups.push(unbindFault)

      const unbindConn = window.api.on('serial:connectionChange', (data: SerialConnectionPayload) => handleConnectionChange(data))
      if (typeof unbindConn === 'function') cleanups.push(unbindConn)

      const unbindPorts = window.api.on('serial:availablePorts', (ports: AvailablePort[]) => {
        try {
          useAppStore.getState().setAvailablePorts(ports)
        } catch (err) {
          console.error('Error setting available ports:', err)
        }
      })
      if (typeof unbindPorts === 'function') cleanups.push(unbindPorts)

      const unbindLimits = window.api.on('safety:jointLimitViolation', () => {
        try {
          useAppStore.getState().setSafetyFlag('jointLimitViolation', true)
        } catch (err) {
          console.error('Error setting joint limit violation:', err)
        }
      })
      if (typeof unbindLimits === 'function') cleanups.push(unbindLimits)
    }

    // 3. Fallback for window.electron.ipcRenderer
    if (window.electron?.ipcRenderer) {
      const ipc = window.electron.ipcRenderer

      const feedbackHandler = (_: any, data: MotorFeedback) => handleMotorFeedback(data)
      const faultHandler = (_: any, data: MotorFaultPayload) => handleMotorFault(data)
      const connHandler = (_: any, data: SerialConnectionPayload) => handleConnectionChange(data)
      const portsHandler = (_: any, ports: AvailablePort[]) => useAppStore.getState().setAvailablePorts(ports)
      const limitHandler = () => useAppStore.getState().setSafetyFlag('jointLimitViolation', true)

      ipc.on('motor:feedback', feedbackHandler)
      ipc.on('motor:fault', faultHandler)
      ipc.on('serial:connectionChange', connHandler)
      ipc.on('serial:availablePorts', portsHandler)
      ipc.on('safety:jointLimitViolation', limitHandler)

      cleanups.push(() => {
        try {
          ipc.removeListener('motor:feedback', feedbackHandler)
          ipc.removeListener('motor:fault', faultHandler)
          ipc.removeListener('serial:connectionChange', connHandler)
          ipc.removeListener('serial:availablePorts', portsHandler)
          ipc.removeListener('safety:jointLimitViolation', limitHandler)
        } catch (err) {
          console.error('Error cleaning up ipcRenderer listeners:', err)
        }
      })
    }
  } catch (error) {
    console.error('Error initializing IPC listeners in setupIpcListeners:', error)
  }

  return () => {
    for (const cleanup of cleanups) {
      try {
        cleanup()
      } catch (err) {
        console.error('Error running IPC cleanup callback:', err)
      }
    }
  }
}
