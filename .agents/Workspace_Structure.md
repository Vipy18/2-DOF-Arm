# Robstride Workspace Structure & Canonical Architectural Index

> **Status:** Synchronized & Canonical  
> **Last Updated:** 2026-10-28  
> **Governing Agent:** Coworker Agent (`coworker`)  
> **Primary Workspace:** `C:\Users\vaibh\OneDrive\Documents\Vipul\2-DOF\`  
> **Upstream Git Repository:** `C:\Users\vaibh\OneDrive\Documents\Vipul\2-DOF\Robstride\`  
> **Active Dev Environment:** `C:\Users\vaibh\OneDrive\Documents\Vipul\2-DOF\Robstride-Dev\`  
> **Central Blackboard:** `Robstride\.agents\` (Junctions linked to `.agents`, `Agents`, `.agent`, `Agent`)

---

## 1. Executive Summary & Dual-Workspace Architecture

The **2-DOF Robstride** workspace provides a complete robotics control, kinematics analysis, telemetry streaming, and motor commissioning suite for a 2-DOF planar/SCARA robotic arm driven by **Robstride RS02** brushless actuators.

The workspace is organized into a dual-root topology:
1. **Upstream Git Repo (`Robstride/`)**: Master tracking repository linked to `https://github.com/Vipy18/Robstride.git`. Contains all tracked source files, commit history, and git metadata.
2. **Active Development Repo (`Robstride-Dev/`)**: Development workspace kept at 100% file and cryptographic hash parity with `Robstride/`.
3. **Multi-Agent Coordination Hub (`.agents/` / `Agents/`)**: Central directory junction pointing to `Robstride\.agents\`, shared across the workspace root and dev folders.

---

## 2. Directory Hierarchy & Topology

```
C:\Users\vaibh\OneDrive\Documents\Vipul\2-DOF\
├── .agents -> Robstride\.agents\       # Central inter-agent bus junction
├── Agents -> Robstride\.agents\        # Central inter-agent bus junction
├── .agent -> Robstride\.agents\        # Alias junction
├── Agent -> Robstride\.agents\         # Alias junction
├── opencode.json                       # OpenCode multi-agent profiles & model routes
│
├── Robstride/                          # Upstream Git Master Repository
│   ├── .git/                           # Git repository internals
│   ├── .agents/                        # Canonical agent bus & task board
│   │   ├── comm.md                     # Inter-agent message log
│   │   ├── tasks.md                    # Task board & verification checklists
│   │   ├── Workspace_Structure.md      # Canonical architectural index
│   │   ├── Agents_Rules.md             # Multi-agent protocol & constraints
│   │   └── agent_roles.md              # Specialist agent contracts
│   ├── ArmControlApp/                  # Electron + Vite + React desktop application
│   │   ├── backend/                    # Embedded Python CAN bridge RPC service
│   │   ├── src/                        # Electron main, preload, and React 18 renderer
│   │   ├── package.json                # Node dependency definitions
│   │   └── electron.vite.config.ts     # Vite build configuration
│   ├── matlab/                         # Industrial MATLAB Mission Control suite
│   │   ├── ArmControl.m                # Motor driver, trajectory engine, and CAN/serial comms
│   │   ├── ArmMonitor.m                # 5-column Mission Control GUI (App Designer/uifigure)
│   │   ├── ArmTuner.m                  # PID calibration & step-response interface
│   │   ├── run_arm_live.m              # Live hardware session launcher
│   │   ├── run_arm_example.m           # Offline simulated session launcher
│   │   ├── run_verification.m          # Automated offline sanity check
│   │   ├── verify_kinematics_comprehensive.m # 1500-point workspace stress test
│   │   ├── test_shortest_path.m        # Multi-turn phase unwrapping verification
│   │   ├── test_trajectory_planning.m  # Trajectory interpolator unit test
│   │   └── test_armmonitor_layout.m    # UI grid & CSV logging regression test
│   ├── python/                         # Python Control Suite & Web UI
│   │   ├── oscillate_motors.py         # Dual-motor safety oscillation & heartbeat
│   │   ├── run_motor.py                # Standalone single-motor driver
│   │   ├── torque_math.py              # Analytical torque, inertia, and payload engine
│   │   ├── test_torque_math.py         # Unit tests for physical torque formulas
│   │   ├── web/                        # Telemetry Web UI (Flask app & templates)
│   │   └── scratch/                    # Orchestration & component build scripts
│   ├── MotorStudio/                    # Vendor Commissioning Software
│   │   └── motor_toolV14L/             # Unpacked native Win32 motor tuning suite
│   ├── Handover/                       # Self-contained client delivery package
│   │   ├── src/                        # Standalone source snapshot
│   │   ├── PROJECT_DESCRIPTION.md      # Comprehensive architecture & engineering spec
│   │   ├── HANDOVER_GUIDE.md           # Engineering handover & development roadmap
│   │   ├── PREREQUISITES.md            # Hardware, OS, and software prerequisites
│   │   └── .handover_manifest.json     # Subagent generation audit trail
│   ├── 932254889-ROBSTRIDE-02-Motor-Instruction-Manual.pdf # RS02 motor manual
│   ├── RS02-IP67User Manual260713.pdf  # Actuator IP67 hardware manual
│   ├── User_Manual.md                  # Protocol, CAN frames, and command reference
│   ├── Start_Robstride_App.bat         # Single-click launcher for Arm Control App
│   ├── README.md                       # Comprehensive repository documentation
│   └── .gitignore                      # Git artifact filtering
│
└── Robstride-Dev/                      # Active Development Environment
    ├── .agents -> Robstride\.agents\   # Synced junction link
    ├── Agents -> Robstride\.agents\    # Synced junction link
    ├── docs/                           # Project information, knowledge transfer, and prerequisites
    │   ├── PROJECT_KNOWLEDGE_TRANSFER.md # Comprehensive project information & KT document
    │   ├── PREREQUISITES.md            # Hardware, OS, and software prerequisites
    │   └── .handover_manifest.json     # Subagent generation audit trail
    ├── matlab/                         # Synchronized MATLAB suite
    ├── python/                         # Synchronized Python suite
    └── MotorStudio/                    # Synchronized MotorStudio suite
```

---

## 3. Subsystem Breakdown & Interfaces

### 3.1 MATLAB Mission Control Subsystem (`matlab/`)
- **Runtime:** Verified on **MATLAB R2026b (v26.2.0.3386108)**; backwards-compatible to R2020b+.
- **Zero Paid Toolboxes:** Runs purely on Base MATLAB built-in `serialport` and App Building UI frameworks.
- **ArmControl Class (`ArmControl.m`):**
  - Protocol: 921600 baud serial-to-CAN converter. Robstride binary frames (Motor IDs 1 & 2).
  - Shortest-Path Unwrapping: Phase-unwraps angle commands across $[-\pi, \pi]$ and $[-360^\circ, +360^\circ]$.
  - Trajectory Streaming: 50Hz atomic dual-motor target dispatch (`set_both_targets(th1, th2)` in a single 34-byte serial buffer write).
- **Mission Control GUI (`ArmMonitor.m`):**
  - 5-column CSS-style grid layout built on `uifigure`.
  - Column 1: Hardware connection, homing, and live status.
  - Column 2: 2D Kinematic visualizer canvas.
  - Column 3: Joint command inputs, direct angular targets, and trajectory execution.
  - Column 4: Dual-channel real-time oscilloscope (Y-axis locked scroll/pan).
  - Column 5: 50-column CSV data logger with manual and timed-duration recording modes.

### 3.2 Desktop Electron Application (`ArmControlApp/`)
- **Main Process (`src/main/`):** Manages Python child process lifecycle and IPC communication channels.
- **Renderer (`src/renderer/`):** React 18, Tailwind CSS, Framer Motion UI for trajectory execution, kinematics controls, and safety bounds.
- **Backend Bridge (`backend/`):** Python CAN bridge service (`can_bridge.py`, `kinematics.py`, `main.py`).

### 3.3 Python Suite & Analytical Physics (`python/`)
- **Physics Core (`torque_math.py`):**
  - Evaluates continuous holding torque ($\tau_{elbow, cont}$, $\tau_{base, cont}$) and mass moment of inertia ($I_{elbow}$, $I_{base}$).
  - Computes dynamic peak torque ($\tau_{peak} = \tau_{cont} + I \cdot \alpha$).
- **Drivers:** `oscillate_motors.py` (dual-motor heartbeat and oscillation), `run_motor.py` (direct motor driver).
- **Web UI:** Flask web application (`python/web/app.py`, `torque_ui.py`) with SVG visualizer.

### 3.4 Robstride Motor Studio (`MotorStudio/`)
- Standalone vendor commissioning suite (`MotorStudio/motor_toolV14L/motor_tool.exe`).
- Provides low-level actuator flashing, calibration, and tuning via USB-to-UART / USB-to-CAN virtual COM port.

---

## 4. Verification & Testing Matrix

| Component | Test File | Engine | Verification Status |
| :--- | :--- | :--- | :--- |
| **Kinematics Engine** | `matlab/verify_kinematics_comprehensive.m` | MATLAB | **Passed (1500/1500 points)** |
| **Angle Unwrapping** | `matlab/test_shortest_path.m` | MATLAB | **Passed** |
| **Trajectory Interpolator** | `matlab/test_trajectory_planning.m` | MATLAB | **Passed** |
| **Mission Control GUI** | `matlab/test_armmonitor_layout.m` | MATLAB | **Passed** |
| **Torque Physics Engine** | `python/test_torque_math.py` | Pytest / Unittest | **Passed (11 unit tests)** |
| **Dev vs Git Parity** | Cryptographic SHA-256 Hash Audit | PowerShell | **Passed (384/384 files, 100% parity)** |

---

## 5. Multi-Agent Coordination Protocol

All autonomous agents operate from `.agents/`:
- **Task Tracking:** `tasks.md` enforces the Gatekeeper Protocol — tasks are marked complete only after verification subagents pass.
- **Message Bus:** `comm.md` logs all inter-agent communications using the format:
  ```markdown
  [FROM: <Agent_Role>] -> [TO: <Agent_Role / ALL>]
  [STATUS: Information / Request / Urgent / Passed / Failed]
  [BODY: Specific message details]
  ```
