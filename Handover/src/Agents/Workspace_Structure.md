# Robstride Workspace Structure & Canonical Architectural Index

> **Status:** Synchronized & Canonical  
> **Last Updated:** 2026-10-27  
> **Governing Agent:** Coworker Agent (`coworker`)  
> **Access Path:** `d:\PRJ\Robstride\.agents\Workspace_Structure.md` (and `d:\PRJ\Robstride\Agents\Workspace_Structure.md`)

---

## 1. Executive Summary & Subsystems

The `Robstride` repository is a multi-platform robotics workspace dedicated to control, kinematics analysis, telemetry streaming, and motor sizing for 2-DOF planar/SCARA robotic arms powered by Robstride RS-series brushless actuators (RS02).

The repository is partitioned into four primary subsystems:
1. **Torque Calculator & Web Dashboard (`/` root)**: Python/Flask server with analytical kinematics/dynamics physics calculations, numeric inputs, and an interactive zoomable SVG arm visualizer.
2. **MATLAB Mission Control & Telemetry (`/matlab`)**: Industrial-grade control and monitoring interface (`ArmControl.m`, `ArmMonitor.m`) with 50Hz continuous trajectory streaming and a 50-column CSV flight data logger.
3. **Desktop Application (`/ArmControlApp`)**: Electron + Vite + React/TypeScript desktop GUI with Python CAN-bus hardware bridge.
4. **Agent Orchestration & Protocol (`/Agents` & `/.agents`)**: Multi-agent shared blackboard, task board, and communication bus.

---

## 2. Directory Hierarchy & Topology

```
d:\PRJ\Robstride\
â”œâ”€â”€ .agents -> Agents/               # Junction link for standardized agent access
â”œâ”€â”€ Agents/                          # Multi-agent coordination hub
â”‚   â”œâ”€â”€ Agents_Rules.md              # Global multi-agent operating rules
â”‚   â”œâ”€â”€ agent_roles.md               # Specialist agent definitions & responsibilities
â”‚   â”œâ”€â”€ comm.md                      # Unified inter-agent communication channel
â”‚   â”œâ”€â”€ tasks.md                     # Central task status and audit board
â”‚   â””â”€â”€ Workspace_Structure.md       # Canonical structural and topological truth
â”œâ”€â”€ templates/                       # Web frontend templates (Flask)
â”‚   â””â”€â”€ index.html                   # Pure numeric CAD-styled torque UI with zoomable SVG
â”œâ”€â”€ matlab/                          # MATLAB kinematic control & diagnostic tools
â”‚   â”œâ”€â”€ ArmControl.m                 # Motor driver, trajectory engine, and CAN/serial comms
â”‚   â”œâ”€â”€ ArmMonitor.m                 # 5-column Mission Control GUI (App Designer/uifigure)
â”‚   â”œâ”€â”€ ArmTuner.m                   # PID parameter calibration interface
â”‚   â”œâ”€â”€ Robstride_Arm_Guide.md       # Hardware and protocol engineering guide
â”‚   â”œâ”€â”€ run_arm_live.m               # Production live launcher
â”‚   â”œâ”€â”€ test_armmonitor_layout.m     # GUI layout and CSV logging automated regression test
â”‚   â”œâ”€â”€ test_shortest_path.m         # Multi-turn phase unwrapping verification
â”‚   â”œâ”€â”€ test_trajectory_planning.m   # Trajectory interpolator unit test
â”‚   â””â”€â”€ verify_kinematics_comprehensive.m # 1500-point workspace stress test
â”œâ”€â”€ ArmControlApp/                   # Cross-platform Electron/React desktop app
â”‚   â”œâ”€â”€ backend/                     # Embedded Python backend
â”‚   â”‚   â”œâ”€â”€ can_bridge.py            # SocketCAN / USB-CAN hardware bridge
â”‚   â”‚   â”œâ”€â”€ kinematics.py            # Planar inverse/forward kinematics
â”‚   â”‚   â””â”€â”€ main.py                  # Local Python RPC service
â”‚   â”œâ”€â”€ src/
â”‚   â”‚   â”œâ”€â”€ main/                    # Electron main process (IPC, process manager)
â”‚   â”‚   â”œâ”€â”€ preload/                 # Secure context isolation preload script
â”‚   â”‚   â”œâ”€â”€ renderer/                # React 18 frontend (Tailwind CSS, Framer Motion)
â”‚   â”‚   â””â”€â”€ shared/                  # Common TypeScript interfaces & constants
â”‚   â”œâ”€â”€ electron.vite.config.ts      # Vite configuration for Electron
â”‚   â””â”€â”€ package.json                 # Dependency definitions & build scripts
â”œâ”€â”€ app.py                           # Python Flask backend server (port 5000)
â”œâ”€â”€ torque_math.py                   # 2-DOF analytical torque & inertia calculation engine
â”œâ”€â”€ test_torque_math.py              # Unit tests for physical torque formulas
â”œâ”€â”€ test_app.py                      # Integration tests for Flask endpoints
â”œâ”€â”€ run_motor.py                     # Direct CAN single-motor testing utility
â”œâ”€â”€ oscillate_motors.py              # Dual-motor safety oscillation & heartbeat script
â””â”€â”€ User_Manual.md                   # Robstride actuator protocol & command guide
```

---

## 3. Subsystem Breakdown & Module Interfaces

### 3.1 Web Torque Calculator Subsystem
- **Core Entry Point:** `python app.py` (Default: `http://127.0.0.1:5000`)
- **Physics Core (`torque_math.py`):**
  - Class `ArmParameters`: Geometric and physical specs ($m_1, m_2, m_{motor}, m_{payload}, L_1, L_2, \alpha_1, \alpha_2, \theta_1, \theta_2, g$).
  - Class `TwoLinkTorqueCalculator`:
    - Evaluates horizontal moment arms perpendicular to gravity.
    - Calculates continuous holding torques: $\tau_{elbow, cont} = |\tau_{elbow, grav}|$, $\tau_{base, cont} = |\tau_{base, grav}|$.
    - Evaluates mass moments of inertia: $I_{elbow}$ and $I_{base}$ (solid uniform links + point masses).
    - Computes dynamic peak torque: $\tau_{peak} = \tau_{cont} + I \cdot \alpha$.
- **Frontend (`templates/index.html`):**
  - Pure numeric inputs for masses, lengths, angular accelerations, and joint angles.
  - Interactive SVG `#arm_canvas` with pointer-centric wheel zooming (`wheel` event handling `viewBox`).
  - Dynamic vector rendering for links, joints, CoM markers, gravity vectors, and TCP coordinate callouts.

### 3.2 MATLAB Mission Control Subsystem (`matlab/`)
- **Core Controller (`ArmControl.m`):**
  - Baud: 921600 / USB-to-CAN converter.
  - Packet protocol: Custom Robstride binary frames (Motor IDs 1 & 2).
  - Shortest-path unwrapping via `calculate_shortest_path` (supporting multi-turn operations across $[-\pi, \pi]$ and $[-360^\circ, +360^\circ]$).
  - Streaming: 50Hz atomic dual-motor target dispatch via `set_both_targets(th1, th2)` in a single 34-byte serial buffer write.
- **Mission Control UI (`ArmMonitor.m`):**
  - Layout: Balanced 5-column CSS-like grid layout on `uifigure`.
  - Column 1: Connection, calibration, homing, and status.
  - Column 2: 2D Kinematic visualizer canvas.
  - Column 3: Joint command inputs, direct angular targets, and trajectory execution.
  - Column 4: Dual-channel real-time oscilloscope (Y-axis locked scroll/pan).
  - Column 5: 50-column CSV data logger with manual and timed-duration recording modes.

### 3.3 Desktop Electron Application (`ArmControlApp/`)
- **Main Process (`src/main/`):** Manages Python child process lifecycle and IPC communication channels.
- **Renderer (`src/renderer/`):**
  - `Dashboard`: System telemetry overview and fault alerts.
  - `Control`: Manual joint and Cartesian jog controls.
  - `Program`: Step-by-step waypoint sequencing editor (`StepEditor`, `StepRow`).
  - `MotorStudio`: Actuator register read/write and low-level PID gain tuning.
- **Python Bridge (`backend/`):** Exposes high-level hardware commands over local WebSocket/stdio to Electron.

---

## 4. Universal Coordinate & Kinematic Invariants

All subsystems adhere to unified physical and kinematic conventions:
1. **Gravity Vector:** Acts vertically downwards along the negative Y axis ($\vec{g} = [0, -9.81]\,\text{m/s}^2$).
2. **Zero Position ($\theta_1 = 0^\circ, \theta_2 = 0^\circ$):** Both links point straight downwards along the direction of gravity.
3. **Angle Chirality:**
   - **Positive Angle ($> 0$):** Clockwise (CW) rotation.
   - **Negative Angle ($< 0$):** Counter-Clockwise (CCW) rotation.
4. **Joint Relative Reference:**
   - $\theta_1$: Measured relative to vertical downward axis.
   - $\theta_2$: Measured relative to Link 1 vector.
   - Absolute orientation of Link 2: $\phi_2 = \theta_1 + \theta_2$.
5. **Horizontal Moment Arm Formulation:**
   - Base to Elbow: $dx_1 = -L_1 \sin(\theta_1)$
   - Elbow to TCP: $dx_2 = -L_2 \sin(\theta_1 + \theta_2)$
   - Continuous holding torque evaluates to $0.0\,\text{Nm}$ at $(0^\circ, 0^\circ)$ and reaches maximum at full horizontal extension ($\pm 90^\circ$).

---

## 5. Inter-Agent Communication Bus (`comm.md`)

All operational decisions, spec approvals, verification audits, and hand-offs must be recorded in `d:\PRJ\Robstride\.agents\comm.md` using the standard header format:
```markdown
[FROM: Agent_Role] -> [TO: Agent_Role / ALL]
[STATUS: Information / Request / Urgent / Passed / Failed]
[BODY: Structured, actionable details, paths, and results]
```
No task may be marked as complete in `tasks.md` without an explicit `[STATUS: Passed]` audit entry from a Verification Agent.
