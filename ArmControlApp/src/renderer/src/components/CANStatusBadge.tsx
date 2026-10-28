import React from 'react'

export interface CANStatusBadgeProps {
  errorCount?: number
  style?: React.CSSProperties
}

export const CANStatusBadge: React.FC<CANStatusBadgeProps> = ({ errorCount = 0, style }) => {
  let dotColor = '#22c55e' // green (OK)
  let labelText = 'CAN OK'
  let textColor = 'rgba(255, 255, 255, 0.7)'

  if (errorCount > 10) {
    dotColor = '#ef4444' // red
    labelText = `CAN ERR: ${errorCount}`
    textColor = '#ef4444'
  } else if (errorCount > 0) {
    dotColor = '#f59e0b' // amber
    labelText = `CAN ERR: ${errorCount}`
    textColor = '#f59e0b'
  }

  return (
    <div
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '6px',
        padding: '3px 8px',
        backgroundColor: 'rgba(255, 255, 255, 0.04)',
        border: '1px solid rgba(255, 255, 255, 0.08)',
        borderRadius: '4px',
        userSelect: 'none',
        ...style
      }}
    >
      <span
        style={{
          width: '6px',
          height: '6px',
          borderRadius: '50%',
          backgroundColor: dotColor,
          boxShadow: errorCount === 0 ? '0 0 6px rgba(34, 197, 94, 0.6)' : `0 0 6px ${dotColor}`,
          display: 'inline-block',
          flexShrink: 0
        }}
      />
      <span
        style={{
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: '11px',
          fontWeight: 600,
          letterSpacing: '0.6px',
          color: textColor
        }}
      >
        {labelText}
      </span>
    </div>
  )
}

export default CANStatusBadge
