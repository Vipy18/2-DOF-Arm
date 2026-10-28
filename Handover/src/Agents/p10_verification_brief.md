# P10 Verification Brief — Robstride Arm Control GUI

## Scope
Full codebase audit before marking any task Complete. Focus on correctness, safety-critical paths, and integration consistency.

## Critical paths to audit

### 1. Safety — E-STOP chain
- Trace E-STOP from `Space` keypress → `useKeyboardShortcuts` → `window.api.emergencyStop()` → IPC → `canBridge.eStop()` → Comm Type 4 to BOTH motors → store `triggerEStop()`
- Verify `SafetyOverlay` renders when `eStopActive=true`
- Verify all Send/Play/Run buttons check `eStopActive` before any motor command
- Verify `useConnectionGuard` triggers E-STOP on port disconnect

### 2. Joint Limit Guard
- Trace Control page drag end → `withinJointLimits()` called with config limits → if fail, NO command sent
- Verify Program playback also calls `withinJointLimits()` per step before `sendPositionCommand`
- Verify `clampToLimits()` is not silently overriding instead of blocking

### 3. IK correctness
- Check `inverseKinematics()` returns `solution: null` when `isReachable=false`
- Verify Control page null-checks `ikResult.solution` before using theta1/theta2
- Verify StepEditor null-checks IK result before enabling Save button
- Check numerical clamping of `cosTheta2` to [-1,1] is present

### 4. API name consistency — `window.api` vs `window.motorAPI`
- Grep all renderer files: confirm single consistent name matching preload's `contextBridge.exposeInMainWorld(...)` call
- Flag any file still using the wrong name

### 5. Program playback safety
- Verify `eStopActive` watch stops playback mid-execution
- Verify `advanceStep()` is only called after await of motor command, not immediately
- Verify `stopPlayback()` is called on `window.api` error during playback

### 6. Temperature auto-throttle
- Verify `TemperatureWarning` calls `writeMotorParam(id, 0x7018, '<f', 3.0)` on >55°C
- Verify it restores to `config.maxCurrentA` on recovery (<45°C)
- Verify it doesn't spam the param write on every render (needs a ref/flag guard)

### 7. CAN packet integrity
- Spot-check `canBridge.makePacket()`: `serial_id = (canId << 3) | 0x04`, header `[0x41, 0x54]`, tail `[0x0D, 0x0A]`, 8-byte payload padding
- Verify `eStop()` sends to BOTH motor IDs (0x01 and 0x02), not just one
- Verify CAN timeout disable (index 0x200C = 0) is sent on connect, before any motor enable

### 8. UI constraint compliance
- Confirm NO nested cards deeper than 1 level in any page
- Confirm NO purple/neon colors anywhere in styles
- Confirm SafetyBar E-STOP button is always visible regardless of page

### 9. Missing ArmCanvas stub check
- P5 (Control) and P6 (Program) both import ArmCanvas — verify the import path is correct relative to their location
- MiniArmCanvas created by P6 — verify P6's Program.tsx actually imports MiniArmCanvas not ArmCanvas for the small preview

### 10. Edge cases
- Program with 0 steps: Play button disabled, playback loop exits cleanly
- Drag end-effector exactly to R_MAX boundary: IK returns valid solution (clamping)
- Motor fault code 0xFF (unknown): faultDecoder returns graceful fallback string
- Serial port open failure: error propagates to store, UI shows error state, does NOT crash

## Output format
For each item above: PASS / FAIL / WARNING with specific file + line reference.
If FAIL: describe exact fix required.
Create audit report at: D:\PRJ\Robstride\Agents\verification_report.md
