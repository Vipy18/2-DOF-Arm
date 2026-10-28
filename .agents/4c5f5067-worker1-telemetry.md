# Worker-1: Live Telemetry Implementation for ArmControl.m

## Overview
Modified `D:\PRJ\Robstride\matlab\ArmControl.m` to incorporate real-time motor telemetry acquisition via Robstride CAN protocol.

## Changes Applied
1. **Properties Added**:
   - `Telemetry`: Nested struct tracking `m1` and `m2` parameters (position, velocity, current, voltage, temperature, fault_code, fault_str, timestamp).
   - `poll_rate_hz = 20`: Configured default polling rate.
   - `read_timer`: MATLAB timer reference.

2. **Constructor Initialization**:
   - Initialized default state structures for `obj.Telemetry.m1` and `obj.Telemetry.m2`.

3. **Methods Added**:
   - `send_read_param(obj, motor_id, index)`: Formats and dispatches Comm Type 0x11 READ requests.
   - `response = read_param_response(obj)`: Reads up to 500 available bytes from serial port.
   - `val = parse_single_param_response(obj, raw)`: Validates 17-byte Robstride serial frame header `[0x41 0x54]`, unpacks payload bytes 5-8 as single float.
   - `poll_once(obj)`: Iterates across motors 1 and 2, reading parameter indices 0x7001, 0x7002, 0x7003, 0x7004, 0x7006, 0x7008, decodes fault status, updates timestamps; encapsulated in error-tolerant try/catch.
   - `start_telemetry(obj, rate_hz)`: Spawns fixed-rate MATLAB timer targeting `poll_once`.
   - `stop_telemetry(obj)`: Safely halts and deletes timer object.
   - `fault_str = decode_fault(obj, fault_byte)`: Resolves fault codes (overcurrent, overvoltage, undervoltage, overtemperature, encoder fault, phase loss) with whitelist for normal status bytes (0x00, 0x18, 0x2C).
