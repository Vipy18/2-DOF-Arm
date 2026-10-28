import React, { useEffect, useState } from 'react'
import { setupIpcListeners } from './store/ipcListeners'
import Sidebar, { PageId } from './components/Sidebar'
import SafetyBar from './components/SafetyBar'
import SafetyOverlay from './components/SafetyOverlay'
import TemperatureWarning from './components/TemperatureWarning'
import ToastProvider from './components/ToastProvider'
import useKeyboardShortcuts from './hooks/useKeyboardShortcuts'
import useConnectionGuard from './hooks/useConnectionGuard'
import Dashboard from './pages/Dashboard'
import Control from './pages/Control'
import Program from './pages/Program'
import MotorStudio from './pages/MotorStudio'

function AppContent(): React.JSX.Element {
  const [activePage, setActivePage] = useState<PageId>('dashboard')

  useEffect(() => {
    const cleanup = setupIpcListeners()
    return cleanup
  }, [])

  // Register keyboard shortcuts (Space=E-Stop, Esc=Clear E-Stop, Ctrl+S, F1-F4)
  useKeyboardShortcuts({ onNavigate: setActivePage, activePage })

  // Register safety connection guard (E-Stop and alert on disconnect)
  useConnectionGuard()

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100vh',
        width: '100vw',
        background: '#131318',
        color: '#e4e1e9',
        fontFamily: "'Hanken Grotesk', sans-serif",
        overflow: 'hidden'
      }}
    >
      {/* Top Sticky Safety Bar */}
      <SafetyBar />

      {/* Temperature Alert Banner */}
      <TemperatureWarning />

      {/* Full-screen Safety Overlay for E-Stop */}
      <SafetyOverlay />

      {/* Main Workspace Container */}
      <div style={{ display: 'flex', flex: 1, minHeight: 0, minWidth: 0, overflow: 'hidden' }}>
        {/* Left Vertical Navigation Bar */}
        <Sidebar activePage={activePage} onNavigate={setActivePage} />

        {/* Content Viewport */}
        <main
          style={{
            flex: 1,
            minHeight: 0,
            minWidth: 0,
            overflowY: 'auto',
            overflowX: 'hidden',
            backgroundColor: '#131318',
            position: 'relative'
          }}
        >
          {activePage === 'dashboard' && <Dashboard />}
          {activePage === 'control' && <Control />}
          {activePage === 'program' && <Program />}
          {activePage === 'motorstudio' && <MotorStudio />}
        </main>
      </div>
    </div>
  )
}

export default function App(): React.JSX.Element {
  return (
    <ToastProvider>
      <AppContent />
    </ToastProvider>
  )
}
