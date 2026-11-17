% =========================================================================
% Script: calibrate_motors.m
% Description: Standalone utility to set motor zero angle and configure
%              CAN IDs for Robstride RS02 actuators directly via CAN commands.
%
% Usage:
%   1. Connect single motor (or daisy-chained motors) to USB-CAN on COM3.
%   2. Open this script in MATLAB, adjust the commands below, and run.
% =========================================================================

%% 1. Initialize Arm Controller on COM3
arm = ArmControl('COM3');
arm.connect();

try
    %% --------------------------------------------------------------------
    %% ACTION A: Set Current Physical Position as Zero Angle (Home)
    %% --------------------------------------------------------------------
    % Move the arm/motor by hand to the desired zero reference pose,
    % then uncomment the lines below for the target motor:
    
    disp('Setting Motor 1 (Base) current position as Zero...');
    arm.set_mechanical_zero(1);
    
    disp('Setting Motor 2 (Fore) current position as Zero...');
    arm.set_mechanical_zero(2);

    %% --------------------------------------------------------------------
    %% ACTION B: Modify Motor CAN ID
    %% --------------------------------------------------------------------
    % IMPORTANT: Connect ONLY ONE motor to the bus when changing its ID
    % to avoid ID collisions if both currently share the same factory ID.
    %
    % Syntax: arm.set_motor_id(CURRENT_ID, NEW_ID)
    %
    % Example to set factory motor (ID 127 or ID 1) to ID 1:
    % arm.set_motor_id(127, 1);
    %
    % Example to set second motor (ID 127 or ID 1) to ID 2:
    % arm.set_motor_id(127, 2);

    disp('Calibration completed successfully.');
    
catch e
    fprintf('\n[ERROR] Calibration command failed: %s\n', e.message);
end

% Disconnect serial port
arm.disconnect();
