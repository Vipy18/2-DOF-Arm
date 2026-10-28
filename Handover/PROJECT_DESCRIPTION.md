# Robstride 2-DOF Robotic Arm Project — Comprehensive Description

**Project Version:** 02 (Active Development)
**Last Generated:** 2026-10-28
**Governing Convention:** Unified coordinate & kinematic invariants (see Section 4)
**Repository Root:** `d:\PRJ\Robstride\`

---
## 1. Executive Summary

**Robstride** is a multi-platform, multi-language robotics workspace dedicated to control, kinematics analysis, telemetry streaming, and motor sizing for a 2-DOF planar robotic arm powered by **Robstride RS02** brushless smart actuators (RS02). The arm has two links with nominal lengths **L1 = 400 mm** (base/shoulder) and **L2 = 300 mm** (fore/elbow).

The handover package contains the following primary subsystems:

1. **MATLAB Mission Control & Telemetry (`matlab/`)**: Industrial-grade control and monitoring interface (`ArmControl.m`, `ArmMonitor.m`, `ArmTuner.m`) with 50Hz continuous trajectory streaming and a 50-column CSV flight data logger.
2. **Robstride Motor Studio (`MotorStudio/`)**: Robstride official actuator commissioning, diagnostic, and tuning utility suite (`motor_tool.exe`).
3. **Joint Torque Calculator & Kinematics Engine (`torque_math.py`)**: Analytical rigid-body dynamics, inertia matrices, continuous/peak torque modeling, and unit test suites (`test_torque_math.py`).
4. **Standalone Hardware Drivers (`oscillate_motors.py`, `run_motor.py`)**: Direct Python-based USB-to-CAN motor control and trajectory testing scripts.
5. **Agent Orchestration & Protocol (`Agents/` & `.agents/`)**: Multi-agent shared blackboard, task board, and communication bus.

All subsystems adhere to unified physical and kinematic conventions defined in this document.

---
## 2. Physical Arm Parameters (Hardware Constants)

| Parameter | Symbol | Value | Units | Description |
|-----------|--------|-------|-------|-------------|
| Base link length | `L1` | `400` | mm | Center-to-center distance from base pivot to elbow joint |
| Fore link length | `L2` | `300` | mm | Center-to-center distance from elbow joint to end-effector |
| Base link weight | `m1` | variable | kg | Weight of the base (proximal) link |
| Fore link weight | `m2` | variable | kg | Weight of the fore (distal) link |
| Elbow motor weight | `mm` | variable | kg | Weight of actuator motor at elbow (loads base motor as point mass at L1) |
| Payload weight | `mp` | variable | kg | Weight of payload at the distal end of the fore link |
| Gravitational acceleration | `g` | `9.81` | m/s² | Acts vertically downwards (negative Y axis) |
| Default base angular acceleration | `α₁` | `0.0` | rad/s² | Used for peak-dynamic torque calculation |
| Default elbow angular acceleration | `α₂` | `0.0` | rad/s² | Used for peak-dynamic torque calculation |
| CAN bus baud rate | — | `921600` | bps | USB-to-CAN serial communication speed |
| Motor 1 (Base) CAN ID | — | `0x01` | — | Base/shoulder joint actuator |
| Motor 2 (Fore) CAN ID | — | `0x02` | — | Elbow/forearm joint actuator |
| Host Controller Node ID | — | `0xFD` (253) | — | Central CAN host identifier |
| Max torque limit per motor | — | `17` | Nm | Hardware limit range for param `0x700B` |
| Torque constant | `KM` | `1.22` | N.m/Arms | RS02 torque constant (per motor manual) |

---
## 3. Unified Coordinate & Kinematic Conventions

All subsystems share the following coordinate frame and angle conventions:

1. **Gravity Vector**: Acts vertically downwards along the negative Y axis: \(\vec{g} = [0, -9.81]\,\text{m/s}^2\).

2. **Zero Position**: \(\theta_1 = 0^\circ, \theta_2 = 0^\circ\) — both links point straight downwards (direction of gravity).

3. **Angle Chirality**:
   - **Positive Angle (\(> 0\))**: Clockwise (CW) rotation.
   - **Negative Angle (\(< 0\))**: Counter-Clockwise (CCW) rotation.

4. **Joint Relative Reference**:
   - \(\theta_1\): Absolute angle of Joint 1 (base/shoulder) in degrees, measured from vertical downward.
   - \(\theta_2\): Relative angle of Joint 2 (elbow) with respect to Link 1.
   - Absolute orientation of Link 2: \(\phi_2 = \theta_1 + \theta_2\).

5. **Horizontal Moment Arm Formulation** (all subsystems use this):
   - Base to Elbow horizontal offset: \(dx_1 = -L_1 \sin(\phi_1)\)
   - Elbow to TCP horizontal offset: \(dx_2 = -L_2 \sin(\phi_2)\)
   - Continuous holding torque evaluates to `0.0 Nm` at \((0^\circ, 0^\circ)\) and reaches maximum at full horizontal extension (\(\pm 90^\circ\)).

6. **Forward Kinematics** (joint angles \(\to\) end-effector XY):
   \[
   x = -L_1 \sin(\theta_1) - L_2 \sin(\theta_1 + \theta_2)
   \]
   \[
   y = -L_1 \cos(\theta_1) - L_2 \cos(\theta_1 + \theta_2)
   \]

7. **Inverse Kinematics** (end-effector XY \(\to\) joint angles):
   - Two solutions: **Elbow Up** (\(\theta_2 > 0\)) and **Elbow Down** (\(\theta_2 < 0\)).
   - Joint angles are normalized to \([-\pi, \pi]\) via `mod(angle + pi, 2*pi) - pi`.

8. **Joint Limits** (software bounds, configurable per motor):
   - Motor 1 (Base): default \([-2\pi, 2\pi]\) rad (i.e., \([-360^\circ, +360^\circ]\))
   - Motor 2 (Elbow): default \([-2\pi, 2\pi]\) rad (i.e., \([-360^\circ, +360^\circ]\))
   - Physical hardware limits: Motor 1 \(\pm 170^\circ\), Motor 2 \(\pm 150^\circ\) (per Motor Studio UI).

9. **Shortest-Path Unwrapping**: Target angles are "unwrapped" across multi-turn operations, minimizing cumulative angular displacement from the current position using `mod((desired - current) + pi, 2*pi) - pi`.

---
## 4. Subsystem Breakdown

### 4.1 Joint Torque Calculator & Kinematics Engine (`torque_math.py`)

**Core Entry Point:** `pytest test_torque_math.py` / module import (`from torque_math import ArmParameters, TwoLinkTorqueCalculator`).

**Physics Core (`torque_math.py`):**

- **Class `ArmParameters`**: Geometric and physical specs.
  - Fields: `motor_weight`, `base_link_weight`, `fore_link_weight`, `payload_weight`, `base_link_length`, `fore_link_length`, `base_angular_accel`, `elbow_angular_accel`, `gravity`, `theta1`, `theta2`.
  - Validation: All numeric fields must be non-negative; angles must be numeric (can be negative).

- **Class `TwoLinkTorqueCalculator`**:
  - Evaluates horizontal moment arms perpendicular to gravity.
  - Calculates continuous holding torques:
    - \(\tau_{\text{elbow, cont}} = |\tau_{\text{elbow, grav}}|\)
    - \(\tau_{\text{base, cont}} = |\tau_{\text{base, grav}}|\)
  - Evaluates mass moments of inertia:
    - \(I_{\text{elbow}} = \frac{1}{3} m_2 L_2^2 + m_p L_2^2\)
    - \(I_{\text{base}} = \frac{1}{3} m_{\text{motor}} L_1^2 + \frac{1}{3} m_1 L_1^2 + m_2 (\frac{1}{3} L_2^2 + L_1^2 + L_1 L_2) + m_p (L_1 + L_2)^2\)
  - Computes dynamic peak torque: \(\tau_{\text{peak}} = \tau_{\text{cont}} + I \cdot \alpha\)

- **Validation Suite (`test_torque_math.py`):**
  - 11 unit tests covering horizontal cantilever, vertical hanging, negative angles, arbitrary poses, and folded configurations against analytical ground truth.

---
### 4.2 MATLAB Mission Control Subsystem (`matlab/`)

**Core Controller (`ArmControl.m`):**
- **Class**: `ArmControl` (MATLAB `handle` subclass).
- **Serial CAN Wrapper**: Based on RobStride USB-to-CAN protocol, baud 921600.
- **Packet Protocol**: Custom binary frames (17-byte AT frames: `[0x41 0x54][4-byte Serial ID][DLC][8-byte payload][0x0D 0x0A]`).
- **Motor IDs**: Motor 1 (Base) = `0x01`, Motor 2 (Fore) = `0x02`, Host ID = `0xFD` (253).
- **Shortest-Path Unwrapping**: Via `calculate_shortest_path` supporting multi-turn operations across \([-\pi, \pi]\) and \([-360^\circ, +360^\circ]\).
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
- `plan_trajectory(start_xy, target_xy, v_max, a_max, traj_type, elbow_config, dt, start_joints)` — P2P trajectory with trapezoidal/arch-profile.
- `forward_kinematics(theta1, theta2)` — XY coordinates from joint angles.
- `inverse_kinematics(x, y, elbow_config)` — Joint angles from XY.
- `read_pid(motor_id)` / `write_param(motor_id, index, value, formatStr)` — Parameter I/O.
- `read_limits(motor_id)` / `set_joint_limits / set_velocity_limit / set_current_limit` — Safety limits.
- `decode_fault(fault_code)` — Decodes 6-bit fault bits per RS02 manual.
- `mit_control(motor_id, pos_rad, vel_rad_s, kp, kd, torque_nm)` — MIT mode control.

**Mission Control UI (`ArmMonitor.m`):**
- **Class**: `ArmMonitor` (MATLAB `handle` subclass).
- **Layout**: Balanced 5-column CSS-like grid on `uifigure` (1600×950, dark theme).
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

**Key Monitor Methods (selected):**
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

---
### 4.3 Robstride Motor Studio (`MotorStudio/`)

**Purpose**: Robstride official actuator commissioning, diagnostic, and parameter management utility suite (`MotorStudio/motor_toolV14L/motor_tool.exe`).

**Key Capabilities:**
- Actuator register inspection and parameter tuning (PID gains, current limits, acceleration limits, CAN node configuration).
- Real-time diagnostic telemetry reading, calibration, and zero-position offset setting.
- Direct hardware testing and firmware interaction over USB-CAN interface.

---
### 4.4 Agent Orchestration & Protocol (`/Agents` & `/.agents`)

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
### 4.5 File Layout & Topology

```
Handover/src/
├ .agents / Agents/    # Multi-agent coordination hub
│   ├── Agents_Rules.md
│   ├── agent_roles.md
│   ├── comm.md
│   ├── tasks.md
│   ├── Workspace_Structure.md
│   └── agent_*.md     # Worker reports and briefs
├ matlab/              # MATLAB Mission Control & Telemetry
│   ├── ArmControl.m
│   ├── ArmMonitor.m
│   ├── ArmTuner.m
│   ├── run_arm_live.m
│   ├── run_arm_example.m
│   ├── verify_kinematics_comprehensive.m
│   └── test_*.m
├ MotorStudio/         # Robstride Motor Studio utility
│   └── motor_toolV14L/
│       └── motor_tool.exe
├ torque_math.py       # Analytical rigid-body dynamics & torque engine
├ test_torque_math.py  # Unit tests for physical torque formulas
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

---
### 5.2 Torque Calculation Flow (`calculate_2link_torques` → `TwoLinkTorqueCalculator.calculate`)

1. Accept `ArmParameters` (all physical specs + joint angles + accelerations).
2. Validate parameters (non-negative numeric fields, angle numeric check).
3. Compute **Elbow Torque**:
   - \(\phi_2 = \theta_1 + \theta_2\) (absolute Link 2 angle).
   - Horizontal moment arms from elbow: \(dx_{\text{fore\_com}} = -(\text{ForeLinkLength}/2) \sin(\phi_2)\), \(dx_{\text{payload}} = -\text{ForeLinkLength} \sin(\phi_2)\).
   - Continuous gravitational torque: \(\tau_{\text{elbow, grav}} = g \cdot (m_2 \cdot dx_{\text{fore\_com}} + m_p \cdot dx_{\text{payload}})\).
   - \( \tau_{\text{elbow, cont}} = |\tau_{\text{elbow, grav}}|\).
   - Inertia: \(I_{\text{elbow}} = \frac{1}{3} m_2 L_2^2 + m_p L_2^2\).
   - Peak: \(\tau_{\text{elbow, peak}} = \tau_{\text{elbow, cont}} + I_{\text{elbow}} \cdot \alpha_2\).
4. Compute **Base Torque**:
   - \(\phi_1 = \theta_1\), \(\phi_2 = \theta_1 + \theta_2\).
   - Horizontal positions relative to base: \(dx_1 = -L_1 \sin(\phi_1)\), \(dx_2 = -L_2 \sin(\phi_2)\).
   - \(dx_{\text{base\_com}} = -(L_1/2) \sin(\phi_1)\), \(dx_{\text{motor}} = dx_1\), \(dx_{\text{fore\_com}} = dx_1 - (L_2/2) \sin(\phi_2)\), \(dx_{\text{payload}} = dx_1 + dx_2\).
   - Continuous gravitational torque: \(\tau_{\text{base, grav}} = g \cdot (m_1 \cdot dx_{\text{base\_com}} + m_{\text{motor}} \cdot dx_{\text{motor}} + m_2 \cdot dx_{\text{fore\_com}} + m_p \cdot dx_{\text{payload}})\).
   - \( \tau_{\text{base, cont}} = |\tau_{\text{base, grav}}|\).
   - Inertia: \(I_{\text{base}} = \frac{1}{3} m_1 L_1^2 + m_{\text{motor}} L_1^2 + m_2 (\frac{1}{3} L_2^2 + L_1^2 + L_1 L_2) + m_p (L_1 + L_2)^2\).
   - Peak: \(\tau_{\text{base, peak}} = \tau_{\text{base, cont}} + I_{\text{base}} \cdot \alpha_1\).
5. Return `TwoLinkTorqueResult` with base and elbow results, total reach, total moving mass, and input parameters.

---
### 5.3 Torque Calculation & Verification Flow (`torque_math.py`)

1. Construct `ArmParameters` with arm geometry, link/motor/payload masses, angular accelerations, and joint angles.
2. Pass parameters to `TwoLinkTorqueCalculator.calculate(params)`.
3. Evaluates horizontal moment arms perpendicular to gravity (-Y axis).
4. Calculates continuous holding torques and rigid-body inertia moments for both joints.
5. Computes peak dynamic torques using \( \tau_{\text{peak}} = \tau_{\text{cont}} + I \cdot \alpha \).
6. Result object provides `base` and `elbow` metrics, total reach, total moving mass, and input parameters.

---
## 6. Safety Critical Notes

### 6.1 Emergency Stop (E-STOP)
- Triggered via UI E-STOP buttons, dedicated safety inputs, or programmatic abort calls in MATLAB and CLI drivers.
- Transmits **Communication Type 4 (Disable Motor)** packets consecutively to both motors (IDs 0x01 and 0x02) in a single atomic transmission block.
- UI shows full-screen overlay (`z-index: 9999`) with `E-STOP ACTIVE`.
- All motion commands, drag sliders, and playback loops are blocked while E-STOP is active.
- Reset: Press **Escape** or click **RESET EMERGENCY STOP** on the overlay.

### 6.2 Joint Limit Guard
- Software bounds strictly validated against limits defined in `ArmControl.m` JOINT_LIMITS property (software defaults: Motor 1 ±360°, Motor 2 ±360° — matching RS02 multi-turn firmware capability).
- Physical hardware limits per Motor Studio: Motor 1 ±170°, Motor 2 ±150°. Set these as tighter software bounds in `ArmMonitor.m` Limits panel when physical mechanical range is constrained.
- IK calculation or command exceeding configured bounds aborts and flashes the joint display red.

### 6.3 Thermal Watchdog
- Continuously reads motor temperature from 50Hz telemetry frames.
- **>55°C**: Auto-writes max current (param 0x7018) down to 3.0A to suppress thermal runaway while preserving holding torque.
- **<45°C**: Automatically restores configured max current (default 5.0A).

### 6.4 Connection Loss Watchdog
- If serial port disconnects unexpectedly:
  1. Best-effort atomic E-STOP routine executed.
  2. UI enters safe fault mode with persistent red toast: `Connection lost — motors disabled`.
  3. Program playback automatically aborted.

### 6.5 CAN Protocol Safety
- All frames are 17 bytes: `[0x41 0x54][4-byte Serial ID][DLC 0x08][8-byte payload][0x0D 0x0A]`.
- Serial ID formula: `Serial ID = (CAN_ID << 3) | 0x04`, where `CAN_ID = (Comm_Type << 24) | (Host_ID << 8) | Motor_ID`.
- Comm Types: 0x02 (Feedback), 0x03 (Enable), 0x04 (Disable), 0x11 (Read Param), 0x12 (Write Param).
- **Never** transmit disable/torque commands without first confirming motor is in a safe state.

---
## 7. Development & Verification Checklist

### 7.1 Required Verification Steps (per `tasks.md` + `Agents_Rules.md`)
- [ ] All unit tests pass (`python -m pytest` / `matlabtest`).
- [ ] Comprehensive kinematics stress test (`verify_kinematics_comprehensive.m` — 1500-point workspace).
- [ ] Torque math test suite (`test_torque_math.py` — 11 test cases covering vertical/horizontal/negative/arbitrary/folded poses).
- [ ] E-STOP functionality verified across MATLAB and CAN bus protocols.
- [ ] Joint limit enforcement verified across all trajectory types.
- [ ] Thermal throttling behavior verified (temperature thresholds and current reduction/restoration).
- [ ] CAN frame serialization/deserialization round-trip tested (send a param write, read back response).
- [ ] Trajectory planning reachability validation (linear/arch/joint profiles).
- [ ] IK/FK consistency verified across elbow-up and elbow-down configurations.
- [ ] Shortest-path unwrapping verified across multi-turn boundaries (+180° → -90°, etc.).
- [ ] Data logging CSV format validated (50-column structure, timestamp integrity).
- [ ] UI/UX regression test (`test_armmonitor_layout.m`).

### 7.2 Handover Checklist
- [ ] `Handover/PROJECT_DESCRIPTION.md` — Written and comprehensive.
- [ ] `Handover/src/` — Key source files copied for reference.
- [ ] `Agents/tasks.md` — All tasks have `[STATUS: Passed]` audit entries.
- [ ] `Agents/comm.md` — Communication log up to date.
- [ ] Hardware manuals — RS02 motor manual & IP67 user manual copied to `Handover/src/`.
- [ ] MATLAB `matlab_workspace.mat` — Not included (binary), but scripts are self-contained.
- [ ] Python virtual environment dependencies documented (`pyserial`, `numpy`, `pytest`).
- [ ] COM port settings documented (default: `COM20`, 921600 baud).
- [ ] CAN bus wiring verified (120Ω termination at both ends, common ground documented in Section 2).

---
## 8. Appendices

### Appendix A: Key MATLAB Class Signatures

**ArmControl (handle subclass):**
- Properties: `s` (serial), `COM_PORT`, `BAUD_RATE`, `MOTOR_1_ID`, `MOTOR_2_ID`, `HOST_ID`, `L1`, `L2`, `Telemetry`, `poll_rate_hz`, `read_timer`, `logging_enabled`, `log_data`.
- Methods: `connect`, `disconnect`, `make_packet`, `build_param_packet`, `write_param`, `enable_motor`, `disable_motor`, `set_current_mode`, `set_current_ref`, `mit_control`, `forward_kinematics`, `inverse_kinematics`, `plan_trajectory`, `calculate_shortest_path`, `read_pid`, `read_limits`, `set_joint_limits`, `set_velocity_limit`, `set_current_limit`, `check_joint_limit`, `decode_fault`, `start_telemetry`, `stop_telemetry`, `start_logging`, `stop_logging`, `save_log`.

**ArmMonitor (handle subclass):**
- Properties: `arm` (ArmControl reference), `fig` (uifigure), `update_timer`, `has_synced_initial_state`, `L1`, `L2`, and 100+ UI element properties.
- Methods: `build_ui`, `update`, `estop`, `reconnect`, `close_cb`, `delete`, `read_initial_motor_state`, `read_limits_to_panel`, `write_limits_from_panel`, `read_pid_to_panel`, `write_pid_from_panel`, `build_command_panel`, `build_ik_panel`, `build_pid_panel`, `build_limits_panel`, `build_log_panel`, `build_oscilloscope`.

### Appendix B: Python Torque Math API Summary

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

---

*End of PROJECT_DESCRIPTION.md*