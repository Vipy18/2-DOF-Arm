% Example script to control the 2-DOF robotic arm in Position/Angle mode

% Initialize arm controller on COM3 (change as needed)
arm = ArmControl('COM3');

try
    % Connect to serial port
    arm.connect();
    
    disp('Initializing Motor 1 (Base)...');
    arm.disable_timeout(arm.MOTOR_1_ID);
    arm.set_position_mode(arm.MOTOR_1_ID); % Switch to position mode
    arm.enable_motor(arm.MOTOR_1_ID);
    arm.set_current_limit(arm.MOTOR_1_ID, 5.0);
    
    disp('Initializing Motor 2 (Fore)...');
    arm.disable_timeout(arm.MOTOR_2_ID);
    arm.set_position_mode(arm.MOTOR_2_ID); % Switch to position mode
    arm.enable_motor(arm.MOTOR_2_ID);
    arm.set_current_limit(arm.MOTOR_2_ID, 5.0);
    
    % Example 1: Explicitly set angles (e.g., 0.5 rad for base, -0.5 rad for fore)
    disp('Setting target angles directly: Motor 1 = 0.5 rad, Motor 2 = -0.5 rad');
    arm.set_target_angle(arm.MOTOR_1_ID, 0.5);
    arm.set_target_angle(arm.MOTOR_2_ID, -0.5);
    
    pause(2);
    
    % Example 2: Use set_arm_angles method
    disp('Setting both angles simultaneously using set_arm_angles...');
    arm.set_arm_angles(0.0, 0.0); % Move back to zero
    
    pause(2);

    % Example 3: Use Inverse Kinematics to move to an XY coordinate
    target_x = 400;
    target_y = 300;
    disp(['Moving arm to coordinate (X=', num2str(target_x), ', Y=', num2str(target_y), ') via IK...']);
    
    [th1, th2] = arm.inverse_kinematics(target_x, target_y);
    fprintf('Calculated Angles: Theta1=%.2f rad, Theta2=%.2f rad\n', th1, th2);
    
    % Use our new high-level wrapper to command both motors
    arm.move_to_xy(target_x, target_y);
    
    pause(3);
    
catch e
    disp('An error occurred during execution:');
    disp(e.message);
end

% Ensure motors are disabled and port is disconnected
disp('Stopping motors...');
try
    arm.disable_motor(arm.MOTOR_1_ID);
    arm.disable_motor(arm.MOTOR_2_ID);
catch
end
arm.disconnect();
