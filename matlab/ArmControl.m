classdef ArmControl < handle
    % ArmControl Class for 2-DOF Robotic Arm using Robstride 02 Motors
    % Serial CAN Wrapper based on RobStride USB-to-CAN protocol
    % Base link: 400mm, Fore link: 300mm
    % Motor 1 (Base): CAN ID 0x01
    % Motor 2 (Fore): CAN ID 0x02

    properties
        s % Serial port object
        COM_PORT = 'COM3' % Default COM port, update upon instantiation
        BAUD_RATE = 921600
        MOTOR_1_ID = 1
        MOTOR_2_ID = 2
        HOST_ID = 253 % 0xFD
        
        L1 = 400 % Base link length (mm)
        L2 = 300 % Fore link length (mm)
        
        % Joint limits (radians)
        JOINT_LIMITS = struct('m1_min', -2*pi, 'm1_max', 2*pi, 'm2_min', -2*pi, 'm2_max', 2*pi)
        
        Telemetry % struct with fields: m1, m2 - each having position, velocity, torque, current, voltage, temperature, fault_code, fault_str, timestamp
        poll_rate_hz = 50
        read_timer % MATLAB timer object
        
        % Data logging
        logging_enabled = false
        log_data  % struct array for telemetry history
    end
    
    methods
        function obj = ArmControl(comPort)
            if nargin > 0
                obj.COM_PORT = comPort;
            end
            obj.Telemetry.m1 = struct('position',0,'velocity',0,'torque',0,'current',0,'voltage',0,'temperature',0,'fault_code',0,'fault_str','OK','timestamp',0);
            obj.Telemetry.m2 = struct('position',0,'velocity',0,'torque',0,'current',0,'voltage',0,'temperature',0,'fault_code',0,'fault_str','OK','timestamp',0);
            obj.log_data = struct('t',{},'m1',{},'m2',{});
        end
        
        function connect(obj)
            try
                obj.s = serialport(obj.COM_PORT, obj.BAUD_RATE);
                disp(['Connected to ', obj.COM_PORT]);
            catch e
                disp('Error opening port. Please check the COM port.');
                rethrow(e);
            end
        end
        
        function disconnect(obj)
            if ~isempty(obj.s) && isvalid(obj.s)
                delete(obj.s);
                obj.s = [];
                disp('Disconnected from COM port.');
            end
        end
        
        function packet = make_packet(~, can_id, data_bytes)
            % Wraps CAN frame into RobStride's specific serial protocol
            can_id_uint32 = uint32(can_id);
            serial_id = bitset(bitshift(can_id_uint32, 3), 3); % serial_id = (can_id << 3) | 0x04
            
            packet = uint8([hex2dec('41'), hex2dec('54')]); % Frame Header
            
            % 4-byte Serial ID (Big Endian)
            id_bytes = typecast(swapbytes(uint32(serial_id)), 'uint8');
            packet = [packet, id_bytes];
            
            % DLC (Data Length)
            packet = [packet, uint8(length(data_bytes))];
            
            % Payload
            packet = [packet, uint8(data_bytes)];
            
            % Pad to 8 bytes if needed
            if length(data_bytes) < 8
                packet = [packet, zeros(1, 8 - length(data_bytes), 'uint8')];
            end
            
            % Frame Tail
            packet = [packet, hex2dec('0D'), hex2dec('0A')];
        end
        
        function packet = build_param_packet(obj, motor_id, index, value, formatStr)
            % Builds Communication Type 18 (single parameter write) CAN packet
            can_id = bitshift(uint32(hex2dec('12')), 24) + bitshift(uint32(obj.HOST_ID), 8) + uint32(motor_id);
            data = zeros(1, 8, 'uint8');
            idx_bytes = typecast(uint16(index), 'uint8');
            data(1:2) = idx_bytes;
            if strcmp(formatStr, 'single')
                val_bytes = typecast(single(value), 'uint8');
            elseif strcmp(formatStr, 'uint32')
                val_bytes = typecast(uint32(value), 'uint8');
            elseif strcmp(formatStr, 'uint8')
                val_bytes = typecast(uint8(value), 'uint8');
            else
                error('Unsupported format string.');
            end
            data(5:4+length(val_bytes)) = val_bytes;
            packet = obj.make_packet(can_id, data);
        end

        function write_param(obj, motor_id, index, value, formatStr, do_pause)
            % Communication Type 18: Single parameter write
            if nargin < 6, do_pause = true; end
            packet = obj.build_param_packet(motor_id, index, value, formatStr);
            if ~isempty(obj.s)
                write(obj.s, packet, "uint8");
                if do_pause
                    pause(0.05);
                end
            end
        end
        
        function enable_motor(obj, motor_id)
            can_id = bitshift(uint32(hex2dec('03')), 24) + bitshift(uint32(obj.HOST_ID), 8) + uint32(motor_id);
            packet = obj.make_packet(can_id, zeros(1, 8, 'uint8'));
            write(obj.s, packet, "uint8");
            pause(0.1);
            disp(['Motor ', num2str(motor_id), ' Enabled.']);
        end
        
        function disable_motor(obj, motor_id)
            can_id = bitshift(uint32(hex2dec('04')), 24) + bitshift(uint32(obj.HOST_ID), 8) + uint32(motor_id);
            packet = obj.make_packet(can_id, zeros(1, 8, 'uint8'));
            write(obj.s, packet, "uint8");
            pause(0.1);
            disp(['Motor ', num2str(motor_id), ' Disabled.']);
        end
        function set_mechanical_zero(obj, motor_id)
            % Communication Type 0x06: Set current position as mechanical zero
            can_id = bitshift(uint32(hex2dec('06')), 24) + bitshift(uint32(obj.HOST_ID), 8) + uint32(motor_id);
            data = zeros(1, 8, 'uint8');
            data(1) = uint8(1);
            packet = obj.make_packet(can_id, data);
            write(obj.s, packet, "uint8");
            pause(0.1);
            disp(['Motor ', num2str(motor_id), ' Mechanical Zero Set.']);
            obj.save_parameters(motor_id);
        end

        function set_motor_id(obj, current_id, new_id)
            % Communication Type 0x07: Modify motor CAN ID
            % Bit 28~24: 0x07, Bit 23~16: new CAN_ID, Bit 15~8: HOST_ID, Bit 7~0: current_id
            can_id = bitshift(uint32(hex2dec('07')), 24) + bitshift(uint32(new_id), 16) + bitshift(uint32(obj.HOST_ID), 8) + uint32(current_id);
            packet = obj.make_packet(can_id, zeros(1, 8, 'uint8'));
            write(obj.s, packet, "uint8");
            pause(0.1);
            disp(['Motor ID changed from ', num2str(current_id), ' to ', num2str(new_id), '.']);
            obj.save_parameters(new_id);
        end

        function save_parameters(obj, motor_id)
            % Communication Type 0x16 (22): Save parameter table to flash
            can_id = bitshift(uint32(hex2dec('16')), 24) + bitshift(uint32(obj.HOST_ID), 8) + uint32(motor_id);
            data = uint8([1, 2, 3, 4, 5, 6, 7, 8]);
            packet = obj.make_packet(can_id, data);
            write(obj.s, packet, "uint8");
            pause(0.1);
            disp(['Motor ', num2str(motor_id), ' Parameters Saved to Flash.']);
        end
        
        % --- Motor Parameter Commands ---
        
        function disable_timeout(obj, motor_id)
            % CAN_TIMEOUT = 0 (param 0x200C)
            obj.write_param(motor_id, hex2dec('200C'), 0, 'uint32');
        end

        function set_current_limit(obj, motor_id, current_a)
            % limit_cur (param 0x7018)
            obj.write_param(motor_id, hex2dec('7018'), current_a, 'single');
        end
        
        function set_velocity_mode(obj, motor_id)
            % run_mode = 2 (param 0x7005)
            obj.write_param(motor_id, hex2dec('7005'), 2, 'uint8');
        end

        function set_position_mode(obj, motor_id)
            % run_mode = 1 (param 0x7005)
            obj.write_param(motor_id, hex2dec('7005'), 1, 'uint8');
        end
        
        function set_speed(obj, motor_id, speed_rad_s)
            % spd_ref (param 0x700A)
            obj.write_param(motor_id, hex2dec('700A'), speed_rad_s, 'single');
        end

        function set_target_position(obj, motor_id, pos_rad)
            % pos_ref = param 0x7016
            obj.check_joint_limit(motor_id, pos_rad);
            obj.write_param(motor_id, hex2dec('7016'), pos_rad, 'single', false);
        end

        function set_both_targets(obj, th1, th2)
            % Atomically send target positions to both motors simultaneously in a single serial write
            obj.check_joint_limit(obj.MOTOR_1_ID, th1);
            obj.check_joint_limit(obj.MOTOR_2_ID, th2);
            p1 = obj.build_param_packet(obj.MOTOR_1_ID, hex2dec('7016'), th1, 'single');
            p2 = obj.build_param_packet(obj.MOTOR_2_ID, hex2dec('7016'), th2, 'single');
            if ~isempty(obj.s)
                write(obj.s, [p1, p2], "uint8");
            end
        end

        function set_target_angle(obj, motor_id, angle_rad)
            % Alias for set_target_position to make setting angles intuitive
            obj.set_target_position(motor_id, angle_rad);
        end

        function set_arm_angles(obj, theta1, theta2)
            % Set the target angle (in radians) for both motors simultaneously
            obj.set_both_targets(theta1, theta2);
        end
        
        function move_to_xy(obj, x, y)
            % Computes IK and commands both motors to move the arm to (X,Y)
            [theta1, theta2] = obj.inverse_kinematics(x, y);
            obj.set_arm_angles(theta1, theta2);
        end

        function target_cmd = calculate_shortest_path(obj, motor_id, desired_angle_rad)
            % Computes unwrapped continuous target minimizing angular displacement from current position
            if motor_id == obj.MOTOR_1_ID
                curr_pos = obj.Telemetry.m1.position;
            else
                curr_pos = obj.Telemetry.m2.position;
            end
            delta = mod((desired_angle_rad - curr_pos) + pi, 2*pi) - pi;
            target_cmd = curr_pos + delta;
        end

        % --- PID Parameter Setters ---
        
        function set_pos_kp(obj, motor_id, kp)
            % Position loop proportional gain loc_kp (param 0x701E, default 40.0)
            obj.write_param(motor_id, hex2dec('701E'), kp, 'single');
        end

        function set_vel_kp(obj, motor_id, kp)
            % Velocity loop proportional gain spd_kp (param 0x701F, default 6.0)
            obj.write_param(motor_id, hex2dec('701F'), kp, 'single');
        end

        function set_vel_ki(obj, motor_id, ki)
            % Velocity loop integral gain spd_ki (param 0x7020, default 0.02)
            obj.write_param(motor_id, hex2dec('7020'), ki, 'single');
        end

        function set_vel_kd(obj, motor_id, kd)
            % Velocity loop filter gain spd_filt_gain (param 0x7021, default 0.1)
            obj.write_param(motor_id, hex2dec('7021'), kd, 'single');
        end

        function set_vel_filt(obj, motor_id, filt)
            % Velocity loop filter gain spd_filt_gain (param 0x7021, default 0.1)
            obj.write_param(motor_id, hex2dec('7021'), filt, 'single');
        end

        function set_cur_kp(obj, motor_id, kp)
            % Current loop proportional gain cur_kp (param 0x7010, default 0.17)
            obj.write_param(motor_id, hex2dec('7010'), kp, 'single');
        end

        function set_cur_ki(obj, motor_id, ki)
            % Current loop integral gain cur_ki (param 0x7011, default 0.012)
            obj.write_param(motor_id, hex2dec('7011'), ki, 'single');
        end

        function set_cur_filt(obj, motor_id, filt)
            % Current loop filter gain cur_filt_gain (param 0x7014, default 0.1)
            obj.write_param(motor_id, hex2dec('7014'), filt, 'single');
        end

        % --- PID Read-back ---

        function pid = read_pid(obj, motor_id)
            % Reads all 7 loop tuning parameters per RS02 manual:
            % Position (loc_kp 0x701E), Velocity (spd_kp 0x701F, spd_ki 0x7020, spd_filt 0x7021),
            % Current (cur_kp 0x7010, cur_ki 0x7011, cur_filt 0x7014).
            pid = struct('loc_kp', NaN, 'spd_kp', NaN, 'spd_ki', NaN, 'spd_filt', NaN, ...
                         'cur_kp', NaN, 'cur_ki', NaN, 'cur_filt', NaN, ...
                         'kp_pos', NaN, 'kp_vel', NaN, 'ki_vel', NaN, 'kd_vel', NaN);
            indices = [hex2dec('701E'), hex2dec('701F'), hex2dec('7020'), hex2dec('7021'), ...
                       hex2dec('7010'), hex2dec('7011'), hex2dec('7014')];
            fields  = {'loc_kp', 'spd_kp', 'spd_ki', 'spd_filt', 'cur_kp', 'cur_ki', 'cur_filt'};
            try
                for k = 1:length(indices)
                    obj.send_read_param(motor_id, indices(k));
                    pause(0.01);
                    raw = obj.read_param_response();
                    val = obj.parse_single_param_response(raw, indices(k));
                    if ~isnan(val)
                        pid.(fields{k}) = val;
                    end
                end
                % Backward compatibility mapping
                pid.kp_pos = pid.loc_kp;
                pid.kp_vel = pid.spd_kp;
                pid.ki_vel = pid.spd_ki;
                pid.kd_vel = pid.spd_filt;
            catch e
                warning('ArmControl:read_pid', 'Error reading PID: %s', e.message);
            end
        end

        % --- Limit Setters ---

        function set_velocity_limit(obj, motor_id, vel_rad_s)
            % Maximum speed limit
            % 0x7024: Location mode (PP) maximum speed (vel_max)
            obj.write_param(motor_id, hex2dec('7024'), vel_rad_s, 'single');
            % 0x7017: Location mode (CSP) speed limit (limit_spd)
            obj.write_param(motor_id, hex2dec('7017'), vel_rad_s, 'single');
        end

        function set_torque_limit(obj, motor_id, torque_nm)
            % Maximum torque limit (param 0x700B: limit_torque, 0 to 17 Nm)
            obj.write_param(motor_id, hex2dec('700B'), torque_nm, 'single');
        end

        function set_acceleration(obj, motor_id, acc_rad_s2)
            if isempty(acc_rad_s2) || ~isnumeric(acc_rad_s2) || isnan(acc_rad_s2)
                warning('ArmControl:set_acceleration', 'Invalid acceleration value.');
                return;
            end
            acc_rad_s2 = max(0, min(500, acc_rad_s2)); % Clamp to valid 0..500 rad/s^2 hardware limit

            % 0x7025 is Location mode (PP) acceleration (acc_set)
            obj.write_param(motor_id, hex2dec('7025'), acc_rad_s2, 'single');
            % 0x7022 is Velocity mode acceleration (acc_rad)
            obj.write_param(motor_id, hex2dec('7022'), acc_rad_s2, 'single');
        end

        function limits = read_limits(obj, motor_id)
            % Reads max speed (0x7024/0x7017), max current (0x7018), and max torque (0x700B) from the motor.
            limits = struct('limit_spd', NaN, 'limit_cur', NaN, 'limit_torque', NaN);
            try
                % Read speed limit (try 0x7024 first, fallback to 0x7017)
                obj.send_read_param(motor_id, hex2dec('7024'));
                pause(0.01);
                raw = obj.read_param_response();
                val = obj.parse_single_param_response(raw, hex2dec('7024'));
                if isnan(val)
                    obj.send_read_param(motor_id, hex2dec('7017'));
                    pause(0.01);
                    raw = obj.read_param_response();
                    val = obj.parse_single_param_response(raw, hex2dec('7017'));
                end
                if ~isnan(val), limits.limit_spd = val; end
                
                % Read current limit
                obj.send_read_param(motor_id, hex2dec('7018'));
                pause(0.01);
                raw = obj.read_param_response();
                val = obj.parse_single_param_response(raw, hex2dec('7018'));
                if ~isnan(val), limits.limit_cur = val; end
                
                % Read torque limit (param 0x700B: limit_torque)
                obj.send_read_param(motor_id, hex2dec('700B'));
                pause(0.01);
                raw = obj.read_param_response();
                val = obj.parse_single_param_response(raw, hex2dec('700B'));
                if ~isnan(val), limits.limit_torque = val; end
            catch e
                warning('ArmControl:read_limits', 'Error reading limits: %s', e.message);
            end
        end

        function set_joint_limits(obj, motor_id, min_rad, max_rad)
            min_rad = max(-4*pi, min(4*pi, min_rad));
            max_rad = max(-4*pi, min(4*pi, max_rad));
            if min_rad > max_rad
                tmp = min_rad; min_rad = max_rad; max_rad = tmp;
            end
            if motor_id == obj.MOTOR_1_ID
                obj.JOINT_LIMITS.m1_min = min_rad;
                obj.JOINT_LIMITS.m1_max = max_rad;
            else
                obj.JOINT_LIMITS.m2_min = min_rad;
                obj.JOINT_LIMITS.m2_max = max_rad;
            end
        end

        % --- Mode Setter: Current/Torque Mode ---

        function set_current_mode(obj, motor_id)
            % run_mode = 3: Current (Torque) mode (param 0x7005)
            obj.write_param(motor_id, hex2dec('7005'), 3, 'uint8');
        end

        function set_current_ref(obj, motor_id, current_a)
            % iq_ref: target current in torque mode (param 0x7006)
            % NOTE: 0x7006 is dual-use. For write it commands iq_ref, for read it returns fault status.
            obj.write_param(motor_id, hex2dec('7006'), current_a, 'single');
        end

        % --- MIT Mode (Comm Type 0x01) ---

        function mit_control(obj, motor_id, pos_rad, vel_rad_s, kp, kd, torque_nm)
            % MIT Control Mode (Comm Type 0x01): position + velocity + gains + torque in one packet.
            % Ranges: pos [-12.5, 12.5] rad, vel [-30, 30] rad/s, kp [0, 500], kd [0, 5], torque [-24, 24] Nm
            % Pack using RS02 MIT bit scheme: 16-bit pos, 12-bit vel, 12-bit kp, 12-bit kd, 12-bit torque
            
            pos_min=-12.56637; pos_max=12.56637;
            vel_min=-44.0;     vel_max=44.0;
            kp_min=0;          kp_max=500;
            kd_min=0;          kd_max=5;
            t_min=-17.0;       t_max=17.0;
            
            % Clamp inputs
            pos_rad  = max(pos_min, min(pos_max, pos_rad));
            vel_rad_s= max(vel_min, min(vel_max, vel_rad_s));
            kp       = max(kp_min,  min(kp_max,  kp));
            kd       = max(kd_min,  min(kd_max,  kd));
            torque_nm= max(t_min,   min(t_max,   torque_nm));
            
            % Float to unsigned int
            p_int = uint16(round((pos_rad   - pos_min) / (pos_max - pos_min) * 65535));
            v_int = uint16(round((vel_rad_s - vel_min) / (vel_max - vel_min) * 4095));
            k_int = uint16(round((kp        - kp_min)  / (kp_max  - kp_min)  * 4095));
            d_int = uint16(round((kd        - kd_min)  / (kd_max  - kd_min)  * 4095));
            t_int = uint16(round((torque_nm - t_min)   / (t_max   - t_min)   * 4095));
            
            % Pack into 8 bytes
            data = zeros(1, 8, 'uint8');
            data(1) = uint8(bitshift(p_int, -8));
            data(2) = uint8(bitand(p_int, 255));
            data(3) = uint8(bitshift(v_int, -4));
            data(4) = uint8(bitor(bitshift(bitand(v_int, 15), 4), bitshift(k_int, -8)));
            data(5) = uint8(bitand(k_int, 255));
            data(6) = uint8(bitshift(d_int, -4));
            data(7) = uint8(bitor(bitshift(bitand(d_int, 15), 4), bitshift(t_int, -8)));
            data(8) = uint8(bitand(t_int, 255));
            
            can_id = bitshift(uint32(hex2dec('01')), 24) + bitshift(uint32(obj.HOST_ID), 8) + uint32(motor_id);
            packet = obj.make_packet(can_id, data);
            write(obj.s, packet, 'uint8');
        end

        % --- Kinematics ---
        
        function [x, y] = forward_kinematics(obj, theta1, theta2)
            % FK: Compute end-effector XY coordinates from joint angles (rad)
            % Zero position is straight down (-Y). Physical angle = theta - pi/2
            x = -obj.L1 * sin(theta1) - obj.L2 * sin(theta1 + theta2);
            y = -obj.L1 * cos(theta1) - obj.L2 * cos(theta1 + theta2);
        end
        
        function [theta1, theta2] = inverse_kinematics(obj, x, y, elbow_config)
            if nargin < 4 || isempty(elbow_config), elbow_config = 'up'; end
            r2 = x^2 + y^2;
            r = sqrt(r2);
            max_reach = obj.L1 + obj.L2;
            min_reach = abs(obj.L1 - obj.L2);
            if r > max_reach + 0.5 || r < min_reach - 0.5
                error('ArmControl:IKOutOfReach', 'Target (%.1f, %.1f) mm out of reach (dist=%.1f mm, reach=[%.1f, %.1f])', x, y, r, min_reach, max_reach);
            end
            D = (r2 - obj.L1^2 - obj.L2^2) / (2 * obj.L1 * obj.L2);
            D = max(-1.0, min(1.0, D));
            if strcmpi(elbow_config, 'down')
                theta2 = atan2(-sqrt(1 - D^2), D);
            else
                theta2 = atan2(sqrt(1 - D^2), D); % Elbow Up (default)
            end
            theta1 = atan2(-x, -y) - atan2(obj.L2 * sin(theta2), obj.L1 + obj.L2 * cos(theta2));
            % Angle normalization
            theta1 = mod(theta1 + pi, 2*pi) - pi;
            theta2 = mod(theta2 + pi, 2*pi) - pi;
        end

        function traj = plan_trajectory(obj, start_xy, target_xy, v_max, a_max, traj_type, elbow_config, dt, start_joints)
            % Plans time-parameterized P2P trajectory with pre-flight safety validation
            % traj_type: 'linear', 'joint', 'arch'
            if nargin < 6 || isempty(traj_type), traj_type = 'linear'; end
            if nargin < 7 || isempty(elbow_config), elbow_config = 'up'; end
            if nargin < 8 || isempty(dt), dt = 0.02; end % 50Hz default for smooth continuous streaming
            if nargin < 9, start_joints = []; end

            
            traj = struct('valid', false, 'error_msg', '', 't', [], 'x', [], 'y', [], ...
                          'th1', [], 'th2', [], 'v_max', v_max, 'a_max', a_max, 'traj_type', traj_type);
            
            x0 = start_xy(1); y0 = start_xy(2);
            x1 = target_xy(1); y1 = target_xy(2);
            
            % Calculate Euclidean Cartesian distance
            D = sqrt((x1 - x0)^2 + (y1 - y0)^2);
            if D < 1.0 % Min travel threshold
                traj.valid = false;
                traj.error_msg = 'Target is too close to start position (< 1 mm).';
                return;
            end
            
            % Trapezoidal motion profile calculation
            v_max = max(10, v_max); % min 10 mm/s
            a_max = max(10, a_max); % min 10 mm/s^2
            t_acc = v_max / a_max;
            d_acc = 0.5 * a_max * t_acc^2;
            
            if 2 * d_acc > D
                % Triangular profile
                v_peak = sqrt(D * a_max);
                t_acc = v_peak / a_max;
                t_cruise = 0;
                T = 2 * t_acc;
            else
                % Trapezoidal profile
                v_peak = v_max;
                d_cruise = D - 2 * d_acc;
                t_cruise = d_cruise / v_peak;
                T = 2 * t_acc + t_cruise;
            end
            
            t = 0 : dt : T;
            if isempty(t) || t(end) < T
                t = [t, T];
            end
            N = length(t);
            u = zeros(1, N);
            
            for i = 1:N
                ti = t(i);
                if ti <= t_acc
                    s_pos = 0.5 * a_max * ti^2;
                elseif ti <= t_acc + t_cruise
                    s_pos = d_acc + v_peak * (ti - t_acc);
                else
                    t_dec = ti - (t_acc + t_cruise);
                    s_pos = d_acc + (v_peak * t_cruise) + (v_peak * t_dec - 0.5 * a_max * t_dec^2);
                end
                u(i) = min(1.0, max(0.0, s_pos / D));
            end
            u(end) = 1.0;
            
            % Generate Cartesian and Joint coordinates
            X = zeros(1, N); Y = zeros(1, N);
            TH1 = zeros(1, N); TH2 = zeros(1, N);
            
            max_reach = obj.L1 + obj.L2;
            min_reach = abs(obj.L1 - obj.L2);
            
            if strcmpi(traj_type, 'joint')
                % Joint-space PTP curve
                try
                    [th1_0, th2_0] = obj.inverse_kinematics(x0, y0, elbow_config);
                    [th1_1, th2_1] = obj.inverse_kinematics(x1, y1, elbow_config);
                catch e
                    traj.valid = false;
                    traj.error_msg = sprintf('Endpoint IK failure: %s', e.message);
                    return;
                end
                % Shortest path joint displacement
                dth1 = mod(th1_1 - th1_0 + pi, 2*pi) - pi;
                dth2 = mod(th2_1 - th2_0 + pi, 2*pi) - pi;
                for i = 1:N
                    TH1(i) = th1_0 + u(i) * dth1;
                    TH2(i) = th2_0 + u(i) * dth2;
                    [X(i), Y(i)] = obj.forward_kinematics(TH1(i), TH2(i));
                end
            else
                % Cartesian Linear or Arch
                arch_height = 80.0; % mm clearance apex
                for i = 1:N
                    ui = u(i);
                    X(i) = x0 + ui * (x1 - x0);
                    if strcmpi(traj_type, 'arch')
                        Y(i) = y0 + ui * (y1 - y0) + arch_height * 4 * ui * (1 - ui);
                    else
                        Y(i) = y0 + ui * (y1 - y0);
                    end
                    
                    % Pre-flight reachability validation
                    ri = sqrt(X(i)^2 + Y(i)^2);
                    if ri > max_reach + 0.5 || ri < min_reach - 0.5
                        traj.valid = false;
                        traj.error_msg = sprintf('Workspace reach limit exceeded at step %d/%d (dist=%.1f mm, max=%.1f mm).', i, N, ri, max_reach);
                        return;
                    end
                    
                    try
                        [t1, t2] = obj.inverse_kinematics(X(i), Y(i), elbow_config);
                    catch e
                        traj.valid = false;
                        traj.error_msg = sprintf('IK failed along path at step %d/%d: %s', i, N, e.message);
                        return;
                    end
                    
                    if i > 1
                        % Continuous unwrapping across waypoints
                        t1 = TH1(i-1) + (mod(t1 - TH1(i-1) + pi, 2*pi) - pi);
                        t2 = TH2(i-1) + (mod(t2 - TH2(i-1) + pi, 2*pi) - pi);
                    end
                    TH1(i) = t1;
                    TH2(i) = t2;
                end
            end
            
            % Align trajectory to current physical motor wraps if provided
            if ~isempty(start_joints)
                diff1 = round((start_joints(1) - TH1(1)) / (2*pi)) * 2 * pi;
                diff2 = round((start_joints(2) - TH2(1)) / (2*pi)) * 2 * pi;
                TH1 = TH1 + diff1;
                TH2 = TH2 + diff2;
            end
            
            % Verify all joint waypoints against joint limits
            if any(TH1 < obj.JOINT_LIMITS.m1_min | TH1 > obj.JOINT_LIMITS.m1_max) || ...
               any(TH2 < obj.JOINT_LIMITS.m2_min | TH2 > obj.JOINT_LIMITS.m2_max)
                traj.valid = false;
                traj.error_msg = 'Trajectory violates joint angle software limits.';
                return;
            end
            
            traj.valid = true;
            traj.t = t;
            traj.x = X;
            traj.y = Y;
            traj.th1 = TH1;
            traj.th2 = TH2;
        end
        
        % --- Live Telemetry Methods ---
        
        function send_read_param(obj, motor_id, index)
            % Comm Type 0x11 (17): Single parameter read request
            can_id = bitshift(uint32(hex2dec('11')), 24) + bitshift(uint32(obj.HOST_ID), 8) + uint32(motor_id);
            data = zeros(1, 8, 'uint8');
            data(1:2) = typecast(uint16(index), 'uint8');
            packet = obj.make_packet(can_id, data);
            write(obj.s, packet, 'uint8');
        end
        
        function response = read_param_response(obj)
            % Reads available bytes (up to 500) from serial port
            response = [];
            try
                if ~isempty(obj.s) && isvalid(obj.s) && obj.s.NumBytesAvailable > 0
                    n = min(obj.s.NumBytesAvailable, 500);
                    response = read(obj.s, n, 'uint8');
                end
            catch
                response = [];
            end
        end
        
        function [val, returned_index] = parse_single_param_response(~, raw, expected_index)
            % Searches for frame header [0x41 0x54], validates >= 17 bytes,
            % extracts DLC & payload, and returns payload(5:8) as single float.
            val = NaN;
            returned_index = uint16(0);
            if isempty(raw) || length(raw) < 17
                return;
            end
            
            raw_bytes = uint8(raw(:)');
            idx = strfind(raw_bytes, uint8([hex2dec('41'), hex2dec('54')]));
            if isempty(idx)
                return;
            end
            
            for k = length(idx):-1:1
                start_i = idx(k);
                if (start_i + 16) <= length(raw_bytes)
                    payload = raw_bytes(start_i + 7 : start_i + 14);
                    try
                        val = double(typecast(uint8(payload(5:8)), 'single'));
                        returned_index = typecast(uint8(payload(1:2)), 'uint16');
                        if nargin >= 3 && ~isempty(expected_index)
                            if returned_index ~= uint16(expected_index)
                                val = NaN;
                                return;
                            end
                        end
                        return;
                    catch
                        val = NaN;
                    end
                end
            end
        end
        
        function parse_feedback_frames(obj)
            % Reads all available bytes and parses Comm Type 0x02 broadcast frames
            raw = obj.read_param_response();
            if isempty(raw) || length(raw) < 17
                return;
            end
            
            raw_bytes = uint8(raw(:)');
            idx = strfind(raw_bytes, uint8([hex2dec('41'), hex2dec('54')]));
            if isempty(idx)
                return;
            end
            
            P_MIN = -12.56637; P_MAX = 12.56637;
            V_MIN = -44.0;     V_MAX = 44.0;
            T_MIN = -17.0;     T_MAX = 17.0;
            KM = 1.22; % Robstride RS02 torque constant: 1.22 N.m/Arms (per manual section 2.11)
            
            for k = 1:length(idx)
                start_i = idx(k);
                if (start_i + 16) <= length(raw_bytes)
                    if raw_bytes(start_i + 15) ~= hex2dec('0D') || raw_bytes(start_i + 16) ~= hex2dec('0A')
                        continue;
                    end
                    
                    serial_id_bytes = raw_bytes(start_i + 2 : start_i + 5);
                    serial_id = swapbytes(typecast(uint8(serial_id_bytes), 'uint32'));
                    can_id = bitshift(serial_id, -3);
                    
                    comm_type = bitshift(can_id, -24);
                    motor_id = bitand(can_id, 255);
                    if motor_id ~= obj.MOTOR_1_ID && motor_id ~= obj.MOTOR_2_ID
                        alt_id = bitand(bitshift(can_id, -8), 255);
                        if alt_id == obj.MOTOR_1_ID || alt_id == obj.MOTOR_2_ID
                            motor_id = alt_id;
                        end
                    end
                    
                    payload = raw_bytes(start_i + 7 : start_i + 14);
                    
                    % Comm Type 2: Feedback Broadcast Frame
                    if comm_type == 2 && length(payload) >= 8
                        raw_pos = double(swapbytes(typecast(uint8(payload(1:2)), 'uint16')));
                        raw_vel = double(swapbytes(typecast(uint8(payload(3:4)), 'uint16')));
                        raw_t   = double(swapbytes(typecast(uint8(payload(5:6)), 'uint16')));
                        
                        % Temperature: Temp(-C) * 10 in Byte 6~7 per RS02 manual
                        temp_10 = double(swapbytes(typecast(uint8(payload(7:8)), 'uint16'))) / 10.0;
                        if temp_10 > 0 && temp_10 < 140
                            raw_temp = temp_10;
                        else
                            raw_temp = double(payload(7));
                        end
                        
                        % True fault bits from 29-bit CAN ID bits 21~16 per RS02 manual
                        fault_bits = uint8(bitand(bitshift(can_id, -16), uint32(63)));
                        
                        pos = (raw_pos / 65535.0) * (P_MAX - P_MIN) + P_MIN;
                        vel = (raw_vel / 65535.0) * (V_MAX - V_MIN) + V_MIN;
                        torque = (raw_t / 65535.0) * (T_MAX - T_MIN) + T_MIN;
                        cur = abs(torque) / KM;
                        
                        if motor_id == obj.MOTOR_1_ID
                            obj.Telemetry.m1.position = pos;
                            obj.Telemetry.m1.velocity = vel;
                            obj.Telemetry.m1.torque = torque;
                            obj.Telemetry.m1.current = cur;
                            obj.Telemetry.m1.temperature = raw_temp;
                            obj.Telemetry.m1.fault_code = fault_bits;
                            obj.Telemetry.m1.fault_str = obj.decode_fault(fault_bits);
                            obj.Telemetry.m1.timestamp = datetime("now");
                        elseif motor_id == obj.MOTOR_2_ID
                            obj.Telemetry.m2.position = pos;
                            obj.Telemetry.m2.velocity = vel;
                            obj.Telemetry.m2.torque = torque;
                            obj.Telemetry.m2.current = cur;
                            obj.Telemetry.m2.temperature = raw_temp;
                            obj.Telemetry.m2.fault_code = fault_bits;
                            obj.Telemetry.m2.fault_str = obj.decode_fault(fault_bits);
                            obj.Telemetry.m2.timestamp = datetime("now");
                        end
                    end
                end
            end
        end
        
        function poll_once(obj)
            % Sends 0x02 feedback request packets and parses incoming frames
            try
                if isempty(obj.s) || ~isvalid(obj.s)
                    return;
                end
                
                % Comm Type 2: request feedback from both motors
                for mid = [obj.MOTOR_1_ID, obj.MOTOR_2_ID]
                    can_id = bitshift(uint32(2), 24) + bitshift(uint32(obj.HOST_ID), 8) + uint32(mid);
                    packet = obj.make_packet(can_id, zeros(1, 8, 'uint8'));
                    write(obj.s, packet, 'uint8');
                end
                
                pause(0.005);
                obj.parse_feedback_frames();
                
                if obj.logging_enabled
                    try
                        entry = struct('t', datetime("now"), 'm1', obj.Telemetry.m1, 'm2', obj.Telemetry.m2);
                        obj.log_data(end+1) = entry;
                    catch
                    end
                end
            catch
                return;
            end
        end
        
        function start_telemetry(obj, rate_hz)
            if nargin < 2 || isempty(rate_hz)
                rate_hz = obj.poll_rate_hz;
            end
            if ~isempty(obj.read_timer) && isvalid(obj.read_timer)
                obj.stop_telemetry();
            end
            period_s = max(0.01, 1 / rate_hz);
            obj.read_timer = timer('ExecutionMode', 'fixedSpacing', ...
                                   'Period', period_s, ...
                                   'BusyMode', 'drop', ...
                                   'TimerFcn', @(~,~) obj.poll_once());
            start(obj.read_timer);
        end
        
        function stop_telemetry(obj)
            if ~isempty(obj.read_timer) && isvalid(obj.read_timer)
                stop(obj.read_timer);
                delete(obj.read_timer);
            end
            obj.read_timer = [];
        end
        
        function fault_str = decode_fault(~, fault_code)
            % Decodes fault bits per RS02-IP67 User Manual (Section 3.3.7, 4.1.2, 4.1.8)
            if fault_code == 0
                fault_str = 'OK';
                return;
            end
            
            % Bitmask decoding:
            % bit 0 (bit 16): Undervoltage fault (< 12V)
            % bit 1 (bit 17): Three-phase overcurrent fault
            % bit 2 (bit 18): Overtemperature fault (> 135-C)
            % bit 3 (bit 19): Magnetic coding fault
            % bit 4 (bit 20): Gridlock / stall overload fault
            % bit 5 (bit 21): Encoder uncalibrated
            errs = {};
            if bitand(fault_code, 1),  errs{end+1} = 'Undervoltage'; end
            if bitand(fault_code, 2),  errs{end+1} = 'Overcurrent'; end
            if bitand(fault_code, 4),  errs{end+1} = 'Overtemp'; end
            if bitand(fault_code, 8),  errs{end+1} = 'Encoder Fault'; end
            if bitand(fault_code, 16), errs{end+1} = 'Stall Overload'; end
            if bitand(fault_code, 32), errs{end+1} = 'Uncalibrated'; end
            
            if isempty(errs)
                fault_str = sprintf('Fault(0x%02X)', fault_code);
            else
                fault_str = strjoin(errs, ', ');
            end
        end
        
        % --- Data Logging Methods ---
        
        function start_logging(obj)
            obj.log_data = struct('t', {}, 'm1', {}, 'm2', {});
            obj.logging_enabled = true;
            disp('Data logging started.');
        end

        function stop_logging(obj)
            obj.logging_enabled = false;
            disp(['Data logging stopped. ', num2str(length(obj.log_data)), ' samples recorded.']);
        end

        function save_log(obj, filename)
            if nargin < 2 || isempty(filename)
                filename = sprintf('arm_log_%s.mat', char(datetime('now', 'Format', 'yyyyMMdd_HHmmss')));
            end
            log_data = obj.log_data;
            save(filename, 'log_data');
            fprintf('Log saved to: %s\n', filename);
        end
    end

    methods (Access = private)
        function check_joint_limit(obj, motor_id, angle_rad)
            % Throws error if angle_rad is outside configured joint limits
            if motor_id == obj.MOTOR_1_ID
                lo = obj.JOINT_LIMITS.m1_min;
                hi = obj.JOINT_LIMITS.m1_max;
            else
                lo = obj.JOINT_LIMITS.m2_min;
                hi = obj.JOINT_LIMITS.m2_max;
            end
            if angle_rad < lo || angle_rad > hi
                error('ArmControl:JointLimit', 'Motor %d angle %.3f rad outside limits [%.3f, %.3f]', motor_id, angle_rad, lo, hi);
            end
        end
    end
end
