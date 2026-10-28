import React from 'react'
import { AlertOctagon, Power } from 'lucide-react'
import { useAppStore } from '../store/motorStore'

export default function SafetyBar(): React.JSX.Element {
  const connection = useAppStore((state) => state.connection)
  const safety = useAppStore((state) => state.safety)
  const triggerEStop = useAppStore((state) => state.triggerEStop)
  const clearEStop = useAppStore((state) => state.clearEStop)

  const isConnected = connection.status === 'connected'
  const isConnecting = connection.status === 'connecting'
  const isError = connection.status === 'error'

  const handleEStopClick = async (): Promise<void> => {
    try {
      if (safety.eStopActive) {
        // If already stopped, allow clearing E-STOP state safely
        clearEStop()
        return
      }

      // Execute Emergency Stop
      triggerEStop()

      if (window.api && typeof window.api.emergencyStop === 'function') {
        await window.api.emergencyStop()
      } else if ((window as any).motorAPI && typeof (window as any).motorAPI.eStop === 'function') {
        await (window as any).motorAPI.eStop()
      }
    } catch (err) {
      console.error('Failed to trigger emergency stop:', err)
    }
  }

  // Status dot color
  let dotColor = '#64748b' // disconnected gray
  let statusText = 'DISCONNECTED'

  if (isConnected) {
    dotColor = '#22c55e' // connected green
    statusText = connection.port ? `CONNECTED (${connection.port})` : 'CONNECTED'
  } else if (isConnecting) {
    dotColor = '#f59e0b' // amber
    statusText = 'CONNECTING...'
  } else if (isError) {
    dotColor = '#ef4444' // red
    statusText = connection.error ? `ERROR: ${connection.error}` : 'CONNECTION ERROR'
  }

  return (
    <header
      style={{
        height: '48px',
        width: '100%',
        backgroundColor: 'rgba(15, 15, 20, 0.95)',
        backdropFilter: 'blur(10px)',
        WebkitBackdropFilter: 'blur(10px)',
        borderBottom: safety.eStopActive
          ? '2px solid #ef4444'
          : '1px solid rgba(255, 255, 255, 0.1)',
        animation: safety.eStopActive ? 'flashBorder 1s ease-in-out infinite' : 'none',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 20px',
        zIndex: 30,
        userSelect: 'none',
        flexShrink: 0
      }}
    >
      {/* Left: Brand / Title */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <span
          className="mono"
          style={{
            fontSize: '13px',
            fontWeight: 700,
            letterSpacing: '1.8px',
            color: 'rgba(255, 255, 255, 0.5)',
            textTransform: 'uppercase'
          }}
        >
          ARM CTRL
        </span>
        <span
          className="mono"
          style={{
            fontSize: '10px',
            color: 'rgba(255, 255, 255, 0.25)',
            padding: '2px 6px',
            borderRadius: '4px',
            backgroundColor: 'rgba(255, 255, 255, 0.04)',
            border: '1px solid rgba(255, 255, 255, 0.08)'
          }}
        >
          2-DOF SCARA
        </span>
      </div>

      {/* Center: Connection Status */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        <span
          style={{
            width: '8px',
            height: '8px',
            borderRadius: '50%',
            backgroundColor: dotColor,
            boxShadow: isConnected ? '0 0 8px #22c55e' : isError ? '0 0 8px #ef4444' : 'none',
            display: 'inline-block',
            transition: 'all 200ms ease'
          }}
        />
        <span
          className="mono"
          style={{
            fontSize: '11px',
            fontWeight: 600,
            letterSpacing: '0.8px',
            color: isConnected ? '#e4e1e9' : 'rgba(255, 255, 255, 0.45)'
          }}
        >
          {statusText}
        </span>
      </div>

      {/* Right: E-STOP Button + Keyboard shortcut hint */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        <div
          className="mono"
          style={{
            fontSize: '11px',
            color: 'rgba(255, 255, 255, 0.4)',
            display: 'flex',
            alignItems: 'center',
            gap: '4px'
          }}
        >
          <kbd
            style={{
              padding: '2px 6px',
              fontSize: '10px',
              backgroundColor: 'rgba(255, 255, 255, 0.08)',
              border: '1px solid rgba(255, 255, 255, 0.15)',
              borderRadius: '4px',
              color: 'rgba(255, 255, 255, 0.7)'
            }}
          >
            Space
          </kbd>
        </div>

        <button
          onClick={handleEStopClick}
          title={safety.eStopActive ? 'Click to reset E-Stop' : 'Trigger Emergency Stop (Space)'}
          style={{
            width: '120px',
            height: '36px',
            backgroundColor: '#ef4444',
            color: '#ffffff',
            border: 'none',
            borderRadius: '4px',
            fontWeight: 700,
            fontSize: '13px',
            letterSpacing: '1px',
            fontFamily: 'JetBrains Mono, monospace',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '6px',
            boxShadow: safety.eStopActive
              ? '0 0 16px rgba(239, 68, 68, 0.8)'
              : '0 2px 8px rgba(239, 68, 68, 0.4)',
            animation: safety.eStopActive ? 'pulseRed 1s ease-in-out infinite' : 'none',
            transition: 'all 150ms ease'
          }}
          onMouseDown={(e) => {
            e.currentTarget.style.transform = 'scale(0.96)'
          }}
          onMouseUp={(e) => {
            e.currentTarget.style.transform = 'scale(1)'
          }}
        >
          {safety.eStopActive ? (
            <>
              <AlertOctagon size={16} />
              <span>STOPPED</span>
            </>
          ) : (
            <>
              <Power size={14} />
              <span>E-STOP</span>
            </>
          )}
        </button>
      </div>
    </header>
  )
}
