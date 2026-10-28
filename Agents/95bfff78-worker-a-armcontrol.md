# Worker-A: ArmControl.m Enhancements

## Task
Modify \D:\PRJ\Robstride\matlab\ArmControl.m\: PID tuning, limit setters, MIT mode, joint limits, data logging, bug fixes.

## Changes Applied
1. **Fix 1 (\disconnect\)**:
   - Replaced \clear obj.s\ with \delete(obj.s); obj.s = [];\ inside \if ~isempty(obj.s) && isvalid(obj.s)\.

2. **Fix 2 (\poll_once\ fault byte)**:
   - Replaced nested floating-point branch with \obj.Telemetry.m1.fault_code = uint8(mod(round(abs(val)), 256));\ for \m1\ and \m2\.

3. **Fix 3 (\parse_single_param_response\)**:
   - Signature: \[val, returned_index] = parse_single_param_response(obj, raw, expected_index)\.
   - Returns eturned_index = typecast(uint8(payload(1:2)), 'uint16')\.
   - If argin >= 3 && ~isempty(expected_index)\ and eturned_index ~= uint16(expected_index)\, returns \al = NaN\.
   - \poll_once\ updated to invoke \obj.parse_single_param_response(raw, param_idx)\.

4. **Properties**:
   - Added \JOINT_LIMITS = struct('m1_min', -pi, 'm1_max', pi, 'm2_min', -pi, 'm2_max', pi)\.
   - Added \logging_enabled = false\, \log_data\.
   - Constructor initialized \obj.log_data = struct('t',{},'m1',{},'m2',{});\.

5. **PID Setters & Read-back**:
   - \set_pos_kp(obj, motor_id, kp)\: param 0x7015 ('single').
   - \set_vel_kp(obj, motor_id, kp)\: param 0x701A ('single').
   - \set_vel_ki(obj, motor_id, ki)\: param 0x701B ('single').
   - \set_vel_kd(obj, motor_id, kd)\: param 0x701C ('single').
   - ead_pid(obj, motor_id)\: reads 0x7015, 0x701A, 0x701B, 0x701C into struct \kp_pos\, \kp_vel\, \ki_vel\, \kd_vel\.

6. **Limit Setters**:
   - \set_velocity_limit(obj, motor_id, vel_rad_s)\: param 0x7017 ('single').
   - \set_torque_limit(obj, motor_id, torque_nm)\: param 0x701E ('single').

7. **Mode Setter**:
   - \set_current_mode(obj, motor_id)\: param 0x7005 = 3 ('uint8').
   - \set_current_ref(obj, motor_id, current_a)\: param 0x7006 ('single').

8. **MIT Mode**:
   - \mit_control(obj, motor_id, pos_rad, vel_rad_s, kp, kd, torque_nm)\: Comm Type 0x01 packed 8-byte frame (16-bit pos, 12-bit vel, kp, kd, torque).

9. **Joint Limit Guard**:
   - Private method \check_joint_limit(obj, motor_id, angle_rad)\ in \methods (Access = private)\. Throws \ArmControl:JointLimit\ if angle out of bounds.
   - Enforced in \set_target_position\ before \write_param\.

10. **Data Logging**:
    - \start_logging(obj)\: resets \log_data\, sets \logging_enabled = true\.
    - \stop_logging(obj)\: sets \logging_enabled = false\.
    - \save_log(obj, filename)\: saves \log_data\ to MAT-file.
    - \poll_once\: appends \struct('t', now(), 'm1', obj.Telemetry.m1, 'm2', obj.Telemetry.m2)\ when \logging_enabled = true\.

## Verification
- MATLAB \checkcode\ run on \ArmControl.m\: 0 syntax errors.
- Unit verified in MATLAB:
  - Instantiation and properties check: PASSED.
  - Private method protection on \check_joint_limit\: PASSED.
  - Joint limit exception on out-of-range angle: PASSED.
  - Data logging start/stop toggle: PASSED.
  - Parameter response index validation and payload parsing: PASSED.
