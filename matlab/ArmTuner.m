classdef ArmTuner < handle
% ArmTuner - PID Tuning and Step Response Analysis for Robstride 2-DOF Arm
% Uses ArmControl to command a single motor with test signals and records
% position, velocity, and current responses.
%
% Usage:
%   tuner = ArmTuner(arm, 1);          % Test Motor 1
%   tuner.step_test(0.5, 3.0);         % Step to 0.5 rad, record 3 seconds
%   tuner.plot_step_response();         % Plot results
%   metrics = tuner.compute_metrics();  % Get rise time, overshoot, etc.
%   tuner.autotune_suggestion();        % Print ZN-based PID hints

    properties
        arm            % ArmControl object reference
        motor_id       % ID of motor under test (1 or 2)
        sample_rate_hz = 50   % Recording rate
        results        % struct with fields: t, pos, vel, cur, ref, test_type
        pid_current    % last-read PID struct from motor
    end

    methods
        function obj = ArmTuner(arm_obj, motor_id)
            % Store arm reference and motor ID to test
            obj.arm = arm_obj;
            if nargin >= 2
                obj.motor_id = motor_id;
            else
                obj.motor_id = arm_obj.MOTOR_1_ID;
            end
            obj.results = struct('t',[],'pos',[],'vel',[],'cur',[],'ref',[],'test_type','none');
        end

        function step_test(obj, target_rad, duration_s)
            % Sends a step command and records response.
            % Motor must already be enabled in position mode.
            if nargin < 3, duration_s = 3.0; end

            fprintf('Step test: Motor %d -> %.3f rad for %.1f s\n', obj.motor_id, target_rad, duration_s);

            n = round(duration_s * obj.sample_rate_hz);
            dt = 1 / obj.sample_rate_hz;
            t_vec   = zeros(1, n);
            pos_vec = zeros(1, n);
            vel_vec = zeros(1, n);
            cur_vec = zeros(1, n);

            % Send step command
            obj.arm.set_target_position(obj.motor_id, target_rad);

            % Record at sample_rate_hz
            t0 = tic;
            for k = 1:n
                % Read latest telemetry
                if obj.motor_id == obj.arm.MOTOR_1_ID
                    m = obj.arm.Telemetry.m1;
                else
                    m = obj.arm.Telemetry.m2;
                end
                t_vec(k)   = toc(t0);
                pos_vec(k) = m.position;
                vel_vec(k) = m.velocity;
                cur_vec(k) = m.current;

                elapsed = toc(t0);
                next_t  = k * dt;
                if next_t > elapsed
                    pause(next_t - elapsed);
                end
            end

            obj.results = struct('t', t_vec, 'pos', pos_vec, 'vel', vel_vec, ...
                                 'cur', cur_vec, 'ref', target_rad, 'test_type', 'step');
            disp('Step test complete.');
        end

        function sine_sweep(obj, amp_rad, freq_hz, cycles)
            % Sinusoidal reference tracking test.
            if nargin < 4, cycles = 3; end
            if nargin < 3, freq_hz = 0.5; end
            if nargin < 2, amp_rad = 0.3; end

            duration_s = cycles / freq_hz;
            n  = round(duration_s * obj.sample_rate_hz);
            dt = 1 / obj.sample_rate_hz;

            t_vec   = zeros(1, n);
            pos_vec = zeros(1, n);
            vel_vec = zeros(1, n);
            cur_vec = zeros(1, n);
            ref_vec = zeros(1, n);

            fprintf('Sine sweep: Motor %d, amp=%.2f rad, freq=%.2f Hz, %d cycles\n', ...
                    obj.motor_id, amp_rad, freq_hz, cycles);

            t0 = tic;
            for k = 1:n
                t_now  = (k-1) * dt;
                ref    = amp_rad * sin(2*pi*freq_hz*t_now);
                ref_vec(k) = ref;
                obj.arm.set_target_position(obj.motor_id, ref);

                if obj.motor_id == obj.arm.MOTOR_1_ID
                    m = obj.arm.Telemetry.m1;
                else
                    m = obj.arm.Telemetry.m2;
                end
                t_vec(k)   = toc(t0);
                pos_vec(k) = m.position;
                vel_vec(k) = m.velocity;
                cur_vec(k) = m.current;

                elapsed = toc(t0);
                next_t  = k * dt;
                if next_t > elapsed, pause(next_t - elapsed); end
            end

            obj.results = struct('t', t_vec, 'pos', pos_vec, 'vel', vel_vec, ...
                                 'cur', cur_vec, 'ref', ref_vec, 'test_type', 'sine');
            disp('Sine sweep complete.');
        end

        function ramp_test(obj, rate_rad_s, target_rad)
            % Ramp motion test: ramps from 0 to target at given rate.
            if nargin < 3, target_rad = 0.5; end
            if nargin < 2, rate_rad_s = 0.2; end

            duration_s = abs(target_rad) / rate_rad_s + 1.0;
            n  = round(duration_s * obj.sample_rate_hz);
            dt = 1 / obj.sample_rate_hz;

            t_vec   = zeros(1, n);
            pos_vec = zeros(1, n);
            vel_vec = zeros(1, n);
            cur_vec = zeros(1, n);
            ref_vec = zeros(1, n);

            fprintf('Ramp test: Motor %d -> %.3f rad at %.3f rad/s\n', obj.motor_id, target_rad, rate_rad_s);

            t0 = tic;
            for k = 1:n
                t_now = (k-1) * dt;
                ref   = min(abs(target_rad), rate_rad_s * t_now) * sign(target_rad);
                ref_vec(k) = ref;
                obj.arm.set_target_position(obj.motor_id, ref);

                if obj.motor_id == obj.arm.MOTOR_1_ID
                    m = obj.arm.Telemetry.m1;
                else
                    m = obj.arm.Telemetry.m2;
                end
                t_vec(k)   = toc(t0);
                pos_vec(k) = m.position;
                vel_vec(k) = m.velocity;
                cur_vec(k) = m.current;

                elapsed = toc(t0);
                next_t  = k * dt;
                if next_t > elapsed, pause(next_t - elapsed); end
            end

            obj.results = struct('t', t_vec, 'pos', pos_vec, 'vel', vel_vec, ...
                                 'cur', cur_vec, 'ref', ref_vec, 'test_type', 'ramp');
            disp('Ramp test complete.');
        end

        function plot_step_response(obj)
            % Plots 3-subplot figure: position tracking, velocity, current.
            if isempty(obj.results.t)
                disp('No test data. Run step_test, sine_sweep, or ramp_test first.');
                return;
            end

            fig = figure('Name', sprintf('Motor %d - %s Response', obj.motor_id, obj.results.test_type), ...
                         'Color', [0.09 0.09 0.12], 'Position', [100 100 900 650]);

            t = obj.results.t;
            pos = obj.results.pos;
            vel = obj.results.vel;
            cur = obj.results.cur;
            ref = obj.results.ref;

            dark_bg = [0.12 0.12 0.15];
            ax_fc = [0.7 0.7 0.7];

            % Subplot 1: Position
            ax1 = subplot(3,1,1);
            if isscalar(ref)
                plot(t, ones(size(t))*ref, '--', 'Color', [0.4 0.9 0.4], 'LineWidth', 1.5); hold on;
            else
                plot(t, ref, '--', 'Color', [0.4 0.9 0.4], 'LineWidth', 1.5); hold on;
            end
            plot(t, pos, '-', 'Color', [0.35 0.75 1.0], 'LineWidth', 2);
            ylabel('Position (rad)', 'Color', ax_fc);
            legend({'Reference','Measured'}, 'TextColor', 'w', 'Color', dark_bg);
            grid on; title(sprintf('Motor %d - %s Response', obj.motor_id, obj.results.test_type), 'Color', 'w');
            set(ax1, 'Color', dark_bg, 'XColor', ax_fc, 'YColor', ax_fc, 'GridColor', [0.3 0.3 0.3]);

            % Subplot 2: Velocity
            ax2 = subplot(3,1,2);
            plot(t, vel, '-', 'Color', [1.0 0.75 0.2], 'LineWidth', 1.8);
            ylabel('Velocity (rad/s)', 'Color', ax_fc); grid on;
            set(ax2, 'Color', dark_bg, 'XColor', ax_fc, 'YColor', ax_fc, 'GridColor', [0.3 0.3 0.3]);

            % Subplot 3: Current
            ax3 = subplot(3,1,3);
            plot(t, cur, '-', 'Color', [1.0 0.35 0.35], 'LineWidth', 1.8);
            yline(5.0, '--', 'Limit', 'Color', [1.0 0.2 0.2], 'LineWidth', 1.2);
            ylabel('Current (A)', 'Color', ax_fc);
            xlabel('Time (s)', 'Color', ax_fc);
            grid on;
            set(ax3, 'Color', dark_bg, 'XColor', ax_fc, 'YColor', ax_fc, 'GridColor', [0.3 0.3 0.3]);

            linkaxes([ax1,ax2,ax3], 'x');
        end

        function metrics = compute_metrics(obj)
            % Computes rise time, settling time, overshoot, and SS error for step tests.
            metrics = struct('rise_time_s', NaN, 'settling_time_s', NaN, ...
                             'overshoot_pct', NaN, 'ss_error_rad', NaN, 'test_type', obj.results.test_type);

            if isempty(obj.results.t) || ~strcmp(obj.results.test_type, 'step')
                disp('compute_metrics requires a completed step_test.');
                return;
            end

            t   = obj.results.t;
            pos = obj.results.pos;
            ref = obj.results.ref;

            % 10%-90% rise time
            % NOTE: Threshold logic assumes ref > 0. Will fail or yield incorrect result if ref is negative.
            thr10 = ref * 0.10;
            thr90 = ref * 0.90;
            idx10 = find(pos >= thr10, 1, 'first');
            idx90 = find(pos >= thr90, 1, 'first');
            if ~isempty(idx10) && ~isempty(idx90)
                metrics.rise_time_s = t(idx90) - t(idx10);
            end

            % Overshoot
            peak = max(pos);
            if ref > 0
                metrics.overshoot_pct = max(0, (peak - ref) / ref * 100);
            end

            % Settling time (within 2% band)
            band = 0.02 * abs(ref);
            settled = find(abs(pos - ref) > band, 1, 'last');
            if ~isempty(settled) && settled < length(t)
                metrics.settling_time_s = t(settled + 1);
            end

            % Steady-state error (mean of last 10% of samples)
            tail = round(0.9 * length(pos)):length(pos);
            metrics.ss_error_rad = abs(mean(pos(tail)) - ref);

            % Print summary
            fprintf('--- Step Response Metrics (Motor %d) ---\n', obj.motor_id);
            fprintf('  Rise time:      %.3f s\n',   metrics.rise_time_s);
            fprintf('  Settling time:  %.3f s\n',   metrics.settling_time_s);
            fprintf('  Overshoot:      %.1f %%\n',  metrics.overshoot_pct);
            fprintf('  SS error:       %.4f rad\n', metrics.ss_error_rad);
            fprintf('----------------------------------------\n');
        end

        function autotune_suggestion(obj)
            % Prints Ziegler-Nichols-inspired PID tuning suggestions based on step response.
            m = obj.compute_metrics();

            fprintf('\n=== Autotune Suggestions for Motor %d ===\n', obj.motor_id);

            if isnan(m.rise_time_s)
                disp('  Run step_test first to get suggestions.');
                return;
            end

            try
                pid = obj.arm.read_pid(obj.motor_id);
                fprintf('  Current PID: pos_kp=%.2f, vel_kp=%.2f, vel_ki=%.2f, vel_kd=%.2f\n', ...
                        pid.kp_pos, pid.kp_vel, pid.ki_vel, pid.kd_vel);
            catch
                disp('  Could not read current PID gains.');
            end

            fprintf('  Rise time: %.3f s | Overshoot: %.1f%% | SS error: %.4f rad\n', ...
                    m.rise_time_s, m.overshoot_pct, m.ss_error_rad);

            if m.rise_time_s > 0.5
                fprintf('  -> Rise time SLOW. Increase pos_kp (+20%%) or vel_kp (+15%%).\n');
            elseif m.rise_time_s < 0.05
                fprintf('  -> Rise time very fast. Monitor for oscillation.\n');
            end

            if m.overshoot_pct > 15
                fprintf('  -> Overshoot HIGH (%.1f%%). Increase vel_kd (+30%%) or decrease pos_kp (-15%%).\n', m.overshoot_pct);
            elseif m.overshoot_pct < 2 && m.rise_time_s > 0.3
                fprintf('  -> Overshoot low but slow. Safely increase pos_kp (+10%%).\n');
            end

            if m.ss_error_rad > 0.01
                fprintf('  -> SS error %.4f rad. Consider increasing vel_ki (+20%%).\n', m.ss_error_rad);
            end

            if m.settling_time_s > 2 * m.rise_time_s
                fprintf('  -> Long settling. Increase vel_kd (+20%%) to damp oscillations.\n');
            end

            fprintf('==========================================\n');
        end
    end
end
