 % =========================================================================
% Script: run_arm_live.m
% Description: Top-level entry script for the 2-DOF Robstride robotic arm
%              system. Wires ArmControl and ArmMonitor together for live
%              CAN serial communication, telemetry, and UI visualization.
%
% Usage:
%   1. Connect Robstride USB-to-CAN adapter to PC.
%   2. Verify COM port setting (default: 'COM20', 921600 baud).
%   3. Run this script in MATLAB Command Window:
%          run_arm_live
%   4. Interact with the live ArmMonitor dashboard.
%   5. Close the ArmMonitor UI figure window to trigger clean shutdown.
%
% System Architecture:
%   - ArmControl: Serial CAN communication handler (Robstride 02 motors)
%   - ArmMonitor: Interactive uifigure live dashboard
%   - Motor 1 (ID = 1): Base joint (Link 1: 400 mm)
%   - Motor 2 (ID = 2): Fore joint (Link 2: 300 mm)
%
% Initialization Sequence (per motor):
%   1. disable_timeout   -> Disable comms timeout (param 0x200C)
%   2. set_position_mode -> Switch run mode to position control (param 0x7005)
%   3. enable_motor      -> Enable motor power stage (Comm type 0x03)
%   4. set_current_limit -> Set current limit to 5.0 A (param 0x7018)
% =========================================================================

%% 1. Clean any orphan timers and serial ports from previous runs
existing_timers = timerfindall;
if ~isempty(existing_timers)
    stop(existing_timers); 
    delete(existing_timers);
end

existing_ports = serialportfind;
if ~isempty(existing_ports)
    delete(existing_ports);
end

%% 2. Instantiate and connect
arm = ArmControl('COM20');  % change COM port here if different
is_connected = false;

try
    arm.connect();
    is_connected = true;
catch e
    fprintf('\n[WARNING] Could not open port %s:\n%s\n', arm.COM_PORT, e.message);
    fprintf('Launching GUI in Offline/Inspection mode.\n');
    fprintf('Tip: If port is busy, run "clear all" or check if another app is using %s.\n\n', arm.COM_PORT);
end

%% 3. Initialize both motors (if connected)
if is_connected
    for motor_id = [arm.MOTOR_1_ID, arm.MOTOR_2_ID]
        try
            arm.disable_timeout(motor_id);        % Prevent communication timeout trips
            arm.set_position_mode(motor_id);      % Ensure position control mode
            arm.enable_motor(motor_id);           % Enable motor torque
            pause(0.05);                          % Brief inter-command settling delay
        catch
        end
    end

    %% 4. Start background telemetry polling at 20 Hz
    arm.start_telemetry(20);
end

%% 5. Launch live monitor figure
monitor = ArmMonitor(arm);

%% 6. Block until monitor figure is closed
% Keep main script execution alive until user closes the UI figure window
try
    waitfor(monitor.fig);
catch
end

%% 7. Safe shutdown (in case close_cb didn't fire)
% Stop telemetry polling, disable motor power stages, and close serial port
try
    arm.stop_telemetry();
    arm.disable_motor(arm.MOTOR_1_ID);
    arm.disable_motor(arm.MOTOR_2_ID);
catch
end
try
    arm.disconnect();
catch
end
disp('Arm session ended cleanly.');
