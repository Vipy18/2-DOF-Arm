# Robstride 2-DOF Robotic Arm Control GUI — User Manual & Operator's Run Guide

**Document Version:** 1.0.0  
**Application:** Robstride 2-DOF Arm Control GUI (`ArmControlApp`)  
**Target Hardware:** Robstride RS02 Brushless Direct-Drive Actuators  
**Host Environment:** Windows / Linux / macOS (Electron 28 + Vite 5 + React 18 + TypeScript + TailwindCSS)  

---

## Table of Contents
1. [System Overview & Architecture](#1-system-overview--architecture)
2. [Hardware Setup & Wiring](#2-hardware-setup--wiring)
3. [Software Installation & Startup](#3-software-installation--startup)
4. [Application Navigation & Layout](#4-application-navigation--layout)
5. [Page-by-Page Operator's Guide](#5-page-by-page-operators-guide)
   - [5.1 Dashboard (Live Telemetry & Link Management)](#51-dashboard-live-telemetry--link-management)
   - [5.2 Control (Interactive Drag Inverse Kinematics)](#52-control-interactive-drag-inverse-kinematics)
   - [5.3 Program (Teach & Playback Sequencer)](#53-program-teach--playback-sequencer)
   - [5.4 Motor Studio (Low-Level Tuning & Configuration)](#54-motor-studio-low-level-tuning--configuration)
6. [Integrated Safety System](#6-integrated-safety-system)
   - [6.1 Spacebar Emergency Stop (E-STOP)](#61-spacebar-emergency-stop-e-stop)
   - [6.2 Joint Limit Guard & Singularity Prevention](#62-joint-limit-guard--singularity-prevention)
   - [6.3 Automatic Thermal Throttling (>55°C)](#63-automatic-thermal-throttling-55c)
   - [6.4 Connection Loss Watchdog (Connection Guard)](#64-connection-loss-watchdog-connection-guard)
7. [Keyboard Shortcuts & Hotkeys](#7-keyboard-shortcuts--hotkeys)
8. [Robstride CAN Protocol Reference](#8-robstride-can-protocol-reference)
9. [Troubleshooting & Diagnostic FAQ](#9-troubleshooting--diagnostic-faq)

---

## 1. System Overview & Architecture

The Robstride 2-DOF Arm Control GUI is a high-performance, real-time desktop application engineered to control, configure, and monitor a 2-Degree-of-Freedom planar robotic arm powered by two **Robstride RS02** smart actuators.

```
+-----------------------------------------------------------------------+
|                       ELECTRON DESKTOP CLIENT                         |
|                                                                       |
|   +---------------------------------------------------------------+   |
|   |                      REACT RENDERER UI                        |   |
|   |  [ Dashboard ]  [ Control (IK) ]  [ Program ]  [ Motor Studio]|   |
|   |  • 50Hz Realtime Telemetry   • Teach & Playback Sequencer     |   |
|   |  • 2-Link Geometric IK       • Thermal Watchdog & Safety Bar  |   |
|   +---------------------------------------------------------------+   |
|                                  |                                    |
|                       IPC Bridge (Preload API)                        |
|                                  |                                    |
|   +---------------------------------------------------------------+   |
|   |                     MAIN PROCESS & CAN BRIDGE                 |   |
|   |  • Serial Driver (921600 Baud)  • 17-byte AT Framing Engine   |   |
|   |  • Config Persistence           • Atomic Multi-Motor E-STOP   |   |
|   +---------------------------------------------------------------+   |
+-----------------------------------|-----------------------------------+
                                    | USB Virtual COM Port
                                    v
            +-----------------------------------------------+
            |          Robstride USB-to-CAN Adapter         |
            +-----------------------------------------------+
                                    | CAN_H / CAN_L (1 Mbps)
                +-------------------+-------------------+
                |                                       |
                v                                       v
    +-----------------------+               +-----------------------+
    |  Motor 1 (Base/Link 1)|               |  Motor 2 (Elbow/Link 2|
    |  CAN Node ID: 0x01    |               |  CAN Node ID: 0x02    |
    |  Link Length: L1=0.4m |               |  Link Length: L2=0.3m |
    +-----------------------+               +-----------------------+
```

---

## 2. Hardware Setup & Wiring

### 2.1 Hardware Requirements
- **1x Robstride USB-to-CAN Adapter** (CH340 / CP210x / FTDI serial interface).
- **2x Robstride RS02 Actuators** (or compatible CyberGear-protocol smart motors).
- **1x DC Power Supply** (24V – 48V DC, rated for at least 10A continuous).
- **1x 2-DOF Planar Arm Rig** (Nominal link dimensions: $L_1 = 0.40\,\text{m}$, $L_2 = 0.30\,\text{m}$).
- **1x 120Ω CAN Bus Termination Resistor** at each bus termination end.

### 2.2 Bus Addressing & Configuration
Both motors share the **same physical CAN bus pair** connected to the single USB-CAN adapter:
- **Motor 1 (Base / Shoulder Joint):** CAN ID = `0x01`
- **Motor 2 (Elbow / Forearm Joint):** CAN ID = `0x02`
- **Host Controller Node ID:** `0xFD` (253)
- **Serial Baud Rate:** `921600` bps (8 data bits, 1 stop bit, no parity)

### 2.3 Physical Wiring Diagram

```
[DC Power Supply: 24-48V] ═══════╦═══════════════════════════════╗
   (+) Positive ─────────────────╫───────────(+) VCC             ║
   (-) Ground   ─────────────────╨───┬───────(-) GND             ║
                                     │                           ║
[Host Computer]                      │                           ║
      │ USB Cable                    │                           ║
      v                              │                           ║
[USB-CAN Adapter]                    │                           ║
   CAN_H ────────────────────────────┼──────── CAN_H (Pin 1) ────╫─── CAN_H (Pin 1) ───[ 120Ω ]
   CAN_L ────────────────────────────┼──────── CAN_L (Pin 2) ────╫─── CAN_L (Pin 2) ───[ Resistor ]
   GND   ────────────────────────────┘         (+) VCC ──────────╝
                                               (-) GND
                                      [ MOTOR 1: BASE (0x01) ]   [ MOTOR 2: ELBOW (0x02) ]
```

> [!IMPORTANT]
> - Ensure a common ground between the USB-CAN adapter, DC power supply, and both motors.
> - Verify that CAN bus termination resistors (120Ω) are installed across `CAN_H` and `CAN_L` to prevent packet reflection and frame loss at 1 Mbps CAN speeds.

---

## 3. Software Installation & Startup

### 3.1 Prerequisites
- **Operating System:** Windows 10/11, macOS 12+, or Ubuntu 20.04+.
- **Node.js:** v18.16.0 or higher.
- **Package Manager:** `npm` (v9+) or `pnpm`.

### 3.2 Running the Application (Development Mode)
Open PowerShell or your preferred terminal and execute:

```powershell
# 1. Navigate to the project root
cd D:\PRJ\Robstride\ArmControlApp

# 2. Install dependencies (first time only)
npm install

# 3. Launch the Electron + Vite development application
npm run dev
```

The application window will initialize at `1400x900` resolution with dark glass styling.

### 3.3 Production Build & Verification
To test TypeScript compilation and package the standalone binary:

```powershell
# Type check all source code (Node main process + Web renderer)
npm run typecheck

# Build the production artifacts
npm run build
```

The compiled bundles will be output to:
- `out/main/main.js` (Main IPC & Serial Process)
- `out/preload/index.js` (Secure Preload Context Bridge)
- `out/renderer/` (Static Web Distribution)

---

## 4. Application Navigation & Layout

The user interface follows an industrial glass-morphism aesthetic designed for dark environments (`#131318` base palette).

```
+----------------------------------------------------------------------------------------------------+
| [APP ICON]  ROBSTRIDE 2-DOF ARM CONTROL                   [E-STOP: IDLE] [TEMP: 32.4°C] [CAN OK]   | <- Top Safety Bar
+-----------+----------------------------------------------------------------------------------------+
|           |                                                                                        |
| Dashboard |                                                                                        |
|   (F1)    |                                                                                        |
|           |                                                                                        |
| Control   |                                                                                        |
|   (F2)    |                                ACTIVE PAGE VIEW AREA                                   |
|           |                                                                                        |
| Program   |                                                                                        |
|   (F3)    |                                                                                        |
|           |                                                                                        |
|  Studio   |                                                                                        |
|   (F4)    |                                                                                        |
|           |                                                                                        |
+-----------+----------------------------------------------------------------------------------------+
| Status: CONNECTED | COM3 @ 921600 Baud                                             Robstride RS02  | <- Bottom Status
+----------------------------------------------------------------------------------------------------+
```

### 4.1 Primary Elements
- **Global Top Safety Bar:** Always mounted across all views. Displays the active E-STOP toggle, real-time peak motor temperature, CAN bus health status badge, and global emergency indicators.
- **Collapsible Sidebar Navigation:** Instant access to the four functional modules via mouse click or hotkeys (`F1`–`F4`).
- **Floating Toast Notification Center:** Provides feedback on hardware writes, parameter downloads, flash commits, and safety events.

---

## 5. Page-by-Page Operator's Guide

### 5.1 Dashboard (Live Telemetry & Link Management)
*Hotkey:* `F1`

The Dashboard serves as the primary system telemetry hub and hardware connection manager.

```
+-----------------------------------------------------------------------------------------------+
|  [EE: X: 0.450m  Y: 0.250m]    [θ: θ1: 25.4°  θ2: 45.2°]                                      |
|                                                                                               |
|                                 2-DOF PLANAR ARM CANVAS                                       |
|                                (Live FK Kinematics View)                                      |
|                                                                                               |
+-----------------------------------------------------------------------------------------------+
| [ MOTOR 1: BASE (0x01) ]       | [ MOTOR 2: ELBOW (0x02) ]       | [ SERIAL LINK ]            |
| Status: ENABLED   Temp: 34.2°C | Status: ENABLED   Temp: 36.1°C | Port: [ COM3 (CH340)    v] |
| Pos:  25.40°   Vel: 0.00 rad/s | Pos:  45.20°   Vel: 0.00 rad/s | Baud: 921600 (Fixed)       |
| Curr: 0.42 A   Torq: 0.12 Nm   | Curr: 0.58 A   Torq: 0.16 Nm   | [ REFRESH ] [ CONNECT ]    |
| [200-pt Realtime Sparkline]    | [200-pt Realtime Sparkline]    | Status: CONNECTED          |
+-----------------------------------------------------------------------------------------------+
```

#### Key Capabilities:
1. **Serial Connection Setup:**
   - Click the **Refresh** icon to scan for active COM ports.
   - Select your USB-CAN adapter from the dropdown list.
   - Click **CONNECT**. The system opens the port at `921600` baud, disables the motor CAN timeout watchdog (`0x200C = 0`), and launches the 50Hz feedback polling thread.
2. **Kinematics Readout:**
   - Real-time display of Cartesian End-Effector coordinates ($X, Y$ in meters) and joint angles ($\theta_1, \theta_2$ in degrees).
3. **Dual Motor Cards:**
   - Independent motor state monitors showing live Position, Velocity, Phase Current, Torque, Temperature, and Fault status.
   - 200-point historical sparkline chart showing telemetry trends.
   - Quick **ENABLE / DISABLE** toggle per motor.

---

### 5.2 Control (Interactive Drag Inverse Kinematics)
*Hotkey:* `F2`

The Control page allows intuitive, direct manipulation of the robotic arm via mouse dragging on the 2D planar workspace.

```
+----------------------------------------------------+------------------------------------------+
| INTERACTIVE IK | MODE: POSITION | LIVE SEND [ ON ] |  END EFFECTOR                            |
+----------------------------------------------------+  X AXIS: 0.420 m    Y AXIS: 0.280 m      |
|                                                    +------------------------------------------+
|                  (Workspace Outer Arc R=0.70m)     |  JOINT ANGLES                            |
|                       .-------.                    |  θ1 (M1): 32.5° (0.567 rad)  [BASE]      |
|                    .-'         '-.                 |  θ2 (M2): 48.2° (0.841 rad)  [ELBOW]     |
|                  .'     [EE]      '.               +------------------------------------------+
|                 /        •          \              |  ELBOW CONFIGURATION                     |
|                ;          \          ;             |  [ ELBOW UP ]    [ (•) ELBOW DOWN ]      |
|                |    (Elbow)•         |             +------------------------------------------+
|                ;          /          ;             |  MOVE SPEED (FRACTION / MAX)             |
|                 \   (Base)•         /              |  [====---------] 30% (1.5 rad/s)         |
|                  '.               .'               +------------------------------------------+
|                    '-.         .-'                 |  STATUS: [ IN WORKSPACE (GREEN) ]        |
|                  (Inner Arc R=0.10m)               +------------------------------------------+
|                                                    |  [ SEND TO ROBOT ]    [ HOME (0,0) ]     |
+----------------------------------------------------+------------------------------------------+
```

#### How to Operate:
1. **Drag-to-Aim:** Click and drag the white/cyan End-Effector handle on the workspace canvas. The Inverse Kinematics engine calculates required joint angles in real time with 20ms throttling.
2. **Elbow Configuration Switch:**
   - **Elbow Down:** Solution where $\theta_2 > 0$ (default configuration).
   - **Elbow Up:** Solution where $\theta_2 < 0$ (overhead reach configuration).
3. **Live Send Toggle:**
   - **LIVE SEND ON:** Hardware motors track the drag cursor continuously in real time.
   - **LIVE SEND OFF:** Arm angles update visually; commands are only dispatched when the mouse is released or when clicking **SEND TO ROBOT**.
4. **Workspace Boundary Indicators:**
   - **IN WORKSPACE (Green):** Target coordinate is within physical reach ($0.10\,\text{m} \le R \le 0.70\,\text{m}$).
   - **OUT OF REACH (Red):** Point is outside reachable circle ($R > L_1 + L_2$ or $R < |L_1 - L_2|$); command transmission is locked out.
   - **NEAR SINGULARITY (Amber):** Arm is approaching full extension ($|\theta_2| < 5^\circ$); velocities are gently damped.
5. **Home Button:** Instantly commands both motors to reference zero position ($\theta_1 = 0^\circ, \theta_2 = 0^\circ$).

---

### 5.3 Program (Teach & Playback Sequencer)
*Hotkey:* `F3`

The Program module allows operators to teach points, construct multi-step motion sequences, edit trajectory parameters inline, simulate motions, and execute automated cycles.

```
+-----------------------------------------------------------------------------------------------+
| [ + RECORD POINT ] [ > PLAY ] [ [] STOP ] [ CLEAR ]  | PROGRAM: [ PickAndPlace_V1 ] [SAVE][LOAD]
+------------------------------------------------------+----------------------------------------+
| STEP SEQUENCE (3 STEPS)              EST. TOTAL: 4.2s| 2-DOF KINEMATICS PREVIEW               |
+------------------------------------------------------+                                        |
| [::] #1  MOVE_J  ↓DOWN  X:0.350 Y:0.200  30%  500ms  |             (Live / Ghost)             |
|          [ SIM ]  [ RUN ]  [ EDIT ]  [ DEL ]         |                   •                    |
+------------------------------------------------------+                  / \                   |
| [::] #2  MOVE_J  ↓DOWN  X:0.500 Y:0.100  50%  200ms  |                 •   •                  |
|          [ SIM ]  [ RUN ]  [ EDIT ]  [ DEL ]         |                /                       |
+------------------------------------------------------+               •                        |
| [::] #3  MOVE_J  ↑UP    X:0.250 Y:0.400  20%  1000ms |  Joint 1 (θ1): 24.5°                   |
|          [ SIM ]  [ RUN ]  [ EDIT ]  [ DEL ]         |  Joint 2 (θ2): -38.2°                  |
+------------------------------------------------------+----------------------------------------+
| Status: IDLE | Sequence contains 3 steps             | Total Est Duration: 4.2s               |
+-----------------------------------------------------------------------------------------------+
```

#### Workflow & Instructions:
1. **Teaching Points:**
   - Jog the arm to the desired position in the **Control** page or physically backdrive it with motors disabled.
   - Click **RECORD POINT** in the top toolbar. The current joint angles, calculated end-effector coordinates, and active elbow configuration are appended to the sequence.
2. **Inline Step Editing:**
   - Click **EDIT** on any step row to open the Step Editor pane.
   - Modify Target $X/Y$, toggle between **Elbow Up / Elbow Down**, adjust speed fraction ($0.05$ to $1.0$), and set **Dwell Time** (time to pause at waypoint in milliseconds).
3. **Simulation vs. Execution:**
   - **SIM Button:** Displays a ghost arm preview trajectory on the preview canvas without moving physical hardware.
   - **RUN Button:** Executes only that specific step on the physical robot.
   - **PLAY (Top Toolbar):** Automatically executes the entire sequence from Step #1 to the end. The active step highlights in cyan.
4. **Saving & Loading Programs:**
   - Click **SAVE** (or press `Ctrl+S`) to persist the routine as a `.json` file.
   - Click **LOAD** to import previously authored JSON motion routines.

---

### 5.4 Motor Studio (Low-Level Tuning & Configuration)
*Hotkey:* `F4`

Motor Studio provides an engineering-grade interface for tuning internal PID loops, setting hardware current/velocity limits, manual multi-mode jogging, reading diagnostic fault registers, and burning parameters to non-volatile flash memory.

```
+-----------------------------------------------------------------------------------------------+
|  [ (•) MOTOR 1 (0x01) - BASE ]     [ MOTOR 2 (0x02) - ELBOW ]                                 |
+-----------------------------------------------------------------------------------------------+
| GENERAL                                                                                       |
|   Motor ID: 0x01 (Joint 1 Base)     Run Mode: [ Position (0) v]      Status: [ CONNECTED ]   |
+-----------------------------------------------------------------------------------------------+
| HARDWARE & SAFETY LIMITS                                                                      |
|   Max Speed (rad/s): [ 10.0 ] (0x7017)   Max Current (A): [ 5.0 ] (0x7018)                    |
|   Joint Limit Min:   [ -170.0° ]          Joint Limit Max: [ +170.0° ]                         |
+-----------------------------------------------------------------------------------------------+
| PID CONTROL GAINS                                                                             |
|   Pos Kp (0x7015): [ 30.000 ]            Vel Kp (0x700B): [ 0.050 ]                           |
|   Vel Ki (0x700C): [ 0.000 ]             Vel Kd (0x700D): [ 0.000 ]                           |
+-----------------------------------------------------------------------------------------------+
| DIRECT CONTROL TEST (MANUAL SEND)                                                             |
|   Pos Ref (rad):    [ 0.00 ] [ SEND ] (0x7016)                                                |
|   Speed Ref (rad/s):[ 0.00 ] [ SEND ] (0x700A)                                                |
|   Current Ref (A):  [ 0.00 ] [ SEND ] (0x7006)                                                |
+-----------------------------------------------------------------------------------------------+
| REALTIME FEEDBACK                                                                             |
|   POSITION: 0.00 deg    VELOCITY: 0.00 rad/s    CURRENT: 0.00 A    TORQUE: 0.00 Nm            |
|   [ TEMP: 28.0°C ]      [ FAULT: 0x00 (NORMAL) ]                   [ CAN_ERRORS: 0 ]          |
+-----------------------------------------------------------------------------------------------+
| [ READ ALL ]             [ WRITE ALL ]                                   [ SAVE TO FLASH ]    |
+-----------------------------------------------------------------------------------------------+
```

#### Parameter Index Reference Table:

| Parameter | Index (Hex) | Data Type | Default | Description |
|---|---|---|---|---|
| **Run Mode** | `0x7005` | `uint8` (`<B`) | 0 | 0: Position, 1: Current, 2: Velocity, 3: MIT |
| **Current Ref ($I_q$)** | `0x7006` | `float` (`<f`) | 0.0 A | Target phase current in Current Mode |
| **Speed Ref ($\omega$)** | `0x700A` | `float` (`<f`) | 0.0 rad/s | Target velocity in Velocity Mode |
| **Velocity Kp** | `0x700B` | `float` (`<f`) | 0.05 | Proportional gain for velocity loop |
| **Velocity Ki** | `0x700C` | `float` (`<f`) | 0.00 | Integral gain for velocity loop |
| **Velocity Kd** | `0x700D` | `float` (`<f`) | 0.00 | Derivative gain for velocity loop |
| **Position Kp** | `0x7015` | `float` (`<f`) | 30.0 | Proportional gain for position loop |
| **Position Ref ($\theta$)**| `0x7016` | `float` (`<f`) | 0.0 rad | Target position in Position Mode |
| **Max Speed Limit** | `0x7017` | `float` (`<f`) | 10.0 rad/s | Maximum allowable motor angular velocity |
| **Max Current Limit** | `0x7018` | `float` (`<f`) | 5.0 A | Maximum allowable motor phase current |
| **Save to Flash** | `0x200B` | `uint32` (`<I`)| 1 | Commits current RAM registers to motor flash |

> [!CAUTION]
> Always verify PID gains on a motor with zero mechanical load before attaching linkages. Unstable gain settings can cause rapid motor oscillation and high current spikes.

---

## 6. Integrated Safety System

The Robstride Arm Control application is architected with multiple interlocking hardware and software safety guards.

```
                                  +---------------------------------------+
                                  |           SAFETY SUPERVISOR           |
                                  +---------------------------------------+
                                                      |
         +--------------------+-----------------------+-----------------------+
         |                    |                       |                       |
         v                    v                       v                       v
+------------------+ +------------------+   +-------------------+   +--------------------+
|  SPACEBAR E-STOP | | JOINT LIMIT GAURD|   | THERMAL WATCHDOG  |   |  CONNECTION GUARD  |
| Atomic Type 4 to | | Angles bounded   |   | Auto-throttle to  |   | Disconnect detects |
| both M1 & M2     | | M1: ±170°        |   | 3.0A at >55°C     |   | immediate E-STOP   |
| Disables motors  | | M2: ±150°        |   | Restore at <45°C  |   | and alarms         |
+------------------+ +------------------+   +-------------------+   +--------------------+
```

### 6.1 Spacebar Emergency Stop (E-STOP)
- **Activation:** Press the **Spacebar** anywhere in the application (inhibited only when typing in text fields) or click the red **E-STOP** button in the Top Safety Bar.
- **Hardware Action:** The CAN bridge immediately transmits **Communication Type 4 (Disable Motor)** packets consecutively to **both Motor 1 (`0x01`) and Motor 2 (`0x02`)** in a single atomic transmission block.
- **UI State:** A full-screen safety overlay (`z-index: 9999`) appears, displaying `E-STOP ACTIVE`. All motion commands, drag sliders, and playback loops are strictly blocked.
- **Reset:** Press **Escape** or click **RESET EMERGENCY STOP** on the overlay once the physical hazard is resolved.

### 6.2 Joint Limit Guard & Singularity Prevention
- **Configurable Software Bounding:** Joint angles are strictly validated against limits defined in `config.json`:
  - **Motor 1 (Base):** Configurable range, default $[-170^\circ, +170^\circ]$ ($[-2.967\,\text{rad}, +2.967\,\text{rad}]$).
  - **Motor 2 (Elbow):** Configurable range, default $[-150^\circ, +150^\circ]$ ($[-2.618\,\text{rad}, +2.618\,\text{rad}]$).
- **Enforcement:** If an Inverse Kinematics calculation or manual input exceeds these bounds, the command is aborted before reaching the CAN bridge, and the joint display flashes red.
- **Singularity Warning:** If the elbow angle approaches $0^\circ$ ($|\theta_2| < 5^\circ$), a `NEAR SINGULARITY` warning appears to advise against high-speed radial excursions.

### 6.3 Automatic Thermal Throttling (>55°C)
- **Continuous Monitoring:** The thermal watchdog continuously reads the motor temperature field in the 50Hz telemetry frame.
- **Critical Threshold (>55°C):** If either motor exceeds $55^\circ\text{C}$:
  1. An alert banner slides down across the top of the window.
  2. The software automatically writes parameter `0x7018` (Max Current) down to **3.0A** to suppress thermal runaway while preserving holding torque.
- **Recovery (<45°C):** Once motor temperature cools below $45^\circ\text{C}$, the software automatically restores the configured maximum current (default **5.0A**).

### 6.4 Connection Loss Watchdog (Connection Guard)
- **Heartbeat Monitor:** If the serial port disconnects unexpectedly (e.g., USB unplugged or serial driver error):
  1. The software executes a best-effort atomic E-STOP routine.
  2. The UI enters safe fault mode with a persistent red toast banner: `Connection lost — motors disabled`.
  3. Program playback is automatically aborted.

---

## 7. Keyboard Shortcuts & Hotkeys

| Shortcut | Action | Description |
|---|---|---|
| <kbd>Space</kbd> | **Emergency Stop (E-STOP)** | Instantly halts and disables both motors via atomic Type 4 CAN packet. |
| <kbd>Esc</kbd> | **Clear E-STOP** | Dismisses safety overlay and restores command readiness. |
| <kbd>Ctrl</kbd> + <kbd>S</kbd> | **Save Program** | Triggers instant JSON export of current motion sequence. |
| <kbd>F1</kbd> | **Navigate to Dashboard** | Opens Telemetry & Connection management view. |
| <kbd>F2</kbd> | **Navigate to Control** | Opens Interactive Drag IK Workspace view. |
| <kbd>F3</kbd> | **Navigate to Program** | Opens Teach & Playback sequencer. |
| <kbd>F4</kbd> | **Navigate to Motor Studio** | Opens Low-Level Parameter Tuning & Flash utility. |

---

## 8. Robstride CAN Protocol Reference

All USB-CAN communication utilizes the standard 17-byte Robstride serial frame format at `921600` baud:

```
+------------+------------+-----------------------+-----+-----------------------+------------+------------+
| Header[0]  | Header[1]  | Serial ID (4 Bytes)   | DLC | Payload (8 Bytes)     | Tail[0]    | Tail[1]    |
| 0x41 ('A') | 0x54 ('T') | Big-Endian uint32     | 0x08| Little-Endian Data    | 0x0D ('\r')| 0x0A ('\n')|
+------------+------------+-----------------------+-----+-----------------------+------------+------------+
```

### 8.1 Serial ID Encoding Formula
$$\text{Serial ID} = \left(\text{CAN ID} \ll 3\right) \mid 0x04$$

Where the 29-bit CAN ID is composed of:
$$\text{CAN ID} = (\text{Comm Type} \ll 24) \mid (\text{Host ID} \ll 8) \mid \text{Motor ID}$$

### 8.2 Communication Types
- **Type 0x02:** Request Motor Feedback (Returns Pos, Vel, Torque, Temp, Fault).
- **Type 0x03:** Enable Motor (Energizes coils in configured Run Mode).
- **Type 0x04:** Stop / Disable Motor (De-energizes inverter bridge).
- **Type 0x11:** Read Single Parameter Index.
- **Type 0x12:** Write Single Parameter Index.

---

## 9. Troubleshooting & Diagnostic FAQ

### Q1: The serial port list is empty or fails to connect.
- **Solution:** 
  1. Ensure the USB-CAN adapter cable is securely plugged in.
  2. Verify that the CH340 / FTDI VCP drivers are installed in Windows Device Manager.
  3. Confirm that no other terminal application (e.g., PuTTY, Serial Plotter, Python script) is holding the COM port open.

### Q2: Motors are connected, but feedback reads 0° and motors do not move.
- **Solution:**
  1. Check 24V–48V DC power supply voltage and ground connections.
  2. Verify CAN termination (120Ω resistor across `CAN_H` and `CAN_L`).
  3. Ensure CAN IDs are configured as `0x01` for Motor 1 and `0x02` for Motor 2.

### Q3: When dragging in the Control tab, the arm doesn't move.
- **Solution:**
  1. Verify if **LIVE SEND** is toggled **ON** in the top bar of the Control tab. If OFF, click **SEND TO ROBOT** to transmit.
  2. Check if the target is **OUT OF REACH** (red indicator) or violating configured Joint Limits.
  3. Ensure E-STOP is not active in the top bar.

### Q4: A motor shows FAULT: 0x02 or 0x08.
- **Solution:**
  - `0x01`: Over-voltage fault (check power supply regenerative braking).
  - `0x02`: Under-voltage fault (check power supply voltage drop).
  - `0x04`: Over-current fault (reduce motion acceleration or verify mechanical linkages are free).
  - `0x08`: Over-temperature fault (allow motor to cool; thermal watchdog auto-throttles at >55°C).

---

*Manual maintained by Robstride Automation Engineering Group.*
