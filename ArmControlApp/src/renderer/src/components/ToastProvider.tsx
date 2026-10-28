import React, { createContext, useContext, useState, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { CheckCircle2, AlertTriangle, AlertCircle, X } from 'lucide-react'

export type ToastType = 'success' | 'error' | 'warning'

export interface ToastOptions {
  message: string
  type?: ToastType
  durationMs?: number
}

interface ToastItem extends ToastOptions {
  id: string
  type: ToastType
}

interface ToastContextValue {
  showToast: (options: ToastOptions) => void
  dismissToast: (id: string) => void
}

const ToastContext = createContext<ToastContextValue | null>(null)

const MAX_TOASTS = 3

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<ToastItem[]>([])

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id))
  }, [])

  const showToast = useCallback(
    ({ message, type = 'success', durationMs = 3000 }: ToastOptions) => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
      const newToast: ToastItem = { id, message, type, durationMs }

      setToasts((prev) => {
        const next = [...prev, newToast]
        if (next.length > MAX_TOASTS) {
          return next.slice(next.length - MAX_TOASTS)
        }
        return next
      })

      if (durationMs > 0) {
        setTimeout(() => {
          dismissToast(id)
        }, durationMs)
      }
    },
    [dismissToast]
  )

  const getBorderColor = (type: ToastType): string => {
    switch (type) {
      case 'success':
        return '#22c55e'
      case 'error':
        return '#ef4444'
      case 'warning':
        return '#f59e0b'
      default:
        return '#38BDF8'
    }
  }

  const getIcon = (type: ToastType) => {
    switch (type) {
      case 'success':
        return <CheckCircle2 size={16} color="#22c55e" style={{ flexShrink: 0 }} />
      case 'error':
        return <AlertCircle size={16} color="#ef4444" style={{ flexShrink: 0 }} />
      case 'warning':
        return <AlertTriangle size={16} color="#f59e0b" style={{ flexShrink: 0 }} />
      default:
        return null
    }
  }

  return (
    <ToastContext.Provider value={{ showToast, dismissToast }}>
      {children}
      <div
        style={{
          position: 'fixed',
          bottom: '20px',
          right: '20px',
          display: 'flex',
          flexDirection: 'column',
          gap: '8px',
          zIndex: 10000,
          pointerEvents: 'none',
          maxWidth: '380px',
          width: 'calc(100vw - 40px)'
        }}
      >
        <AnimatePresence mode="popLayout">
          {toasts.map((toast) => {
            const borderColor = getBorderColor(toast.type)
            return (
              <motion.div
                key={toast.id}
                layout
                initial={{ opacity: 0, y: 20, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 10, scale: 0.95 }}
                transition={{ duration: 0.2, ease: 'easeOut' }}
                style={{
                  pointerEvents: 'auto',
                  backgroundColor: 'rgba(19, 19, 24, 0.92)',
                  backdropFilter: 'blur(10px)',
                  WebkitBackdropFilter: 'blur(10px)',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  borderLeft: `4px solid ${borderColor}`,
                  borderRadius: '6px',
                  padding: '10px 14px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '12px',
                  boxShadow: '0 8px 24px rgba(0, 0, 0, 0.5), 0 2px 6px rgba(0, 0, 0, 0.3)'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0, flex: 1 }}>
                  {getIcon(toast.type)}
                  <span
                    style={{
                      fontFamily: "'JetBrains Mono', monospace",
                      fontSize: '12px',
                      color: '#e4e1e9',
                      lineHeight: 1.4,
                      wordBreak: 'break-word'
                    }}
                  >
                    {toast.message}
                  </span>
                </div>
                <button
                  onClick={() => dismissToast(toast.id)}
                  style={{
                    backgroundColor: 'transparent',
                    border: 'none',
                    padding: '2px',
                    cursor: 'pointer',
                    color: 'rgba(255, 255, 255, 0.4)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderRadius: '4px',
                    flexShrink: 0,
                    transition: 'color 150ms ease'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.color = '#ffffff'
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.color = 'rgba(255, 255, 255, 0.4)'
                  }}
                >
                  <X size={14} />
                </button>
              </motion.div>
            )
          })}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  )
}

export function useToast(): ToastContextValue {
  const context = useContext(ToastContext)
  if (!context) {
    // Return a safe dummy implementation if accessed outside of provider
    return {
      showToast: (options: ToastOptions) => console.log('Toast fallback:', options),
      dismissToast: () => {}
    }
  }
  return context
}

export default ToastProvider
