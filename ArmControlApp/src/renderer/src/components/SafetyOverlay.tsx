import React from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { AlertOctagon, RotateCcw } from 'lucide-react'
import { useAppStore } from '../store/motorStore'

export const SafetyOverlay: React.FC = () => {
  const eStopActive = useAppStore((state) => state.safety.eStopActive)
  const clearEStop = useAppStore((state) => state.clearEStop)

  const handleClear = (): void => {
    try {
      clearEStop()
    } catch (err) {
      console.error('Failed to clear E-STOP:', err)
    }
  }

  return (
    <AnimatePresence>
      {eStopActive && (
        <motion.div
          key="safety-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            width: '100vw',
            height: '100vh',
            backgroundColor: 'rgba(239, 68, 68, 0.12)',
            backdropFilter: 'blur(6px)',
            WebkitBackdropFilter: 'blur(6px)',
            border: '3px solid #ef4444',
            boxSizing: 'border-box',
            zIndex: 9999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            pointerEvents: 'auto',
            userSelect: 'none'
          }}
        >
          <div
            style={{
              backgroundColor: 'rgba(19, 19, 24, 0.95)',
              border: '1px solid rgba(239, 68, 68, 0.5)',
              borderRadius: '12px',
              padding: '32px 48px',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              textAlign: 'center',
              boxShadow: '0 20px 50px rgba(0, 0, 0, 0.8), 0 0 30px rgba(239, 68, 68, 0.3)',
              maxWidth: '480px',
              width: '90%'
            }}
          >
            <div
              style={{
                width: '64px',
                height: '64px',
                borderRadius: '50%',
                backgroundColor: 'rgba(239, 68, 68, 0.15)',
                border: '1px solid rgba(239, 68, 68, 0.4)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: '20px',
                boxShadow: '0 0 20px rgba(239, 68, 68, 0.3)'
              }}
            >
              <AlertOctagon size={36} color="#ef4444" />
            </div>

            <h1
              style={{
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: '22px',
                fontWeight: 800,
                letterSpacing: '2px',
                color: '#ffffff',
                margin: '0 0 10px 0',
                textTransform: 'uppercase'
              }}
            >
              EMERGENCY STOP ACTIVE
            </h1>

            <p
              style={{
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: '13px',
                color: 'rgba(255, 255, 255, 0.75)',
                margin: '0 0 28px 0',
                lineHeight: 1.5
              }}
            >
              All motors disabled. Clear E-STOP to resume.
            </p>

            <button
              onClick={handleClear}
              style={{
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: '13px',
                fontWeight: 700,
                letterSpacing: '1px',
                color: '#ffffff',
                backgroundColor: '#ef4444',
                border: 'none',
                borderRadius: '6px',
                padding: '12px 28px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                boxShadow: '0 4px 14px rgba(239, 68, 68, 0.4)',
                transition: 'all 150ms ease'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = '#dc2626'
                e.currentTarget.style.boxShadow = '0 6px 20px rgba(239, 68, 68, 0.6)'
                e.currentTarget.style.transform = 'translateY(-1px)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = '#ef4444'
                e.currentTarget.style.boxShadow = '0 4px 14px rgba(239, 68, 68, 0.4)'
                e.currentTarget.style.transform = 'translateY(0)'
              }}
              onMouseDown={(e) => {
                e.currentTarget.style.transform = 'translateY(1px)'
              }}
              onMouseUp={(e) => {
                e.currentTarget.style.transform = 'translateY(0)'
              }}
            >
              <RotateCcw size={16} />
              <span>CLEAR E-STOP</span>
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

export default SafetyOverlay
