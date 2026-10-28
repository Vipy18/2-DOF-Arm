import React, { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { RefreshCw, Radio, PowerOff, Compass, Target } from 'lucide-react'
import { useAppStore } from '../store/motorStore'
import ArmCanvas from '../components/ArmCanvas'
import MotorCard from '../components/MotorCard'
import { AvailablePort } from '../store/types'

export default function Dashboard(): React.JSX.Element {
  const arm = useAppStore((state) => state.arm)
  const connection = useAppStore((state) => state.connection)
  const setAvailablePorts = useAppStore((state) => state.setAvailablePorts)
  const setConnectedPort = useAppStore((state) => state.setConnectedPort)
  const setConnectionStatus = useAppStore((state) => state.setConnectionStatus)

  const [selectedPort, setSelectedPort] = useState<string>(connection.port || '')
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false)
  const [isConnecting, setIsConnecting] = useState<boolean>(false)

  const isConnected = connection.status === 'connected'

  // Sync selectedPort when connection.port updates
  useEffect(() => {
    if (connection.port) {
      setSelectedPort(connection.port)
    } else if (connection.availablePorts.length > 0 && !selectedPort) {
      setSelectedPort(connection.availablePorts[0].path)
    }
  }, [connection.port, connection.availablePorts, selectedPort])

  // Initial fetch of serial ports on mount
  useEffect(() => {
    refreshPorts()
  }, [])

  const refreshPorts = async (): Promise<void> => {
    setIsRefreshing(true)
    try {
      let ports: AvailablePort[] = []
      if ((window as any).motorAPI && typeof (window as any).motorAPI.listPorts === 'function') {
        const rawPorts = await (window as any).motorAPI.listPorts()
        ports = (rawPorts || []).map((p: any) => ({
          path: p.path || p.port || '',
          manufacturer: p.manufacturer || p.name || ''
        }))
      } else if (window.api && typeof window.api.listPorts === 'function') {
        const rawPorts = await window.api.listPorts()
        ports = (rawPorts || []).map((p: any) => ({
          path: p.path || (p as any).port || '',
          manufacturer: p.manufacturer || (p as any).name || ''
        }))
      } else if (window.electron?.ipcRenderer) {
        const rawPorts = await window.electron.ipcRenderer.invoke('serial:listPorts')
        ports = (rawPorts || []).map((p: any) => ({
          path: p.path || p.port || '',
          manufacturer: p.manufacturer || p.name || ''
        }))
      }

      ports = ports.filter((p) => p.path && p.path.trim().length > 0)
      setAvailablePorts(ports)

      if (ports.length > 0) {
        setSelectedPort((current) => {
          if (current && ports.some((p) => p.path === current)) return current
          return ports[0].path
        })
      }
    } catch (err) {
      console.error('Failed to list serial ports:', err)
    } finally {
      setIsRefreshing(false)
    }
  }

  const handleConnectToggle = async (): Promise<void> => {
    if (isConnecting) return

    if (isConnected) {
      // Disconnect
      try {
        setIsConnecting(true)
        if ((window as any).motorAPI && typeof (window as any).motorAPI.disconnect === 'function') {
          await (window as any).motorAPI.disconnect()
        } else if (window.api && typeof window.api.disconnectSerial === 'function') {
          await window.api.disconnectSerial()
        } else if (window.electron?.ipcRenderer) {
          await window.electron.ipcRenderer.invoke('serial:disconnect')
        }
        setConnectionStatus('disconnected')
      } catch (err: any) {
        console.error('Error disconnecting:', err)
        setConnectionStatus('error', err.message || 'Disconnect failed')
      } finally {
        setIsConnecting(false)
      }
    } else {
      // Connect
      if (!selectedPort) {
        setConnectionStatus('error', 'Please select a serial port')
        return
      }

      try {
        setIsConnecting(true)
        setConnectionStatus('connecting')

        if ((window as any).motorAPI && typeof (window as any).motorAPI.connect === 'function') {
          await (window as any).motorAPI.connect(selectedPort)
          setConnectedPort(selectedPort)
        } else if (window.api && typeof window.api.connectSerial === 'function') {
          const res = await window.api.connectSerial(selectedPort, 921600)
          if (res.success) {
            setConnectedPort(selectedPort)
          } else {
            setConnectionStatus('error', res.error || 'Connection failed')
          }
        } else if (window.electron?.ipcRenderer) {
          await window.electron.ipcRenderer.invoke('serial:connect', selectedPort)
          setConnectedPort(selectedPort)
        } else {
          // Fallback mock connection for standalone testing
          setConnectedPort(selectedPort)
        }
      } catch (err: any) {
        console.error('Error connecting:', err)
        setConnectionStatus('error', err.message || 'Connection failed')
      } finally {
        setIsConnecting(false)
      }
    }
  }

  const theta1Deg = (arm.theta1 * 180) / Math.PI
  const theta2Deg = (arm.theta2 * 180) / Math.PI

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      style={{
        display: 'flex',
        flexDirection: 'column',
        minHeight: '100%',
        padding: '16px 20px',
        gap: '16px',
        boxSizing: 'border-box',
        overflowY: 'auto'
      }}
    >
      {/* Top Section: Live Arm Kinematics Canvas */}
      <div
        className="glass"
        style={{
          flex: '1 1 360px',
          minHeight: '320px',
          display: 'flex',
          flexDirection: 'column',
          position: 'relative',
          overflow: 'hidden',
          padding: '12px'
        }}
      >
        {/* Top Overlay Badge: Live Coordinates & Joint Angles */}
        <div
          style={{
            position: 'absolute',
            top: '16px',
            left: '16px',
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            zIndex: 10
          }}
        >
          {/* Cartesian End-Effector Chip */}
          <div
            className="glass"
            style={{
              padding: '6px 12px',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              backgroundColor: 'rgba(15, 15, 20, 0.75)',
              borderColor: 'rgba(255, 255, 255, 0.1)'
            }}
          >
            <Target size={14} color="#38BDF8" />
            <div className="mono" style={{ fontSize: '11px', color: '#e4e1e9' }}>
              <span style={{ color: 'rgba(255, 255, 255, 0.4)', marginRight: '4px' }}>EE:</span>
              X: <span style={{ fontWeight: 600 }}>{arm.endEffector.x.toFixed(3)}m</span>, Y:{' '}
              <span style={{ fontWeight: 600 }}>{arm.endEffector.y.toFixed(3)}m</span>
            </div>
          </div>

          {/* Joint Angles Chip */}
          <div
            className="glass"
            style={{
              padding: '6px 12px',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              backgroundColor: 'rgba(15, 15, 20, 0.75)',
              borderColor: 'rgba(255, 255, 255, 0.1)'
            }}
          >
            <Compass size={14} color="#38BDF8" />
            <div className="mono" style={{ fontSize: '11px', color: '#e4e1e9' }}>
              <span style={{ color: 'rgba(255, 255, 255, 0.4)', marginRight: '4px' }}>θ:</span>
              θ1: <span style={{ fontWeight: 600 }}>{theta1Deg.toFixed(1)}°</span>, θ2:{' '}
              <span style={{ fontWeight: 600 }}>{theta2Deg.toFixed(1)}°</span>
            </div>
          </div>
        </div>

        {/* Live Arm Canvas */}
        <div style={{ flex: 1, minHeight: 0, width: '100%', height: '100%', position: 'relative' }}>
          <ArmCanvas
            theta1={arm.theta1}
            theta2={arm.theta2}
            interactive={false}
            showWorkspace={true}
          />
        </div>
      </div>

      {/* Bottom Section: Motor Cards + Connection Panel */}
      <div
        style={{
          display: 'flex',
          gap: '16px',
          alignItems: 'stretch',
          flex: '0 0 auto',
          minHeight: '200px'
        }}
      >
        {/* Motor 1 Card */}
        <MotorCard motorIndex={0} />

        {/* Motor 2 Card */}
        <MotorCard motorIndex={1} />

        {/* Connection Panel */}
        <div
          className="glass"
          style={{
            width: '260px',
            flexShrink: 0,
            padding: '16px',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            gap: '12px'
          }}
        >
          {/* Header */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              paddingBottom: '8px',
              borderBottom: '1px solid rgba(255, 255, 255, 0.08)'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Radio size={14} color="#38BDF8" />
              <span
                className="mono"
                style={{
                  fontSize: '11px',
                  fontWeight: 700,
                  letterSpacing: '1px',
                  color: 'rgba(255, 255, 255, 0.7)',
                  textTransform: 'uppercase'
                }}
              >
                Serial Link
              </span>
            </div>

            <button
              onClick={refreshPorts}
              disabled={isRefreshing || isConnected}
              title="Refresh Ports"
              style={{
                backgroundColor: 'transparent',
                border: 'none',
                color: isRefreshing ? '#38BDF8' : 'rgba(255, 255, 255, 0.4)',
                cursor: isConnected ? 'not-allowed' : 'pointer',
                padding: '4px',
                borderRadius: '4px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'all 150ms ease'
              }}
            >
              <RefreshCw size={13} className={isRefreshing ? 'spin-icon' : ''} />
            </button>
          </div>

          {/* Port Dropdown + Info */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <label
              className="mono"
              style={{ fontSize: '10px', color: 'rgba(255, 255, 255, 0.4)', letterSpacing: '0.6px' }}
            >
              PORT (921600 BAUD)
            </label>
            <select
              value={selectedPort}
              onChange={(e) => setSelectedPort(e.target.value)}
              disabled={isConnected || isConnecting}
              className="mono"
              style={{
                width: '100%',
                backgroundColor: 'rgba(0, 0, 0, 0.35)',
                border: '1px solid rgba(255, 255, 255, 0.15)',
                borderRadius: '6px',
                padding: '8px 10px',
                color: '#e4e1e9',
                fontSize: '12px',
                outline: 'none',
                cursor: isConnected ? 'not-allowed' : 'pointer'
              }}
            >
              {connection.availablePorts.length === 0 ? (
                <option value="">No ports found</option>
              ) : (
                connection.availablePorts.map((p) => (
                  <option key={p.path} value={p.path} style={{ backgroundColor: '#131318' }}>
                    {p.path} {p.manufacturer ? `(${p.manufacturer})` : ''}
                  </option>
                ))
              )}
            </select>
          </div>

          {/* Connect / Disconnect Action Button */}
          <button
            onClick={handleConnectToggle}
            disabled={isConnecting || (!selectedPort && !isConnected)}
            style={{
              width: '100%',
              height: '36px',
              borderRadius: '6px',
              backgroundColor: isConnected
                ? 'rgba(239, 68, 68, 0.15)'
                : 'rgba(56, 189, 248, 0.15)',
              border: isConnected
                ? '1px solid rgba(239, 68, 68, 0.4)'
                : '1px solid rgba(56, 189, 248, 0.4)',
              color: isConnected ? '#ef4444' : '#38BDF8',
              fontFamily: 'JetBrains Mono, monospace',
              fontSize: '12px',
              fontWeight: 700,
              letterSpacing: '0.8px',
              cursor: isConnecting || (!selectedPort && !isConnected) ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
              transition: 'all 150ms ease'
            }}
            onMouseEnter={(e) => {
              if (!isConnecting && (selectedPort || isConnected)) {
                e.currentTarget.style.backgroundColor = isConnected
                  ? 'rgba(239, 68, 68, 0.25)'
                  : 'rgba(56, 189, 248, 0.25)'
              }
            }}
            onMouseLeave={(e) => {
              if (!isConnecting && (selectedPort || isConnected)) {
                e.currentTarget.style.backgroundColor = isConnected
                  ? 'rgba(239, 68, 68, 0.15)'
                  : 'rgba(56, 189, 248, 0.15)'
              }
            }}
          >
            {isConnected ? (
              <>
                <PowerOff size={14} />
                <span>DISCONNECT</span>
              </>
            ) : (
              <>
                <Radio size={14} />
                <span>{isConnecting ? 'CONNECTING...' : 'CONNECT'}</span>
              </>
            )}
          </button>
        </div>
      </div>
    </motion.div>
  )
}
