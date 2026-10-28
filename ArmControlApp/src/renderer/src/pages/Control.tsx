import React, { useState, useEffect, useCallback, useMemo } from 'react'
import {
  Zap,
  Activity,
  Home,
  Send,
  AlertTriangle,
  AlertOctagon,
  CheckCircle2,
  Crosshair,
  Gauge
} from 'lucide-react'
import { Point2D, IKResult, ElbowConfig } from '../kinematics/types'
import { inverseKinematics } from '../kinematics/inverse'
import { forwardKinematics, radToDeg, degToRad } from '../kinematics/forward'
import { withinJointLimits } from '../kinematics/limits'
import { useAppStore } from '../store/motorStore'
import ArmCanvas from '../components/ArmCanvas'
import ElbowToggle from '../components/ElbowToggle'

/**
 * Throttle utility function
 */
function throttle<T extends (...args: any[]) => any>(fn: T, ms: number): T {
  let last = 0
  return ((...args) => {
    const now = Date.now()
    if (now - last >= ms) {
      last = now
      fn(...args)
    }
  }) as T
}

export default function Control(): React.JSX.Element {
  // Global store subscriptions
  const arm = useAppStore((state) => state.arm)
  const safety = useAppStore((state) => state.safety)
  const connection = useAppStore((state) => state.connection)
  const motors = useAppStore((state) => state.motors)
  const config = useAppStore((state) => state.config)
  const updateArm = useAppStore((state) => state.updateArm)

  // Local page state
  const [dragTarget, setDragTarget] = useState<Point2D | null>(null)
  const [ikResult, setIkResult] = useState<IKResult | null>(null)
  const [elbowPref, setElbowPref] = useState<ElbowConfig>('down')
  const [speed, setSpeed] = useState<number>(0.3)
  const [liveSend, setLiveSend] = useState<boolean>(false)
  const [limitFlash, setLimitFlash] = useState<boolean>(false)
  const [sendSuccess, setSendSuccess] = useState<boolean>(false)

  // Arm geometry & joint limits
  const l1 = config.armGeometry?.l1 ?? 0.4
  const l2 = config.armGeometry?.l2 ?? 0.3

  const limits = useMemo(
    () => ({
      m1Min: degToRad(config.motor1Limits?.minDeg ?? -170),
      m1Max: degToRad(config.motor1Limits?.maxDeg ?? 170),
      m2Min: degToRad(config.motor2Limits?.minDeg ?? -150),
      m2Max: degToRad(config.motor2Limits?.maxDeg ?? 150)
    }),
    [config.motor1Limits, config.motor2Limits]
  )

  // Initialize or update IK result when arm state changes externally if not dragging
  useEffect(() => {
    if (!dragTarget) {
      const res = inverseKinematics(arm.endEffector, elbowPref, l1, l2)
      setIkResult(res)
    }
  }, [arm.endEffector, elbowPref, l1, l2, dragTarget])

  // Motor communication API helpers wrapped in try/catch
  const sendPositionCommand = useCallback(
    async (motorId: number, positionRad: number, maxSpeedRadS?: number): Promise<boolean> => {
      try {
        if (window.api && typeof window.api.sendPositionCommand === 'function') {
          return await window.api.sendPositionCommand(motorId, positionRad, maxSpeedRadS)
        } else if ((window as any).motorAPI && typeof (window as any).motorAPI.writeParam === 'function') {
          await (window as any).motorAPI.writeParam(motorId, 0x7016, '<f', positionRad)
          return true
        } else if (window.electron?.ipcRenderer) {
          await window.electron.ipcRenderer.invoke('motor:writeParam', motorId, 0x7016, '<f', positionRad)
          return true
        }
        return false
      } catch (err) {
        console.error(`[Control] Failed sending position to Motor ${motorId}:`, err)
        return false
      }
    },
    []
  )

  const sendHomeCommand = useCallback(async (): Promise<boolean> => {
    try {
      if (window.api && typeof window.api.home === 'function') {
        await window.api.home()
        return true
      } else if ((window as any).motorAPI && typeof (window as any).motorAPI.home === 'function') {
        await (window as any).motorAPI.home()
        return true
      } else if (window.electron?.ipcRenderer) {
        await window.electron.ipcRenderer.invoke('motor:home')
        return true
      }
      return false
    } catch (err) {
      console.error('[Control] Failed sending home command:', err)
      return false
    }
  }, [])

  // Drag handler (throttled at 20ms)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const handleDrag = useCallback(
    throttle((point: Point2D) => {
      setDragTarget(point)
      const result = inverseKinematics(point, elbowPref, l1, l2)
      setIkResult(result)

      if (result.solution && result.isReachable && liveSend && !safety.eStopActive) {
        const { theta1, theta2 } = result.solution
        if (withinJointLimits({ theta1, theta2 }, limits)) {
          // Send to motors
          sendPositionCommand(1, theta1)
          sendPositionCommand(2, theta2)

          // Update arm store
          const fk = forwardKinematics({ theta1, theta2 }, l1, l2)
          updateArm({
            theta1,
            theta2,
            elbow: fk.elbow,
            endEffector: fk.endEffector
          })
        }
      }
    }, 20),
    [elbowPref, liveSend, safety.eStopActive, l1, l2, limits, sendPositionCommand, updateArm]
  )

  // Drag end handler
  const handleDragEnd = useCallback(
    (point: Point2D) => {
      setDragTarget(null)
      const result = inverseKinematics(point, elbowPref, l1, l2)
      setIkResult(result)

      if (!result.solution || !result.isReachable) return
      const { theta1, theta2 } = result.solution

      // Check joint limits
      if (!withinJointLimits({ theta1, theta2 }, limits)) {
        setLimitFlash(true)
        setTimeout(() => setLimitFlash(false), 1500)
        return
      }

      // Update arm store
      const fk = forwardKinematics({ theta1, theta2 }, l1, l2)
      updateArm({
        theta1,
        theta2,
        elbow: fk.elbow,
        endEffector: fk.endEffector
      })

      // Send to motors if not already live sending
      if (!liveSend && !safety.eStopActive) {
        sendPositionCommand(1, theta1)
        sendPositionCommand(2, theta2)
      }
    },
    [elbowPref, liveSend, safety.eStopActive, l1, l2, limits, sendPositionCommand, updateArm]
  )

  // Handle elbow toggle change
  const handleElbowPrefChange = useCallback(
    (newElbow: ElbowConfig) => {
      setElbowPref(newElbow)
      const currentPos = dragTarget ?? arm.endEffector
      const result = inverseKinematics(currentPos, newElbow, l1, l2)
      setIkResult(result)

      if (liveSend && result.solution && result.isReachable && !safety.eStopActive) {
        const { theta1, theta2 } = result.solution
        if (withinJointLimits({ theta1, theta2 }, limits)) {
          sendPositionCommand(1, theta1)
          sendPositionCommand(2, theta2)
          const fk = forwardKinematics({ theta1, theta2 }, l1, l2)
          updateArm({
            theta1,
            theta2,
            elbow: fk.elbow,
            endEffector: fk.endEffector
          })
        }
      }
    },
    [dragTarget, arm.endEffector, l1, l2, liveSend, safety.eStopActive, limits, sendPositionCommand, updateArm]
  )

  // Explicit Send to Robot button
  const handleSendToRobot = async (): Promise<void> => {
    if (safety.eStopActive) return

    let solution = ikResult?.solution
    if (!solution) {
      const currentPos = dragTarget ?? arm.endEffector
      const res = inverseKinematics(currentPos, elbowPref, l1, l2)
      setIkResult(res)
      solution = res.solution
    }

    if (!solution || (ikResult && !ikResult.isReachable)) {
      return
    }

    const { theta1, theta2 } = solution

    // Check joint limits
    if (!withinJointLimits({ theta1, theta2 }, limits)) {
      setLimitFlash(true)
      setTimeout(() => setLimitFlash(false), 1500)
      return
    }

    // Update arm store
    const fk = forwardKinematics({ theta1, theta2 }, l1, l2)
    updateArm({
      theta1,
      theta2,
      elbow: fk.elbow,
      endEffector: fk.endEffector
    })

    // Send position commands to both motors
    await sendPositionCommand(1, theta1)
    await sendPositionCommand(2, theta2)

    setSendSuccess(true)
    setTimeout(() => setSendSuccess(false), 1200)
  }

  // Home Robot button
  const handleHome = async (): Promise<void> => {
    if (safety.eStopActive) return
    await sendHomeCommand()

    const fk = forwardKinematics({ theta1: 0, theta2: 0 }, l1, l2)
    updateArm({
      theta1: 0,
      theta2: 0,
      elbow: fk.elbow,
      endEffector: fk.endEffector
    })

    const res = inverseKinematics(fk.endEffector, elbowPref, l1, l2)
    setIkResult(res)
  }

  // Display coordinate and angle computations
  const currentXY: Point2D = dragTarget ?? arm.endEffector
  const displayTheta1 = ikResult?.solution ? ikResult.solution.theta1 : arm.theta1
  const displayTheta2 = ikResult?.solution ? ikResult.solution.theta2 : arm.theta2

  const theta1Deg = radToDeg(displayTheta1)
  const theta2Deg = radToDeg(displayTheta2)

  // Status chip evaluation
  let statusLabel = 'IN WORKSPACE'
  let statusDotColor = '#22c55e'
  let statusBg = 'rgba(34, 197, 94, 0.1)'
  let statusBorder = 'rgba(34, 197, 94, 0.25)'

  if (ikResult) {
    if (!ikResult.isReachable || !ikResult.solution) {
      statusLabel = 'OUT OF REACH'
      statusDotColor = '#ef4444'
      statusBg = 'rgba(239, 68, 68, 0.12)'
      statusBorder = 'rgba(239, 68, 68, 0.3)'
    } else if (ikResult.isSingular) {
      statusLabel = 'NEAR SINGULARITY'
      statusDotColor = '#f59e0b'
      statusBg = 'rgba(245, 158, 11, 0.12)'
      statusBorder = 'rgba(245, 158, 11, 0.3)'
    }
  }

  const isOutOfReach = ikResult !== null && (!ikResult.isReachable || !ikResult.solution)
  const isSendDisabled = safety.eStopActive || isOutOfReach
  const activeMode = motors[0]?.mode ? motors[0].mode.toUpperCase() : 'POSITION'

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'row',
        width: '100%',
        height: '100%',
        backgroundColor: '#131318',
        overflow: 'hidden',
        position: 'relative'
      }}
    >
      {/* ============================================================ */}
      {/* LEFT PANEL (~70% width): Interactive Arm Canvas + Header Bar */}
      {/* ============================================================ */}
      <div
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          height: '100%',
          position: 'relative',
          borderRight: '1px solid rgba(255, 255, 255, 0.08)',
          backgroundColor: '#131318'
        }}
      >
        {/* Top Control Switch Bar */}
        <div
          style={{
            height: '52px',
            padding: '0 20px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
            backgroundColor: 'rgba(255, 255, 255, 0.02)',
            zIndex: 10,
            userSelect: 'none'
          }}
        >
          {/* Left: Mode Chip & Header */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Crosshair size={16} color="#38BDF8" />
              <span
                className="mono"
                style={{
                  fontSize: '12px',
                  fontWeight: 700,
                  letterSpacing: '1px',
                  color: '#ffffff'
                }}
              >
                INTERACTIVE IK
              </span>
            </div>

            {/* RunMode Badge */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '3px 8px',
                borderRadius: '4px',
                backgroundColor: 'rgba(56, 189, 248, 0.1)',
                border: '1px solid rgba(56, 189, 248, 0.25)'
              }}
            >
              <span
                style={{
                  width: '6px',
                  height: '6px',
                  borderRadius: '50%',
                  backgroundColor: '#38BDF8'
                }}
              />
              <span
                className="mono"
                style={{
                  fontSize: '10px',
                  fontWeight: 600,
                  letterSpacing: '0.8px',
                  color: '#38BDF8'
                }}
              >
                MODE: {activeMode}
              </span>
            </div>
          </div>

          {/* Right: Live Send Toggle Switch */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <label
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                cursor: safety.eStopActive ? 'not-allowed' : 'pointer'
              }}
            >
              <span
                className="mono"
                style={{
                  fontSize: '11px',
                  fontWeight: 600,
                  letterSpacing: '0.8px',
                  color: liveSend ? '#38BDF8' : 'rgba(255, 255, 255, 0.5)',
                  transition: 'color 150ms ease'
                }}
              >
                LIVE SEND {liveSend ? 'ON' : 'OFF'}
              </span>

              {/* Custom Switch Component */}
              <button
                type="button"
                role="switch"
                aria-checked={liveSend}
                disabled={safety.eStopActive}
                onClick={() => setLiveSend((prev) => !prev)}
                style={{
                  width: '38px',
                  height: '20px',
                  borderRadius: '10px',
                  backgroundColor: liveSend ? '#38BDF8' : 'rgba(255, 255, 255, 0.12)',
                  border: liveSend
                    ? '1px solid rgba(56, 189, 248, 0.6)'
                    : '1px solid rgba(255, 255, 255, 0.18)',
                  position: 'relative',
                  cursor: safety.eStopActive ? 'not-allowed' : 'pointer',
                  transition: 'all 200ms ease',
                  padding: 0,
                  outline: 'none'
                }}
              >
                <div
                  style={{
                    width: '14px',
                    height: '14px',
                    borderRadius: '50%',
                    backgroundColor: '#ffffff',
                    position: 'absolute',
                    top: '2px',
                    left: liveSend ? '20px' : '2px',
                    transition: 'all 200ms cubic-bezier(0.4, 0, 0.2, 1)',
                    boxShadow: '0 1px 3px rgba(0, 0, 0, 0.4)'
                  }}
                />
              </button>
            </label>
          </div>
        </div>

        {/* Arm Canvas Container */}
        <div
          style={{
            flex: 1,
            position: 'relative',
            width: '100%',
            height: 'calc(100% - 52px)',
            overflow: 'hidden'
          }}
        >
          <ArmCanvas
            theta1={displayTheta1}
            theta2={displayTheta2}
            interactive={!safety.eStopActive}
            showWorkspace={true}
            l1={l1}
            l2={l2}
            onEndEffectorDrag={handleDrag}
            onEndEffectorDragEnd={handleDragEnd}
          />

          {/* E-STOP ACTIVE OVERLAY */}
          {safety.eStopActive && (
            <div
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                backgroundColor: 'rgba(19, 19, 24, 0.85)',
                backdropFilter: 'blur(8px)',
                WebkitBackdropFilter: 'blur(8px)',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '12px',
                zIndex: 20,
                userSelect: 'none'
              }}
            >
              <div
                style={{
                  width: '56px',
                  height: '56px',
                  borderRadius: '50%',
                  backgroundColor: 'rgba(239, 68, 68, 0.15)',
                  border: '2px solid #ef4444',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  animation: 'pulseRed 1.5s ease-in-out infinite'
                }}
              >
                <AlertOctagon size={32} color="#ef4444" />
              </div>
              <span
                className="mono"
                style={{
                  fontSize: '18px',
                  fontWeight: 800,
                  letterSpacing: '2px',
                  color: '#ef4444'
                }}
              >
                E-STOP ACTIVE
              </span>
              <span
                style={{
                  fontSize: '13px',
                  color: 'rgba(255, 255, 255, 0.6)',
                  textAlign: 'center',
                  maxWidth: '320px'
                }}
              >
                Arm movement and motor commands are inhibited. Reset Emergency Stop in header to resume control.
              </span>
            </div>
          )}

          {/* Dragging Coordinate Tooltip Badge */}
          {dragTarget && (
            <div
              className="mono"
              style={{
                position: 'absolute',
                bottom: '16px',
                left: '16px',
                padding: '6px 12px',
                backgroundColor: 'rgba(15, 15, 20, 0.85)',
                border: '1px solid rgba(56, 189, 248, 0.3)',
                borderRadius: '6px',
                backdropFilter: 'blur(10px)',
                WebkitBackdropFilter: 'blur(10px)',
                fontSize: '11px',
                color: '#38BDF8',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                pointerEvents: 'none',
                zIndex: 15
              }}
            >
              <Crosshair size={13} color="#38BDF8" />
              <span>
                TARGET: ({dragTarget.x.toFixed(3)}m, {dragTarget.y.toFixed(3)}m)
              </span>
            </div>
          )}
        </div>
      </div>

      {/* ============================================================ */}
      {/* RIGHT PANEL (~30% width): Coordinates, Angles, Elbow & Sends */}
      {/* ============================================================ */}
      <div
        className="glass"
        style={{
          width: '340px',
          minWidth: '300px',
          maxWidth: '380px',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          gap: '18px',
          padding: '20px',
          overflowY: 'auto',
          backgroundColor: 'rgba(255, 255, 255, 0.04)',
          borderLeft: '1px solid rgba(255, 255, 255, 0.08)',
          boxSizing: 'border-box',
          userSelect: 'none'
        }}
      >
        {/* Section 1: End-Effector Coordinates */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
            paddingBottom: '16px',
            borderBottom: '1px solid rgba(255, 255, 255, 0.08)'
          }}
        >
          <span
            className="mono"
            style={{
              fontSize: '11px',
              fontWeight: 700,
              letterSpacing: '1.2px',
              color: 'rgba(255, 255, 255, 0.45)',
              textTransform: 'uppercase'
            }}
          >
            END EFFECTOR
          </span>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
            {/* Coordinate X */}
            <div
              style={{
                backgroundColor: 'rgba(255, 255, 255, 0.03)',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                borderRadius: '6px',
                padding: '10px 12px'
              }}
            >
              <div
                className="mono"
                style={{
                  fontSize: '10px',
                  color: 'rgba(255, 255, 255, 0.4)',
                  marginBottom: '2px'
                }}
              >
                X AXIS
              </div>
              <div
                className="mono"
                style={{
                  fontSize: '18px',
                  fontWeight: 700,
                  color: '#ffffff'
                }}
              >
                {currentXY.x.toFixed(3)}
                <span
                  style={{
                    fontSize: '11px',
                    fontWeight: 400,
                    color: 'rgba(255, 255, 255, 0.4)',
                    marginLeft: '4px'
                  }}
                >
                  m
                </span>
              </div>
            </div>

            {/* Coordinate Y */}
            <div
              style={{
                backgroundColor: 'rgba(255, 255, 255, 0.03)',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                borderRadius: '6px',
                padding: '10px 12px'
              }}
            >
              <div
                className="mono"
                style={{
                  fontSize: '10px',
                  color: 'rgba(255, 255, 255, 0.4)',
                  marginBottom: '2px'
                }}
              >
                Y AXIS
              </div>
              <div
                className="mono"
                style={{
                  fontSize: '18px',
                  fontWeight: 700,
                  color: '#ffffff'
                }}
              >
                {currentXY.y.toFixed(3)}
                <span
                  style={{
                    fontSize: '11px',
                    fontWeight: 400,
                    color: 'rgba(255, 255, 255, 0.4)',
                    marginLeft: '4px'
                  }}
                >
                  m
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Section 2: Joint Angles */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
            paddingBottom: '16px',
            borderBottom: '1px solid rgba(255, 255, 255, 0.08)'
          }}
        >
          <span
            className="mono"
            style={{
              fontSize: '11px',
              fontWeight: 700,
              letterSpacing: '1.2px',
              color: 'rgba(255, 255, 255, 0.45)',
              textTransform: 'uppercase'
            }}
          >
            JOINT ANGLES
          </span>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
            {/* θ1 (Motor 1 / Shoulder) */}
            <div
              style={{
                backgroundColor: limitFlash ? 'rgba(239, 68, 68, 0.15)' : 'rgba(255, 255, 255, 0.03)',
                border: limitFlash
                  ? '1px solid rgba(239, 68, 68, 0.5)'
                  : '1px solid rgba(255, 255, 255, 0.08)',
                borderRadius: '6px',
                padding: '10px 12px',
                transition: 'all 150ms ease'
              }}
            >
              <div
                className="mono"
                style={{
                  fontSize: '10px',
                  color: 'rgba(255, 255, 255, 0.4)',
                  marginBottom: '2px',
                  display: 'flex',
                  justifyContent: 'space-between'
                }}
              >
                <span>θ1 (M1)</span>
                <span>BASE</span>
              </div>
              <div
                className="mono"
                style={{
                  fontSize: '18px',
                  fontWeight: 700,
                  color: limitFlash ? '#ef4444' : '#ffffff'
                }}
              >
                {theta1Deg.toFixed(1)}°
              </div>
              <div
                className="mono"
                style={{
                  fontSize: '10px',
                  color: 'rgba(255, 255, 255, 0.35)',
                  marginTop: '2px'
                }}
              >
                {displayTheta1.toFixed(3)} rad
              </div>
            </div>

            {/* θ2 (Motor 2 / Elbow) */}
            <div
              style={{
                backgroundColor: limitFlash ? 'rgba(239, 68, 68, 0.15)' : 'rgba(255, 255, 255, 0.03)',
                border: limitFlash
                  ? '1px solid rgba(239, 68, 68, 0.5)'
                  : '1px solid rgba(255, 255, 255, 0.08)',
                borderRadius: '6px',
                padding: '10px 12px',
                transition: 'all 150ms ease'
              }}
            >
              <div
                className="mono"
                style={{
                  fontSize: '10px',
                  color: 'rgba(255, 255, 255, 0.4)',
                  marginBottom: '2px',
                  display: 'flex',
                  justifyContent: 'space-between'
                }}
              >
                <span>θ2 (M2)</span>
                <span>ELBOW</span>
              </div>
              <div
                className="mono"
                style={{
                  fontSize: '18px',
                  fontWeight: 700,
                  color: limitFlash ? '#ef4444' : '#ffffff'
                }}
              >
                {theta2Deg.toFixed(1)}°
              </div>
              <div
                className="mono"
                style={{
                  fontSize: '10px',
                  color: 'rgba(255, 255, 255, 0.35)',
                  marginTop: '2px'
                }}
              >
                {displayTheta2.toFixed(3)} rad
              </div>
            </div>
          </div>
        </div>

        {/* Section 3: Elbow Configuration Toggle */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
            paddingBottom: '16px',
            borderBottom: '1px solid rgba(255, 255, 255, 0.08)'
          }}
        >
          <span
            className="mono"
            style={{
              fontSize: '11px',
              fontWeight: 700,
              letterSpacing: '1.2px',
              color: 'rgba(255, 255, 255, 0.45)',
              textTransform: 'uppercase'
            }}
          >
            ELBOW CONFIGURATION
          </span>

          <ElbowToggle
            value={elbowPref}
            onChange={handleElbowPrefChange}
            disabled={safety.eStopActive}
          />
        </div>

        {/* Section 4: Move Speed Slider */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
            paddingBottom: '16px',
            borderBottom: '1px solid rgba(255, 255, 255, 0.08)'
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between'
            }}
          >
            <span
              className="mono"
              style={{
                fontSize: '11px',
                fontWeight: 700,
                letterSpacing: '1.2px',
                color: 'rgba(255, 255, 255, 0.45)',
                textTransform: 'uppercase'
              }}
            >
              MOVE SPEED
            </span>
            <span
              className="mono"
              style={{
                fontSize: '12px',
                fontWeight: 700,
                color: '#38BDF8'
              }}
            >
              {Math.round(speed * 100)}%
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <Gauge size={14} color="rgba(255, 255, 255, 0.4)" />
            <input
              type="range"
              min="0.05"
              max="1.0"
              step="0.01"
              value={speed}
              disabled={safety.eStopActive}
              onChange={(e) => setSpeed(parseFloat(e.target.value))}
              style={{
                flex: 1,
                accentColor: '#38BDF8',
                height: '4px',
                backgroundColor: 'rgba(255, 255, 255, 0.1)',
                borderRadius: '2px',
                cursor: safety.eStopActive ? 'not-allowed' : 'pointer'
              }}
            />
          </div>
        </div>

        {/* Section 5: Kinematics Status Chip */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
            padding: '8px 12px',
            borderRadius: '6px',
            backgroundColor: statusBg,
            border: `1px solid ${statusBorder}`,
            transition: 'all 200ms ease'
          }}
        >
          <span
            style={{
              width: '8px',
              height: '8px',
              borderRadius: '50%',
              backgroundColor: statusDotColor,
              display: 'inline-block',
              boxShadow: `0 0 8px ${statusDotColor}`
            }}
          />
          <span
            className="mono"
            style={{
              fontSize: '11px',
              fontWeight: 700,
              letterSpacing: '1px',
              color: statusDotColor
            }}
          >
            {statusLabel}
          </span>
        </div>

        {/* Section 6: Action Buttons */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '10px',
            marginTop: 'auto'
          }}
        >
          {/* SEND TO ROBOT (Primary Action) */}
          <button
            type="button"
            disabled={isSendDisabled}
            onClick={handleSendToRobot}
            style={{
              width: '100%',
              height: '42px',
              borderRadius: '6px',
              border: '1px solid rgba(255, 255, 255, 0.3)',
              backgroundColor: sendSuccess
                ? 'rgba(34, 197, 94, 0.25)'
                : isSendDisabled
                ? 'rgba(255, 255, 255, 0.05)'
                : 'rgba(255, 255, 255, 0.15)',
              color: isSendDisabled ? 'rgba(255, 255, 255, 0.25)' : '#ffffff',
              fontWeight: 700,
              fontSize: '12px',
              letterSpacing: '1.2px',
              fontFamily: 'JetBrains Mono, monospace',
              cursor: isSendDisabled ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              transition: 'all 150ms ease',
              boxShadow: isSendDisabled ? 'none' : '0 2px 8px rgba(0, 0, 0, 0.3)'
            }}
            onMouseEnter={(e) => {
              if (!isSendDisabled && !sendSuccess) {
                e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.22)'
                e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.45)'
              }
            }}
            onMouseLeave={(e) => {
              if (!isSendDisabled && !sendSuccess) {
                e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.15)'
                e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.3)'
              }
            }}
          >
            {sendSuccess ? (
              <>
                <CheckCircle2 size={16} color="#22c55e" />
                <span style={{ color: '#22c55e' }}>COMMAND SENT</span>
              </>
            ) : (
              <>
                <Send size={15} color={isSendDisabled ? 'rgba(255, 255, 255, 0.3)' : '#ffffff'} />
                <span>SEND TO ROBOT</span>
              </>
            )}
          </button>

          {/* HOME (Ghost Action) */}
          <button
            type="button"
            disabled={safety.eStopActive}
            onClick={handleHome}
            style={{
              width: '100%',
              height: '36px',
              borderRadius: '6px',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              backgroundColor: 'transparent',
              color: safety.eStopActive ? 'rgba(255, 255, 255, 0.25)' : 'rgba(255, 255, 255, 0.65)',
              fontWeight: 600,
              fontSize: '11px',
              letterSpacing: '1px',
              fontFamily: 'JetBrains Mono, monospace',
              cursor: safety.eStopActive ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
              transition: 'all 150ms ease'
            }}
            onMouseEnter={(e) => {
              if (!safety.eStopActive) {
                e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.06)'
                e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.2)'
                e.currentTarget.style.color = '#ffffff'
              }
            }}
            onMouseLeave={(e) => {
              if (!safety.eStopActive) {
                e.currentTarget.style.backgroundColor = 'transparent'
                e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.08)'
                e.currentTarget.style.color = 'rgba(255, 255, 255, 0.65)'
              }
            }}
          >
            <Home size={14} />
            <span>HOME (θ=0, θ=0)</span>
          </button>
        </div>
      </div>
    </div>
  )
}
