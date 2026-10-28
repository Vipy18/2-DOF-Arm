import React, { useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { AlertTriangle, Flame } from 'lucide-react'
import { useAppStore } from '../store/motorStore'

export const TemperatureWarning: React.FC = () => {
  const motors = useAppStore((state) => state.motors)
  const config = useAppStore((state) => state.config)

  // Track whether current has been throttled due to critical temp per motor
  const throttledRef = useRef<{ [motorId: number]: boolean }>({ 1: false, 2: false })

  // Auto current throttling effect
  useEffect(() => {
    motors.forEach((motor) => {
      const motorId = motor.id
      const temp = motor.temperature

      // Critical temperature (> 55°C): throttle current limit to 3.0A
      if (temp > 55 && !throttledRef.current[motorId]) {
        throttledRef.current[motorId] = true
        try {
          if (window.api && typeof window.api.writeMotorParam === 'function') {
            window.api.writeMotorParam(motorId, 0x7018, '<f', 3.0).catch((err) => {
              console.error(`Failed to auto-reduce current for Motor ${motorId}:`, err)
            })
          } else if ((window as any).motorAPI && typeof (window as any).motorAPI.writeParam === 'function') {
            (window as any).motorAPI.writeParam(motorId, 0x7018, 3.0, '<f').catch((err: any) => {
              console.error(`Failed to auto-reduce current for Motor ${motorId}:`, err)
            })
          }
        } catch (err) {
          console.error(`Error sending thermal current reduction command for Motor ${motorId}:`, err)
        }
      }

      // Return to safe temperature (< 45°C): restore configured max current
      if (temp < 45 && throttledRef.current[motorId]) {
        throttledRef.current[motorId] = false
        const maxCurrentA =
          motorId === 1
            ? config.motor1Limits.maxCurrentA || 5.0
            : config.motor2Limits.maxCurrentA || 5.0

        try {
          if (window.api && typeof window.api.writeMotorParam === 'function') {
            window.api.writeMotorParam(motorId, 0x7018, '<f', maxCurrentA).catch((err) => {
              console.error(`Failed to restore max current for Motor ${motorId}:`, err)
            })
          } else if ((window as any).motorAPI && typeof (window as any).motorAPI.writeParam === 'function') {
            (window as any).motorAPI.writeParam(motorId, 0x7018, maxCurrentA, '<f').catch((err: any) => {
              console.error(`Failed to restore max current for Motor ${motorId}:`, err)
            })
          }
        } catch (err) {
          console.error(`Error sending thermal current restore command for Motor ${motorId}:`, err)
        }
      }
    })
  }, [motors, config])

  // Determine warnings to display
  const criticalMotors = motors.filter((m) => m.temperature > 55)
  const highTempMotors = motors.filter((m) => m.temperature > 50 && m.temperature <= 55)

  const isCritical = criticalMotors.length > 0
  const isHigh = highTempMotors.length > 0

  if (!isCritical && !isHigh) {
    return null
  }

  // Construct message
  let message = ''
  if (isCritical) {
    message = criticalMotors
      .map((m) => `Motor ${m.id} CRITICAL TEMPERATURE: ${m.temperature.toFixed(1)}°C — Auto-reducing current`)
      .join(' | ')
  } else {
    message = highTempMotors
      .map((m) => `Motor ${m.id} HIGH TEMPERATURE: ${m.temperature.toFixed(1)}°C`)
      .join(' | ')
  }

  const bgColor = isCritical ? 'rgba(239, 68, 68, 0.95)' : 'rgba(245, 158, 11, 0.95)'
  const textColor = '#ffffff'

  return (
    <AnimatePresence>
      <motion.div
        key="temp-warning-banner"
        initial={{ height: 0, opacity: 0 }}
        animate={{ height: 'auto', opacity: 1 }}
        exit={{ height: 0, opacity: 0 }}
        transition={{ duration: 0.2 }}
        style={{
          width: '100%',
          backgroundColor: bgColor,
          color: textColor,
          padding: '6px 16px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '8px',
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: '12px',
          fontWeight: 700,
          letterSpacing: '0.6px',
          zIndex: 25,
          overflow: 'hidden',
          boxShadow: isCritical
            ? '0 2px 10px rgba(239, 68, 68, 0.4)'
            : '0 2px 10px rgba(245, 158, 11, 0.4)'
        }}
      >
        {isCritical ? <Flame size={15} /> : <AlertTriangle size={15} />}
        <span>{message}</span>
      </motion.div>
    </AnimatePresence>
  )
}

export default TemperatureWarning
