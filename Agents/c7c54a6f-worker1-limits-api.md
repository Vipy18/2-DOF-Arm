# Worker-1: ArmControl Limits API Summary

## Task
Modify `D:\PRJ\Robstride\matlab\ArmControl.m` to add limits support:
1. `read_limits(obj, motor_id)`: Reads max speed (0x7017) and max current (0x7018).
2. `set_joint_limits(obj, motor_id, min_rad, max_rad)`: Dynamically updates software position limits in `obj.JOINT_LIMITS`.

## Implementation Details
- File: `D:\PRJ\Robstride\matlab\ArmControl.m`
- Added `read_limits` and `set_joint_limits` under Limit Setters block.
- Ran MATLAB `checkcode` - 0 new warnings/errors in added methods.
- Executed unit test instantiating `ArmControl` and verified dynamic update of `JOINT_LIMITS` for motor 1 and motor 2.
