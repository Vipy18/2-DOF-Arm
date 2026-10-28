import React, { useState, useEffect, useRef, useMemo } from 'react'
import {
  Play,
  Square,
  Plus,
  Save,
  FolderOpen,
  RotateCcw,
  ListOrdered,
  Sparkles,
  AlertTriangle,
  Layers,
  Cpu,
  Info
} from 'lucide-react'
import { useProgramStore } from '../store/programStore'
import { useAppStore } from '../store/motorStore'
import { StepRow } from '../components/StepRow'
import { StepEditor } from '../components/StepEditor'
import { MiniArmCanvas } from '../components/MiniArmCanvas'
import {
  forwardKinematics,
  withinJointLimits,
  estimateDuration,
  radToDeg,
  DEFAULT_L1,
  DEFAULT_L2,
  DEFAULT_JOINT_LIMITS
} from '../kinematics'
import { ProgramStep, ElbowConfig } from '../store/types'

/**
 * Robust helper to send motor position command across available IPC bridges
 */
async function sendMotorPosition(
  motorId: number,
  positionRad: number,
  speedFraction = 0.5
): Promise<boolean> {
  try {
    // 1. window.api sendPositionCommand
    if (window.api && typeof window.api.sendPositionCommand === 'function') {
      const maxSpeed = Math.max(0.1, speedFraction * Math.PI)
      return await window.api.sendPositionCommand(motorId, positionRad, maxSpeed)
    }

    // 2. window.motorAPI writeParam (POS_REF = 0x7016)
    if (window.motorAPI && typeof window.motorAPI.writeParam === 'function') {
      await window.motorAPI.writeParam(motorId, 0x7016, 'f', positionRad)
      return true
    }

    // 3. window.api generic invoke
    if (window.api && typeof window.api.invoke === 'function') {
      await window.api.invoke('motor:writeParam', motorId, 0x7016, 'f', positionRad)
      return true
    }

    // 4. electron ipcRenderer fallback
    if (window.electron?.ipcRenderer) {
      await window.electron.ipcRenderer.invoke('motor:writeParam', motorId, 0x7016, 'f', positionRad)
      return true
    }

    return true
  } catch (err) {
    console.error(`[Program] Error sending position to Motor ${motorId}:`, err)
    return false
  }
}

export const Program: React.FC = () => {
  // Program Store State & Actions
  const {
    name,
    steps,
    isPlaying,
    currentStepIndex,
    editingStepId,
    addStep,
    deleteStep,
    setEditingStep,
    startPlayback,
    stopPlayback,
    advanceStep,
    newProgram,
    loadProgram,
    setName,
    getTotalEstimatedDuration
  } = useProgramStore()

  // App Store State
  const arm = useAppStore((state) => state.arm)
  const motors = useAppStore((state) => state.motors)
  const safety = useAppStore((state) => state.safety)
  const config = useAppStore((state) => state.config)
  const setSafetyFlag = useAppStore((state) => state.setSafetyFlag)

  const l1 = config.armGeometry?.l1 ?? DEFAULT_L1
  const l2 = config.armGeometry?.l2 ?? DEFAULT_L2

  const jointLimitsRad = useMemo(() => {
    return {
      m1Min: config.motor1Limits ? (config.motor1Limits.minDeg * Math.PI) / 180 : DEFAULT_JOINT_LIMITS.m1Min,
      m1Max: config.motor1Limits ? (config.motor1Limits.maxDeg * Math.PI) / 180 : DEFAULT_JOINT_LIMITS.m1Max,
      m2Min: config.motor2Limits ? (config.motor2Limits.minDeg * Math.PI) / 180 : DEFAULT_JOINT_LIMITS.m2Min,
      m2Max: config.motor2Limits ? (config.motor2Limits.maxDeg * Math.PI) / 180 : DEFAULT_JOINT_LIMITS.m2Max
    }
  }, [config.motor1Limits, config.motor2Limits])

  // Local state for temporary canvas simulation preview
  const [simulationAngles, setSimulationAngles] = useState<{ theta1: number; theta2: number } | null>(null)
  const simTimerRef = useRef<NodeJS.Timeout | null>(null)
  const playbackTimerRef = useRef<NodeJS.Timeout | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Current arm angles
  const currentArmAngles = useMemo(() => {
    return {
      theta1: arm.theta1 ?? (motors[0]?.position ? (motors[0].position * Math.PI) / 180 : 0),
      theta2: arm.theta2 ?? (motors[1]?.position ? (motors[1].position * Math.PI) / 180 : 0)
    }
  }, [arm.theta1, arm.theta2, motors])

  // Stop playback immediately if E-Stop triggers
  useEffect(() => {
    if (safety.eStopActive && isPlaying) {
      console.warn('[Program] E-Stop activated — stopping program playback immediately')
      stopPlayback()
      if (playbackTimerRef.current) {
        clearTimeout(playbackTimerRef.current)
        playbackTimerRef.current = null
      }
    }
  }, [safety.eStopActive, isPlaying, stopPlayback])

  // Playback execution loop
  useEffect(() => {
    if (!isPlaying || steps.length === 0) {
      if (playbackTimerRef.current) {
        clearTimeout(playbackTimerRef.current)
        playbackTimerRef.current = null
      }
      return
    }

    if (safety.eStopActive) {
      stopPlayback()
      return
    }

    const step = steps[currentStepIndex]
    if (!step) {
      stopPlayback()
      return
    }

    // Safety check joint limits before sending command
    const isSafe = withinJointLimits(step.targetAngles, jointLimitsRad)
    if (!isSafe) {
      console.error(`[Program] Step #${step.index + 1} exceeds configured joint limits! Aborting playback.`)
      setSafetyFlag('jointLimitViolation', true)
      stopPlayback()
      return
    }

    const executeStep = async () => {
      try {
        // Send motor commands
        await sendMotorPosition(1, step.targetAngles.theta1, step.speed)
        await sendMotorPosition(2, step.targetAngles.theta2, step.speed)

        // Calculate motion duration
        const prevAngles =
          currentStepIndex === 0
            ? currentArmAngles
            : steps[currentStepIndex - 1].targetAngles

        const moveTimeMs = estimateDuration(prevAngles, step.targetAngles, step.speed)
        const dwellTimeMs = Math.max(0, step.dwellMs || 0)
        const totalDurationMs = Math.max(200, moveTimeMs + dwellTimeMs)

        // Schedule advancing to next step
        playbackTimerRef.current = setTimeout(() => {
          advanceStep()
        }, totalDurationMs)
      } catch (err) {
        console.error('[Program] Playback step execution error:', err)
        stopPlayback()
      }
    }

    executeStep()

    return () => {
      if (playbackTimerRef.current) {
        clearTimeout(playbackTimerRef.current)
        playbackTimerRef.current = null
      }
    }
  }, [isPlaying, currentStepIndex, steps, safety.eStopActive, jointLimitsRad, advanceStep, stopPlayback, currentArmAngles, setSafetyFlag])

  // Trigger temporary preview on canvas (e.g. from SIM button)
  const triggerSimulationPreview = (targetAngles: { theta1: number; theta2: number }) => {
    if (simTimerRef.current) {
      clearTimeout(simTimerRef.current)
    }
    setSimulationAngles(targetAngles)
    simTimerRef.current = setTimeout(() => {
      setSimulationAngles(null)
    }, 2500)
  }

  // Record current physical arm pose as a new program step
  const handleRecordPoint = () => {
    try {
      const theta1 = currentArmAngles.theta1
      const theta2 = currentArmAngles.theta2

      // Compute current FK position
      const fk = forwardKinematics({ theta1, theta2 }, l1, l2)
      const elbowConfig: ElbowConfig = theta2 < 0 ? 'up' : 'down'

      addStep({
        moveType: 'MOVE_J',
        targetAngles: { theta1, theta2 },
        targetXY: { x: fk.endEffector.x, y: fk.endEffector.y },
        elbowConfig,
        speed: 0.5,
        dwellMs: 500,
        label: `Point ${steps.length + 1}`
      })
    } catch (err) {
      console.error('[Program] Failed to record point:', err)
    }
  }

  // Run a single step on hardware
  const handleRunSingleStep = async (step: ProgramStep) => {
    if (safety.eStopActive) {
      alert('Cannot run step: EMERGENCY STOP is active!')
      return
    }

    const isSafe = withinJointLimits(step.targetAngles, jointLimitsRad)
    if (!isSafe) {
      alert(`Cannot run step #${step.index + 1}: Exceeds joint limits!`)
      setSafetyFlag('jointLimitViolation', true)
      return
    }

    try {
      await sendMotorPosition(1, step.targetAngles.theta1, step.speed)
      await sendMotorPosition(2, step.targetAngles.theta2, step.speed)
    } catch (err) {
      console.error(`[Program] Failed to run step #${step.index + 1}:`, err)
    }
  }

  // Clear all steps
  const handleClearAll = () => {
    if (steps.length === 0) return
    if (window.confirm('Are you sure you want to clear all program steps?')) {
      newProgram()
    }
  }

  // Save program to file
  const handleSaveProgram = async () => {
    const payload = {
      name: name.trim() || 'Untitled Program',
      steps,
      savedAt: new Date().toISOString()
    }

    try {
      if (window.api && typeof window.api.invoke === 'function') {
        const res = await window.api.invoke('program:save', payload)
        if (res && res.success) return
      }

      if (window.electron?.ipcRenderer) {
        await window.electron.ipcRenderer.invoke('program:save', payload)
        return
      }
    } catch (err) {
      console.warn('[Program] IPC save not supported or failed, falling back to browser download:', err)
    }

    // Fallback: Trigger client-side JSON download
    try {
      const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(payload, null, 2))
      const downloadAnchor = document.createElement('a')
      downloadAnchor.setAttribute('href', dataStr)
      downloadAnchor.setAttribute('download', `${(name || 'program').toLowerCase().replace(/\s+/g, '_')}.json`)
      document.body.appendChild(downloadAnchor)
      downloadAnchor.click()
      downloadAnchor.remove()
    } catch (err) {
      console.error('[Program] Fallback download failed:', err)
    }
  }

  // Load program from file
  const handleLoadProgram = async () => {
    try {
      if (window.api && typeof window.api.invoke === 'function') {
        const result = await window.api.invoke('program:load')
        if (result && result.steps) {
          loadProgram(result)
          return
        }
      }

      if (window.electron?.ipcRenderer) {
        const result = await window.electron.ipcRenderer.invoke('program:load')
        if (result && result.steps) {
          loadProgram(result)
          return
        }
      }
    } catch (err) {
      console.warn('[Program] IPC load failed, falling back to file input dialog:', err)
    }

    // Fallback: open file selector
    if (fileInputRef.current) {
      fileInputRef.current.click()
    }
  }

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = (event) => {
      try {
        const content = event.target?.result as string
        const parsed = JSON.parse(content)
        if (parsed && Array.isArray(parsed.steps)) {
          loadProgram({
            name: parsed.name || file.name.replace(/\.json$/i, ''),
            steps: parsed.steps
          })
        } else {
          alert('Invalid program JSON format.')
        }
      } catch (err) {
        console.error('[Program] Failed to parse program JSON:', err)
        alert('Failed to parse program file.')
      }
    }
    reader.readAsText(file)
    e.target.value = ''
  }

  const totalDurationSec = (getTotalEstimatedDuration() / 1000).toFixed(1)

  
  return (

    <div className="h-full w-full flex flex-col overflow-hidden bg-background text-on-background select-none">
      <input type="file" ref={fileInputRef} onChange={handleFileInputChange} accept=".json" className="hidden" />
      
      {/* Top Navbar / Toolbar */}
      <header className="h-[64px] min-h-[64px] bg-white/5 backdrop-blur-xl border-b border-white/10 flex items-center justify-between px-6 z-10 shrink-0">
        <div className="flex items-center gap-4">
            <h2 className="font-headline-md text-headline-md text-primary">Sequence Editor</h2>
            <span className="glass-panel px-2 py-1 rounded text-xs font-label-caps text-secondary bg-white/5 border border-white/10">{steps.length} STEPS</span>
        </div>
        
        <div className="flex gap-2 flex-wrap items-center">
            <button onClick={handleRecordPoint} disabled={isPlaying} className="btn-primary bg-white/80 hover:bg-white text-black font-label-caps text-label-caps px-4 py-2 rounded transition-colors duration-200 flex items-center justify-center gap-2">
                <Plus className="w-4 h-4" /> Record
            </button>
            <div className="flex gap-2 w-full sm:w-auto ml-4">
                <button onClick={startPlayback} disabled={steps.length === 0 || safety.eStopActive || isPlaying} className="btn-icon text-secondary border border-secondary/30 bg-secondary/10 hover:bg-secondary/20 rounded w-10 h-10 flex items-center justify-center transition-all duration-200">
                    <Play className="w-4 h-4 fill-current" />
                </button>
                <button onClick={stopPlayback} disabled={!isPlaying} className="btn-icon bg-white/5 border border-white/10 text-on-surface-variant hover:text-primary hover:bg-white/10 rounded w-10 h-10 flex items-center justify-center transition-all duration-200">
                    <Square className="w-4 h-4 fill-current text-danger" />
                </button>
                <div className="w-px h-10 bg-white/10 mx-1"></div>
                <button onClick={handleClearAll} disabled={steps.length === 0 || isPlaying} className="btn-icon bg-white/5 border border-white/10 text-on-surface-variant hover:text-primary hover:bg-white/10 rounded w-10 h-10 flex items-center justify-center transition-all duration-200">
                    <RotateCcw className="w-4 h-4" />
                </button>
                
                <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Program Name" className="bg-black/40 border border-white/5 shadow-inner rounded focus:outline-none focus:border-secondary focus:ring-1 focus:ring-secondary text-primary font-data-point text-sm px-3 py-2 w-40 ml-2" />
                
                <button onClick={handleSaveProgram} disabled={steps.length === 0} className="btn-icon bg-white/5 border border-white/10 text-on-surface-variant hover:text-primary hover:bg-white/10 rounded w-10 h-10 flex items-center justify-center transition-all duration-200">
                    <Save className="w-4 h-4" />
                </button>
                <button onClick={handleLoadProgram} disabled={isPlaying} className="btn-icon bg-white/5 border border-white/10 text-on-surface-variant hover:text-primary hover:bg-white/10 rounded w-10 h-10 flex items-center justify-center transition-all duration-200">
                    <FolderOpen className="w-4 h-4" />
                </button>
            </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 flex flex-col md:flex-row p-gutter gap-gutter overflow-hidden relative z-10 h-full">
        {/* Left Pane: Sequence List */}
        <section className="w-full md:w-[400px] flex flex-col gap-4 h-full shrink-0">
          <div className="flex-1 overflow-y-auto pr-2 space-y-2 pb-20 custom-scrollbar">
            {steps.length === 0 ? (
                <div className="p-4 text-center text-on-surface-variant font-label-caps">No steps recorded.</div>
            ) : (
                steps.map((step, idx) => (
                    <StepRow
                      key={step.id || `step-${idx}`}
                      step={step}
                      isActive={isPlaying && currentStepIndex === idx}
                      isEditing={editingStepId === step.id}
                      onEdit={() => setEditingStep(step.id)}
                      onDelete={() => deleteStep(step.id)}
                      onSimulate={() => triggerSimulationPreview(step.targetAngles)}
                      onRun={() => handleRunSingleStep(step)}
                    />
                ))
            )}
          </div>
        </section>

        {/* Right Pane */}
        <section className="flex-1 flex flex-col gap-4 h-full min-w-0">
          {editingStepId !== null ? (
            <StepEditor stepId={editingStepId} onClose={() => setEditingStep(null)} onSimulate={triggerSimulationPreview} />
          ) : (
            <div className="flex-1 glass-panel rounded-xl relative overflow-hidden flex flex-col group min-h-[300px] bg-white/5 border border-white/10">
              <div className="absolute top-4 left-4 z-10 flex flex-col gap-1">
                <div className="font-label-caps text-on-surface-variant text-xs">WORKSPACE SCHEMATIC</div>
                <div className="font-data-point text-xl text-primary">SCARA_01</div>
              </div>
              <MiniArmCanvas currentAngles={currentArmAngles} previewAngles={simulationAngles} l1={l1} l2={l2} height={400} />
              
              {/* Real-time Angles readout */}
              <div className="absolute bottom-4 left-4 flex gap-4">
                  <div className="bg-black/40 border border-white/10 rounded-xl p-3">
                    <div className="text-[10px] font-label-caps text-white/50">J1 (θ1)</div>
                    <div className="text-base font-data-point text-white mt-1">
                      {radToDeg(currentArmAngles.theta1).toFixed(1)}°
                    </div>
                  </div>
                  <div className="bg-black/40 border border-white/10 rounded-xl p-3">
                    <div className="text-[10px] font-label-caps text-white/50">J2 (θ2)</div>
                    <div className="text-base font-data-point text-white mt-1">
                      {radToDeg(currentArmAngles.theta2).toFixed(1)}°
                    </div>
                  </div>
              </div>
            </div>
          )}
        </section>
      </main>
      
      <footer className="h-[38px] min-h-[38px] bg-white/5 backdrop-blur-glass border-t border-white/10 flex items-center justify-between px-6 text-xs font-mono text-white/70 z-10">
        <div className="flex items-center gap-3 truncate max-w-sm">
          <Layers className="w-3.5 h-3.5 text-accent" />
          <span className="truncate text-white/90 font-semibold">{name || 'Untitled Program'}</span>
          <span className="text-white/30">|</span>
          <span>{steps.length} {steps.length === 1 ? 'step' : 'steps'}</span>
        </div>
        <div className="flex items-center gap-2 text-white/80">
          <span className="text-white/50 uppercase text-[10px] tracking-wider font-label-caps">Estimated Duration:</span>
          <span className="text-secondary font-bold font-data-point">{totalDurationSec}s</span>
        </div>
      </footer>
    </div>
  )
}

export default Program;
