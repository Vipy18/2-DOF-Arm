# Worker-IK Summary: 2-DOF Inverse Kinematics Input Panel & Zero-Down Coordinate Frame

## Scope
1. Implement 2-DOF Inverse Kinematics (IK) panel in `d:\PRJ\Robstride\matlab\ArmMonitor.m`.
2. Apply coordinate frame correction across `ArmControl.m` and `ArmMonitor.m` where motor zero position = arm pointing straight down along -Y.

## Completed Changes
1. `ArmControl.m`:
   - `forward_kinematics`: `x = L1*sin(th1) + L2*sin(th1+th2)`, `y = -L1*cos(th1) - L2*cos(th1+th2)`.
   - `inverse_kinematics`: added `+ pi/2` offset to `theta1`.
2. `ArmMonitor.m`:
   - Properties: added `ik_x_field`, `ik_y_field`, `ik_elbow_dropdown`, `ik_lbl_result`, `ik_lbl_status`, `ik_lbl_fk`, `h_ik_target`, `h_ik_ghost1`, `h_ik_ghost2`, `ik_preview_chk`.
   - Layout: `viz_grid` changed to `[2, 1]` with `RowHeight = {'1x', 130}` and `RowSpacing = 6`. Embedded `build_ik_panel(viz_grid)`.
   - `build_ui`: initial link and joint markers set pointing straight down at `(0, -L1)` and `(0, -(L1+L2))`.
   - `redraw_arm`: elbow at `(l1*sin(th1), -l1*cos(th1))`, EE at `(elbow_x + l2*sin(th1+th2), elbow_y - l2*cos(th1+th2))`.
   - `solve_ik_preview` & `solve_and_send_ik`: `th1 = atan2(y, x) - atan2(...) + pi/2`. Supports 'Elbow Up' (default) and 'Elbow Down'.
   - `update_ik_fk_readback`: updated FK formulas with `sin/cos` down-frame.
   - `draw_ik_ghost`: dashed ghost arm elbow at `(L1*sin(th1), -L1*cos(th1))`.

## Verification
- ASCII purity: 0 non-ASCII bytes across all modified files.
- MATLAB `checkcode`: `ARMCONTROL_CLEAN`, `ARMMONITOR_CLEAN` (0 warnings, 0 errors).
- Unit tests: Target `(0, -700)` mm maps to `th1 = 0.000 rad (0.0 deg), th2 = 0.000 rad (0.0 deg)`.
