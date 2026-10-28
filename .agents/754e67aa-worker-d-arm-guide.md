# Worker-D: MATLAB Control System User Guide

## Objective
Author a comprehensive, technically exhaustive user guide for the Robstride 2-DOF planar robotic arm MATLAB control system at `D:\PRJ\Robstride\matlab\Robstride_Arm_Guide.md`.

## Delivered Sections
1. **Overview**: System description (2x RS02 actuators, 400mm + 300mm planar links), 921600 baud serial-CAN AT framing protocol, file manifest, ASCII system architecture diagram.
2. **Hardware Setup**: Motor IDs (M1=0x01 base, M2=0x02 fore, Host=0xFD), link lengths (L1=400mm, L2=300mm), DC power (24-60V, 10A), CAN bus termination (120 Ohm), CH340 COM identification, single-motor addressing note.
3. **Software Setup**: MATLAB R2020b+ requirements, zero external toolbox dependencies, MATLAB search path addition, COM port configuration.
4. **Quick Start**: 5-step workflow from hardware hookup to running `run_arm_live`, telemetry startup, dashboard interaction, and safe shutdown.
5. **ArmControl API Reference**: Complete method table covering constructor, connect/disconnect, power stage enable/disable, mode setters, position/velocity/current setters, MIT mode, PID read/write, limits, telemetry polling, data logging, and FK/IK.
6. **Control Modes**: In-depth coverage of Position Mode (run_mode=1), Velocity Mode (run_mode=2), Current Mode (run_mode=3), and MIT Mode (Comm Type 0x01).
7. **Parameter Reference Table**: Complete specification table covering 18 parameters with hex index, dec index, types, units, valid ranges, and read/write characteristics.
8. **Telemetry System**: 20 Hz background timer polling architecture, Comm Type 0x11 queries, telemetry data structure fields, latency analysis, and packet drop recovery.
9. **Live Dashboard (ArmMonitor)**: UI layout (header, motor cards, 2D kinematics visualizer, PID tuning panel, control bar), visual warning thresholds (>3A, >4.5A, >60°C, >80°C), synchronous E-STOP, and control workflows.
10. **PID Tuning Workflow**: 7-step tuning methodology, cascaded loop architecture, safety constraints (max +30% gain step, 5A clamp), and diagnostic troubleshooting table (symptoms to cause to gain adjustment).
11. **ArmTuner Guide**: Class instantiation, step test, sine sweep, ramp test, 3-subplot dark visualization, automated metric extraction, and heuristic autotune recommendations.
12. **MIT Mode Deep Dive**: Dynamic impedance control, RS02 bit-packing schema (16-bit pos, 12-bit vel, 12-bit Kp, 12-bit Kd, 12-bit torque), dynamic ranges, and code recipes (spring-damper, transparent teaching, gravity comp).
13. **Joint Limits & Safety**: `JOINT_LIMITS` configuration, pre-transmission validation guards in `set_target_position`, workspace reachability annulus ($R \in [100, 700]\text{ mm}$), and E-STOP handling.
14. **Data Logging**: `start_logging`, `stop_logging`, `save_log`, log struct array schema, and MATLAB loading/plotting post-processing script.
15. **Fault Code Reference**: Full table of normal status codes (0x00, 0x18, 0x2C) and critical hardware error codes (0x01 through 0x06) with corrective recovery actions.
16. **Troubleshooting**: Solutions for port access issues, unresponsive motors, frozen telemetry, orphan background timers, parsing NaNs, and headless graphics errors.
17. **Changelog & Version History**: Documenting versions 1.0, 1.1, and 1.2 feature progression.

## Verification
- File written to `D:\PRJ\Robstride\matlab\Robstride_Arm_Guide.md` (741 lines, 42.2 KB).
- Read-back validation performed on lines 1–50 and 700–741.
