import React from 'react'
import { ElbowConfig } from '../kinematics/types'

export interface ElbowToggleProps {
  value: ElbowConfig
  onChange: (value: ElbowConfig) => void
  disabled?: boolean
}

export default function ElbowToggle({
  value,
  onChange,
  disabled = false
}: ElbowToggleProps): React.JSX.Element {
  const isUp = value === 'up'
  const isDown = value === 'down'

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        width: '100%',
        backgroundColor: 'rgba(255, 255, 255, 0.04)',
        border: '1px solid rgba(255, 255, 255, 0.08)',
        borderRadius: '6px',
        padding: '3px',
        gap: '4px',
        opacity: disabled ? 0.5 : 1,
        pointerEvents: disabled ? 'none' : 'auto'
      }}
      role="group"
      aria-label="Elbow Configuration Toggle"
    >
      {/* Elbow Up Button */}
      <button
        type="button"
        disabled={disabled}
        onClick={() => onChange('up')}
        aria-pressed={isUp}
        style={{
          flex: 1,
          padding: '8px 12px',
          fontSize: '11px',
          fontWeight: isUp ? 700 : 500,
          fontFamily: 'JetBrains Mono, monospace',
          letterSpacing: '0.8px',
          borderRadius: '4px',
          border: isUp ? '1px solid rgba(255, 255, 255, 0.25)' : '1px solid transparent',
          backgroundColor: isUp ? 'rgba(255, 255, 255, 0.16)' : 'transparent',
          color: isUp ? '#ffffff' : 'rgba(255, 255, 255, 0.45)',
          cursor: disabled ? 'not-allowed' : 'pointer',
          transition: 'all 150ms ease',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '6px',
          boxShadow: isUp ? '0 1px 4px rgba(0, 0, 0, 0.25)' : 'none'
        }}
        onMouseEnter={(e) => {
          if (!isUp && !disabled) {
            e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.08)'
            e.currentTarget.style.color = 'rgba(255, 255, 255, 0.8)'
          }
        }}
        onMouseLeave={(e) => {
          if (!isUp && !disabled) {
            e.currentTarget.style.backgroundColor = 'transparent'
            e.currentTarget.style.color = 'rgba(255, 255, 255, 0.45)'
          }
        }}
      >
        <span>ELBOW UP</span>
      </button>

      {/* Elbow Down Button */}
      <button
        type="button"
        disabled={disabled}
        onClick={() => onChange('down')}
        aria-pressed={isDown}
        style={{
          flex: 1,
          padding: '8px 12px',
          fontSize: '11px',
          fontWeight: isDown ? 700 : 500,
          fontFamily: 'JetBrains Mono, monospace',
          letterSpacing: '0.8px',
          borderRadius: '4px',
          border: isDown ? '1px solid rgba(255, 255, 255, 0.25)' : '1px solid transparent',
          backgroundColor: isDown ? 'rgba(255, 255, 255, 0.16)' : 'transparent',
          color: isDown ? '#ffffff' : 'rgba(255, 255, 255, 0.45)',
          cursor: disabled ? 'not-allowed' : 'pointer',
          transition: 'all 150ms ease',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '6px',
          boxShadow: isDown ? '0 1px 4px rgba(0, 0, 0, 0.25)' : 'none'
        }}
        onMouseEnter={(e) => {
          if (!isDown && !disabled) {
            e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.08)'
            e.currentTarget.style.color = 'rgba(255, 255, 255, 0.8)'
          }
        }}
        onMouseLeave={(e) => {
          if (!isDown && !disabled) {
            e.currentTarget.style.backgroundColor = 'transparent'
            e.currentTarget.style.color = 'rgba(255, 255, 255, 0.45)'
          }
        }}
      >
        <span>ELBOW DOWN</span>
      </button>
    </div>
  )
}
