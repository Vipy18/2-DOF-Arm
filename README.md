# Robstride 2-DOF Robotic Arm Control & Dynamics Suite

Industrial control, kinematics analysis, telemetry streaming, and rigid-body dynamics for a 2-DOF planar robotic arm powered by **Robstride RS02** brushless smart actuators.

---

## 1. System Overview

Robstride provides a multi-platform control and simulation environment for a 2-link planar robotic manipulator ($L_1 = 400\,\text{mm}$, $L_2 = 300\,\text{mm}$, maximum reach $700\,\text{mm}$). The arm operates under a unified coordinate convention where both links point straight downwards along the $-Y$ axis at $\theta_1 = 0^\circ, \theta_2 = 0^\circ$, with Clockwise (CW) rotation defined as positive.

```
       [Base Motor (ID 0x01)] (0, 0)
                 |
                 |  Link 1 (L1 = 400 mm)
                 |
       [Elbow Motor (ID 0x02)]
                 |
                 |  Link 2 (L2 = 300 mm)
                 |
          (End-Effector / TCP)
```

---

## 2. Repository Layout

```
d:\PRJ\Robstride\
├── matlab/                 # Primary industrial Mission Control & Telemetry GUI
│   ├── ArmControl.m        # Core motor controller, CAN driver, and kinematics class
│   ├── ArmMonitor.m        # 5-column Mission Control UI (oscilloscope, visualizer, CSV logger)
│   ├── ArmTuner.m          # Single-joint PID step-response & Ziegler-Nichols tuning
│   ├── run_arm_live.m      # Production live hardware launcher (COM20 @ 921600 baud)
│   ├── run_arm_example.m   # Offline simulation & demo script
│   ├── run_verification.m  # Automated offline UI & logic assertion suite
│   └── test_*.m            # Unit tests (kinematics, trajectory, layout, unwrapping)
├── Handover/               # Self-contained, audited handover bundle for incoming engineers
│   ├── src/                # Clean source snapshot (MATLAB, Motor Studio, Agents, manuals)
│   ├── PROJECT_DESCRIPTION.md # Complete architectural and system specification
│   ├── HANDOVER_GUIDE.md   # Developer roadmap, conventions, known traps, and guidelines
│   ├── PREREQUISITES.md    # Host hardware, runtime dependencies, and verification steps
│   └── .handover_manifest.json # Subagent execution and verification audit trail
├── MotorStudio/            # Robstride official motor commissioning & parameter tuning tool
│   └── motor_toolV14L/     # Unpacked executable (motor_tool.exe) and Qt runtime DLLs
├── Agents/                 # Multi-agent coordination hub (.agents/ junction link)
│   ├── comm.md             # Standardized inter-agent message bus
│   ├── tasks.md            # Central task board with verification audit logs
│   ├── Agents_Rules.md     # Multi-agent behavioral contract
│   └── Workspace_Structure.md # Canonical architectural and topological map
├── ArmControlApp/          # Desktop application (Electron 28 + Vite 5 + React 18 + TypeScript)
├── templates/              # HTML frontend templates for web calculator
├── torque_math.py          # Core 2-DOF analytical Lagrangian torque & inertia calculation engine
├── test_torque_math.py     # 11 unit tests for torque formulas & pose validation
├── run_motor.py            # Standalone single-motor CAN CLI control script
├── oscillate_motors.py     # Standalone dual-motor oscillation & CAN heartbeat check
└── app.py                  # Flask web dashboard entry point (port 5000)
```

---

## 3. Physical Constants & Conventions

| Parameter | Symbol | Value | Units | Description |
|---|---|---|---|---|
| Base Link Length | $L_1$ | 400 | mm | Center-to-center distance from base to elbow |
| Fore Link Length | $L_2$ | 300 | mm | Center-to-center distance from elbow to TCP |
| Gravitational Acceleration | $g$ | 9.81 | m/s² | Acts vertically downwards along negative $Y$ |
| CAN Bus Baud Rate | — | 921600 | bps | Serial communications speed for USB-to-CAN adapter |
| Motor 1 (Base) Node ID | — | `0x01` | — | Base/shoulder actuator |
| Motor 2 (Elbow) Node ID | — | `0x02` | — | Elbow/forearm actuator |
| Host Controller Node ID | — | `0xFD` (253) | — | Master controller CAN node ID |
| Max Actuator Torque | $\tau_{\max}$ | 17 | N·m | Hardware limit for parameter index `0x700B` |
| Torque Constant | $K_M$ | 1.22 | N·m/Arms | RS02 torque constant |
| Default Software Limits | — | $\pm 360^\circ$ | — | Multi-turn software limits in ArmControl |
| Physical Hardware Limits | — | $\pm 170^\circ / \pm 150^\circ$ | — | Mechanical stops for Motor 1 and Motor 2 |

### Kinematic Formulas
* **Forward Kinematics**:
  $$x = -L_1 \sin(\theta_1) - L_2 \sin(\theta_1 + \theta_2)$$
  $$y = -L_1 \cos(\theta_1) - L_2 \cos(\theta_1 + \theta_2)$$
* **Shortest-Path Angular Unwrapping**:
  $$\Delta \theta = \operatorname{mod}((\theta_{\text{desired}} - \theta_{\text{current}}) + \pi, 2\pi) - \pi$$

---

## 4. Quick Start

### Python Dynamics & Standalone Drivers
```bash
# 1. Set up virtual environment
python -m venv .venv
.\.venv\Scripts\activate

# 2. Install dependencies
pip install pyserial pytest numpy

# 3. Run torque math test suite (11 analytical tests)
pytest test_torque_math.py

# 4. Hardware smoke test (connect USB-to-CAN adapter to COM20)
python run_motor.py
python oscillate_motors.py
```

### MATLAB Mission Control
Requires Base MATLAB R2020b or later (zero paid toolboxes required).

```matlab
% In MATLAB command prompt:
cd('matlab');

% Run offline UI and logic sanity check (no hardware needed):
run_verification

% Run unit tests:
test_shortest_path
test_trajectory_planning
test_armmonitor_layout
verify_kinematics_comprehensive

% Launch live mission control with actuators connected:
run_arm_live
```

---

## 5. Why are `.m` and `.py` Files in the Root Directory?

This repository progressed through distinct development phases, leaving specialized entry points at the root:

1. **Origin of Root `.py` Files** (`torque_math.py`, `run_motor.py`, `oscillate_motors.py`, `app.py`):
   * The project began as a standalone Python rigid-body physics engine (`torque_math.py`) and direct USB-to-CAN hardware verification scripts (`run_motor.py`, `oscillate_motors.py`).
   * `app.py` and `torque_ui.py` served as early interactive UI prototypes for kinematics verification before the industrial MATLAB mission control was architected.
   * `torque_math.py` remains the authoritative analytical reference for 2-DOF multi-body dynamics.

2. **Origin of Root `.m` Files** (`test_scroll.m` to `test_scroll4.m`):
   * During the implementation of `ArmMonitor.m`, MATLAB's native `uigridlayout` exhibited a known clipping bug where nested panels failed to scroll vertically.
   * `test_scroll.m` through `test_scroll4.m` were created as rapid isolation test fixtures to prototype the 3-layer panel hierarchy (`master_grid` $\to$ `scroll_panel` $\to$ `canvas_panel`).
   * The finalized, robust layout was integrated into `matlab/ArmMonitor.m` and unit-tested in `matlab/test_armmonitor_layout.m`.

3. **Origin of Root `build_*.py` Files**:
   * Scaffolding scripts used during early frontend code generation for component templates.

> **Clean Production Snapshot**: If you want a completely clean, uncluttered directory structure containing only the production MATLAB suite, Motor Studio, and core dynamics engine without historical scratch scripts, use the [`Handover/src/`](file:///d:/PRJ/Robstride/Handover/src/) folder.
