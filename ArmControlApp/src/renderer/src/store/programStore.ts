import { create } from 'zustand'
import { ProgramState, ProgramStep } from './types'

export interface ProgramStore extends ProgramState {
  // Step CRUD
  addStep: (step: Omit<ProgramStep, 'id' | 'index'>) => void
  updateStep: (id: string, data: Partial<ProgramStep>) => void
  deleteStep: (id: string) => void
  reorderSteps: (fromIndex: number, toIndex: number) => void

  // Edit mode
  setEditingStep: (id: string | null) => void

  // Playback
  startPlayback: () => void
  stopPlayback: () => void
  advanceStep: () => void // called after each step completes
  setCurrentStepIndex: (index: number) => void

  // File ops
  newProgram: () => void
  loadProgram: (data: { name: string; steps: ProgramStep[] }) => void
  setName: (name: string) => void
  setDirty: (dirty: boolean) => void

  // Computed
  getTotalEstimatedDuration: () => number // in ms
}

/**
 * Generate a unique step ID
 */
export function generateStepId(): string {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID()
    }
  } catch {
    // ignore and fallback
  }
  return `step_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`
}

const initialProgramState: ProgramState = {
  name: 'Untitled Program',
  steps: [],
  isPlaying: false,
  currentStepIndex: 0,
  editingStepId: null,
  dirty: false
}

export const useProgramStore = create<ProgramStore>((set, get) => ({
  ...initialProgramState,

  addStep: (stepData) =>
    set((state) => {
      const newStep: ProgramStep = {
        ...stepData,
        id: generateStepId(),
        index: state.steps.length
      }
      return {
        steps: [...state.steps, newStep],
        dirty: true
      }
    }),

  updateStep: (id: string, data: Partial<ProgramStep>) =>
    set((state) => {
      const steps = state.steps.map((step) => {
        if (step.id === id) {
          return { ...step, ...data }
        }
        return step
      })
      return {
        steps,
        dirty: true
      }
    }),

  deleteStep: (id: string) =>
    set((state) => {
      const filtered = state.steps.filter((s) => s.id !== id)
      // Re-index remaining steps to ensure clean sequence
      const reindexed = filtered.map((s, idx) => ({ ...s, index: idx }))
      
      const newEditingStepId = state.editingStepId === id ? null : state.editingStepId
      const newCurrentStepIndex =
        state.currentStepIndex >= reindexed.length
          ? Math.max(0, reindexed.length - 1)
          : state.currentStepIndex

      return {
        steps: reindexed,
        editingStepId: newEditingStepId,
        currentStepIndex: newCurrentStepIndex,
        dirty: true
      }
    }),

  reorderSteps: (fromIndex: number, toIndex: number) =>
    set((state) => {
      if (
        fromIndex < 0 ||
        fromIndex >= state.steps.length ||
        toIndex < 0 ||
        toIndex >= state.steps.length ||
        fromIndex === toIndex
      ) {
        return state
      }

      const updated = [...state.steps]
      const [movedItem] = updated.splice(fromIndex, 1)
      updated.splice(toIndex, 0, movedItem)

      const reindexed = updated.map((s, idx) => ({ ...s, index: idx }))
      return {
        steps: reindexed,
        dirty: true
      }
    }),

  setEditingStep: (id: string | null) =>
    set(() => ({
      editingStepId: id
    })),

  startPlayback: () =>
    set((state) => ({
      isPlaying: state.steps.length > 0,
      currentStepIndex: 0
    })),

  stopPlayback: () =>
    set(() => ({
      isPlaying: false
    })),

  advanceStep: () => {
    const { steps, currentStepIndex, isPlaying } = get()
    if (!isPlaying) return

    const nextIndex = currentStepIndex + 1
    if (nextIndex < steps.length) {
      set({ currentStepIndex: nextIndex })
    } else {
      // Completed all steps
      set({ isPlaying: false, currentStepIndex: 0 })
    }
  },

  setCurrentStepIndex: (index: number) =>
    set((state) => ({
      currentStepIndex: Math.max(0, Math.min(index, Math.max(0, state.steps.length - 1)))
    })),

  newProgram: () =>
    set(() => ({
      name: 'Untitled Program',
      steps: [],
      isPlaying: false,
      currentStepIndex: 0,
      editingStepId: null,
      dirty: false
    })),

  loadProgram: (data: { name: string; steps: ProgramStep[] }) =>
    set(() => {
      const normalizedSteps = (data.steps || []).map((s, idx) => ({
        ...s,
        id: s.id || generateStepId(),
        index: idx
      }))
      return {
        name: data.name || 'Untitled Program',
        steps: normalizedSteps,
        isPlaying: false,
        currentStepIndex: 0,
        editingStepId: null,
        dirty: false
      }
    }),

  setName: (name: string) =>
    set(() => ({
      name,
      dirty: true
    })),

  setDirty: (dirty: boolean) =>
    set(() => ({
      dirty
    })),

  getTotalEstimatedDuration: () => {
    const { steps } = get()
    if (!steps || steps.length === 0) return 0

    const NOMINAL_MAX_SPEED_RAD_S = 2.0 // standard max joint speed in rad/s
    const ACCELERATION_OVERHEAD_MS = 200 // ramp-up / ramp-down buffer

    let totalMs = 0
    let prevTheta1 = 0
    let prevTheta2 = 0

    for (const step of steps) {
      const dTheta1 = Math.abs(step.targetAngles.theta1 - prevTheta1)
      const dTheta2 = Math.abs(step.targetAngles.theta2 - prevTheta2)
      const maxDelta = Math.max(dTheta1, dTheta2)

      const speedFactor = Math.max(0.05, Math.min(1.0, step.speed || 0.5))
      const moveSpeed = NOMINAL_MAX_SPEED_RAD_S * speedFactor

      const moveTimeMs = (maxDelta / moveSpeed) * 1000 + ACCELERATION_OVERHEAD_MS
      const dwellTimeMs = Math.max(0, step.dwellMs || 0)

      totalMs += moveTimeMs + dwellTimeMs

      prevTheta1 = step.targetAngles.theta1
      prevTheta2 = step.targetAngles.theta2
    }

    return Math.round(totalMs)
  }
}))
