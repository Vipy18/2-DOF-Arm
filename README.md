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

All source files are strictly partitioned into dedicated directories â€” the root directory contains only project-level metadata:

```
d:\PRJ\Robstride\
â”œâ”€â”€ matlab/                 # Primary industrial Mission Control & Telemetry GUI
â”‚   â”œâ”€â”€ ArmControl.m        # Core motor controller, CAN driver, and kinematics class
â”‚   â”œâ”€â”€ ArmMonitor.m        # 5-column Mission Control UI (oscilloscope, visualizer, CSV logger)
â”‚   â”œâ”€â”€ ArmTuner.m          # Single-joint PID step-response & Ziegler-Nichols tuning
â”‚   â”œâ”€â”€ run_arm_live.m      # Production live hardware launcher (COM20 @ 921600 baud)
â”‚   â”œâ”€â”€ run_arm_example.m   # Offline simulation & demo script
â”‚   â”œâ”€â”€ run_verification.m  # Automated offline UI & logic assertion suite
â”‚   â”œâ”€â”€ test_*.m            # Unit tests (kinematics, trajectory, layout, unwrapping)
â”‚   â””â”€â”€ scratch/            # Isolation test fixtures for UI scrolling (test_scroll*.m)
â”œâ”€â”€ python/                 # Python dynamics engine, CLI drivers, and calculators
â”‚   â”œâ”€â”€ torque_math.py      # Core 2-DOF analytical Lagrangian torque & inertia calculation engine
â”‚   â”œâ”€â”€ test_torque_math.py # Unit tests for torque formulas & pose validation
â”‚   â”œâ”€â”€ run_motor.py        # Standalone single-motor CAN CLI control script
â”‚   â”œâ”€â”€ oscillate_motors.py # Standalone dual-motor oscillation & CAN heartbeat check
â”‚   â”œâ”€â”€ web/                # Web dashboard & Tkinter GUI (app.py, torque_ui.py, templates/)
â”‚   â””â”€â”€ scratch/            # Builder scaffolding and orchestration scripts
├── docs/                   # Project knowledge transfer, specifications, and prerequisites
│   ├── PROJECT_KNOWLEDGE_TRANSFER.md # Comprehensive project information & knowledge transfer
│   ├── PREREQUISITES.md    # Host hardware, runtime dependencies, and verification steps
│   └── .handover_manifest.json # Subagent execution and verification audit trail
â”œâ”€â”€ MotorStudio/            # Robstride official motor commissioning & parameter tuning tool
â”‚   â””â”€â”€ motor_toolV14L/     # Unpacked executable (motor_tool.exe) and Qt runtime DLLs
â”œâ”€â”€ Agents/                 # Multi-agent coordination hub (.agents/ junction link)
â”‚   â”œâ”€â”€ comm.md             # Standardized inter-agent message bus
â”‚   â”œâ”€â”€ tasks.md            # Central task board with verification audit logs
â”‚   â”œâ”€â”€ Agents_Rules.md     # Multi-agent behavioral contract
â”‚   â””â”€â”€ Workspace_Structure.md # Canonical architectural and topological map
â”œâ”€â”€ README.md               # Project documentation and directory map
â””â”€â”€ .gitignore              # Repository exclusions (node_modules, build artifacts, etc.)
```

---

## 3. Physical Constants & Conventions

| Parameter | Symbol | Value | Units | Description |
|---|---|---|---|---|
| Base Link Length | $L_1$ | 400 | mm | Center-to-center distance from base to elbow |
| Fore Link Length | $L_2$ | 300 | mm | Center-to-center distance from elbow to TCP |
| Gravitational Acceleration | $g$ | 9.81 | m/sÂ² | Acts vertically downwards along negative $Y$ |
| CAN Bus Baud Rate | â€” | 921600 | bps | Serial communications speed for USB-to-CAN adapter |
| Motor 1 (Base) Node ID | â€” | `0x01` | â€” | Base/shoulder actuator |
| Motor 2 (Elbow) Node ID | â€” | `0x02` | â€” | Elbow/forearm actuator |
| Host Controller Node ID | â€” | `0xFD` (253) | â€” | Master controller CAN node ID |
| Max Actuator Torque | $\tau_{\max}$ | 17 | NÂ·m | Hardware limit for parameter index `0x700B` |
| Torque Constant | $K_M$ | 1.22 | NÂ·m/Arms | RS02 torque constant |
| Default Software Limits | â€” | $\pm 360^\circ$ | â€” | Multi-turn software limits in ArmControl |
| Physical Hardware Limits | â€” | $\pm 170^\circ / \pm 150^\circ$ | â€” | Mechanical stops for Motor 1 and Motor 2 |

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

# 3. Run torque math unit tests (10 analytical tests)
python -m unittest python/test_torque_math.py

# 4. Hardware smoke test (connect USB-to-CAN adapter to COM20)
python python/run_motor.py
python python/oscillate_motors.py

# 5. (Optional) Run local web calculator dashboard
python python/web/app.py
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

## 5. Directory Organization & File History

To maintain a clean repository root, all source files were relocated to functional directories:

* **`python/`**: Houses the core physics model (`torque_math.py`) and standalone CLI hardware drivers (`run_motor.py`, `oscillate_motors.py`).
* **`python/web/`**: Houses the Flask web dashboard (`app.py`), HTML templates, and standalone Tkinter calculator (`torque_ui.py`).
* **`python/scratch/`**: Houses legacy template builders (`build_*.py`, `update_html.py`) and multi-agent runner scripts (`run_orchestration.py`).
* **`matlab/scratch/`**: Houses historical scroll-bug isolation test fixtures (`test_scroll*.m`) used during `ArmMonitor` UI development.
* **`docs/`**: Houses system specifications, developer roadmap, environment prerequisites, and multi-agent audit reports.
