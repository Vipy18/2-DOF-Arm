import React, { useState, useEffect, useCallback } from 'react'
import {
  Download,
  Upload,
  Save,
  Send,
  Loader2,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Thermometer,
  ShieldAlert,
  Sliders,
  Activity,
  Cpu,
  Radio,
  Gauge,
  Zap
} from 'lucide-react'
import { useAppStore } from '../store/motorStore'
import { decodeFault, isFault } from '../store/faultDecoder'
import { RunMode, AppConfig } from '../store/types'

interface MotorParamsForm {
  runMode: 'Position' | 'Velocity' | 'Current' | 'MIT'
  maxSpeed: number
  maxCurrent: number
  limitTorque: number
  jointLimitMin: number
  jointLimitMax: number
  posKp: number
  velKp: number
  velKi: number
  velKd: number
  posRef: number
  speedRef: number
  currentRef: number
}

const MODE_NAME_TO_INDEX: Record<string, number> = {
  Position: 0,
  Current: 1,
  Velocity: 2,
  MIT: 3
}

const MODE_INDEX_TO_NAME: Record<number, 'Position' | 'Velocity' | 'Current' | 'MIT'> = {
  0: 'Position',
  1: 'Current',
  2: 'Velocity',
  3: 'MIT'
}

const defaultMotor1Form: MotorParamsForm = {
  runMode: 'Position',
  maxSpeed: 10.0,
  maxCurrent: 5.0,
  limitTorque: 10.0,
  jointLimitMin: -170.0,
  jointLimitMax: 170.0,
  posKp: 30.0,
  velKp: 0.05,
  velKi: 0.0,
  velKd: 0.0, // Vel Kd index 0x700D per Robstride 02 manual
  posRef: 0.0,
  speedRef: 0.0,
  currentRef: 0.0
}

const defaultMotor2Form: MotorParamsForm = {
  runMode: 'Position',
  maxSpeed: 10.0,
  maxCurrent: 5.0,
  limitTorque: 10.0,
  jointLimitMin: -150.0,
  jointLimitMax: 150.0,
  posKp: 30.0,
  velKp: 0.05,
  velKi: 0.0,
  velKd: 0.0, // Vel Kd index 0x700D per Robstride 02 manual
  posRef: 0.0,
  speedRef: 0.0,
  currentRef: 0.0
}

// Helpers for IPC communication
async function writeParamHelper(
  motorId: number,
  index: number,
  format: string,
  value: number
): Promise<boolean> {
  try {
    if (window.api && typeof window.api.writeMotorParam === 'function') {
      return await window.api.writeMotorParam(motorId, index, format, value)
    } else if (window.motorAPI && typeof window.motorAPI.writeParam === 'function') {
      await window.motorAPI.writeParam(motorId, index, format, value)
      return true
    } else if (window.api && typeof window.api.invoke === 'function') {
      await window.api.invoke('motor:writeParam', motorId, index, format, value)
      return true
    } else if (window.electron?.ipcRenderer) {
      await window.electron.ipcRenderer.invoke('motor:writeParam', motorId, index, format, value)
      return true
    }
  } catch (err) {
    console.error(`[MotorStudio] Error writing param 0x${index.toString(16)} to motor ${motorId}:`, err)
    throw err
  }
  return false
}

async function readParamHelper(motorId: number, index: number): Promise<number | null> {
  try {
    if (window.motorAPI && typeof window.motorAPI.readParam === 'function') {
      return await window.motorAPI.readParam(motorId, index)
    } else if (window.api && typeof window.api.invoke === 'function') {
      return await window.api.invoke('motor:readParam', motorId, index)
    } else if (window.electron?.ipcRenderer) {
      return await window.electron.ipcRenderer.invoke('motor:readParam', motorId, index)
    }
  } catch (err) {
    console.error(`[MotorStudio] Error reading param 0x${index.toString(16)} from motor ${motorId}:`, err)
    throw err
  }
  return null
}

async function saveConfigHelper(cfg: Partial<AppConfig>): Promise<void> {
  try {
    if (window.api && typeof window.api.saveConfig === 'function') {
      await window.api.saveConfig(cfg)
    } else if (window.motorAPI && typeof window.motorAPI.saveConfig === 'function') {
      await window.motorAPI.saveConfig(cfg as any)
    } else if (window.api && typeof window.api.invoke === 'function') {
      await window.api.invoke('config:save', cfg)
    } else if (window.electron?.ipcRenderer) {
      await window.electron.ipcRenderer.invoke('config:save', cfg)
    }
  } catch (err) {
    console.error('[MotorStudio] Error saving config:', err)
    throw err
  }
}

export function MotorStudio(): React.JSX.Element {
  const [activeMotor, setActiveMotor] = useState<1 | 2>(1)
  const [formData, setFormData] = useState<Record<1 | 2, MotorParamsForm>>({
    1: { ...defaultMotor1Form },
    2: { ...defaultMotor2Form }
  })

  // Operation states
  const [isReading, setIsReading] = useState(false)
  const [isWriting, setIsWriting] = useState(false)
  const [isSavingFlash, setIsSavingFlash] = useState(false)
  const [showWriteConfirm, setShowWriteConfirm] = useState(false)
  const [activeSendingField, setActiveSendingField] = useState<string | null>(null)

  // Toast notification state
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null)

  // Store subscriptions
  const motors = useAppStore((state) => state.motors)
  const connection = useAppStore((state) => state.connection)
  const config = useAppStore((state) => state.config)
  const updateConfig = useAppStore((state) => state.updateConfig)

  const activeMotorState = motors[activeMotor === 1 ? 0 : 1]
  const isConnected = connection.status === 'connected'
  const currentForm = formData[activeMotor]

  const showToast = useCallback((message: string, type: 'success' | 'error' | 'info' = 'info') => {
    setToast({ message, type })
  }, [])

  // Auto-dismiss toast
  useEffect(() => {
    if (!toast) return
    const timer = setTimeout(() => {
      setToast(null)
    }, 4000)
    return () => clearTimeout(timer)
  }, [toast])

  // Sync initial joint limits from app config if available
  useEffect(() => {
    if (config) {
      setFormData((prev) => {
        const m1Limits = config.motor1Limits
        const m2Limits = config.motor2Limits
        return {
          1: {
            ...prev[1],
            jointLimitMin: m1Limits?.minDeg ?? prev[1].jointLimitMin,
            jointLimitMax: m1Limits?.maxDeg ?? prev[1].jointLimitMax,
            maxCurrent: m1Limits?.maxCurrentA ?? prev[1].maxCurrent
          },
          2: {
            ...prev[2],
            jointLimitMin: m2Limits?.minDeg ?? prev[2].jointLimitMin,
            jointLimitMax: m2Limits?.maxDeg ?? prev[2].jointLimitMax,
            maxCurrent: m2Limits?.maxCurrentA ?? prev[2].maxCurrent
          }
        }
      })
    }
  }, [config])

  // Update specific form field in local state
  const updateFormField = <K extends keyof MotorParamsForm>(key: K, value: MotorParamsForm[K]): void => {
    setFormData((prev) => ({
      ...prev,
      [activeMotor]: {
        ...prev[activeMotor],
        [key]: value
      }
    }))
  }

  // Handle Run Mode change
  const handleRunModeChange = async (newMode: 'Position' | 'Velocity' | 'Current' | 'MIT'): Promise<void> => {
    updateFormField('runMode', newMode)
    const modeIndex = MODE_NAME_TO_INDEX[newMode]
    const modeKey = newMode.toLowerCase() as RunMode

    try {
      let success = false
      if (window.api && typeof window.api.setRunMode === 'function') {
        success = await window.api.setRunMode(activeMotor, modeKey)
      } else if (window.motorAPI && typeof window.motorAPI.setMode === 'function') {
        await window.motorAPI.setMode(activeMotor, modeIndex)
        success = true
      } else {
        success = await writeParamHelper(activeMotor, 0x7005, '<B', modeIndex)
      }

      if (success) {
        showToast(`Motor ${activeMotor} mode changed to ${newMode}`, 'success')
      }
    } catch (err: any) {
      console.error('[MotorStudio] Failed to set run mode:', err)
      showToast(`Failed to set mode: ${err.message || 'IPC error'}`, 'error')
    }
  }

  // Handle Joint Limit changes with config persistence
  const handleLimitChange = async (
    field: 'jointLimitMin' | 'jointLimitMax',
    value: number
  ): Promise<void> => {
    updateFormField(field, value)

    try {
      const isM1 = activeMotor === 1
      const currentM1 = config.motor1Limits ?? { minDeg: -170, maxDeg: 170, maxCurrentA: 5.0 }
      const currentM2 = config.motor2Limits ?? { minDeg: -150, maxDeg: 150, maxCurrentA: 5.0 }

      const updatedM1 = isM1
        ? { ...currentM1, [field === 'jointLimitMin' ? 'minDeg' : 'maxDeg']: value }
        : currentM1
      const updatedM2 = !isM1
        ? { ...currentM2, [field === 'jointLimitMin' ? 'minDeg' : 'maxDeg']: value }
        : currentM2

      const newConfigPayload = {
        motor1Limits: updatedM1,
        motor2Limits: updatedM2
      }

      updateConfig(newConfigPayload)
      await saveConfigHelper(newConfigPayload)
    } catch (err: any) {
      console.error('[MotorStudio] Failed to save joint limits to config:', err)
      showToast(`Failed to save config: ${err.message || 'Error'}`, 'error')
    }
  }

  // Handle manual command send
  const handleSendCommand = async (
    field: 'posRef' | 'speedRef' | 'currentRef',
    paramIndex: number,
    value: number
  ): Promise<void> => {
    const eStopActive = useAppStore.getState().safety.eStopActive
    if (eStopActive) {
      showToast(`Cannot send ${field} while E-STOP is active`, 'error')
      return
    }

    setActiveSendingField(field)
    try {
      let success = false
      if (field === 'posRef') {
        if (window.api && typeof window.api.sendPositionCommand === 'function') {
          success = await window.api.sendPositionCommand(activeMotor, value)
        } else {
          success = await writeParamHelper(activeMotor, paramIndex, '<f', value)
        }
      } else if (field === 'speedRef') {
        if (window.api && typeof window.api.sendVelocityCommand === 'function') {
          success = await window.api.sendVelocityCommand(activeMotor, value)
        } else {
          success = await writeParamHelper(activeMotor, paramIndex, '<f', value)
        }
      } else if (field === 'currentRef') {
        if (window.api && typeof window.api.sendCurrentCommand === 'function') {
          success = await window.api.sendCurrentCommand(activeMotor, value)
        } else {
          success = await writeParamHelper(activeMotor, paramIndex, '<f', value)
        }
      }

      if (success) {
        showToast(`Sent ${field} = ${value} to Motor ${activeMotor}`, 'success')
      }
    } catch (err: any) {
      console.error(`[MotorStudio] Failed to send ${field}:`, err)
      showToast(`Send failed: ${err.message || 'IPC error'}`, 'error')
    } finally {
      setActiveSendingField(null)
    }
  }

  // Handle single param write on blur/change
  const handleSingleParamWrite = async (
    index: number,
    format: string,
    value: number,
    label: string
  ): Promise<void> => {
    try {
      const ok = await writeParamHelper(activeMotor, index, format, value)
      if (ok) {
        showToast(`${label} written: ${value}`, 'success')
      }
    } catch (err: any) {
      showToast(`Failed to write ${label}: ${err.message || 'Write error'}`, 'error')
    }
  }

  // Handle READ ALL action
  const handleReadAll = async (): Promise<void> => {
    setIsReading(true)
    try {
      let readParams: Record<number, number> | null = null

      if (window.api && typeof window.api.invoke === 'function') {
        try {
          readParams = await window.api.invoke('motor:readAllParams', activeMotor)
        } catch {
          // Fallback to individual reads
        }
      }

      if (readParams && typeof readParams === 'object') {
        setFormData((prev) => {
          const cur = prev[activeMotor]
          return {
            ...prev,
            [activeMotor]: {
              ...cur,
              posKp: readParams![0x7015] ?? cur.posKp,
              velKp: readParams![0x700B] ?? cur.velKp,
              velKi: readParams![0x700C] ?? cur.velKi,
              velKd: readParams![0x700D] ?? cur.velKd,
              maxSpeed: readParams![0x7017] ?? cur.maxSpeed,
              maxCurrent: readParams![0x7018] ?? cur.maxCurrent,
              posRef: readParams![0x7016] ?? cur.posRef,
              speedRef: readParams![0x700A] ?? cur.speedRef,
              currentRef: readParams![0x7006] ?? cur.currentRef,
              runMode:
                readParams![0x7005] !== undefined
                  ? MODE_INDEX_TO_NAME[Math.round(readParams![0x7005])] ?? cur.runMode
                  : cur.runMode
            }
          }
        })
        showToast(`Motor ${activeMotor}: All parameters loaded successfully`, 'success')
      } else {
        // Sequential fallback read
        const indicesToRead: { key: keyof MotorParamsForm; index: number }[] = [
          { key: 'posKp', index: 0x7015 },
          { key: 'velKp', index: 0x700B },
          { key: 'velKi', index: 0x700C },
          { key: 'velKd', index: 0x700D },
          { key: 'maxSpeed', index: 0x7017 },
          { key: 'maxCurrent', index: 0x7018 },
          { key: 'posRef', index: 0x7016 },
          { key: 'speedRef', index: 0x700A },
          { key: 'currentRef', index: 0x7006 }
        ]

        let readCount = 0
        const updates: Partial<MotorParamsForm> = {}

        for (const item of indicesToRead) {
          try {
            const val = await readParamHelper(activeMotor, item.index)
            if (val !== null && !isNaN(val)) {
              (updates as any)[item.key] = Number(val.toFixed(4))
              readCount++
            }
          } catch (e) {
            console.warn(`[MotorStudio] Could not read param 0x${item.index.toString(16)}:`, e)
          }
        }

        // Also read run mode 0x7005
        try {
          const modeVal = await readParamHelper(activeMotor, 0x7005)
          if (modeVal !== null && !isNaN(modeVal)) {
            const mName = MODE_INDEX_TO_NAME[Math.round(modeVal)]
            if (mName) {
              updates.runMode = mName
              readCount++
            }
          }
        } catch (e) {
          console.warn('[MotorStudio] Could not read run mode param:', e)
        }

        if (readCount > 0) {
          setFormData((prev) => ({
            ...prev,
            [activeMotor]: {
              ...prev[activeMotor],
              ...updates
            }
          }))
          showToast(`Motor ${activeMotor}: ${readCount} parameter(s) read`, 'success')
        } else {
          showToast(`Motor ${activeMotor}: Read timed out or no response from CAN bridge`, 'error')
        }
      }
    } catch (err: any) {
      console.error('[MotorStudio] Error during Read All:', err)
      showToast(`Read All failed: ${err.message || 'IPC error'}`, 'error')
    } finally {
      setIsReading(false)
    }
  }

  // Handle WRITE ALL action (invoked after confirmation modal)
  const handleWriteAll = async (): Promise<void> => {
    setShowWriteConfirm(false)
    setIsWriting(true)

    const form = formData[activeMotor]
    const writes = [
      { name: 'Run Mode', index: 0x7005, format: '<B', value: MODE_NAME_TO_INDEX[form.runMode] },
      { name: 'Max Speed', index: 0x7017, format: '<f', value: form.maxSpeed },
      { name: 'Max Current', index: 0x7018, format: '<f', value: form.maxCurrent },
      { name: 'Pos Kp', index: 0x7015, format: '<f', value: form.posKp },
      { name: 'Vel Kp', index: 0x700B, format: '<f', value: form.velKp },
      { name: 'Vel Ki', index: 0x700C, format: '<f', value: form.velKi },
      { name: 'Vel Kd', index: 0x700D, format: '<f', value: form.velKd }
    ]

    let successCount = 0
    const errors: string[] = []

    for (const item of writes) {
      try {
        await writeParamHelper(activeMotor, item.index, item.format, item.value)
        successCount++
      } catch (err: any) {
        errors.push(`${item.name}: ${err.message || 'Failed'}`)
      }
    }

    // Persist joint limits to config
    try {
      const isM1 = activeMotor === 1
      const currentM1 = config.motor1Limits ?? { minDeg: -170, maxDeg: 170, maxCurrentA: 5.0 }
      const currentM2 = config.motor2Limits ?? { minDeg: -150, maxDeg: 150, maxCurrentA: 5.0 }

      const updatedM1 = isM1
        ? { ...currentM1, minDeg: form.jointLimitMin, maxDeg: form.jointLimitMax, maxCurrentA: form.maxCurrent }
        : currentM1
      const updatedM2 = !isM1
        ? { ...currentM2, minDeg: form.jointLimitMin, maxDeg: form.jointLimitMax, maxCurrentA: form.maxCurrent }
        : currentM2

      const cfgPayload = {
        motor1Limits: updatedM1,
        motor2Limits: updatedM2
      }

      updateConfig(cfgPayload)
      await saveConfigHelper(cfgPayload)
    } catch (err: any) {
      errors.push(`Config Limits: ${err.message || 'Failed'}`)
    }

    setIsWriting(false)

    if (errors.length === 0) {
      showToast(`Motor ${activeMotor}: All ${successCount} parameters written successfully`, 'success')
    } else {
      showToast(`Written with ${errors.length} error(s). Check console for details.`, 'error')
    }
  }

  // Handle SAVE TO FLASH action
  const handleSaveToFlash = async (): Promise<void> => {
    setIsSavingFlash(true)
    try {
      await writeParamHelper(activeMotor, 0x200B, '<I', 1)
      showToast(`Motor ${activeMotor}: Parameters saved to Flash memory`, 'success')
    } catch (err: any) {
      console.error('[MotorStudio] Failed to save to flash:', err)
      showToast(`Save to Flash failed: ${err.message || 'Write error'}`, 'error')
    } finally {
      setIsSavingFlash(false)
    }
  }

  const temp = activeMotorState?.temperature ?? 0
  const faultCode = activeMotorState?.faultCode ?? 0
  const faultDesc = activeMotorState?.faultDescription || decodeFault(faultCode)
  const isFaulted = isFault(faultCode)

  const tempColorClass =
    temp > 55
      ? 'text-danger border-danger/40 bg-danger/10'
      : temp > 45
        ? 'text-amber-400 border-amber-400/40 bg-amber-400/10'
        : 'text-white/80 border-glass-border bg-black/20'

  
  return (
    <div className="flex flex-col h-full w-full overflow-hidden bg-background text-on-background">

      {toast && (
        <div
          className={`fixed top-4 right-4 z-50 flex items-center gap-2.5 px-4 py-2.5 rounded-xl text-xs font-mono border backdrop-blur-glass shadow-2xl transition-all ${
            toast.type === 'success'
              ? 'bg-emerald-950/80 border-emerald-500/40 text-emerald-300'
              : toast.type === 'error'
                ? 'bg-red-950/80 border-danger/40 text-red-300'
                : 'bg-[#131318]/90 border-glass-border text-accent'
          }`}
        >
          <span>{toast.message}</span>
        </div>
      )}



<nav className="hidden md:flex flex-col h-full border-r border-white/10 bg-surface-dim/80 backdrop-blur-xl docked left-0 w-64 z-40 shrink-0">

<div className="p-6 border-b border-white/10 flex items-center gap-4">
<div className="w-10 h-10 rounded bg-white/10 flex items-center justify-center shrink-0">
<span className="material-symbols-outlined text-primary">robot_2</span>
</div>
<div>
<h1 className="font-headline-md text-headline-md text-primary truncate">OP-UNIT-01</h1>
<p className="font-label-caps text-label-caps text-on-surface-variant truncate mt-1">Local Control Mode</p>
</div>
</div>

<div className="flex-1 py-4 flex flex-col gap-1 overflow-y-auto px-2">
<a className="flex items-center gap-3 rounded-DEFAULT px-4 py-3 text-on-surface-variant hover:bg-white/5 hover:text-primary transition-colors font-label-caps text-label-caps group" href="#">
<span className="material-symbols-outlined group-hover:text-primary transition-colors text-on-surface-variant">dashboard</span>
                Dashboard
            </a>
<a className="flex items-center gap-3 rounded-DEFAULT px-4 py-3 text-on-surface-variant hover:bg-white/5 hover:text-primary transition-colors font-label-caps text-label-caps group" href="#">
<span className="material-symbols-outlined group-hover:text-primary transition-colors text-on-surface-variant">tune</span>
                Control
            </a>
<a className="flex items-center gap-3 rounded-DEFAULT px-4 py-3 text-on-surface-variant hover:bg-white/5 hover:text-primary transition-colors font-label-caps text-label-caps group" href="#">
<span className="material-symbols-outlined group-hover:text-primary transition-colors text-on-surface-variant">code</span>
                Program
            </a>
<a className="flex items-center gap-3 rounded-DEFAULT px-4 py-3 text-secondary bg-white/5 border-l-2 border-secondary font-label-caps text-label-caps transition-all duration-200 ease-in-out" href="#">
<span className="material-symbols-outlined text-secondary" style="font-variation-settings: 'FILL' 1;">settings_input_component</span>
                Motor Studio
            </a>
</div>

<div className="mt-auto border-t border-white/10 p-2 flex flex-col gap-1">
<a className="flex items-center gap-3 rounded-DEFAULT px-4 py-3 text-on-surface-variant hover:bg-white/5 hover:text-primary transition-colors font-label-caps text-label-caps group" href="#">
<span className="material-symbols-outlined group-hover:text-primary transition-colors text-on-surface-variant">analytics</span>
                Diagnostics
            </a>
<a className="flex items-center gap-3 rounded-DEFAULT px-4 py-3 text-on-surface-variant hover:bg-white/5 hover:text-primary transition-colors font-label-caps text-label-caps group" href="#">
<span className="material-symbols-outlined group-hover:text-primary transition-colors text-on-surface-variant">history</span>
                Logs
            </a>
</div>
</nav>

<div className="flex-1 flex flex-col min-w-0 h-full relative">

<div className="absolute inset-0 pointer-events-none overflow-hidden opacity-20 mix-blend-screen">
<div className="absolute -top-1/4 -right-1/4 w-1/2 h-1/2 rounded-full bg-secondary blur-[120px]"></div>
<div className="absolute -bottom-1/4 -left-1/4 w-1/2 h-1/2 rounded-full bg-[#1a3b5c] blur-[120px]"></div>
</div>

<header className="flex justify-between items-center px-panel-padding h-16 w-full z-50 bg-white/5 backdrop-blur-md border-b border-white/10 docked full-width top-0 shrink-0">
<div className="flex items-center gap-6 h-full">
<div className="font-display-lg text-headline-md tracking-tighter text-primary">
                    MOTOR STUDIO v2.4
                </div>

<div className="hidden md:flex h-full items-end gap-2 ml-8">
<button onClick={() => setActiveMotor(1)} className={`h-10 px-6 rounded-t-DEFAULT ${activeMotor === 1 ? "bg-white/10 border-b-2 border-secondary text-secondary" : "bg-transparent border-transparent text-on-surface-variant hover:bg-white/5"} font-label-caps text-label-caps flex items-center gap-2 transition-all`}>
<span className="w-2 h-2 rounded-full bg-secondary animate-pulse"></span>
                        {activeMotor === 1 ? "Motor 1 [J1] ACTIVE" : "Motor 1 [J1]"}
                    </button>
<button onClick={() => setActiveMotor(2)} className={`h-10 px-6 rounded-t-DEFAULT ${activeMotor === 2 ? "bg-white/10 border-b-2 border-secondary text-secondary" : "bg-transparent border-transparent text-on-surface-variant hover:bg-white/5"} font-label-caps text-label-caps flex items-center gap-2 transition-all`}>
<span className="w-2 h-2 rounded-full bg-surface-variant"></span>
                        {activeMotor === 2 ? "Motor 2 [J2] ACTIVE" : "Motor 2 [J2]"}
                    </button>
</div>
</div>
<div className="flex items-center gap-4">
<button className="w-10 h-10 rounded-DEFAULT flex items-center justify-center text-on-surface-variant hover:text-primary hover:bg-white/5 transition-all">
<span className="material-symbols-outlined">settings</span>
</button>
<button className="w-10 h-10 rounded-DEFAULT flex items-center justify-center text-on-surface-variant hover:text-primary hover:bg-white/5 transition-all relative">
<span className="material-symbols-outlined">notifications</span>
<span className="absolute top-2 right-2 w-2 h-2 rounded-full bg-error"></span>
</button>
<div className="h-6 w-[1px] bg-white/10 mx-2"></div>
<button className="h-10 px-6 rounded-DEFAULT bg-[#ff3333]/20 hover:bg-[#ff3333]/30 text-[#ff3333] border border-[#ff3333]/50 font-label-caps text-label-caps flex items-center gap-2 active:scale-95 duration-150 transition-all">
<span className="material-symbols-outlined text-[16px]">dangerous</span>
                    EMERGENCY STOP
                </button>
</div>
</header>

<main className="flex-1 overflow-y-auto p-gutter z-10 relative">
<div className="max-w-[1600px] mx-auto">

<div className="grid grid-cols-1 md:grid-cols-12 gap-gutter">

<div className="col-span-1 md:col-span-4 flex flex-col gap-gutter">

<div className="glass-panel rounded-lg p-6">
<div className="flex items-center justify-between mb-6">
<h2 className="font-headline-md text-body-base text-primary">Operating Mode</h2>
<span className="material-symbols-outlined text-on-surface-variant text-[20px]">swap_horiz</span>
</div>
<div className="relative">
<select value={currentForm.runMode} onChange={(e) => handleRunModeChange(e.target.value as any)} className="w-full glass-input rounded-DEFAULT px-4 py-3 font-label-caps text-label-caps text-primary appearance-none cursor-pointer">
<option className="bg-surface-dim" value="Position">Position Control</option>
<option className="bg-surface-dim" value="Velocity">Velocity Control</option>
<option className="bg-surface-dim" value="Current">Current Control</option>
<option className="bg-surface-dim" value="MIT">MIT Custom Mode</option>
</select>
<span className="material-symbols-outlined absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-on-surface-variant text-[18px]">expand_more</span>
</div>
<div className="mt-4 flex items-center gap-2">
<div className="w-2 h-2 rounded-full bg-secondary"></div>
<span className="font-label-caps text-[10px] text-secondary">ACTIVE: CLOSED LOOP</span>
</div>
</div>

<div className="glass-panel rounded-lg p-6">
<div className="flex items-center justify-between mb-6">
<h2 className="font-headline-md text-body-base text-primary">Safety Limits</h2>
<span className="material-symbols-outlined text-on-surface-variant text-[20px]">warning</span>
</div>
<div className="space-y-4">
<div className="flex items-center justify-between group">
<label className="font-label-caps text-label-caps text-on-surface-variant">Max Speed</label>
<div className="relative flex items-center">
<input className="glass-input rounded-DEFAULT w-24 text-right pr-10 py-2 font-data-point text-[14px] text-primary" step="0.1" type="number" value={currentForm.maxSpeed} onChange={(e) => updateFormField('maxSpeed', parseFloat(e.target.value) || 0)} onBlur={() => handleSingleParamWrite(0x7017, '<f', currentForm.maxSpeed, 'Max Speed')} />
<span className="absolute right-3 font-label-caps text-[10px] text-on-surface-variant pointer-events-none">rad/s</span>
</div>
</div>
<div className="flex items-center justify-between group">
<label className="font-label-caps text-label-caps text-on-surface-variant">Max Current</label>
<div className="relative flex items-center">
<input className="glass-input rounded-DEFAULT w-24 text-right pr-8 py-2 font-data-point text-[14px] text-primary" step="0.1" type="number" value={currentForm.maxCurrent} onChange={(e) => updateFormField('maxCurrent', parseFloat(e.target.value) || 0)} onBlur={() => handleSingleParamWrite(0x7018, '<f', currentForm.maxCurrent, 'Max Current')} />
<span className="absolute right-3 font-label-caps text-[10px] text-on-surface-variant pointer-events-none">A</span>
</div>
</div>
<div className="h-[1px] w-full bg-white/5 my-2"></div>
<div className="flex items-center justify-between group">
<label className="font-label-caps text-label-caps text-on-surface-variant">Joint Min Lim</label>
<div className="relative flex items-center">
<input className="glass-input rounded-DEFAULT w-24 text-right pr-10 py-2 font-data-point text-[14px] text-primary" step="0.01" type="number" value={currentForm.jointLimitMin} onChange={(e) => handleLimitChange('jointLimitMin', parseFloat(e.target.value) || 0)} />
<span className="absolute right-3 font-label-caps text-[10px] text-on-surface-variant pointer-events-none">rad</span>
</div>
</div>
<div className="flex items-center justify-between group">
<label className="font-label-caps text-label-caps text-on-surface-variant">Joint Max Lim</label>
<div className="relative flex items-center">
<input className="glass-input rounded-DEFAULT w-24 text-right pr-10 py-2 font-data-point text-[14px] text-primary" step="0.01" type="number" value={currentForm.jointLimitMax} onChange={(e) => handleLimitChange('jointLimitMax', parseFloat(e.target.value) || 0)} />
<span className="absolute right-3 font-label-caps text-[10px] text-on-surface-variant pointer-events-none">rad</span>
</div>
</div>
<button className="w-full mt-4 py-2 rounded-DEFAULT border border-white/10 hover:border-white/30 text-on-surface-variant hover:text-primary font-label-caps text-label-caps transition-all">
                                    APPLY LIMITS
                                </button>
</div>
</div>
</div>

<div className="col-span-1 md:col-span-4 flex flex-col gap-gutter">

<div className="glass-panel rounded-lg p-6 flex-1 flex flex-col">
<div className="flex items-center justify-between mb-8">
<div>
<h2 className="font-headline-md text-body-base text-primary">Control Gains (PID)</h2>
<p className="font-label-caps text-[10px] text-on-surface-variant mt-1">TUNING PARAMETERS</p>
</div>
<button className="w-8 h-8 rounded bg-white/5 hover:bg-white/10 flex items-center justify-center text-on-surface-variant transition-colors" title="Auto-tune">
<span className="material-symbols-outlined text-[18px]">auto_fix_high</span>
</button>
</div>
<div className="space-y-6 flex-1">

<div>
<div className="flex justify-between items-end mb-2">
<label className="font-label-caps text-label-caps text-secondary">Position Kp</label>
<span className="font-data-point text-[16px] text-primary">{currentForm.posKp}</span>
</div>
<input className="w-full h-4 mt-2 cursor-pointer" max="100" min="0" step="0.1" type="range" value={currentForm.posKp} onChange={(e) => updateFormField('posKp', parseFloat(e.target.value) || 0)} onBlur={() => handleSingleParamWrite(0x7015, '<f', currentForm.posKp, 'Pos Kp')} />
</div>

<div>
<div className="flex justify-between items-end mb-2">
<label className="font-label-caps text-label-caps text-on-surface-variant">Velocity Kp</label>
<span className="font-data-point text-[16px] text-primary">{currentForm.velKp}</span>
</div>
<input className="w-full h-4 mt-2 cursor-pointer" max="1" min="0" step="0.01" type="range" value={currentForm.velKp} onChange={(e) => updateFormField('velKp', parseFloat(e.target.value) || 0)} onBlur={() => handleSingleParamWrite(0x700B, '<f', currentForm.velKp, 'Vel Kp')} />
</div>
</div>

<div>
<div className="flex justify-between items-end mb-2">
<label className="font-label-caps text-label-caps text-on-surface-variant">Velocity Ki</label>
<span className="font-data-point text-[16px] text-primary">{currentForm.velKi}</span>
</div>
<input className="w-full h-4 mt-2 cursor-pointer" max="1" min="0" step="0.001" type="range" value={currentForm.velKi} onChange={(e) => updateFormField('velKi', parseFloat(e.target.value) || 0)} onBlur={() => handleSingleParamWrite(0x700C, '<f', currentForm.velKi, 'Vel Ki')} />
</div>
</div>

<div>
<div className="flex justify-between items-end mb-2">
<label className="font-label-caps text-label-caps text-on-surface-variant">Velocity Kd</label>
<span className="font-data-point text-[16px] text-primary">{currentForm.velKd}</span>
</div>
<input className="w-full h-4 mt-2 cursor-pointer" max="1" min="0" step="0.001" type="range" value={currentForm.velKd} onChange={(e) => updateFormField('velKd', parseFloat(e.target.value) || 0)} onBlur={() => handleSingleParamWrite(0x700D, '<f', currentForm.velKd, 'Vel Kd')} />
</div>
</div>
</div>
<div className="mt-8 flex gap-3">
<button className="flex-1 py-3 rounded-DEFAULT bg-white/5 border border-white/10 hover:bg-white/10 text-primary font-label-caps text-label-caps transition-all">
                                    RESET
                                </button>
<button className="flex-1 py-3 rounded-DEFAULT primary-action font-label-caps text-label-caps font-bold">
                                    WRITE TO FLASH
                                </button>
</div>
</div>
</div>

<div className="col-span-1 md:col-span-4 flex flex-col gap-gutter">

<div className="glass-panel rounded-lg p-6 relative overflow-hidden group">

<div className="absolute bottom-0 left-0 w-full h-1/2 opacity-20 pointer-events-none transition-opacity group-hover:opacity-30">
<svg className="w-full h-full stroke-secondary fill-none" preserveAspectRatio="none" strokeWidth="1" viewBox="0 0 100 50">
<path d="M0,40 L10,35 L20,45 L30,20 L40,30 L50,15 L60,25 L70,10 L80,30 L90,20 L100,5"></path>
</svg>
</div>
<div className="flex items-center justify-between mb-6 relative z-10">
<div className="flex items-center gap-2">
<span className="w-2 h-2 rounded-full bg-[#4CAF50] shadow-[0_0_8px_#4CAF50]"></span>
<h2 className="font-headline-md text-body-base text-primary">Telemetry Stream</h2>
</div>
<span className="font-label-caps text-[10px] text-on-surface-variant">1kHz</span>
</div>
<div className="grid grid-cols-2 gap-4 relative z-10">

<div className="bg-black/20 p-3 rounded-DEFAULT border border-white/5">
<div className="font-label-caps text-[10px] text-on-surface-variant mb-1">POSITION (DEG)</div>
<div className="font-data-point text-[24px] text-primary">{(activeMotorState?.position ?? 0).toFixed(2)}</div>
</div>

<div className="bg-black/20 p-3 rounded-DEFAULT border border-white/5">
<div className="font-label-caps text-[10px] text-on-surface-variant mb-1">VELOCITY (RAD/S)</div>
<div className="font-data-point text-[24px] text-primary">{(activeMotorState?.velocity ?? 0).toFixed(2)}</div>
</div>

<div className="bg-black/20 p-3 rounded-DEFAULT border border-white/5">
<div className="font-label-caps text-[10px] text-secondary mb-1">CURRENT (A)</div>
<div className="font-data-point text-[24px] text-secondary">{(activeMotorState?.current ?? 0).toFixed(2)}</div>
</div>

<div className="bg-black/20 p-3 rounded-DEFAULT border border-white/5">
<div className="font-label-caps text-[10px] text-on-surface-variant mb-1">TEMP (°C)</div>
<div className="font-data-point text-[24px] text-primary">{activeMotorState?.temperature ?? 0}</div>
</div>
</div>
</div>

<div className="glass-panel rounded-lg p-6 mt-auto border-secondary/30">
<h2 className="font-headline-md text-body-base text-primary mb-4 flex items-center gap-2">
<span className="material-symbols-outlined text-[18px] text-secondary">terminal</span>
                                Direct Command
                            </h2>
<div className="flex gap-2 mb-4">
<input className="flex-1 glass-input rounded-DEFAULT px-3 py-2 font-data-point text-[14px] text-primary" placeholder="Target" type="number" value={currentForm.posRef} onChange={(e) => updateFormField('posRef', parseFloat(e.target.value) || 0)}/>
<select className="w-24 glass-input rounded-DEFAULT px-2 py-2 font-label-caps text-[10px] text-on-surface-variant appearance-none text-center">
<option value="Position">RAD</option>
<option value="Velocity">RAD/S</option>
<option value="Current">AMP</option>
</select>
</div>
<button className="w-full py-3 rounded-DEFAULT bg-secondary/20 hover:bg-secondary/30 border border-secondary/50 text-secondary font-label-caps text-label-caps flex items-center justify-center gap-2 transition-all active:scale-95">
<span className="material-symbols-outlined text-[16px]">send</span>
                                SEND COMMAND
                            </button>
</div>
</div>
</div>
</div>
</main>
</div>

    </div>
  );
}

export default MotorStudio;
