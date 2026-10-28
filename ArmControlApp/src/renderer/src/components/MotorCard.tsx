import React, { useState } from 'react'
import { Thermometer, AlertTriangle, Square } from 'lucide-react'
import { useAppStore } from '../store/motorStore'
import { isFault } from '../store/faultDecoder'

export interface MotorCardProps {
  motorIndex: 0 | 1
}

export default function MotorCard({ motorIndex }: MotorCardProps): React.JSX.Element {
  const motor = useAppStore((state) => state.motors[motorIndex])
  const setMotorEnabled = useAppStore((state) => state.setMotorEnabled)
  const [isToggling, setIsToggling] = useState(false)

  const motorId = motor.id // 1 or 2
  const isM1 = motorIndex === 0
  const jointName = isM1 ? 'Joint 1 — Base' : 'Joint 2 — Elbow'

  const handleToggleEnable = async (): Promise<void> => {
    if (isToggling) return
    setIsToggling(true)

    const targetEnabled = !motor.enabled
    try {
      if (targetEnabled) {
        if (window.api && typeof window.api.enableMotor === 'function') {
          await window.api.enableMotor(motorId)
        } else if ((window as any).motorAPI && typeof (window as any).motorAPI.enableMotor === 'function') {
          await (window as any).motorAPI.enableMotor(motorId)
        }
      } else {
        if (window.api && typeof window.api.disableMotor === 'function') {
          await window.api.disableMotor(motorId)
        } else if ((window as any).motorAPI && typeof (window as any).motorAPI.disableMotor === 'function') {
          await (window as any).motorAPI.disableMotor(motorId)
        }
      }
      setMotorEnabled(motorId, targetEnabled)
    } catch (err) {
      console.error(`Failed to ${targetEnabled ? 'enable' : 'disable'} motor ${motorId}:`, err)
    } finally {
      setIsToggling(false)
    }
  }

  const handleStopMotor = async (): Promise<void> => {
    try {
      if (window.api && typeof window.api.disableMotor === 'function') {
        await window.api.disableMotor(motorId)
      } else if ((window as any).motorAPI && typeof (window as any).motorAPI.disableMotor === 'function') {
        await (window as any).motorAPI.disableMotor(motorId)
      }
      setMotorEnabled(motorId, false)
    } catch (err) {
      console.error(`Failed to stop motor ${motorId}:`, err)
    }
  }

  // Temperature color styling
  let tempColor = '#e4e1e9'
  if (motor.temperature > 55) {
    tempColor = '#ef4444' // red
  } else if (motor.temperature > 45) {
    tempColor = '#f97316' // orange
  }

  const hasFault = isFault(motor.faultCode)

  return (
    <div
      className="glass"
      style={{
        flex: 1,
        minWidth: '280px',
        padding: '16px',
        display: 'flex',
        flexDirection: 'column',
        gap: '12px',
        position: 'relative',
        transition: 'all 150ms ease'
      }}
    >
      {/* Header Row */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingBottom: '8px',
          borderBottom: '1px solid rgba(255, 255, 255, 0.08)'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {/* M1 / M2 Badge */}
          <span
            className="mono"
            style={{
              padding: '2px 8px',
              borderRadius: '4px',
              backgroundColor: isM1 ? 'rgba(56, 189, 248, 0.15)' : 'rgba(168, 85, 247, 0.15)',
              border: `1px solid ${isM1 ? 'rgba(56, 189, 248, 0.4)' : 'rgba(168, 85, 247, 0.4)'}`,
              color: isM1 ? '#38BDF8' : '#c084fc',
              fontWeight: 700,
              fontSize: '12px'
            }}
          >
            M{motorId}
          </span>

          <span style={{ fontSize: '13px', fontWeight: 600, color: '#e4e1e9' }}>
            {jointName}
          </span>

          {/* Mode Chip */}
          <span
            className="mono"
            style={{
              fontSize: '10px',
              padding: '2px 6px',
              borderRadius: '4px',
              backgroundColor: 'rgba(255, 255, 255, 0.06)',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              color: 'rgba(255, 255, 255, 0.6)',
              textTransform: 'uppercase'
            }}
          >
            {motor.mode || 'VELOCITY'}
          </span>
        </div>

        {/* Enable Toggle Switch */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span
            className="mono"
            style={{
              fontSize: '10px',
              color: motor.enabled ? '#38BDF8' : 'rgba(255, 255, 255, 0.35)',
              fontWeight: 600
            }}
          >
            {motor.enabled ? 'ON' : 'OFF'}
          </span>

          <button
            onClick={handleToggleEnable}
            disabled={isToggling}
            title={motor.enabled ? `Disable Motor ${motorId}` : `Enable Motor ${motorId}`}
            style={{
              width: '36px',
              height: '20px',
              borderRadius: '10px',
              backgroundColor: motor.enabled ? '#38BDF8' : 'rgba(255, 255, 255, 0.15)',
              border: 'none',
              cursor: isToggling ? 'not-allowed' : 'pointer',
              position: 'relative',
              transition: 'all 150ms ease',
              padding: '2px',
              boxShadow: motor.enabled ? '0 0 8px rgba(56, 189, 248, 0.5)' : 'none'
            }}
          >
            <div
              style={{
                width: '16px',
                height: '16px',
                borderRadius: '50%',
                backgroundColor: '#ffffff',
                transform: motor.enabled ? 'translateX(16px)' : 'translateX(0)',
                transition: 'transform 150ms ease'
              }}
            />
          </button>
        </div>
      </div>

      {/* 2x2 Telemetry Grid */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: '8px'
        }}
      >
        {/* Position */}
        <div
          style={{
            backgroundColor: 'rgba(0, 0, 0, 0.25)',
            border: '1px solid rgba(255, 255, 255, 0.06)',
            borderRadius: '6px',
            padding: '8px 10px'
          }}
        >
          <div
            className="mono"
            style={{
              fontSize: '16px',
              fontWeight: 700,
              color: '#e4e1e9',
              lineHeight: 1.2
            }}
          >
            {typeof motor.position === 'number' ? motor.position.toFixed(1) : '0.0'}
            <span style={{ fontSize: '11px', color: 'rgba(255, 255, 255, 0.4)', marginLeft: '2px' }}>
              °
            </span>
          </div>
          <div
            style={{
              fontSize: '9px',
              fontWeight: 600,
              color: 'rgba(255, 255, 255, 0.4)',
              letterSpacing: '0.8px',
              marginTop: '2px'
            }}
          >
            POSITION
          </div>
        </div>

        {/* Speed */}
        <div
          style={{
            backgroundColor: 'rgba(0, 0, 0, 0.25)',
            border: '1px solid rgba(255, 255, 255, 0.06)',
            borderRadius: '6px',
            padding: '8px 10px'
          }}
        >
          <div
            className="mono"
            style={{
              fontSize: '16px',
              fontWeight: 700,
              color: '#e4e1e9',
              lineHeight: 1.2
            }}
          >
            {typeof motor.velocity === 'number' ? motor.velocity.toFixed(2) : '0.00'}
            <span style={{ fontSize: '10px', color: 'rgba(255, 255, 255, 0.4)', marginLeft: '2px' }}>
              r/s
            </span>
          </div>
          <div
            style={{
              fontSize: '9px',
              fontWeight: 600,
              color: 'rgba(255, 255, 255, 0.4)',
              letterSpacing: '0.8px',
              marginTop: '2px'
            }}
          >
            SPEED
          </div>
        </div>

        {/* Current */}
        <div
          style={{
            backgroundColor: 'rgba(0, 0, 0, 0.25)',
            border: '1px solid rgba(255, 255, 255, 0.06)',
            borderRadius: '6px',
            padding: '8px 10px'
          }}
        >
          <div
            className="mono"
            style={{
              fontSize: '16px',
              fontWeight: 700,
              color: '#e4e1e9',
              lineHeight: 1.2
            }}
          >
            {typeof motor.current === 'number' ? motor.current.toFixed(2) : '0.00'}
            <span style={{ fontSize: '10px', color: 'rgba(255, 255, 255, 0.4)', marginLeft: '2px' }}>
              A
            </span>
          </div>
          <div
            style={{
              fontSize: '9px',
              fontWeight: 600,
              color: 'rgba(255, 255, 255, 0.4)',
              letterSpacing: '0.8px',
              marginTop: '2px'
            }}
          >
            CURRENT
          </div>
        </div>

        {/* Torque */}
        <div
          style={{
            backgroundColor: 'rgba(0, 0, 0, 0.25)',
            border: '1px solid rgba(255, 255, 255, 0.06)',
            borderRadius: '6px',
            padding: '8px 10px'
          }}
        >
          <div
            className="mono"
            style={{
              fontSize: '16px',
              fontWeight: 700,
              color: '#e4e1e9',
              lineHeight: 1.2
            }}
          >
            {typeof motor.torque === 'number' ? motor.torque.toFixed(2) : '0.00'}
            <span style={{ fontSize: '10px', color: 'rgba(255, 255, 255, 0.4)', marginLeft: '2px' }}>
              Nm
            </span>
          </div>
          <div
            style={{
              fontSize: '9px',
              fontWeight: 600,
              color: 'rgba(255, 255, 255, 0.4)',
              letterSpacing: '0.8px',
              marginTop: '2px'
            }}
          >
            TORQUE
          </div>
        </div>
      </div>

      {/* Fault Warning Banner if any */}
      {hasFault && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            padding: '6px 10px',
            borderRadius: '6px',
            backgroundColor: 'rgba(239, 68, 68, 0.15)',
            border: '1px solid rgba(239, 68, 68, 0.4)',
            color: '#ef4444',
            fontSize: '11px'
          }}
        >
          <AlertTriangle size={14} />
          <span className="mono" style={{ fontWeight: 600 }}>
            FAULT 0x{motor.faultCode.toString(16)}: {motor.faultDescription || 'Error'}
          </span>
        </div>
      )}

      {/* Footer Row: Temperature + Single Motor Stop Button */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingTop: '6px',
          borderTop: '1px solid rgba(255, 255, 255, 0.06)'
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
            color: tempColor,
            fontSize: '11px'
          }}
        >
          <Thermometer size={14} color={tempColor} />
          <span className="mono" style={{ fontWeight: 600 }}>
            {motor.temperature !== undefined ? `${motor.temperature}°C` : '--°C'}
          </span>
        </div>

        <button
          onClick={handleStopMotor}
          disabled={!motor.enabled}
          title={`Disable Motor ${motorId}`}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
            padding: '3px 8px',
            borderRadius: '4px',
            backgroundColor: 'transparent',
            border: '1px solid rgba(255, 255, 255, 0.15)',
            color: motor.enabled ? 'rgba(255, 255, 255, 0.8)' : 'rgba(255, 255, 255, 0.3)',
            fontSize: '10px',
            fontWeight: 600,
            fontFamily: 'JetBrains Mono, monospace',
            cursor: motor.enabled ? 'pointer' : 'not-allowed',
            transition: 'all 150ms ease'
          }}
          onMouseEnter={(e) => {
            if (motor.enabled) {
              e.currentTarget.style.borderColor = 'rgba(239, 68, 68, 0.5)'
              e.currentTarget.style.color = '#ef4444'
            }
          }}
          onMouseLeave={(e) => {
            if (motor.enabled) {
              e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.15)'
              e.currentTarget.style.color = 'rgba(255, 255, 255, 0.8)'
            }
          }}
        >
          <Square size={10} />
          <span>STOP</span>
        </button>
      </div>
    </div>
  )
}
