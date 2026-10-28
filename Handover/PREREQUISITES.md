# Robstride Project — Prerequisites & Dependencies

**Generated:** 2026-10-28
**Repository Root:** `d:\PRJ\Robstride\`

---

## 1. Overview

The **Robstride** project is a robotics workspace dedicated to control, kinematics analysis, telemetry streaming, and motor sizing for a 2-DOF planar robotic arm powered by **Robstride RS02** brushless smart actuators.

The handover package contains the following primary subsystems:

| Subsystem | Technology Stack | Primary Language / Runtime |
|---|---|---|
| **MATLAB Mission Control & Telemetry** (`matlab/`) | Base MATLAB (R2020b+) | MATLAB |
| **Robstride Motor Studio** (`MotorStudio/`) | Native Windows Executable (`motor_tool.exe`) | C++ / Win32 |
| **Joint Torque Calculator & Kinematics** (`torque_math.py`) | Python standard library / `pytest` | Python 3.10+ |
| **Standalone Hardware Drivers** (`oscillate_motors.py`, `run_motor.py`) | Python (`pyserial`) | Python 3.10+ |
| **Agent Orchestration & Protocol** (`Agents/` & `.agents/`) | Multi-agent coordination | Markdown / JSON |

---

## 2. Python Dependencies

### 2.1 Component Dependency Map

| File | Dependencies | Purpose |
|---|---|---|
| `torque_math.py` | Standard library (`math`, `dataclasses`, `typing`) | Core 2-DOF analytical torque & inertia engine |
| `test_torque_math.py` | Standard library (`math`, `unittest`) / `pytest` | 11 unit tests for torque formulas & pose validation |
| `run_motor.py` | `pyserial`, `struct`, `time` | Direct CAN single-motor testing utility |
| `oscillate_motors.py` | `pyserial`, `struct`, `time`, `signal` | Dual-motor safety oscillation & heartbeat script |

### 2.2 Package Installation

```bash
pip install pyserial pytest numpy
```

- `pyserial>=3.5`: Required by `run_motor.py` and `oscillate_motors.py` for USB-to-CAN serial port communication at 921600 baud.
- `pytest`: Test runner for physics and kinematics validation suites.
- `numpy`: Numerical analysis and array manipulation.

---

## 3. System & Hardware Prerequisites

### 3.1 Operating System
- **Windows 10 / 11 x64** (required for Robstride Motor Studio and USB-to-CAN serial drivers).

### 3.2 Python Environment
- **Python 3.10+** (64-bit).
- Virtual environment setup:
```bash
python -m venv .venv
.\.venv\Scripts\activate
pip install pyserial pytest numpy
```

### 3.3 MATLAB Environment
- **MATLAB R2020b or later** (R2023b+ recommended).
- **Toolbox Requirements**: Base MATLAB only. Zero paid toolboxes required (uses built-in `serialport` interface and standard UI components).

### 3.4 Robstride Motor Studio
- Standalone vendor commissioning suite located at `MotorStudio/motor_toolV14L/motor_tool.exe`.
- Requires CH340 or equivalent USB-to-UART / USB-to-CAN virtual COM port drivers installed on Windows.

### 3.5 Actuator & CAN-Bus Hardware
- **Robstride RS02 brushless smart actuators**: 2 units (Motor 1 = Base/shoulder at CAN ID `0x01`, Motor 2 = Elbow/forearm at CAN ID `0x02`).
- **USB-to-CAN adapter**: Robstride AT-command protocol compatible (default baud: `921600` bps).
- **CAN Bus Topology**:
  - Linear bus topology with 120Ω termination resistors installed at both physical line ends.
  - Common ground shared between host controller, power supply, and both actuators.
- **Power Supply**: 24V–48V DC rated for peak dynamic actuator currents (nominal 5A per motor, 10A supply recommended).

---

## 4. Subsystem Dependency Breakdown

### 4.1 Joint Torque Calculator (`torque_math.py`)
- Python 3.10+
- `pytest` (for test execution)
- Standard library modules: `math`, `dataclasses`, `typing`

### 4.2 Standalone CAN Scripts (`run_motor.py`, `oscillate_motors.py`)
- Python 3.10+
- `pyserial>=3.5`
- Standard library modules: `struct`, `time`, `signal`, `sys`

### 4.3 MATLAB Mission Control (`matlab/`)
- MATLAB R2020b+ with `serialport` support
- Key scripts: `run_arm_live.m` (live hardware session), `run_arm_example.m` (offline demo), `run_verification.m` (automated offline sanity-check)
- Core classes: `ArmControl.m` (motor controller), `ArmMonitor.m` (mission control UI), `ArmTuner.m` (PID step-response tuner)
- Test suites: `test_armmonitor_layout.m`, `test_shortest_path.m`, `test_trajectory_planning.m`, `verify_kinematics_comprehensive.m`

### 4.4 Robstride Motor Studio (`MotorStudio/`)
- Windows 10/11 x64 runtime
- Executable: `MotorStudio/motor_toolV14L/motor_tool.exe`

### 4.5 Agent Coordination (`Agents/` & `.agents/`)
- Markdown/JSON editor or parser
- Task board: `Agents/tasks.md`
- Communication bus: `Agents/comm.md`

---

## 5. Environment Configuration

| Variable | Default Value | Description |
|---|---|---|
| `COM_PORT` | `COM20` | USB-to-CAN adapter serial COM port |
| `BAUD_RATE` | `921600` | Serial baud rate for AT CAN adapter |
| `MOTOR_1_ID` | `0x01` | CAN node ID for Base motor |
| `MOTOR_2_ID` | `0x02` | CAN node ID for Elbow motor |
| `HOST_ID` | `0xFD` (253) | Central CAN host controller identifier |

---

## 6. Quick-Start Verification Checklist

### 6.1 Python Physics & Drivers Verification
```bash
# 1. Create and activate virtual environment
python -m venv .venv
.\.venv\Scripts\activate

# 2. Install dependencies
pip install pyserial pytest numpy

# 3. Run torque math unit tests
python -m pytest test_torque_math.py
```

### 6.2 Standalone Motor Hardware Smoke Test
```bash
# With USB-to-CAN adapter connected to COM20:
python run_motor.py
# Or run dual-motor heartbeat check:
python oscillate_motors.py
```

### 6.3 MATLAB Mission Control Verification
```matlab
% In MATLAB command window:
cd('matlab');

% Run offline sanity check first (no hardware needed):
run_verification

% Run unit test suites:
test_shortest_path
test_trajectory_planning
test_armmonitor_layout
verify_kinematics_comprehensive

% Launch live mission control with hardware connected:
run_arm_live
```

### 6.4 Robstride Motor Studio Launch
```powershell
# Launch vendor commissioning tool directly:
& ".\MotorStudio\motor_toolV14L\motor_tool.exe"
```
