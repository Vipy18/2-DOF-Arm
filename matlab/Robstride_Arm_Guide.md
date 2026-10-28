# Robstride 2-DOF Arm — MATLAB Control System Guide

Comprehensive user guide and technical reference for controlling the Robstride 2-DOF planar robotic arm using MATLAB (R2020b or later).

---

## 1. Overview

### System Description
The Robstride 2-DOF robotic manipulator is a high-torque planar arm actuated by two direct/quasi-direct drive Robstride RS02 brushless actuator modules. Each actuator integrates a high-efficiency BLDC motor, planetary gear reduction, high-resolution magnetic encoder, and a Field-Oriented Control (FOC) driver with CAN bus communication.
- **Base Joint (Joint 1 / Motor 1):** Actuates the 400 mm base link relative to the ground frame.
- **Fore Joint (Joint 2 / Motor 2):** Actuates the 300 mm forearm link relative to the base link.
- **Total Reach:** 700 mm maximum planar workspace radius.

### Communication System
The host PC interfaces with the CAN bus via a RobStride USB-to-CAN adapter operating as a Virtual COM Port (VCP).
- **Baud Rate:** 921,600 bps
- **CAN Bitrate:** 1 Mbps (Standard high-speed CAN)
- **Serial-CAN Framing Protocol:**
  - Header: `0x41 0x54` (`AT`)
  - Serial ID (4 bytes, Big-Endian): `serial_id = (can_id << 3) | 0x04`
  - DLC (1 byte): Payload length (1–8 bytes)
  - Data (8 bytes): Parameter payload (padded with 0x00 to 8 bytes if needed)
  - Tail: `0x0D 0x0A` (`\r\n`)

### File List
| File | Description |
|---|---|
| `ArmControl.m` | Core driver class managing serial-CAN framing, kinematics (FK/IK), control modes, PID read/write, joint limits, telemetry poller, and logging. |
| `ArmMonitor.m` | Live graphical dashboard built with base MATLAB `uifigure` and `uigridlayout` (telemetry cards, 2D kinematic plot, PID panel, control bar, synchronous E-STOP). |
| `ArmTuner.m` | PID tuning and validation suite supporting step, ramp, and sine sweep tests with automated metric computation and Ziegler-Nichols tuning guidance. |
| `run_arm_live.m` | Top-level startup script initializing both motors, starting 20 Hz background telemetry, and launching `ArmMonitor` with figure-close shutdown. |
| `run_arm_example.m` | CLI demonstration script showing position mode commands, simultaneous joint moves, and inverse kinematics coordinate tracking. |

### System Architecture Diagram
```text
+-----------------------------------------------------------------------+
|                              Host PC                                  |
|  +---------------------+   +---------------------+   +-------------+  |
|  |     ArmMonitor      |   |      ArmTuner       |   | run_arm_live|  |
|  | (Live Dashboard UI) |   | (Step/Sine Testing) |   |  (Launcher) |  |
|  +----------+----------+   +----------+----------+   +------+------+  |
|             |                         |                     |         |
|             +--------------------+----+---------------------+         |
|                                  |                                    |
|                                  v                                    |
|                         +-----------------+                           |
|                         |   ArmControl    |                           |
|                         | (Driver Engine) |                           |
|                         +--------+--------+                           |
+----------------------------------|------------------------------------+
                                   |
              Serial Port (COMxx, 921600 baud, AT Framing)
                                   |
                                   v
             +---------------------------------------------+
             |        RobStride USB-to-CAN Adapter         |
             +---------------------+-----------------------+
                                   |
                        CAN Bus (1 Mbps, CAN_H / CAN_L)
                                   |
         +-------------------------+-------------------------+
         |                                                   |
         v                                                   v
+---------------------------------+         +---------------------------------+
|      Motor 1 (CAN ID 0x01)      |         |      Motor 2 (CAN ID 0x02)      |
|  Base Joint Actuator (L1=400mm) |         |  Fore Joint Actuator (L2=300mm) |
+---------------------------------+         +---------------------------------+
```

---

## 2. Hardware Setup

### Motor Identifiers & Kinematic Parameters
- **Motor 1 (Base Joint):** CAN ID `0x01` (hex), Host Target `0x01`. Controls Link 1 ($L_1 = 400\text{ mm}$).
- **Motor 2 (Fore Joint):** CAN ID `0x02` (hex), Host Target `0x02`. Controls Link 2 ($L_2 = 300\text{ mm}$).
- **Master Host ID:** `0xFD` (253 decimal).

### Wiring Specifications
1. **DC Power Bus:**
   - Operational Voltage: **24V to 60V DC** (48V nominal recommended).
   - Supply Rating: Regulated DC power supply capable of **10A continuous** (minimum 5A peak per motor).
   - Polarity: Verify V+ (Red) and V- (Black) polarity prior to powering on. Reverse voltage permanently damages motor drivers.
2. **CAN Bus:**
   - Connect `CAN_H` (Yellow) of Motor 1, Motor 2, and USB-to-CAN adapter together.
   - Connect `CAN_L` (Green/White) of Motor 1, Motor 2, and USB-to-CAN adapter together.
   - Ensure a 120 $\Omega$ terminal resistor is present across `CAN_H` and `CAN_L` at the terminal end.
3. **Host USB Connection:**
   - Connect USB-C port of the RobStride adapter directly to a native USB 3.0 / 2.0 port on the host PC.

### COM Port Identification (Windows)
1. Press `Win + X` and select **Device Manager**.
2. Expand the **Ports (COM & LPT)** section.
3. Locate **USB-SERIAL CH340 (COMxx)** or **Silicon Labs CP210x USB to UART Bridge (COMxx)**.
4. Note the COM identifier (e.g., `COM20`).
5. If marked with a yellow warning icon, install the CH340 driver (WCH CH341SER driver package).

> [!IMPORTANT]
> **Single-Motor Addressing Pre-requisite:**
> Factory Robstride motors default to CAN ID `0x01`. If both motors are powered simultaneously on the bus with identical IDs, bus arbitration fails. Connect **one motor at a time** to set Motor 2 to CAN ID `0x02` before daisy-chaining both onto the active bus.

---

## 3. Software Setup

### Prerequisites
- **MATLAB Version:** R2020b or newer (required for modern `serialport`, `uifigure`, and `uigridlayout` architectures).
- **Toolbox Dependencies:** **None.** Pure base MATLAB implementation — no Instrument Control Toolbox or Robotics System Toolbox required.

### Path Configuration
Add the MATLAB driver folder to the active search path in the MATLAB Command Window:
```matlab
addpath('D:\PRJ\Robstride\matlab');
savepath; % Optional: persist path across sessions
```

### COM Port Configuration
Open `run_arm_live.m` and verify line 33 matches your hardware COM port:
```matlab
arm = ArmControl('COM20');  % Change 'COM20' to match your detected port
```

---

## 4. Quick Start

Follow this sequence to power on and run the arm with live telemetry and dashboard control:

### Step 1: Connect Hardware
1. Connect CAN bus daisy chain (`CAN_H`, `CAN_L`) and USB adapter to PC.
2. Power on the 24–60V DC power supply. Verify motor LEDs turn solid or blink indicating standby.

### Step 2: Open MATLAB
Launch MATLAB and navigate to the project root:
```matlab
cd 'D:\PRJ\Robstride\matlab';
```

### Step 3: Run the Main Script
Execute `run_arm_live` in the Command Window:
```matlab
run_arm_live
```
**Execution Sequence Details:**
1. **Orphan Timer Purge:** Scans and terminates any lingering MATLAB background timers (`stop(timerfindall); delete(timerfindall);`).
2. **Serial Handshake:** Instantiates `ArmControl('COM20')` and opens 921,600 baud serial connection.
3. **Motor Commissioning:** Iterates through Motor 1 and Motor 2:
   - Sets param `0x200C` (`CAN_TIMEOUT`) to 0 (disables communication timeout trip).
   - Sets param `0x7005` (`run_mode`) to 1 (Position Control Mode).
   - Sends Comm Type `0x03` (`enable_motor`) to energize power inverter stages.
   - Sets param `0x7018` (`limit_cur`) to 5.0 A hardware safety clamp.
4. **Telemetry Activation:** Launches background timer polling 6 parameters per motor at 20 Hz.
5. **Dashboard Launch:** Creates and renders the 1200x700 `ArmMonitor` dark-theme UI.

### Step 4: Interact with ArmMonitor
- Monitor live joint angles, angular velocities, phase currents, temperatures, and bus voltages.
- Check 2D planar kinematics visualization displaying real-time link posture.
- Read active PID gains, modify values, and click **Write M1 / Write M2**.
- Enter target joint angles (rad) and click **Send** to command motion.

### Step 5: Safe Shutdown
Close the `ArmMonitor` window. The `close_cb` cleanup callback automatically:
- Stops the UI refresh timer and background telemetry timer.
- Issues Comm Type `0x04` to disable both motors (removes holding torque).
- Closes and clears the serial port handle cleanly.

---

## 5. ArmControl API Reference

All methods belong to the `ArmControl` handle class.

| Method | Syntax | Parameters | Description | Example |
|---|---|---|---|---|
| `ArmControl` | `arm = ArmControl(comPort)` | `comPort` (char, default: `'COM20'`) | Constructor. Initializes controller object and telemetry structures. | `arm = ArmControl('COM4');` |
| `connect` | `arm.connect()` | None | Opens serial port at 921600 baud. | `arm.connect();` |
| `disconnect` | `arm.disconnect()` | None | Safely deletes and clears serial port object. | `arm.disconnect();` |
| `enable_motor` | `arm.enable_motor(motor_id)` | `motor_id` (1 or 2) | Sends Comm Type 0x03 to enable motor inverter stage. | `arm.enable_motor(1);` |
| `disable_motor` | `arm.disable_motor(motor_id)` | `motor_id` (1 or 2) | Sends Comm Type 0x04 to disable motor torque output. | `arm.disable_motor(2);` |
| `set_position_mode` | `arm.set_position_mode(motor_id)` | `motor_id` (1 or 2) | Sets run mode to Position Control (`0x7005` = 1). | `arm.set_position_mode(1);` |
| `set_velocity_mode` | `arm.set_velocity_mode(motor_id)` | `motor_id` (1 or 2) | Sets run mode to Velocity Control (`0x7005` = 2). | `arm.set_velocity_mode(1);` |
| `set_current_mode` | `arm.set_current_mode(motor_id)` | `motor_id` (1 or 2) | Sets run mode to Torque/Current Control (`0x7005` = 3). | `arm.set_current_mode(1);` |
| `set_speed` | `arm.set_speed(motor_id, speed_rad_s)` | `motor_id` (1 or 2), `speed_rad_s` (single) | Commands target angular velocity in Velocity Mode (`0x700A`). | `arm.set_speed(1, 1.5);` |
| `set_target_position` | `arm.set_target_position(motor_id, pos_rad)` | `motor_id` (1 or 2), `pos_rad` (single) | Commands target joint position (`0x7016`) after checking `JOINT_LIMITS`. | `arm.set_target_position(1, 0.5);` |
| `set_target_angle` | `arm.set_target_angle(motor_id, angle_rad)` | `motor_id` (1 or 2), `angle_rad` (single) | Alias wrapper for `set_target_position`. | `arm.set_target_angle(2, -0.2);` |
| `set_arm_angles` | `arm.set_arm_angles(theta1, theta2)` | `theta1`, `theta2` (rad) | Commands both joints simultaneously with limit checks. | `arm.set_arm_angles(0.2, 0.4);` |
| `move_to_xy` | `arm.move_to_xy(x_mm, y_mm)` | `x_mm`, `y_mm` (Cartesian coordinates in mm) | Solves IK and commands both joints to target planar position. | `arm.move_to_xy(400, 300);` |
| `mit_control` | `arm.mit_control(motor_id, p, v, kp, kd, t)` | `motor_id`, `p` (rad), `v` (rad/s), `kp`, `kd`, `t` (Nm) | Comm Type 0x01 high-rate full-state impedance packet. | `arm.mit_control(1, 0, 0, 80, 2, 0);` |
| `set_pos_kp` | `arm.set_pos_kp(motor_id, kp)` | `motor_id`, `kp` (single) | Writes position proportional gain (`0x7015`). | `arm.set_pos_kp(1, 35.0);` |
| `set_vel_kp` | `arm.set_vel_kp(motor_id, kp)` | `motor_id`, `kp` (single) | Writes velocity proportional gain (`0x701A`). | `arm.set_vel_kp(1, 2.5);` |
| `set_vel_ki` | `arm.set_vel_ki(motor_id, ki)` | `motor_id`, `ki` (single) | Writes velocity integral gain (`0x701B`). | `arm.set_vel_ki(1, 0.05);` |
| `set_vel_kd` | `arm.set_vel_kd(motor_id, kd)` | `motor_id`, `kd` (single) | Writes velocity derivative gain (`0x701C`). | `arm.set_vel_kd(1, 0.02);` |
| `read_pid` | `pid = arm.read_pid(motor_id)` | `motor_id` (1 or 2) | Reads `kp_pos`, `kp_vel`, `ki_vel`, `kd_vel` from motor RAM/flash. | `pid = arm.read_pid(1);` |
| `set_current_limit` | `arm.set_current_limit(motor_id, limit_a)` | `motor_id`, `limit_a` (single, Amps) | Sets maximum allowable phase current (`0x7018`). | `arm.set_current_limit(1, 5.0);` |
| `set_velocity_limit` | `arm.set_velocity_limit(motor_id, vel_rad_s)` | `motor_id`, `vel_rad_s` (single) | Sets maximum allowable angular velocity (`0x7017`). | `arm.set_velocity_limit(1, 10.0);` |
| `set_torque_limit` | `arm.set_torque_limit(motor_id, torque_nm)` | `motor_id`, `torque_nm` (single) | Sets maximum allowable motor torque (`0x701E`). | `arm.set_torque_limit(1, 12.0);` |
| `disable_timeout` | `arm.disable_timeout(motor_id)` | `motor_id` (1 or 2) | Sets `0x200C` = 0 to disable communication loss shutdown. | `arm.disable_timeout(1);` |
| `start_telemetry` | `arm.start_telemetry(rate_hz)` | `rate_hz` (numeric, default: 20) | Starts background MATLAB timer polling 6 parameters at `rate_hz`. | `arm.start_telemetry(20);` |
| `stop_telemetry` | `arm.stop_telemetry()` | None | Stops and deletes background polling timer safely. | `arm.stop_telemetry();` |
| `start_logging` | `arm.start_logging()` | None | Initializes empty `log_data` buffer and enables telemetry history recording. | `arm.start_logging();` |
| `stop_logging` | `arm.stop_logging()` | None | Disables logging while retaining recorded data. | `arm.stop_logging();` |
| `save_log` | `arm.save_log(filename)` | `filename` (char, optional) | Saves recorded telemetry buffer to `.mat` file. | `arm.save_log('run1.mat');` |
| `forward_kinematics` | `[x, y] = arm.forward_kinematics(th1, th2)` | `th1`, `th2` (rad) | Computes end-effector Cartesian coordinate (mm). | `[x, y] = arm.forward_kinematics(0, 0);` |
| `inverse_kinematics` | `[th1, th2] = arm.inverse_kinematics(x, y)` | `x`, `y` (Cartesian coordinates in mm) | Solves elbow-up analytical IK. Throws error if out of reach. | `[th1, th2] = arm.inverse_kinematics(400, 300);` |

---

## 6. Control Modes

Robstride RS02 actuators support four operational control modes:

### 1. Position Mode (`run_mode = 1`, Param `0x7005`)
- **Target Parameter:** `pos_ref` (Param `0x7016`, single precision float in radians).
- **Cascaded Loop Architecture:**
  $$\text{Position Error } e_p = p_{\text{ref}} - p \implies \dot{p}_{\text{ref}} = K_{p,\text{pos}} \cdot e_p$$
  $$\text{Velocity Loop } I_{q,\text{ref}} = K_{p,\text{vel}} e_v + K_{i,\text{vel}} \int e_v dt + K_{d,\text{vel}} \frac{d e_v}{dt}$$
- **Characteristics:** Provides high holding stiffness and trajectory tracking accuracy. Ideal for point-to-point motion and Cartesian trajectory following.

### 2. Velocity Mode (`run_mode = 2`, Param `0x7005`)
- **Target Parameter:** `spd_ref` (Param `0x700A`, single precision float in rad/s).
- **Control Architecture:** Bypasses position loop; feeds speed reference directly into the velocity PID controller to generate quadrature current $I_q$.
- **Characteristics:** Continuous rotation and velocity tracking. Does not regulate angle or hold stationary position against external loads.

### 3. Current / Torque Mode (`run_mode = 3`, Param `0x7005`)
- **Target Parameter:** `iq_ref` (Param `0x7006`, single precision float in Amperes).
- **Control Architecture:** Direct command to FOC current regulator ($I_q$). Output torque is proportional: $\tau = K_t \cdot I_q$.
- **Characteristics:** Zero position or velocity feedback. Motor will accelerate freely to maximum speed limit if unconstrained.
- **Safety Precaution:** Always set conservative current limits via `set_current_limit` (e.g., 2.0A) before switching into Current Mode.

### 4. MIT Mode (Comm Type `0x01`)
- **Protocol:** Special 8-byte CAN frame containing five packed state variables:
  $$\tau_{\text{cmd}} = K_p (p_{\text{des}} - p) + K_d (v_{\text{des}} - v) + \tau_{\text{ff}}$$
- **Parameters Packed:**
  - Desired Position $p_{\text{des}} \in [-12.5, 12.5]\text{ rad}$ (16-bit)
  - Desired Velocity $v_{\text{des}} \in [-30.0, 30.0]\text{ rad/s}$ (12-bit)
  - Virtual Stiffness $K_p \in [0, 500]$ (12-bit)
  - Virtual Damping $K_d \in [0, 5]$ (12-bit)
  - Feedforward Torque $\tau_{\text{ff}} \in [-24.0, 24.0]\text{ Nm}$ (12-bit)
- **Characteristics:** Bypasses onboard trajectory generation. Executes high-rate impedance control directly on the DSP at up to 1 kHz. Ideal for dynamic walking, compliant interaction, and impedance control.

---

## 7. Parameter Reference Table

The following table lists all accessible RS02 motor parameters via Comm Type `0x11` (Read) and Comm Type `0x12` (Write).

| Parameter Name | Index (hex) | Index (dec) | Data Type | Units | Valid Range | Read/Write | Description |
|---|---|---|---|---|---|---|---|
| `run_mode` | `0x7005` | 28677 | `uint8` | — | 1, 2, 3 | R/W | 1 = Position, 2 = Velocity, 3 = Current |
| `spd_ref` | `0x700A` | 28682 | `single` | rad/s | [-30.0, 30.0] | R/W | Target velocity reference in Velocity Mode |
| `iq_ref` | `0x7006` | 28678 | `single` | A | [-23.0, 23.0] | R/W | Target quadrature current reference in Torque Mode |
| `pos_ref` | `0x7016` | 28694 | `single` | rad | [-12.5, 12.5] | R/W | Target position reference in Position Mode |
| `limit_cur` | `0x7018` | 28696 | `single` | A | [0.0, 23.0] | R/W | Maximum allowable phase current limit |
| `vel_limit` | `0x7017` | 28695 | `single` | rad/s | [0.0, 30.0] | R/W | Maximum allowable angular velocity limit |
| `torque_limit`| `0x701E` | 28702 | `single` | Nm | [0.0, 24.0] | R/W | Maximum allowable torque limit |
| `pos_kp` | `0x7015` | 28693 | `single` | — | [0.0, 500.0] | R/W | Position loop proportional gain |
| `vel_kp` | `0x701A` | 28698 | `single` | — | [0.0, 50.0] | R/W | Velocity loop proportional gain |
| `vel_ki` | `0x701B` | 28699 | `single` | — | [0.0, 10.0] | R/W | Velocity loop integral gain |
| `vel_kd` | `0x701C` | 28700 | `single` | — | [0.0, 5.0] | R/W | Velocity loop derivative gain |
| `voltage` | `0x7001` | 28673 | `single` | V | [0.0, 60.0] | R | Measured DC bus supply voltage |
| `temperature`| `0x7002` | 28674 | `single` | °C | [-40.0, 120.0] | R | Internal motor MOSFET/stator temperature |
| `position` | `0x7003` | 28675 | `single` | rad | [-\infty, \infty] | R | Measured mechanical rotor angle |
| `velocity` | `0x7004` | 28676 | `single` | rad/s | [-30.0, 30.0] | R | Measured rotor angular velocity |
| `fault` | `0x7006` | 28678 | `single`/`uint8` | — | Byte codes | R | Status/fault indicator. When read via 0x11, byte value `mod(abs(val), 256)` gives status/fault code |
| `current` | `0x7008` | 28680 | `single` | A | [-23.0, 23.0] | R | Measured active quadrature current ($I_q$) |
| `CAN_TIMEOUT` | `0x200C` | 8204 | `uint32` | ms | [0, 65535] | R/W | Communication loss watchdog timer (0 = disabled) |

> [!NOTE]
> Parameter `0x7006` dual-use: When written via Comm Type `0x12`, it commands `iq_ref` (target torque current). When read via Comm Type `0x11`, the returned IEEE 754 float payload represents the motor status/fault byte encoded in the lowest 8 bits.

---

## 8. Telemetry System

### Polling Architecture
`ArmControl` implements a background MATLAB timer object (`read_timer`) configured for `fixedRate` execution at 20 Hz (50 ms cycle time).
In each timer period, `poll_once` executes the following query pipeline:
1. Sequentially transmits Comm Type `0x11` read requests for both Motor 1 and Motor 2 across 6 target parameters:
   - Position (`0x7003`)
   - Velocity (`0x7004`)
   - Current (`0x7008`)
   - Voltage (`0x7001`)
   - Temperature (`0x7002`)
   - Fault Status (`0x7006`)
2. Reads 16-byte response frames from the serial buffer.
3. Validates frame markers (`0x41 0x54` and `0x0D 0x0A`).
4. Extracts and unpacks the 4-byte IEEE 754 single-precision float (`typecast(..., 'single')`).
5. Updates internal `Telemetry` structure and evaluates fault byte codes.

### Telemetry Data Structure
The real-time telemetry state is accessible via `arm.Telemetry.m1` and `arm.Telemetry.m2`:
```matlab
struct with fields:
       position: 0.2450    % radians
       velocity: 0.0012    % rad/s
        current: 0.4500    % Amperes (Iq)
        voltage: 48.1200   % Volts DC
    temperature: 34.5000   % degrees Celsius
     fault_code: 0         % uint8 (0 = OK, 24/44 = normal status)
      fault_str: 'OK'      % char ('OK', 'Overcurrent', etc.)
      timestamp: 7.3987e+05% MATLAB serial datenum
```

### Latency & Error Handling
- **Query Latency:** At 921,600 baud, transmitting and receiving all 12 parameter packets requires approximately 18–24 ms round-trip time, well within the 50 ms (20 Hz) execution window.
- **Packet Drop Resilience:** The telemetry routine is encapsulated in `try/catch` blocks. If serial bytes are dropped or incomplete, the cycle silently aborts without throwing errors or halting the background timer, preserving continuous operation.

---

## 9. Live Dashboard (ArmMonitor)

`ArmMonitor` provides a real-time dark-theme GUI constructed using base MATLAB `uifigure` and `uigridlayout`.

### Launching the Dashboard
```matlab
monitor = ArmMonitor(arm);
```

### Interface Layout
The dashboard is arranged in a 3-row, 4-column responsive grid:
```text
+----------------------------------------------------------------------------------------------------+
| HEADER: ARM MONITOR                  | [RE-ENABLE] (Green)          | [E-STOP] (Red)               |
+-------------------+-------------------+------------------------------------+-----------------------+
| MOTOR 1 (Base)    | MOTOR 2 (Fore)    | 2-LINK KINEMATICS VISUALIZATION    | PID TUNING PANEL      |
| Position: [rad/deg| Position: [rad/deg|                                    | Target Motor: [M1/M2] |
| Velocity: rad/s   | Velocity: rad/s   |   * Workspace Boundary (R=700mm)   | Pos Kp: [  35.0 ]     |
| Current:  A       | Current:  A       |   * Link 1 (400mm, White)          | Vel Kp: [   2.5 ]     |
| Voltage:  V       | Voltage:  V       |   * Link 2 (300mm, Blue)           | Vel Ki: [   0.05]     |
| Temp:     °C      | Temp:     °C      |   * End-Effector Marker (Orange)   | Vel Kd: [   0.02]     |
| Fault:    OK      | Fault:    OK      |                                    | [Read M1]  [Write M1] |
|                   |                   |                                    | [Read M2]  [Write M2] |
+-------------------+-------------------+------------------------------------+-----------------------+
| CONTROL BAR: Unit: [deg/rad] | M1 Angle [Send] | M2 Angle [Send] | Mode: [Position/Velocity/Current] |
+----------------------------------------------------------------------------------------------------+
```

### Visual Warning Thresholds
Telemetry values change color dynamically to provide instant visual diagnostics:
| Metric | Normal (White) | Warning (Yellow) | Critical (Red Highlight) |
|---|---|---|---|
| **Phase Current ($I_q$)** | $\le 3.0\text{ A}$ | $3.0\text{ A} < I_q \le 4.5\text{ A}$ | $> 4.5\text{ A}$ |
| **Temperature** | $\le 60.0^\circ\text{C}$ | $60.0^\circ\text{C} < T \le 80.0^\circ\text{C}$ | $> 80.0^\circ\text{C}$ |
| **Fault Status** | `'OK'` (0x00, 0x18, 0x2C) | — | Non-zero fault code (Red card background) |

### Emergency Stop (E-STOP) & Recovery (RE-ENABLE)
- **E-STOP (Red Button):** Instantly and synchronously sends Comm Type `0x04` to both Motor 1 and Motor 2, disabling inverter stages and dropping phase currents to zero immediately.
- **RE-ENABLE (Green Button):** Re-establishes serial communication if needed, clears timeouts, applies selected control mode, enables motor power stages, clamps current limit to 5.0A, and resumes 20 Hz background telemetry polling. Allows seamless recovery from E-STOP without restarting MATLAB.

### PID Tuning Workflow in ArmMonitor
1. **Read Active Gains:** Click **Read M1** or **Read M2**. The system polls parameters `0x7015`, `0x701A`, `0x701B`, and `0x701C` and populates the numeric fields.
2. **Modify Gains:** Type updated gain values into the corresponding numeric input boxes.
3. **Commit to Motor:** Click **Write M1** or **Write M2** to flash parameters to the active motor RAM.

### Control Bar Operations
- **Unit Selector (`deg` / `rad`):** Choose whether joint commands are entered in degrees (`°`) or radians (`rad`). Labels and internal conversions update dynamically.
  - When `deg` is selected: Entering `60` commands $60^\circ$ ($1.047\text{ rad}$).
  - When `rad` is selected: Entering `1.0` commands $1.0\text{ rad}$ ($57.3^\circ$).
- **Joint Angle Command:** Enter target angle for Motor 1 or Motor 2 and click **Send**. `ArmControl.set_target_position` verifies joint limits ($[-\pi, +\pi]$ rad or $[-180^\circ, +180^\circ]$) before transmission.
- **Mode Switching:** Select `Position`, `Velocity`, or `Current` from dropdown menu to switch operating modes on both motors simultaneously.

---

## 10. PID Tuning Workflow

Robstride motors utilize a nested dual-loop control architecture: an outer position loop feeding into an inner velocity PID loop.

```text
Target Pos (rad)        Pos Loop                Velocity Loop                   Motor
  pos_ref ---->(+)----> [ pos_kp ] ---->(+)----> [ vel_kp + vel_ki/s + vel_kd*s ] ----> Current Iq
                ^ -                       ^ -
                |                         |
           Actual Pos                Actual Vel
```

### Step-by-Step Tuning Procedure
1. **Read Existing Gains:** Query factory defaults via `pid = arm.read_pid(1);`.
2. **Execute Step Test:** Use `ArmTuner` to apply a controlled 0.5 rad step input:
   ```matlab
   tuner = ArmTuner(arm, 1);
   tuner.step_test(0.5, 3.0);
   ```
3. **Analyze Response:** Plot recorded trajectory using `tuner.plot_step_response();`.
4. **Extract Metrics:** Run `metrics = tuner.compute_metrics();` to calculate:
   - Rise Time (10% to 90% threshold)
   - Peak Overshoot Percentage
   - Settling Time (within 2% steady-state error band)
   - Steady-State Tracking Error
5. **Evaluate Heuristic Suggestions:** Run `tuner.autotune_suggestion();`.
6. **Iterate Gain Adjustments:** Apply incremental updates based on observed symptoms.
7. **Write and Verify:** Commit new gains via `arm.set_pos_kp(...)` and re-run step test.

> [!CAUTION]
> **Tuning Safety Constraints:**
> - Never increase any gain by more than **20% to 30%** in a single adjustment.
> - Ensure current limit is clamped to **5.0A** during tuning to protect motor windings from sustained saturation.
> - Maintain clear physical space around the arm linkage.

### Diagnostic Tuning Matrix
| Observed Symptom | Primary Root Cause | Corrective Gain Adjustment |
|---|---|---|
| **Sluggish rise time ($> 0.5\text{ s}$)** | Low position loop proportional gain | Increase `pos_kp` by +20% |
| **Severe overshoot ($> 15\%$)** | Insufficient velocity loop damping | Increase `vel_kd` by +30% or reduce `pos_kp` by -15% |
| **High-frequency chatter / acoustic buzz** | Excessive derivative or proportional gain | Decrease `vel_kd` by -25% and reduce `vel_kp` by -20% |
| **Steady-state sag under gravity** | Insufficient velocity integral action | Increase `vel_ki` by +20% (start from small base e.g., 0.02) |
| **Extended oscillation / ringing** | Low damping ratio in velocity loop | Increase `vel_kd` by +20% |
| **Motor feels loose / low stiffness** | Low velocity proportional gain | Increase `vel_kp` by +15% |

---

## 11. ArmTuner Guide

`ArmTuner` is an automated test generation and metric analysis class for systematic actuator characterization.

### Instantiation
```matlab
tuner = ArmTuner(arm, 1);  % Characterize Motor 1 (Base Joint)
% or
tuner = ArmTuner(arm, 2);  % Characterize Motor 2 (Fore Joint)
```

### 1. Step Response Test
Commands an instantaneous displacement to assess transient response:
```matlab
tuner.step_test(0.5, 3.0); % Move 0.5 rad, record for 3.0 seconds at 50 Hz
```
- **Analysis:** Evaluates rise time, overshoot, and damping characteristics.

### 2. Sine Sweep Test
Applies a frequency-chirped sinusoidal trajectory to assess system bandwidth and mechanical resonances:
```matlab
tuner.sine_sweep(0.3, 0.5, 5.0); % Amplitude: 0.3 rad, Frequency: 0.5 Hz to 5.0 Hz
```
- **Analysis:** Identifies phase lag, mechanical link compliance, and resonance frequencies.

### 3. Constant Velocity Ramp Test
Drives the actuator at a constant angular rate to evaluate velocity tracking error and friction:
```matlab
tuner.ramp_test(0.5, 0.2); % Target: 0.5 rad at constant speed of 0.2 rad/s
```
- **Analysis:** Evaluates Coulomb friction, stiction, and steady-state velocity tracking fidelity.

### 4. Plotting Test Data
Generates a synchronized 3-subplot dark-theme performance chart:
```matlab
tuner.plot_step_response();
```
- **Subplot 1:** Position reference (dashed green) vs. measured position (solid blue).
- **Subplot 2:** Angular velocity response (orange).
- **Subplot 3:** Measured phase current $I_q$ (red) with 5.0A hardware limit threshold.

### 5. Quantitative Performance Metrics
```matlab
m = tuner.compute_metrics();
```
**Console Output Example:**
```text
--- Step Response Metrics (Motor 1) ---
  Rise time:      0.185 s
  Settling time:  0.420 s
  Overshoot:      6.8 %
  SS error:       0.0021 rad
----------------------------------------
```

### 6. Automated Heuristic Suggestions
```matlab
tuner.autotune_suggestion();
```
Analyzes measured metrics against dynamic performance criteria and provides specific recommendations for `pos_kp`, `vel_kp`, `vel_ki`, and `vel_kd`.

---

## 12. MIT Mode Deep Dive

MIT Mode (Comm Type `0x01`) is a real-time full-state control protocol originally designed for high-performance quadruped and biped actuators.

### When to Use MIT Mode
- Dynamic impedance and admittance control.
- Compliant interaction where external contact must yield smoothly.
- Real-time gravity compensation and inverse dynamics control loops.
- High-frequency trajectory streaming (up to 500 Hz–1 kHz).

### Packet Bit-Packing Architecture
MIT control transmits 8 raw bytes containing five compressed parameters:
```text
Byte 1: [ pos[15:8]                                             ]
Byte 2: [ pos[7:0]                                              ]
Byte 3: [ vel[11:4]                                             ]
Byte 4: [ vel[3:0] (4 bits)   | kp[11:8] (4 bits)               ]
Byte 5: [ kp[7:0]                                               ]
Byte 6: [ kd[11:4]                                              ]
Byte 7: [ kd[3:0] (4 bits)    | torque[11:8] (4 bits)           ]
Byte 8: [ torque[7:0]                                           ]
```

### Dynamic Ranges & Scaling Equations
| Parameter | Physical Range | Quantization | Scaling Formula |
|---|---|---|---|
| **Position ($p$)** | $[-12.5, 12.5]\text{ rad}$ | 16-bit unsigned (0 to 65535) | $p_{\text{int}} = \text{round}\left(\frac{p - (-12.5)}{25.0} \times 65535\right)$ |
| **Velocity ($v$)** | $[-30.0, 30.0]\text{ rad/s}$ | 12-bit unsigned (0 to 4095) | $v_{\text{int}} = \text{round}\left(\frac{v - (-30.0)}{60.0} \times 4095\right)$ |
| **Stiffness ($K_p$)** | $[0.0, 500.0]$ | 12-bit unsigned (0 to 4095) | $k_{\text{int}} = \text{round}\left(\frac{K_p - 0}{500.0} \times 4095\right)$ |
| **Damping ($K_d$)** | $[0.0, 5.0]$ | 12-bit unsigned (0 to 4095) | $d_{\text{int}} = \text{round}\left(\frac{K_d - 0}{5.0} \times 4095\right)$ |
| **Torque ($\tau$)** | $[-24.0, 24.0]\text{ Nm}$ | 12-bit unsigned (0 to 4095) | $t_{\text{int}} = \text{round}\left(\frac{\tau - (-24.0)}{48.0} \times 4095\right)$ |

### Example Usages

#### 1. Compliant Virtual Spring-Damper (Position Hold)
```matlab
% Hold position at 0.5 rad with stiffness Kp=100 and damping Kd=2.0
arm.mit_control(1, 0.5, 0.0, 100.0, 2.0, 0.0);
```

#### 2. Transparent Teaching Mode (Zero-Stiffness Virtual Damper)
```matlab
% Zero position stiffness, light damping (Kd=0.5), zero torque -> joint is backdrivable by hand
arm.mit_control(1, 0.0, 0.0, 0.0, 0.5, 0.0);
```

#### 3. Gravity Compensation + Virtual Stiffness
```matlab
% Apply feedforward gravity torque tau_g while maintaining soft compliance
tau_g = 2.4; % Computed feedforward gravity torque in Nm
arm.mit_control(1, target_angle, 0.0, 50.0, 1.5, tau_g);
```

> [!WARNING]
> MIT Mode directly bypasses the motor's internal position trajectory filter. Never command a large position discrepancy ($|p_{\text{des}} - p_{\text{meas}}| > 0.5\text{ rad}$) with high $K_p$ ($> 100$), as this generates maximum torque instantaneously.

---

## 13. Joint Limits & Safety

### Software Joint Limit Enforcement
`ArmControl` protects against mechanical collisions by defining joint angle limits in the `JOINT_LIMITS` property:
```matlab
% Default limits (radians)
arm.JOINT_LIMITS = struct('m1_min', -pi, 'm1_max', pi, ...
                          'm2_min', -pi, 'm2_max', pi);
```

### Custom Limit Configuration
Modify limits to match your specific physical arm installation:
```matlab
% Constrain Base Joint to +/- 90 degrees
arm.JOINT_LIMITS.m1_min = -pi/2;
arm.JOINT_LIMITS.m1_max =  pi/2;

% Constrain Fore Joint to +/- 120 degrees
arm.JOINT_LIMITS.m2_min = -deg2rad(120);
arm.JOINT_LIMITS.m2_max =  deg2rad(120);
```

### Pre-Transmission Guard
Every call to `set_target_position`, `set_target_angle`, `set_arm_angles`, or `move_to_xy` evaluates `check_joint_limit` **prior to packet generation**. If an angle violates bounds, an error is thrown immediately:
```text
Error using ArmControl/check_joint_limit
Motor 1 angle 1.850 rad outside limits [-1.571, 1.571]
```
No serial or CAN packet is transmitted, ensuring the physical motor never receives an illegal command.

### Workspace Reachability & Kinematic Singularities
For link lengths $L_1 = 400\text{ mm}$ and $L_2 = 300\text{ mm}$:
- **Maximum Reach ($R_{\text{max}}$):** $L_1 + L_2 = 700\text{ mm}$ (Full extension singularity).
- **Minimum Reach ($R_{\text{min}}$):** $|L_1 - L_2| = 100\text{ mm}$ (Full fold boundary).

In `inverse_kinematics(x, y)`:
$$D = \frac{x^2 + y^2 - L_1^2 - L_2^2}{2 L_1 L_2}$$
- **Reachable Condition:** $D \in [-1.0, 1.0]$.
- If $|D| > 1.0$, the coordinate $(X, Y)$ lies outside the reachable annulus. `inverse_kinematics` throws an descriptive exception before any motor movement is attempted.

---

## 14. Data Logging

`ArmControl` includes a real-time telemetry logging system for experiment recording, offline system identification, and performance analysis.

### Logging Workflow
```matlab
% 1. Start logging (clears previous buffer and activates recording)
arm.start_logging();

% 2. Perform test motion
arm.move_to_xy(350, 250);
pause(3.0);

% 3. Stop logging
arm.stop_logging();

% 4. Save to MAT file (defaults to arm_log_YYYYMMDD_HHMMSS.mat)
arm.save_log('step_test_run1.mat');
```

### Log Data Architecture
The recorded data is stored in `arm.log_data` as an array of structs:
```matlab
log_data(k).t       % Datetime serial timestamp (now())
log_data(k).m1      % Full telemetry struct snapshot for Motor 1
log_data(k).m2      % Full telemetry struct snapshot for Motor 2
```

### Loading and Plotting Logged Data
Use this standard post-processing script to inspect recorded trials:
```matlab
% Load saved dataset
load('step_test_run1.mat');

% Extract time relative to start (seconds)
t0 = log_data(1).t;
time_s = ([log_data.t] - t0) * 86400; % Convert serial days to seconds

% Extract joint positions, velocities, and currents
m1_pos = arrayfun(@(x) x.m1.position, log_data);
m2_pos = arrayfun(@(x) x.m2.position, log_data);
m1_vel = arrayfun(@(x) x.m1.velocity, log_data);
m2_vel = arrayfun(@(x) x.m2.velocity, log_data);
m1_cur = arrayfun(@(x) x.m1.current,  log_data);
m2_cur = arrayfun(@(x) x.m2.current,  log_data);

% Generate analysis plot
figure('Name', 'Arm Telemetry Log Analysis', 'Color', 'w');

subplot(3,1,1);
plot(time_s, rad2deg(m1_pos), 'b-', 'LineWidth', 1.5); hold on;
plot(time_s, rad2deg(m2_pos), 'r-', 'LineWidth', 1.5);
ylabel('Joint Angle (deg)'); legend({'Joint 1 (Base)', 'Joint 2 (Fore)'});
grid on; title('Recorded Trajectory');

subplot(3,1,2);
plot(time_s, m1_vel, 'b-', 'LineWidth', 1.5); hold on;
plot(time_s, m2_vel, 'r-', 'LineWidth', 1.5);
ylabel('Velocity (rad/s)'); grid on;

subplot(3,1,3);
plot(time_s, m1_cur, 'b-', 'LineWidth', 1.5); hold on;
plot(time_s, m2_cur, 'r-', 'LineWidth', 1.5);
yline(5.0, 'r--', 'Safety Clamp (5A)');
ylabel('Current (A)'); xlabel('Elapsed Time (s)'); grid on;
```

---

## 15. Fault Code Reference

When querying parameter `0x7006` or decoding feedback packets, the lower 8 bits represent the actuator status and error register.

| Code (hex) | Code (dec) | Category | Description | Recommended Corrective Action |
|---|---|---|---|---|
| `0x00` | 0 | Normal Status | Ready / Normal Standby | System healthy. Ready for motion commands. |
| `0x18` | 24 | Normal Status | Operating Status / Mode Active | Normal closed-loop status code. No action required. |
| `0x2C` | 44 | Normal Status | Motor Enabled / Inverter Running | Normal closed-loop operation indication. No action required. |
| `0x30` | 48 | Normal Status | CSP Mode Standby | Normal closed-loop operational state. No action required. |
| `0x32` | 50 | Normal Status | CSP Mode Active | Normal closed-loop operational state. No action required. |
| `0x36` | 54 | Normal Status | Closed-Loop Position / Holding Active | Normal operational status indicating FOC position control loop actively closed and holding. No action required. |
| `0x01` | 1 | Critical Fault | Overcurrent Fault | Peak phase current exceeded hardware trip point. Check for mechanical jamming, collisions, or excessively aggressive step inputs. |
| `0x02` | 2 | Critical Fault | Overvoltage Fault | Bus voltage exceeded 60V threshold. Usually caused by rapid deceleration dumping regenerative energy into supply. Add shunt regulator or reduce braking rate. |
| `0x03` | 3 | Critical Fault | Undervoltage Fault | Bus voltage dropped below operating threshold (< 18V). Check power supply connections, battery charge, or supply wire gauge. |
| `0x04` | 4 | Critical Fault | Overtemperature Fault | MOSFET driver or motor stator temperature exceeded 85°C. Power down immediately and allow system to cool. Verify continuous current is under 4A. |
| `0x05` | 5 | Critical Fault | Magnetic Encoder Fault | Magnetic sensor read error, calibration table corruption, or magnetic interference. Check sensor connector and recalibrate/reboot motor. |
| `0x06` | 6 | Critical Fault | Phase Loss Fault | Motor phase connection open or high resistance on U, V, or W winding lead. Inspect motor terminal connectors. |

---

## 16. Troubleshooting

### 1. Port Not Found or Access Denied
- **Symptom:** `Error opening port. Please check the COM port.`
- **Causes:**
  - Another process (e.g., Electron app, Python backend, Arduino IDE, or an open MATLAB session) holds the COM port lock.
  - Specified COM port string does not match Device Manager.
- **Solution:**
  1. Run `delete(serialportfind);` in MATLAB to release dangling handles.
  2. Close external terminal applications or Electron processes.
  3. Verify port in Windows Device Manager.

### 2. Motor Does Not Respond After Enable
- **Symptom:** Motor stays limp or fails to produce holding torque after `enable_motor`.
- **Causes:**
  - 24–60V DC power supply is switched off or disconnected.
  - Watchdog communication timeout has triggered.
  - CAN ID mismatch between MATLAB command and motor hardware.
- **Solution:**
  1. Verify bus voltage with a multimeter across the power terminals ($> 24\text{V}$).
  2. Ensure `arm.disable_timeout(motor_id)` is called before enabling.
  3. Verify CAN IDs by testing each motor individually on the bus.

### 3. Telemetry Stuck at Zero or Frozen
- **Symptom:** Dashboard numbers do not update, or all fields display 0.0.
- **Causes:**
  - Background telemetry timer was stopped or not started.
  - Serial baud rate mismatch (must be 921,600).
- **Solution:**
  1. Check timer status: `arm.read_timer.Running`.
  2. Restart polling: `arm.start_telemetry(20);`.
  3. Verify baud rate: `arm.s.BaudRate` must equal 921600.

### 4. E-STOP Not Responsive / Orphan Timers
- **Symptom:** UI hangs, or multiple timers flood the command line with errors after `Ctrl+C`.
- **Causes:** Terminating scripts via `Ctrl+C` leaves background timer objects running in the MATLAB workspace.
- **Solution:**
  ```matlab
  t = timerfindall;
  if ~isempty(t), stop(t); delete(t); end
  ```

### 5. Parser Returning NaN for Parameters
- **Symptom:** `read_pid` returns `NaN` for gains.
- **Causes:** Incoming serial response returned an unexpected parameter index or incomplete packet.
- **Solution:**
  1. Clear serial receive buffer: `flush(arm.s);`.
  2. Add small inter-query pauses when reading multiple parameters sequentially.

### 6. MATLAB Figure Not Opening
- **Symptom:** `run_arm_live` hangs or throws graphics server error.
- **Causes:** MATLAB was launched with `-nodesktop` or `-nodisplay` flags.
- **Solution:** Run MATLAB in standard desktop interactive graphical mode.

---

## 17. Changelog & Version History

### Version 1.0 (Initial Release)
- Base `ArmControl` handle class with raw serial-CAN packet encoding and decoding.
- Proprietary RobStride USB-to-CAN framing (`0x41 0x54` header, `0x0D 0x0A` tail, big-endian serial ID).
- Comm Types implemented: `0x02` (feedback), `0x03` (enable), `0x04` (disable), `0x12` (write single param).
- Basic 2-DOF planar forward kinematics and analytical elbow-up inverse kinematics.
- Position (`run_mode=1`) and Velocity (`run_mode=2`) operating modes.

### Version 1.1 (Telemetry & Live Visualization)
- Background asynchronous telemetry polling engine at 20 Hz using MATLAB `timer`.
- Comm Type `0x11` parameter query support (position, velocity, current, voltage, temperature, fault).
- Dedicated `ArmMonitor` UI dashboard built on `uifigure` and `uigridlayout`.
- Real-time 2D planar kinematics visualization with workspace boundary circle.
- Visual warning thresholds for overcurrent (>3A, >4.5A) and overtemperature (>60°C, >80°C).
- Synchronous emergency stop (E-STOP) button.

### Version 1.2 (Advanced Control & Tuning Suite)
- **PID Tuning Infrastructure:** Read and write support for position loop (`0x7015`) and velocity loop (`0x701A`, `0x701B`, `0x701C`) gains.
- **Integrated PID Panel:** Interactive gain readback, modification, and writing in `ArmMonitor`.
- **`ArmTuner` Suite:** Automated test generation including step response, constant velocity ramp, and dynamic sine sweeps.
- **Quantitative Metrics:** Automated calculation of rise time, settling time, overshoot percentage, and steady-state error.
- **MIT Mode (Comm Type `0x01`):** Full 8-byte packed impedance control protocol with stiffness and damping scaling.
- **Joint Limit Guards:** Pre-transmission range checks enforcing `JOINT_LIMITS` before packet generation.
- **Telemetry Data Logging:** In-memory recording, MAT-file serialization (`save_log`), and offline plotting workflows.
- **Bug Fixes:** Resolved serial handle cleanup in `disconnect()`, corrected fault byte decoding for normal status codes (`0x18`, `0x2C`), and added index validation in response parsing.
