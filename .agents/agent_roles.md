# Agent Roles

## Coordinator
**ID:** Claude Sonnet Thinking (Conversation: 17c5efff-2902-4495-9206-7ad5a32a90a1)
**Scope:** Planning, architecture, task assignment, review approval, oversight
**Cannot:** Write source code, run build commands, push commits

---

## Worker Agent — CAN/Communication Layer
**TypeName:** self (Gemini Flash)
**Scope:**
- `src/main/canBridge.ts` — Serial port open/close, CAN frame encode/decode
- `src/main/ipcHandlers.ts` — IPC channel definitions
- `run_motor.py` protocol reference for packet format

---

## Worker Agent — Kinematics Engine
**TypeName:** self (Gemini Flash)
**Scope:**
- `src/renderer/kinematics/forward.ts` — FK computation
- `src/renderer/kinematics/inverse.ts` — IK computation (geometric 2-link)
- `src/renderer/kinematics/limits.ts` — Joint limit guard

---

## Worker Agent — UI / Pages
**TypeName:** self (Gemini Flash)
**Scope:**
- All `src/renderer/pages/` files
- All `src/renderer/components/` files
- Global CSS / Tailwind tokens
- Stitch design system application

---

## Worker Agent — State & Data
**TypeName:** self (Gemini Flash)
**Scope:**
- `src/renderer/store/motorStore.ts` — Zustand store
- Program data model (JSON schema for saved programs)
- Telemetry ring-buffer / history

---

## Verification Agent
**TypeName:** self (Gemini Pro)
**Scope:**
- Full codebase integration audit
- Safety-critical path review (E-stop, joint limits, IK singularity)
- Edge case analysis
- Final approval gate before tasks marked Complete
