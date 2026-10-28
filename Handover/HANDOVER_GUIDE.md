# Robstride Project — Handover Guide

**Generated:** 2026-10-28
**Project Version:** 02 (Active Development)
**Repository Root:** `d:\PRJ\Robstride\`

---

## 1. Executive Summary

**Robstride** is a multi-platform, multi-language robotics workspace dedicated to control, kinematics analysis, telemetry streaming, and motor sizing for a 2-DOF planar robotic arm powered by **Robstride RS02** brushless smart actuators.

The handover package contains the following primary subsystems:

1. **MATLAB Mission Control & Telemetry (`matlab/`)**: Industrial-grade control and monitoring interface (`ArmControl.m`, `ArmMonitor.m`, `ArmTuner.m`) with 50Hz continuous trajectory streaming and a 50-column CSV flight data logger.
2. **Robstride Motor Studio (`MotorStudio/`)**: Robstride official actuator commissioning, diagnostic, and parameter management utility suite (`motor_tool.exe`).
3. **Joint Torque Calculator & Kinematics Engine (`torque_math.py`)**: Analytical rigid-body dynamics, inertia matrices, continuous/peak torque modeling, and unit test suites (`test_torque_math.py`).
4. **Standalone Hardware Drivers (`oscillate_motors.py`, `run_motor.py`)**: Direct Python-based USB-to-CAN motor control and trajectory testing scripts.
5. **Agent Orchestration & Protocol (`Agents/` & `.agents/`)**: Multi-agent shared blackboard, task board, and communication bus.

All subsystems adhere to unified physical and kinematic conventions defined in `PROJECT_DESCRIPTION.md`.

---

## 2. Physical Arm Parameters (Hardware Constants)

| Parameter | Symbol | Value | Units | Description |
|-----------|--------|-------|-------|-------------|
| Base link length | `L1` | `400` | mm | Center-to-center distance from base pivot to elbow joint |
| Fore link length | `L2` | `300` | mm | Center-to-center distance from elbow joint to end-effector |
| Gravitational acceleration | `g` | `9.81` | m/s² | Acts vertically downwards (negative Y axis) |
| CAN bus baud rate | — | `921600` | bps | USB-to-CAN serial communication speed |
| Motor 1 (Base) CAN ID | — | `0x01` | — | Base/shoulder joint actuator |
| Motor 2 (Fore) CAN ID | — | `0x02` | — | Elbow/forearm joint actuator |
| Host Controller Node ID | — | `0xFD` (253) | — | Central CAN host identifier |
| Max torque limit per motor | — | `17` | Nm | Hardware limit range for param `0x700B` |
| Torque constant | `KM` | `1.22` | N.m/Arms | RS02 torque constant (per motor manual) |

**Coordinate Conventions** (from PROJECT_DESCRIPTION.md §3):
- **Zero Position**: $\theta_1 = 0^\circ, \theta_2 = 0^\circ$ — both links point straight downwards (direction of gravity).
- **Positive Angle ($> 0$)**: Clockwise (CW) rotation.
- **Negative Angle ($< 0$)**: Counter-Clockwise (CCW) rotation.
- **Forward Kinematics**: $x = -L_1 \sin(\theta_1) - L_2 \sin(\theta_1 + \theta_2)$, $y = -L_1 \cos(\theta_1) - L_2 \cos(\theta_1 + \theta_2)$
- **Inverse Kinematics**: Two solutions (Elbow Up/Down), angles normalized to $[-\pi, \pi]$.

---

## 3. Subsystem Breakdown & Development Guidelines

### 3.1 Joint Torque Calculator & Kinematics Engine (`torque_math.py`)

**Core Entry Point:** `pytest test_torque_math.py` / module import (`from torque_math import ArmParameters, TwoLinkTorqueCalculator`).

**Physics Core (`torque_math.py`):**
- `ArmParameters` dataclass: Validates all numeric fields are non-negative; angles must be numeric (can be negative).
- `TwoLinkTorqueCalculator.calculate(params)`: Returns `TwoLinkTorqueResult` with base and elbow continuous/peak torques, inertia, total reach, and total moving mass.
- `calculate_elbow_torque()`, `calculate_base_torque()`, `calculate_2link_torques()`: Helper functions.
- All torque formulas use absolute magnitude of gravity acting on center-of-mass horizontal offsets.

**Unit Tests (`test_torque_math.py`):**
- 11 test cases covering: vertical/horizontal/negative/arbitrary/folded poses, inertia and peak torque calculations, dictionary calculation parity, input validation (type checking + value range), and negative angle handling.
- Run with: `python -m pytest test_torque_math.py` or `python test_torque_math.py`.

### 3.2 MATLAB Mission Control Subsystem (`matlab/`)

**Core Controller (`ArmControl.m`):**
- **Class**: `ArmControl` (MATLAB `handle` subclass).
- **Serial CAN Wrapper**: Based on RobStride USB-to-CAN protocol, baud 921600.
- **Packet Protocol**: Custom binary frames (17-byte AT frames: `[0x41 0x54][4-byte Serial ID][DLC][8-byte payload][0x0D 0x0A]`).
- **Motor IDs**: Motor 1 (Base) = `0x01`, Motor 2 (Fore) = `0x02`, Host ID = `0xFD` (253).
- **Shortest-Path Unwrapping**: Via `calculate_shortest_path` supporting multi-turn operations across $[-\pi, \pi]$ and $[-360^\circ, +360^\circ]$.
- **Streaming**: 50Hz atomic dual-motor target dispatch via `set_both_targets(th1, th2)` in a single 34-byte serial buffer write.
- **Modes Supported**: Position (0), Velocity (1), Current/Torque (3), MIT (Impedance) mode.
- **MIT Control**: Comm Type 0x01 with packed 16-bit position, 12-bit velocity, 12-bit kp, 12-bit kd, 12-bit torque.
- **Kinematics**: Forward and inverse kinematics with elbow-up/-down configuration options.
- **Trajectory Planning**: `plan_trajectory` supporting 'linear', 'joint', and 'arch' trajectory types with reachability validation.
- **Telemetry**: 50Hz feedback polling with `poll_once` / `parse_feedback_frames` processing Comm Type 0x02 broadcast frames.
- **Data Logging**: CSV-style struct logging with timestamps, per-sample motor telemetry (position, velocity, torque, current, voltage, temperature, fault code).

**Key Methods (ArmControl.m):**
- `connect / disconnect` — Open/close serial port.
- `enable_motor / disable_motor` — Motor power stage control.
- `set_current_mode / set_position_mode / set_velocity_mode` — Run mode switching.
- `set_speed / set_target_position / set_target_angle / set_both_targets` — Motion commands.
- `move_to_xy(x, y)` — IK + dual-motor command.
- `calculate_shortest_path(motor_id, desired_angle_rad)` — Unwrapped continuous target.
- `plan_trajectory(...)` — P2P trajectory with trapezoidal/arch-profile.
- `forward_kinematics(theta1, theta2)` — XY coordinates from joint angles.
- `inverse_kinematics(x, y, elbow_config)` — Joint angles from XY.
- `read_pid(motor_id)` / `write_param(motor_id, index, value, formatStr)` — Parameter I/O.
- `read_limits(motor_id)` / `set_joint_limits / set_velocity_limit / set_current_limit` — Safety limits.
- `decode_fault(fault_code)` — Decodes 6-bit fault bits per RS02 manual.
- `mit_control(motor_id, pos_rad, vel_rad_s, kp, kd, torque_nm)` — MIT mode control.

**Mission Control UI (`ArmMonitor.m`):**
- **Class**: `ArmMonitor` (MATLAB `handle` subclass).
- **Layout**: 5-column CSS-like grid on `uifigure` (1600×950, dark theme).
- **Column 1**: Connection, calibration, homing, and status.
- **Column 2**: 2D Kinematic visualizer canvas with arm plot.
- **Column 3**: Joint command inputs, direct angular targets, trajectory execution.
- **Column 4**: Dual-channel real-time oscilloscope (Y-axis locked scroll/pan).
- **Column 5**: 50-column CSV data logger with manual and timed-duration recording modes.

**Key Features (ArmMonitor.m):**
- **Live Telemetry Updates**: 25Hz timer-driven `update()` method reads `ArmControl.Telemetry` and refreshes all UI fields.
- **Color-Coded Status**: Current red (>4.5A), yellow (>3.0A); temperature red (>80°C), yellow (>60°C).
- **Fault Detection**: Decodes and displays fault strings (Undervoltage, Overcurrent, Overtemp, Encoder, Stall/Gridlock, Uncalibrated).
- **Emergency Stop (E-STOP)**: Spacebar or UI button triggers atomic disabling of both motors via Comm Type 0x04 (Disable Motor) — sends consecutive disable packets to Motor IDs 0x01 and 0x02 in a single serial write block.
- **Joint Limit Guard**: Software bounds validated against IK/planned trajectories.
- **Thermal Watchdog**: Auto-throttles max current from 5.0A → 3.0A at >55°C, restores at <45°C.
- **Oscilloscope**: Live buffer of 200 samples across 6 channels (m1 position, m1 velocity, m1 current, m2 position, m2 velocity, m2 current).
- **Data Logging**: Manual toggle + timed-duration recording to CSV files with sample counting and elapsed time.
- **IK/FK Readback**: Real-time Cartesian coordinates displayed from current joint angles.
- **Trajectory Abort**: `abort_trajectory()` called on E-STOP or close.

**Key Monitor Methods:**
- `update()` — 25Hz telemetry refresh.
- `estop()` — Emergency stop both motors.
- `reconnect()` — Re-open serial port and re-enable motors in last-selected mode.
- `read_initial_motor_state()` — Query PID and limits from hardware at startup.
- `read_pid_to_panel(motor_id)` / `write_pid_from_panel(motor_id)` — PID parameter I/O.
- `read_limits_to_panel(motor_id)` / `write_limits_from_panel(motor_id)` — Limit I/O.
- `build_ik_panel()` / `build_pid_panel()` / `build_limits_panel()` / `build_log_panel()` — UI construction.
- `build_command_panel()` — Motor command inputs.
- `update_oscilloscope(telem)` — OSCilloscope buffer management.
- `redraw_arm(th1, th2)` — SVG arm visualization refresh.
- `update_ik_fk_readback(th1, th2)` — Display current XY from joint angles.
- `log_telemetry_sample(telem, th1, th2)` — Append sample to CSV log file.

**Telemetry Rate Architecture** (three distinct rates — not contradictions):
- **50Hz**: `ArmControl` motor target streaming (`set_both_targets`) and hardware feedback poll rate via `start_telemetry()`.
- **20Hz**: Default `start_telemetry(20)` argument in `run_arm_live.m` — configurable; 50Hz is the max supported.
- **25Hz**: `ArmMonitor` UI refresh rate — separate from the hardware poll rate. The monitor reads whatever `ArmControl.Telemetry` has buffered.

**ArmTuner (`ArmTuner.m`):**
- **Class**: `ArmTuner` (MATLAB `handle` subclass).
- **Purpose**: PID step-response tuning and closed-loop performance analysis for a single motor under test.
- **Key Methods**:
  - `step_test(target_rad, duration_s)` — Commands step input, records 50Hz pos/vel/current response.
  - `plot_step_response()` — Renders position, velocity, and current vs time overlay.
  - `compute_metrics()` — Returns rise time, settling time, overshoot percentage, and steady-state error.
  - `autotune_suggestion()` — Prints Ziegler-Nichols-based PID gain hints from observed response.
- **Usage**: `tuner = ArmTuner(arm, 1); tuner.step_test(0.5, 3.0); tuner.autotune_suggestion();`

**run_verification.m:**
- Automated sanity-check script that instantiates `ArmControl('COM_DUMMY')` and `ArmMonitor` without hardware.
- Asserts: UI element validity, panel scrollable properties, resize callback correctness, PID out-of-bounds clamping, E-STOP function execution, and closed-form shutdown sequence.
- Run offline (no motor hardware required): `run_verification` from MATLAB command window.

### 3.3 Robstride Motor Studio (`MotorStudio/`)

**Purpose**: Robstride official actuator commissioning, diagnostic, and parameter management utility suite (`MotorStudio/motor_toolV14L/motor_tool.exe`).

**Key Capabilities:**
- Actuator register inspection and parameter tuning (PID gains, current limits, acceleration limits, CAN node configuration).
- Real-time diagnostic telemetry reading, calibration, and zero-position offset setting.
- Direct hardware testing and firmware interaction over USB-CAN interface.

**Safety-Critical Notes (from PROJECT_DESCRIPTION.md §6):**
- **E-STOP**: Triggered via UI E-STOP buttons, dedicated safety inputs, or programmatic abort calls in MATLAB and CLI drivers. Transmits Communication Type 4 (Disable Motor) packets consecutively to both motors (IDs 0x01 and 0x02) in a single atomic transmission block.
- **Joint Limit Guard**: Software bounds strictly validated against limits defined in `ArmControl.m` (or defaults: Motor 1 ±360°, Motor 2 ±360°).
- **Thermal Watchdog**: Continuously reads motor temperature from 50Hz telemetry frames. >55°C: Auto-writes max current (param 0x7018) down to 3.0A. <45°C: Automatically restores configured max current.
- **Connection Loss Watchdog**: If serial port disconnects unexpectedly: Best-effort atomic E-STOP routine executed. Controller enters safe fault mode. Motion commands automatically aborted.
- **CAN Protocol Safety**: All frames are 17 bytes. Serial ID formula: `Serial ID = (CAN_ID << 3) | 0x04`, where `CAN_ID = (Comm_Type << 24) | (Host_ID << 8) | Motor_ID`. Comm Types: 0x02 (Feedback), 0x03 (Enable), 0x04 (Disable), 0x11 (Read Param), 0x12 (Write Param). Never transmit disable/torque commands without first confirming motor is in a safe state.

### 3.4 Agent Orchestration & Protocol (`/Agents` & `/.agents`)

**Purpose**: Multi-agent shared blackboard, task board, and communication bus for coordinated development and verification.

**Key Files:**
- `Agents_Rules.md` — Global multi-agent operating rules (mandatory for ALL tasks).
- `agent_roles.md` — Specialist agent definitions & responsibilities.
- `comm.md` — Unified inter-agent communication channel with standard header format.
- `tasks.md` — Central task status and audit board. **No task may be marked complete without `[STATUS: Passed]` audit entry from a Verification Agent.**
- `Workspace_Structure.md` — Canonical structural and topological truth (this document section).
- `agent_*` (worker files) — Individual agent task reports and briefs.

**Communication Format (comm.md):**
```
[FROM: Agent_Role] -> [TO: Agent_Role / ALL]
[STATUS: Information / Request / Urgent / Passed / Failed]
[BODY: Structured, actionable details, paths, and results]
```

**Verification Requirement**: Every task in `tasks.md` must have an explicit `[STATUS: Passed]` entry from a Verification Agent before being marked complete.

---

## 4. File Layout & Topology

```
Handover/src/
├ Agents/              # Multi-agent coordination hub (accessed via .agents/ symlink)
│   ├── Agents_Rules.md
│   ├── agent_roles.md
│   ├── comm.md
│   ├── tasks.md
│   ├── Workspace_Structure.md
│   └── agent_*.md     # Worker reports and briefs
├ matlab/              # MATLAB Mission Control & Telemetry
│   ├── ArmControl.m             # Core motor controller class
│   ├── ArmMonitor.m             # Mission control UI (5-column layout)
│   ├── ArmTuner.m               # PID step-response tuning & ZN analysis
│   ├── run_arm_live.m           # Live hardware session entry point
│   ├── run_arm_example.m        # Offline demo / example usage
│   ├── run_verification.m       # Automated UI & logic sanity-check script
│   ├── verify_kinematics_comprehensive.m  # 1500-point FK/IK workspace audit
│   ├── test_armmonitor_layout.m  # UI layout + CSV logging regression tests
│   ├── test_shortest_path.m      # Multi-turn angular unwrapping tests
│   └── test_trajectory_planning.m  # Linear/arch/joint trajectory tests
├ MotorStudio/         # Robstride Motor Studio utility
│   └── motor_toolV14L/
│       └── motor_tool.exe
├ torque_math.py       # Analytical rigid-body dynamics & torque engine
├ test_torque_math.py  # Unit tests for physical torque formulas (11 cases)
├ run_motor.py         # Direct CAN single-motor testing utility
├ oscillate_motors.py  # Dual-motor safety oscillation & heartbeat script
└ *.pdf                # Actuator instruction and hardware manuals
```

---

## 5. Software Integration Flow

### 5.1 MATLAB Live Session (`run_arm_live.m`)
1. **Cleanup**: Remove orphan timers and stale serial ports.
2. **Instantiate**: `arm = ArmControl('COM20')` — create controller on default COM port.
3. **Connect**: `arm.connect()` — opens serial at 921600 baud.
4. **Initialize Motors** (if connected):
   - `disable_timeout(motor_id)` — disables comms timeout (param 0x200C = 0).
   - `set_position_mode(motor_id)` — switches run mode to position control (param 0x7005 = 1).
   - `enable_motor(motor_id)` — energizes motor power stage (Comm Type 0x03).
5. **Start Telemetry**: `arm.start_telemetry(20)` — begins 20Hz (default) feedback polling timer.
6. **Launch Monitor**: `monitor = ArmMonitor(arm)` — creates the UI figure and starts the 25Hz update timer.
7. **Block**: `waitfor(monitor.fig)` — script pauses until user closes the UI figure.
8. **Shutdown**: Stop telemetry, disable both motors, disconnect serial port.

### 5.2 Torque Calculation Flow (`calculate_2link_torques` → `TwoLinkTorqueCalculator.calculate`)
1. Accept `ArmParameters` (all physical specs + joint angles + accelerations).
2. Validate parameters (non-negative numeric fields, angle numeric check).
3. Compute **Elbow Torque**: Follow the formula chain from PROJECT_DESCRIPTION.md §5.2.
4. Compute **Base Torque**: Follow the formula chain from PROJECT_DESCRIPTION.md §5.2.
5. Return `TwoLinkTorqueResult` with base and elbow results, total reach, total moving mass, and input parameters.

---

## 6. Open TODOs & Known Issues

Based on the codebase audit, here are the outstanding items that need attention:

### 6.1 Pending Implementation Items

1. **Canvas Wrapper Architecture for UI Scrolling** (tasks.md line 13)
   - MATLAB uigridlayout bug workaround implemented in `ArmMonitor.m` using 3-layer panel architecture (`master_grid` → `scroll_panel` → `canvas_panel`).
   - The `canvas_panel` has a fixed pixel height (960px) exceeding the viewport, forcing a real scrollbar.
   - Verify the workaround still functions correctly with newer MATLAB versions.
   - See `test_armmonitor_layout.m` for verification test.

2. **Negative Angle Normalization Consistency**
   - MATLAB `ArmControl.inverse_kinematics()` normalizes via `mod(theta1 + pi, 2*pi) - pi`.
   - Ensure all kinematic calculations across MATLAB and Python adhere to the unified coordinate frame (\(\theta_1, \theta_2 = 0^\circ\) straight down, CW positive).

3. **Shortest-Path Unwrapping Edge Cases**
   - Test boundary conditions at exactly +180° / -180° wraparound.
   - Verify `calculate_shortest_path` handles multi-turn operations (≥360° cumulative displacement).

4. **Thermal Watchdog Auto-Restore Threshold**
   - MATLAB `ArmMonitor.m` currently checks `temp > 80°C` for red, `temp > 60°C` for yellow.
   - Auto-restore threshold at `<45°C` is implemented but needs verification against real hardware.

5. **CAN Frame Serialization Round-Trip Testing**
   - No automated test sends a param write command and reads back the response.
   - Manual verification via `run_motor.py` or MATLAB test scripts is recommended.

### 6.2 Design Pattern Notes

- **3-Layer UI Scrolling Workaround** (`ArmMonitor.m`): Uses `master_grid` → `scroll_panel` → `canvas_panel` to bypass MATLAB uigridlayout scrolling bug. The `canvas_panel` has a fixed pixel height (960px) exceeding the viewport, forcing a real scrollbar.

- **Atomic Multi-Motor Commands**: `set_both_targets()` in `ArmControl.m` combines M1 and M2 packets into a single 34-byte serial write to eliminate inter-motor desynchronization.

- **Shortest-Path Unwrapping**: Uses `mod((desired - current) + pi, 2*pi) - pi` pattern for smooth continuous multi-turn motion.

- **PID Parameter Normalization**: MATLAB `read_pid_to_panel()` decodes 7 PID gains per motor with fallback compatibility mappings.

### 6.3 Test Suite Status

| Test Suite | Status | Notes |
|---|---|---|
| `test_torque_math.py` | ✅ Passes | 11 unit tests — run via `python -m pytest test_torque_math.py` |
| `test_shortest_path.m` | ✅ Passes | MATLAB multi-turn unwrap verification |
| `test_trajectory_planning.m` | ✅ Passes | MATLAB linear/arch/joint profile verification |
| `test_armmonitor_layout.m` | ✅ Passes | Full UI layout + CSV logging regression tests |
| `verify_kinematics_comprehensive.m` | ✅ Passes | 1500-point FK/IK workspace stress test |
| `run_verification.m` | ✅ Passes | Offline UI/logic sanity-check (no hardware required) |
| CAN round-trip (param write → read) | ⚠️ Manual only | No automated test; verify via `run_motor.py` on hardware |
| E-STOP hardware fire test | ⚠️ Manual only | No automated test; verify on physical hardware |
| Thermal watchdog auto-throttle | ⚠️ Manual only | Requires hardware reaching 55°C thermal threshold |

---

## 7. Development Checklist for Next Agent

### 7.1 Required Verification Steps (from `tasks.md` §7.1 + `Agents_Rules.md`)
- [ ] All unit tests pass (`python -m pytest` / MATLAB test suite).
- [ ] Comprehensive kinematics stress test (`verify_kinematics_comprehensive.m` — 1500-point workspace).
- [ ] Automated UI & logic sanity-check (`run_verification.m` — runs offline without hardware).
- [ ] Torque math test suite (`test_torque_math.py` — 11 test cases).
- [ ] E-STOP functionality verified across MATLAB and CAN bus protocols.
- [ ] Joint limit enforcement verified across all trajectory types.
- [ ] Thermal throttling behavior verified (temperature thresholds and current reduction/restoration).
- [ ] CAN frame serialization/deserialization round-trip tested (manual via `run_motor.py` or MATLAB).
- [ ] Trajectory planning reachability validation (linear/arch/joint profiles).
- [ ] IK/FK consistency verified across elbow-up and elbow-down configurations.
- [ ] Shortest-path unwrapping verified across multi-turn boundaries.
- [ ] Data logging CSV format validated (50-column structure, timestamp integrity).
- [ ] UI/UX regression test (`test_armmonitor_layout.m`).

### 7.2 Handover Checklist (from `PROJECT_DESCRIPTION.md` §7.2)
- [x] `Handover/PROJECT_DESCRIPTION.md` — Written and comprehensive. ✅
- [x] `Handover/src/` — Key source files copied for reference. ✅
- [ ] `Agents/tasks.md` — All tasks have `[STATUS: Passed]` audit entries. 🔄 **Pending**.
- [ ] `Agents/comm.md` — Communication log up to date. 🔄 **Check current state**.
- [x] Hardware manuals — RS02 motor manual & IP67 user manual copied to `Handover/src/`. ✅
- [ ] MATLAB `matlab_workspace.mat` — Not included (binary), but scripts are self-contained. ✅
- [x] Python virtual environment dependencies documented (`pyserial`, `numpy`, `pytest`). ✅
- [x] COM port settings documented (default: `COM20`, 921600 baud). ✅
- [x] CAN bus wiring verified (120Ω termination at both ends, common ground documented in `PROJECT_DESCRIPTION.md` §2). ✅

### 7.3 Agent Communication Protocol

When working on this project, follow the `comm.md` format for all inter-agent communication:

```
[FROM: Agent_Role] -> [TO: Agent_Role / ALL]
[STATUS: Information / Request / Urgent / Passed / Failed]
[BODY: Structured, actionable details, paths, and results]
```

**Task handoff procedure:**
1. Worker agent completes task and logs results in `comm.md`.
2. Verification Agent reviews and either logs `[STATUS: Passed]` or `[STATUS: Failed]` with details.
3. Coordinator updates `tasks.md` checkbox accordingly.
4. **No task may be marked complete without `[STATUS: Passed]` from a Verification Agent.**

### 7.4 Python Development Guidelines

- Run all Python tests from the repository root: `python -m pytest` or individually: `python -m pytest test_torque_math.py`.
- Virtual environment: Use `python -m venv .venv` and activate before running.
- Dependencies: `pyserial>=3.5`, `numpy`, `pytest`.
- Code style: Follow existing patterns in `torque_math.py` — use dataclasses with `__post_init__` validation, absolute magnitude for torque calculations, and `to_dict()` for serialization.

### 7.5 MATLAB Development Guidelines

- Run MATLAB tests by executing the `.m` file directly (e.g., `test_armmonitor_layout`).
- Code style: Use `disp()` for console output, `fprintf()` for formatted output, `uialert()`/`errordlg()` for UI alerts.
- All MATLAB classes inherit from `handle` for reference semantics.
- Serial port operations wrapped in try/catch — always handle disconnect gracefully.
- PID parameter indices follow RS02 manual: 0x7005 (run mode), 0x7016 (position ref), 0x7018 (current limit), 0x700B (torque limit).

### 7.6 Critical Success Factors

1. **Never modify kinematics equations without updating ALL subsystems** — FK/IK conventions are shared across Python dynamics and MATLAB control.
2. **Always validate joint limits before transmitting CAN commands** — both MATLAB `check_joint_limit()` and Python `within_joint_limits()` must be respected.
3. **E-STOP must be atomic and instantaneous** — both motors disabled in a single serial write block.
4. **Thermal thresholds are safety-critical** — >55°C auto-throttle to 3.0A, <45°C restore. Do not modify without reviewing safety implications.
5. **CAN bus requires 120Ω termination at both ends** with common ground — verify before any hardware testing.

---

## 8. Appendices

### Appendix A: Python Torque Math API Summary

```python
from torque_math import (
    ArmParameters, JointTorqueResult, TwoLinkTorqueResult,
    TwoLinkTorqueCalculator, calculate_2link_torques,
    calculate_base_torque, calculate_elbow_torque,
    calculate_base_inertia, calculate_elbow_inertia,
)

# Example usage:
params = ArmParameters(
    motor_weight=0.5, base_link_weight=0.4, fore_link_weight=0.3,
    payload_weight=0.5, base_link_length=0.25, fore_link_length=0.25,
    theta1=90.0, theta2=0.0, base_angular_accel=10.0, elbow_angular_accel=10.0,
)
result = TwoLinkTorqueCalculator.calculate(params)
print(f"Base continuous: {result.base.continuous_torque:.4f} Nm")
print(f"Elbow peak: {result.elbow.peak_torque:.4f} Nm")
print(f"Total reach: {result.total_reach} m")
```

### Appendix B: MATLAB Class Signatures

**ArmControl (handle subclass):**
- Properties: `s` (serial), `COM_PORT`, `BAUD_RATE`, `MOTOR_1_ID`, `MOTOR_2_ID`, `HOST_ID`, `L1`, `L2`, `Telemetry`, `poll_rate_hz`, `read_timer`, `logging_enabled`, `log_data`.
- Methods: `connect`, `disconnect`, `make_packet`, `build_param_packet`, `write_param`, `enable_motor`, `disable_motor`, `set_current_mode`, `set_current_ref`, `mit_control`, `forward_kinematics`, `inverse_kinematics`, `plan_trajectory`, `calculate_shortest_path`, `read_pid`, `read_limits`, `set_joint_limits`, `set_velocity_limit`, `set_current_limit`, `check_joint_limit`, `decode_fault`, `start_telemetry`, `stop_telemetry`, `start_logging`, `stop_logging`, `save_log`.

**ArmMonitor (handle subclass):**
- Properties: `arm` (ArmControl reference), `fig` (uifigure), `update_timer`, `has_synced_initial_state`, and 100+ UI element properties.
- Methods: `build_ui`, `update`, `estop`, `reconnect`, `close_cb`, `delete`, `read_initial_motor_state`, `read_limits_to_panel`, `write_limits_from_panel`, `read_pid_to_panel`, `write_pid_from_panel`, `build_command_panel`, `build_ik_panel`, `build_pid_panel`, `build_limits_panel`, `build_log_panel`, `build_oscilloscope`.

### Appendix C: CAN Frame Byte Layout (17 bytes)

| Byte(s) | Field | Description |
|---------|-------|-------------|
| 0–1 | Header | `0x41` ('A'), `0x54` ('T') |
| 2–5 | Serial ID | Big-endian uint32: `(CAN_ID << 3) | 0x04` |
| 6 | DLC | Data Length Code (= 8 for all Robstride frames) |
| 7–14 | Payload | 8 bytes of motor data (position, velocity, torque, current, temperature, fault) |
| 15–16 | Tail | `0x0D` ('\r'), `0x0A` ('\n') |

### Appendix D: Communication Type Mapping

| Comm Type | Hex | Mnemonic | Direction | Description |
|-----------|-----|----------|-----------|-------------|
| 0x02 | 0x02 | FEEDBACK | Motor → Host | Request/return motor feedback (Pos, Vel, Torque, Temp, Fault). |
| 0x03 | 0x03 | ENABLE | Host → Motor | Energize coils in configured Run Mode. |
| 0x04 | 0x04 | DISABLE | Host → Motor | De-energize inverter bridge (E-STOP). |
| 0x11 | 0x11 | READ_SINGLE | Host → Motor | Read single parameter index (response returns value). |
| 0x12 | 0x12 | WRITE_SINGLE | Host → Motor | Write single parameter index (stores to RAM; Flash requires 0x200B). |

### Appendix E: Key Python / MATLAB API Cross-Reference

> [!NOTE]
> `kinematics.py` and `can_bridge.py` are part of the excluded Python web UI subsystem and are **not present** in `Handover/src/`. All kinematic functions for this handover are implemented in `ArmControl.m` (MATLAB) and `torque_math.py` (Python).

| Function | MATLAB Equivalent | Source in Handover/src/ |
|----------|------------------|--------------------------|
| `calculate_2link_torques()` | `TwoLinkTorqueCalculator.calculate()` | `torque_math.py` |
| `forward_kinematics(theta1, theta2)` | `ArmControl.forward_kinematics()` | `ArmControl.m` (authoritative), `torque_math.py` (analytical reference) |
| `inverse_kinematics(x, y, elbow_config)` | `ArmControl.inverse_kinematics()` | `ArmControl.m` |
| `calculate_shortest_path(motor_id, desired_angle)` | `ArmControl.calculate_shortest_path()` | `ArmControl.m` |
| `set_both_targets(th1, th2)` | `ArmControl.set_both_targets()` | `ArmControl.m` (34-byte atomic write) |

---

## 9. Version History

| Version | Date | Changes |
|---------|------|---------|
| 01 | 2026-05-01 | Initial handover guide creation |
| 02 | 2026-10-28 | Comprehensive audit and rewrite — added design patterns, test suite status, critical success factors, cross-referenced API tables, and updated TODO categorization |