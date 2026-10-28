import { useEffect } from 'react'
import { useAppStore } from '../store/motorStore'
import { PageId } from '../components/Sidebar'

export interface KeyboardShortcutsProps {
  onNavigate: (page: PageId) => void
  activePage?: PageId
}

export function useKeyboardShortcuts({ onNavigate, activePage }: KeyboardShortcutsProps): void {
  const triggerEStop = useAppStore((state) => state.triggerEStop)
  const clearEStop = useAppStore((state) => state.clearEStop)
  const eStopActive = useAppStore((state) => state.safety.eStopActive)

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent): void => {
      try {
        const activeElement = document.activeElement as HTMLElement | null
        const tagName = (activeElement?.tagName || '').toLowerCase()
        const isEditable =
          tagName === 'input' ||
          tagName === 'textarea' ||
          tagName === 'select' ||
          Boolean(activeElement?.isContentEditable)

        // Space bar -> Trigger E-STOP (only if not typing in an input/textarea)
        if (e.code === 'Space') {
          if (!isEditable) {
            e.preventDefault()
            triggerEStop()
            if (window.api && typeof window.api.emergencyStop === 'function') {
              window.api.emergencyStop().catch((err) => console.error('E-Stop IPC failed:', err))
            } else if ((window as any).motorAPI && typeof (window as any).motorAPI.eStop === 'function') {
              (window as any).motorAPI.eStop().catch((err: any) => console.error('E-Stop IPC failed:', err))
            }
          }
          return
        }

        // Escape -> Clear E-STOP if currently active
        if (e.key === 'Escape' || e.code === 'Escape') {
          if (eStopActive) {
            e.preventDefault()
            clearEStop()
          }
          return
        }

        // Ctrl+S / Cmd+S -> Trigger Program save event
        if ((e.ctrlKey || e.metaKey) && (e.key === 's' || e.key === 'S')) {
          e.preventDefault()
          window.dispatchEvent(new CustomEvent('program:save'))
          return
        }

        // Navigation shortcuts: F1, F2, F3, F4
        if (e.key === 'F1') {
          e.preventDefault()
          onNavigate('dashboard')
          return
        }
        if (e.key === 'F2') {
          e.preventDefault()
          onNavigate('control')
          return
        }
        if (e.key === 'F3') {
          e.preventDefault()
          onNavigate('program')
          return
        }
        if (e.key === 'F4') {
          e.preventDefault()
          onNavigate('motorstudio')
          return
        }
      } catch (err) {
        console.error('Error handling keyboard shortcut:', err)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [triggerEStop, clearEStop, eStopActive, onNavigate, activePage])
}

export default useKeyboardShortcuts
