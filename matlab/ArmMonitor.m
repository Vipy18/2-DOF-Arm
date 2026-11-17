classdef ArmMonitor < handle
    % ArmMonitor - MATLAB live-data dashboard for 2-DOF Robstride Arm
    % Uses base MATLAB R2020b+ uifigure and uigridlayout (no toolboxes needed)
    
    properties
        arm           % ArmControl reference
        fig           % uifigure handle
        update_timer  % timer for UI refresh
        has_synced_initial_state = false  % True once position input fields are synced with present motor angles
        
        % Link lengths in mm
        L1 = 233.19
        L2 = 208.19
        
        % Top bar elements
        lbl_title
        btn_reconnect
        btn_estop
        
        % Motor 1 UI elements
        m1_panel
        m1_pos_rad_lbl
        m1_pos_deg_lbl
        m1_vel_lbl
        m1_cur_lbl
        m1_volt_lbl
        m1_temp_lbl
        m1_fault_lbl
        
        % Motor 2 UI elements
        m2_panel
        m2_pos_rad_lbl
        m2_pos_deg_lbl
        m2_vel_lbl
        m2_cur_lbl
        m2_volt_lbl
        m2_temp_lbl
        m2_fault_lbl
        
        % Visualization UI elements
        viz_panel
        ax
        h_workspace_circle
        h_base_pivot
        h_base_link
        h_fore_link
        h_elbow_joint
        h_ee_joint
        
        % IK Input panel elements
        ik_panel
        ik_x_field
        ik_y_field
        ik_elbow_dropdown
        ik_traj_dropdown
        ik_spd_field
        ik_acc_field
        btn_ik_preview
        btn_ik_exec
        btn_ik_abort
        h_traj_plot
        traj_timer
        active_traj
        traj_step_idx
        ik_lbl_result
        ik_lbl_status
        ik_lbl_fk
        h_ik_target       % scatter handle - target crosshair on axes
        h_ik_ghost1       % Line handle - ghost link 1 (dashed)
        h_ik_ghost2       % Line handle - ghost link 2 (dashed)
        ik_preview_chk    % Checkbox: show ghost arm
        
        % PID Panel UI elements (7 parameters per motor)
        pid_panel
        m1_kp_pos_field
        m1_kp_vel_field
        m1_ki_vel_field
        m1_kd_vel_field
        m1_kp_cur_field
        m1_ki_cur_field
        m1_filt_cur_field
        m2_kp_pos_field
        m2_kp_vel_field
        m2_ki_vel_field
        m2_kd_vel_field
        m2_kp_cur_field
        m2_ki_cur_field
        m2_filt_cur_field
        
        % Limits & Safety UI elements
        limits_panel
        lbl_lim_pos_min
        lbl_lim_pos_max
        lbl_lim_vel
        m1_pos_min_field
        m1_pos_max_field
        m1_vel_lim_field
        m1_cur_lim_field
        m1_tor_lim_field
        m2_pos_min_field
        m2_pos_max_field
        m2_vel_lim_field
        m2_cur_lim_field
        m2_tor_lim_field
        
        % Live Oscilloscope UI elements and buffers
        osc_panel
        osc_ax
        osc_lines
        osc_dropdowns
        osc_buffers = zeros(6, 200)
        osc_buffer_idx = 1
        osc_xlim_listener
        
        % Motor Command UI elements
        cmd_panel
        unit_dropdown
        lbl_m1
        lbl_m2
        lbl_m1_speed      % Label for M1 speed (shows unit)
        lbl_m2_speed      % Label for M2 speed (shows unit)
        lbl_m1_accel      % Label for M1 acceleration (shows unit)
        lbl_m2_accel      % Label for M2 acceleration (shows unit)
        m1_target_field   % Target angle input for Motor 1
        m2_target_field   % Target angle input for Motor 2
        m1_angle_field
        m2_angle_field
        m1_speed_field
        m2_speed_field
        m1_accel_field    % Acceleration input for Motor 1
        m2_accel_field    % Acceleration input for Motor 2
        btn_send_both
        shortest_path_chk
        m1_jog_fwd
        m1_jog_bwd
        m2_jog_fwd
        m2_jog_bwd
        mode_dropdown
        
        % Data Logging UI elements and state
        log_panel
        log_dir_field
        btn_log_browse
        log_prefix_field
        log_mode_dropdown
        log_duration_field
        btn_log_toggle
        lbl_log_status
        lbl_log_samples
        lbl_log_elapsed
        lbl_log_file
        btn_log_open_folder
        is_logging = false
        is_timed_logging = false
        log_duration = 10.0
        log_start_time = 0
        log_fid = -1
        log_sample_count = 0
        log_current_file = ''
        log_static_params_str = ''
    end
    
    methods
        function obj = ArmMonitor(arm_obj)
            % Constructor: stores arm reference, builds UI, starts 10Hz update timer
            if nargin > 0
                obj.arm = arm_obj;
                if isprop(arm_obj, 'L1') && ~isempty(arm_obj.L1)
                    obj.L1 = arm_obj.L1;
                end
                if isprop(arm_obj, 'L2') && ~isempty(arm_obj.L2)
                    obj.L2 = arm_obj.L2;
                end
            end
            
            % Build UI layout
            obj.build_ui();
            
            % Automatically read present motor parameters (PID and Limits) from hardware
            if ~isempty(obj.arm)
                obj.read_initial_motor_state();
            end
            
            % Attach figure close callback
            obj.fig.CloseRequestFcn = @(~,~) obj.close_cb();
            
            % Create and start 25Hz update timer
            obj.update_timer = timer(...
                'ExecutionMode', 'fixedSpacing', ...
                'Period', 0.04, ...
                'BusyMode', 'drop', ...
                'TimerFcn', @(~,~) obj.update());
            
            start(obj.update_timer);
        end
        
        function build_ui(obj)
            % Construct 1600x950 scrollable uifigure and dark dashboard UI
            % Canvas Wrapper Architecture: master_grid -> scroll_panel -> canvas_panel -> main_grid
            % This 3-layer workaround bypasses the MATLAB uigridlayout bug where a grid
            % placed directly on a uifigure/scroll panel permanently disables scrolling
            % by compressing all content. The canvas_panel has a fixed pixel height that
            % exceeds the viewport, forcing the scroll_panel to spawn a real scrollbar.
            obj.fig = uifigure('Name', 'Robstride Arm Monitor', 'Color', [0.1, 0.1, 0.12]);
            obj.fig.Position = [50, 50, 1600, 950];

            % Layer 1: master_grid fills the figure (no scrolling here)
            master_grid = uigridlayout(obj.fig, [1, 1], 'Padding', [0 0 0 0]);
            master_grid.RowHeight = {'1x'};
            master_grid.ColumnWidth = {'1x'};

            % Layer 2: scroll_panel - the scrollable viewport
            scroll_panel = uipanel(master_grid, 'Scrollable', 'on', 'BorderType', 'none', 'BackgroundColor', [0.1, 0.1, 0.12], 'AutoResizeChildren', 'off');
            scroll_panel.Layout.Row = 1;
            scroll_panel.Layout.Column = 1;

            % Layer 3: canvas_panel - fixed pixel height (taller than viewport = scrollbar appears)
            canvas_h = 960;
            canvas_panel = uipanel(scroll_panel, 'Position', [0, 0, 1580, canvas_h], 'BorderType', 'none', 'BackgroundColor', [0.1, 0.1, 0.12]);

            % SizeChangedFcn: keep canvas width locked to scroll_panel width (no horizontal scroll)
            scroll_panel.SizeChangedFcn = @(src,~) obj.on_scroll_resize(src, canvas_panel, canvas_h);

            % main_grid lives inside canvas_panel (not directly on figure)
            main_grid = uigridlayout(canvas_panel, [3, 1]);
            main_grid.RowHeight = {55, 620, 250};
            main_grid.ColumnWidth = {'1x'};
            main_grid.Padding = [8, 8, 8, 8];
            main_grid.RowSpacing = 8;

            % --- TOP BAR ---
            top_panel = uipanel(main_grid);
            top_panel.Layout.Row = 1;
            top_panel.Layout.Column = 1;
            top_panel.BackgroundColor = [0.14, 0.14, 0.17];
            top_panel.BorderType = 'none';

            top_grid = uigridlayout(top_panel, [1, 3]);
            top_grid.ColumnWidth = {'1x', 140, 120};
            top_grid.RowHeight = {'1x'};
            top_grid.Padding = [15, 5, 15, 5];

            obj.lbl_title = uilabel(top_grid);
            obj.lbl_title.Layout.Row = 1;
            obj.lbl_title.Layout.Column = 1;
            obj.lbl_title.Text = 'ARM MONITOR';
            obj.lbl_title.FontColor = [1.0, 1.0, 1.0];
            obj.lbl_title.FontSize = 22;
            obj.lbl_title.FontWeight = 'bold';
            obj.lbl_title.VerticalAlignment = 'center';

            obj.btn_reconnect = uibutton(top_grid, 'push');
            obj.btn_reconnect.Layout.Row = 1;
            obj.btn_reconnect.Layout.Column = 2;
            obj.btn_reconnect.Text = 'RE-ENABLE';
            obj.btn_reconnect.BackgroundColor = [0.18, 0.55, 0.25];
            obj.btn_reconnect.FontColor = [1.0, 1.0, 1.0];
            obj.btn_reconnect.FontSize = 14;
            obj.btn_reconnect.FontWeight = 'bold';
            obj.btn_reconnect.ButtonPushedFcn = @(~,~) obj.reconnect();

            obj.btn_estop = uibutton(top_grid, 'push');
            obj.btn_estop.Layout.Row = 1;
            obj.btn_estop.Layout.Column = 3;
            obj.btn_estop.Text = 'E-STOP';
            obj.btn_estop.BackgroundColor = [0.85, 0.15, 0.15];
            obj.btn_estop.FontColor = [1.0, 1.0, 1.0];
            obj.btn_estop.FontSize = 16;
            obj.btn_estop.FontWeight = 'bold';
            obj.btn_estop.ButtonPushedFcn = @(~,~) obj.estop();

            % ===== BODY GRID (Row 2 of main_grid) =====
            body_grid = uigridlayout(main_grid, [2, 5]);
            body_grid.Layout.Row = 2;
            body_grid.Layout.Column = 1;
            body_grid.ColumnWidth = {240, '1x', 270, 290, 260};
            body_grid.RowHeight = {320, 290};
            body_grid.Padding = [0, 0, 0, 0];
            body_grid.ColumnSpacing = 8;
            body_grid.RowSpacing = 8;

            % Column 1, Row 1: Motor 1 Telemetry
            obj.m1_panel = uipanel(body_grid);
            obj.m1_panel.Layout.Row = 1;
            obj.m1_panel.Layout.Column = 1;
            obj.m1_panel.Title = 'Motor 1 / Base';
            obj.m1_panel.BackgroundColor = [0.13, 0.13, 0.16];
            obj.m1_panel.ForegroundColor = [1.0, 1.0, 1.0];
            obj.m1_panel.FontSize = 13;
            obj.m1_panel.FontWeight = 'bold';
            obj.m1_panel.Scrollable = 'off';

            % Column 1, Row 2: Motor 2 Telemetry
            obj.m2_panel = uipanel(body_grid);
            obj.m2_panel.Layout.Row = 2;
            obj.m2_panel.Layout.Column = 1;
            obj.m2_panel.Title = 'Motor 2 / Fore';
            obj.m2_panel.BackgroundColor = [0.13, 0.13, 0.16];
            obj.m2_panel.ForegroundColor = [1.0, 1.0, 1.0];
            obj.m2_panel.FontSize = 13;
            obj.m2_panel.FontWeight = 'bold';
            obj.m2_panel.Scrollable = 'off';

            obj.build_motor_widgets(1);
            obj.build_motor_widgets(2);

            % Column 2, Rows 1-2: Arm Visualization (spans both rows)
            obj.viz_panel = uipanel(body_grid);
            obj.viz_panel.Layout.Row = [1 2];
            obj.viz_panel.Layout.Column = 2;
            obj.viz_panel.Title = 'Arm Visualization';
            obj.viz_panel.BackgroundColor = [0.13, 0.13, 0.16];
            obj.viz_panel.ForegroundColor = [1.0, 1.0, 1.0];
            obj.viz_panel.FontSize = 13;
            obj.viz_panel.FontWeight = 'bold';

            viz_grid = uigridlayout(obj.viz_panel, [1, 1]);
            viz_grid.Padding = [8, 8, 8, 8];

            obj.ax = uiaxes(viz_grid);
            obj.ax.Layout.Row = 1;
            obj.ax.Layout.Column = 1;
            obj.ax.Color = [0.10, 0.10, 0.10];
            obj.ax.XColor = [0.65, 0.65, 0.65];
            obj.ax.YColor = [0.65, 0.65, 0.65];
            obj.ax.GridColor = [0.35, 0.35, 0.35];
            obj.ax.GridAlpha = 0.5;
            title(obj.ax, 'Arm Visualization', 'Color', [1.0, 1.0, 1.0], 'FontSize', 13);
            xlabel(obj.ax, 'X (mm)', 'Color', [0.8, 0.8, 0.8]);
            ylabel(obj.ax, 'Y (mm)', 'Color', [0.8, 0.8, 0.8]);
            grid(obj.ax, 'on');
            hold(obj.ax, 'on');

            max_reach = obj.L1 + obj.L2;
            lim = max_reach + 50;
            obj.ax.XLim = [-lim, lim];
            obj.ax.YLim = [-lim, lim];
            axis(obj.ax, 'equal');

            th_c = linspace(0, 2*pi, 200);
            xc = max_reach * cos(th_c);
            yc = max_reach * sin(th_c);
            obj.h_workspace_circle = plot(obj.ax, xc, yc, '--', 'Color', [0.5, 0.5, 0.5], 'LineWidth', 1.2);

            obj.h_base_pivot = plot(obj.ax, 0, 0, 'o', ...
                'MarkerFaceColor', [0.8, 0.8, 0.8], ...
                'MarkerEdgeColor', [1.0, 1.0, 1.0], ...
                'MarkerSize', 8);

            obj.h_base_link = plot(obj.ax, [0, 0], [0, -obj.L1], '-', ...
                'Color', [1.0, 1.0, 1.0], 'LineWidth', 4);
            obj.h_fore_link = plot(obj.ax, [0, 0], [-obj.L1, -(obj.L1 + obj.L2)], '-', ...
                'Color', [0.35, 0.75, 1.0], 'LineWidth', 4);
            obj.h_elbow_joint = plot(obj.ax, 0, -obj.L1, 'o', ...
                'MarkerFaceColor', [0.2, 0.6, 1.0], ...
                'MarkerEdgeColor', [1.0, 1.0, 1.0], ...
                'MarkerSize', 8);
            obj.h_ee_joint = plot(obj.ax, 0, -(obj.L1 + obj.L2), 'o', ...
                'MarkerFaceColor', [1.0, 0.4, 0.2], ...
                'MarkerEdgeColor', [1.0, 1.0, 1.0], ...
                'MarkerSize', 9);

            obj.redraw_arm(0, 0);

            % Column 3, Row 1: Motor Commands
            obj.cmd_panel = uipanel(body_grid);
            obj.cmd_panel.Layout.Row = 1;
            obj.cmd_panel.Layout.Column = 3;
            obj.cmd_panel.Title = 'Motor Commands';
            obj.cmd_panel.BackgroundColor = [0.13, 0.13, 0.16];
            obj.cmd_panel.ForegroundColor = [1.0, 1.0, 1.0];
            obj.cmd_panel.FontSize = 13;
            obj.cmd_panel.FontWeight = 'bold';
            obj.cmd_panel.Scrollable = 'off';

            % Column 3, Row 2: Inverse Kinematics
            obj.ik_panel = uipanel(body_grid);
            obj.ik_panel.Layout.Row = 2;
            obj.ik_panel.Layout.Column = 3;
            obj.ik_panel.Title = 'Inverse Kinematics';
            obj.ik_panel.BackgroundColor = [0.13, 0.13, 0.16];
            obj.ik_panel.ForegroundColor = [1.0, 1.0, 1.0];
            obj.ik_panel.FontSize = 13;
            obj.ik_panel.FontWeight = 'bold';
            obj.ik_panel.Scrollable = 'off';

            % Column 4, Row 1: PID Tuning
            obj.pid_panel = uipanel(body_grid);
            obj.pid_panel.Layout.Row = 1;
            obj.pid_panel.Layout.Column = 4;
            obj.pid_panel.Title = 'PID Tuning';
            obj.pid_panel.BackgroundColor = [0.13, 0.13, 0.16];
            obj.pid_panel.ForegroundColor = [1.0, 1.0, 1.0];
            obj.pid_panel.FontSize = 13;
            obj.pid_panel.FontWeight = 'bold';
            obj.pid_panel.Scrollable = 'off';

            % Column 4, Row 2: Limits & Safety
            obj.limits_panel = uipanel(body_grid);
            obj.limits_panel.Layout.Row = 2;
            obj.limits_panel.Layout.Column = 4;
            obj.limits_panel.Title = 'Limits & Safety';
            obj.limits_panel.BackgroundColor = [0.13, 0.13, 0.16];
            obj.limits_panel.ForegroundColor = [1.0, 1.0, 1.0];
            obj.limits_panel.FontSize = 13;
            obj.limits_panel.FontWeight = 'bold';
            obj.limits_panel.Scrollable = 'off';

            % Column 5, Rows 1-2: Data Logging (spans both rows)
            obj.log_panel = uipanel(body_grid);
            obj.log_panel.Layout.Row = [1 2];
            obj.log_panel.Layout.Column = 5;
            obj.log_panel.Title = 'Data Logging';
            obj.log_panel.BackgroundColor = [0.13, 0.13, 0.16];
            obj.log_panel.ForegroundColor = [1.0, 1.0, 1.0];
            obj.log_panel.FontSize = 13;
            obj.log_panel.FontWeight = 'bold';
            obj.log_panel.Scrollable = 'off';

            obj.build_command_panel();
            obj.build_ik_panel();
            obj.build_pid_panel();
            obj.build_limits_panel();
            obj.build_log_panel();

            % Row 3: Live Oscilloscope Panel
            obj.osc_panel = uipanel(main_grid);
            obj.osc_panel.Layout.Row = 3;
            obj.osc_panel.Layout.Column = 1;
            obj.osc_panel.Title = 'Live Oscilloscope';
            obj.osc_panel.BackgroundColor = [0.13, 0.13, 0.16];
            obj.osc_panel.ForegroundColor = [1.0, 1.0, 1.0];
            obj.osc_panel.FontSize = 13;
            obj.osc_panel.FontWeight = 'bold';
            obj.build_oscilloscope();

            obj.m1_angle_field = obj.m1_target_field;
            obj.m2_angle_field = obj.m2_target_field;
            if ~isempty(obj.cmd_panel) && isvalid(obj.cmd_panel)
                cg_children = obj.cmd_panel.Children;
                if ~isempty(cg_children)
                    all_btns = findobj(cg_children, 'Type', 'uibutton');
                    for b_idx = 1:numel(all_btns)
                        if contains(all_btns(b_idx).Text, 'SEND BOTH', 'IgnoreCase', true)
                            obj.btn_send_both = all_btns(b_idx);
                            break;
                        end
                    end
                    all_lbls = findobj(cg_children, 'Type', 'uilabel');
                    for l_idx = 1:numel(all_lbls)
                        if contains(all_lbls(l_idx).Text, 'M1 Target', 'IgnoreCase', true)
                            obj.lbl_m1 = all_lbls(l_idx);
                        elseif contains(all_lbls(l_idx).Text, 'M2 Target', 'IgnoreCase', true)
                            obj.lbl_m2 = all_lbls(l_idx);
                        end
                    end
                end
            end
        end
        
        function update(obj)
            % Called by 25 Hz timer: updates telemetry values, threshold colors, arm plot, and oscilloscope
            try
                if isempty(obj.fig) || ~isgraphics(obj.fig)
                    return;
                end
                if isempty(obj.arm) || (~isprop(obj.arm, 'Telemetry') && ~isfield(obj.arm, 'Telemetry')) || isempty(obj.arm.Telemetry)
                    return;
                end
                
                telem = obj.arm.Telemetry;
                th1 = 0;
                th2 = 0;

                % Synchronize control bar target angle fields to motor's present angle on first frame
                if ~obj.has_synced_initial_state
                    if isfield(telem, 'm1') && isfield(telem.m1, 'position') && ...
                       isfield(telem, 'm2') && isfield(telem.m2, 'position')
                        unit = 'deg';
                        if ~isempty(obj.unit_dropdown) && isvalid(obj.unit_dropdown)
                            unit = obj.unit_dropdown.Value;
                        end
                        if strcmp(unit, 'deg')
                            obj.m1_angle_field.Value = round(telem.m1.position * (180 / pi), 1);
                            obj.m2_angle_field.Value = round(telem.m2.position * (180 / pi), 1);
                        else
                            obj.m1_angle_field.Value = round(telem.m1.position, 3);
                            obj.m2_angle_field.Value = round(telem.m2.position, 3);
                        end
                        obj.has_synced_initial_state = true;
                    end
                end
                
                % Update Motor 1
                if isfield(telem, 'm1') && ~isempty(telem.m1)
                    m1 = telem.m1;
                    if isfield(m1, 'position')
                        th1 = m1.position;
                        obj.m1_pos_rad_lbl.Text = sprintf('%.3f rad', th1);
                        obj.m1_pos_deg_lbl.Text = sprintf('%.1f deg', th1 * (180 / pi));
                    end
                    if isfield(m1, 'velocity')
                        obj.m1_vel_lbl.Text = sprintf('%.2f rad/s', m1.velocity);
                    end
                    if isfield(m1, 'current')
                        cur1 = m1.current;
                        obj.m1_cur_lbl.Text = sprintf('%.2f A', cur1);
                        if abs(cur1) > 4.5
                            obj.m1_cur_lbl.FontColor = [1.0, 0.25, 0.25]; % Red (>4.5A)
                        elseif abs(cur1) > 3.0
                            obj.m1_cur_lbl.FontColor = [1.0, 0.85, 0.0];  % Yellow (>3.0A)
                        else
                            obj.m1_cur_lbl.FontColor = [1.0, 1.0, 1.0];   % White normal
                        end
                    end
                    if isfield(m1, 'voltage')
                        obj.m1_volt_lbl.Text = sprintf('%.1f V', m1.voltage);
                    end
                    if isfield(m1, 'temperature')
                        temp1 = m1.temperature;
                        obj.m1_temp_lbl.Text = sprintf('%.1f deg C', temp1);
                        if temp1 > 80
                            obj.m1_temp_lbl.FontColor = [1.0, 0.25, 0.25]; % Red (>80C)
                        elseif temp1 > 60
                            obj.m1_temp_lbl.FontColor = [1.0, 0.85, 0.0];  % Yellow (>60C)
                        else
                            obj.m1_temp_lbl.FontColor = [1.0, 1.0, 1.0];   % White normal
                        end
                    end
                    if isfield(m1, 'fault_str')
                        fstr1 = string(m1.fault_str);
                        obj.m1_fault_lbl.Text = char(fstr1);
                        if ~strcmpi(strtrim(fstr1), "OK") && ~strcmpi(strtrim(fstr1), "None") && strlength(strtrim(fstr1)) > 0
                            obj.m1_fault_lbl.BackgroundColor = [0.85, 0.15, 0.15]; % Red on fault
                            obj.m1_fault_lbl.FontColor = [1.0, 1.0, 1.0];
                        else
                            obj.m1_fault_lbl.BackgroundColor = [0.18, 0.18, 0.22];
                            obj.m1_fault_lbl.FontColor = [0.4, 1.0, 0.4]; % Green on OK
                        end
                    end
                end
                
                % Update Motor 2
                if isfield(telem, 'm2') && ~isempty(telem.m2)
                    m2 = telem.m2;
                    if isfield(m2, 'position')
                        th2 = m2.position;
                        obj.m2_pos_rad_lbl.Text = sprintf('%.3f rad', th2);
                        obj.m2_pos_deg_lbl.Text = sprintf('%.1f deg', th2 * (180 / pi));
                    end
                    if isfield(m2, 'velocity')
                        obj.m2_vel_lbl.Text = sprintf('%.2f rad/s', m2.velocity);
                    end
                    if isfield(m2, 'current')
                        cur2 = m2.current;
                        obj.m2_cur_lbl.Text = sprintf('%.2f A', cur2);
                        if abs(cur2) > 4.5
                            obj.m2_cur_lbl.FontColor = [1.0, 0.25, 0.25]; % Red (>4.5A)
                        elseif abs(cur2) > 3.0
                            obj.m2_cur_lbl.FontColor = [1.0, 0.85, 0.0];  % Yellow (>3.0A)
                        else
                            obj.m2_cur_lbl.FontColor = [1.0, 1.0, 1.0];   % White normal
                        end
                    end
                    if isfield(m2, 'voltage')
                        obj.m2_volt_lbl.Text = sprintf('%.1f V', m2.voltage);
                    end
                    if isfield(m2, 'temperature')
                        temp2 = m2.temperature;
                        obj.m2_temp_lbl.Text = sprintf('%.1f deg C', temp2);
                        if temp2 > 80
                            obj.m2_temp_lbl.FontColor = [1.0, 0.25, 0.25]; % Red (>80C)
                        elseif temp2 > 60
                            obj.m2_temp_lbl.FontColor = [1.0, 0.85, 0.0];  % Yellow (>60C)
                        else
                            obj.m2_temp_lbl.FontColor = [1.0, 1.0, 1.0];   % White normal
                        end
                    end
                    if isfield(m2, 'fault_str')
                        fstr2 = string(m2.fault_str);
                        obj.m2_fault_lbl.Text = char(fstr2);
                        if ~strcmpi(strtrim(fstr2), "OK") && ~strcmpi(strtrim(fstr2), "None") && strlength(strtrim(fstr2)) > 0
                            obj.m2_fault_lbl.BackgroundColor = [0.85, 0.15, 0.15]; % Red on fault
                            obj.m2_fault_lbl.FontColor = [1.0, 1.0, 1.0];
                        else
                            obj.m2_fault_lbl.BackgroundColor = [0.18, 0.18, 0.22];
                            obj.m2_fault_lbl.FontColor = [0.4, 1.0, 0.4]; % Green on OK
                        end
                    end
                end
                
                % Update Live Oscilloscope
                obj.update_oscilloscope(telem);
                
                % Redraw arm visualization
                obj.redraw_arm(th1, th2);
                obj.update_ik_fk_readback(th1, th2);
                
                % Real-time CSV Data Logging
                if obj.is_logging && obj.log_fid > 0
                    obj.log_telemetry_sample(telem, th1, th2);
                end
                
            catch
                % Silently return on error
                return;
            end
        end
        
        function estop(obj)
            % Synchronous Emergency Stop: instantly disables both motors and alerts
            try
                obj.abort_trajectory();
            catch
            end
            try
                if ~isempty(obj.arm)
                    m1_id = 1;
                    m2_id = 2;
                    if isprop(obj.arm, 'MOTOR_1_ID') && ~isempty(obj.arm.MOTOR_1_ID)
                        m1_id = obj.arm.MOTOR_1_ID;
                    end
                    if isprop(obj.arm, 'MOTOR_2_ID') && ~isempty(obj.arm.MOTOR_2_ID)
                        m2_id = obj.arm.MOTOR_2_ID;
                    end
                    try
                        obj.arm.disable_motor(m1_id);
                    catch e1
                        warning('ArmMonitor:estop_m1', 'Failed to disable M1: %s', e1.message);
                    end
                    try
                        obj.arm.disable_motor(m2_id);
                    catch e2
                        warning('ArmMonitor:estop_m2', 'Failed to disable M2: %s', e2.message);
                    end
                end
            catch e
                warning('ArmMonitor:estop', 'Error executing E-STOP: %s', e.message);
            end
            
            % Display warning dialog
            try
                if ~isempty(obj.fig) && isgraphics(obj.fig)
                    uialert(obj.fig, 'EMERGENCY STOP ACTIVATED', 'EMERGENCY STOP', 'Icon', 'error');
                else
                    errordlg('EMERGENCY STOP ACTIVATED', 'EMERGENCY STOP');
                end
            catch
                errordlg('EMERGENCY STOP ACTIVATED', 'EMERGENCY STOP');
            end
        end
        
        function reconnect(obj)
            % Reconnects / Re-enables motors after E-STOP or connection reset
            try
                if isempty(obj.arm)
                    warning('ArmMonitor:reconnect', 'No ArmControl object attached.');
                    return;
                end
                
                % Re-open serial port if closed
                if isempty(obj.arm.s) || ~isvalid(obj.arm.s)
                    disp('Re-opening serial connection...');
                    obj.arm.connect();
                end
                
                m1_id = obj.arm.MOTOR_1_ID;
                m2_id = obj.arm.MOTOR_2_ID;
                
                % Query selected control mode from UI
                mode_str = 'Position';
                if ~isempty(obj.mode_dropdown) && isvalid(obj.mode_dropdown)
                    mode_str = obj.mode_dropdown.Value;
                end
                
                % Re-enable motors in selected mode without overwriting PID or limits
                for mid = [m1_id, m2_id]
                    obj.arm.disable_timeout(mid);
                    switch mode_str
                        case 'Position'
                            obj.arm.set_position_mode(mid);
                        case 'Velocity'
                            obj.arm.set_velocity_mode(mid);
                        case 'Current'
                            obj.arm.set_current_mode(mid);
                    end
                    obj.arm.enable_motor(mid);
                    pause(0.05);
                end
                
                % Restart telemetry polling timer
                obj.arm.start_telemetry(20);
                
                fprintf('Motors re-enabled in %s mode and telemetry restarted.\n', mode_str);
                
                if ~isempty(obj.fig) && isgraphics(obj.fig)
                    uialert(obj.fig, sprintf('Motors re-enabled in %s mode.\nTelemetry active.', mode_str), ...
                            'Motors Re-enabled', 'Icon', 'success');
                end
            catch e
                warning('ArmMonitor:reconnect', 'Reconnection failed: %s', e.message);
                if ~isempty(obj.fig) && isgraphics(obj.fig)
                    uialert(obj.fig, sprintf('Reconnection failed:\n%s', e.message), ...
                            'Reconnection Error', 'Icon', 'error');
                end
            end
        end
        
        function close_cb(obj)
            % Close callback: stops timer, stops telemetry, and deletes figure
            try
                if obj.is_logging
                    obj.stop_csv_logging();
                end
            catch
            end
            try
                obj.abort_trajectory();
            catch
            end
            try
                obj.clear_trajectory_path();
            catch
            end
            try
                if ~isempty(obj.update_timer) && isvalid(obj.update_timer)
                    stop(obj.update_timer);
                    delete(obj.update_timer);
                    obj.update_timer = [];
                end
            catch
            end
            
            try
                if ~isempty(obj.osc_xlim_listener) && isvalid(obj.osc_xlim_listener)
                    delete(obj.osc_xlim_listener);
                    obj.osc_xlim_listener = [];
                end
            catch
            end
            
            try
                if ~isempty(obj.arm) && (ismethod(obj.arm, 'stop_telemetry') || isprop(obj.arm, 'stop_telemetry'))
                    obj.arm.stop_telemetry();
                end
            catch
            end
            
            try
                if ~isempty(obj.fig) && isgraphics(obj.fig)
                    delete(obj.fig);
                end
            catch
            end
        end
        
        function delete(obj)
            % Handle destructor to guarantee timer cleanup
            obj.close_cb();
        end

        function read_initial_motor_state(obj)
            % Queries active PID gains and Limits directly from hardware
            try
                if isempty(obj.arm)
                    return;
                end
                
                mid1 = 1; mid2 = 2;
                if isprop(obj.arm, 'MOTOR_1_ID') || isfield(obj.arm, 'MOTOR_1_ID')
                    mid1 = obj.arm.MOTOR_1_ID;
                end
                if isprop(obj.arm, 'MOTOR_2_ID') || isfield(obj.arm, 'MOTOR_2_ID')
                    mid2 = obj.arm.MOTOR_2_ID;
                end
                
                % Query active PID gains from both motors
                obj.read_pid_to_panel(mid1);
                pause(0.02);
                obj.read_pid_to_panel(mid2);
                pause(0.02);
                
                % Query active limits from both motors
                obj.read_limits_to_panel(mid1);
                pause(0.02);
                obj.read_limits_to_panel(mid2);
                pause(0.02);
                
                disp('Initial motor state (PID and Limits) successfully loaded into UI.');
            catch e
                disp(['ArmMonitor: note on initial state read: ' e.message]);
            end
        end

        function read_limits_to_panel(obj, motor_id)
            try
                if isempty(obj.arm)
                    return;
                end

                % Ensure all limit fields accept any motor-reported value
                lim_fields = {obj.m1_pos_min_field, obj.m1_pos_max_field, obj.m1_vel_lim_field, ...
                              obj.m1_cur_lim_field, obj.m1_tor_lim_field, ...
                              obj.m2_pos_min_field, obj.m2_pos_max_field, ...
                              obj.m2_vel_lim_field, obj.m2_cur_lim_field, obj.m2_tor_lim_field};
                for fi = 1:numel(lim_fields)
                    fld = lim_fields{fi};
                    if ~isempty(fld) && isvalid(fld)
                        fld.Limits = [-Inf, Inf];
                    end
                end

                is_m1 = (motor_id == 1);
                if isprop(obj.arm, 'MOTOR_1_ID') || isfield(obj.arm, 'MOTOR_1_ID')
                    is_m1 = (motor_id == obj.arm.MOTOR_1_ID);
                end

                unit = 'deg';
                if ~isempty(obj.unit_dropdown) && isvalid(obj.unit_dropdown)
                    unit = obj.unit_dropdown.Value;
                end
                is_deg = strcmp(unit, 'deg');

                % Read joint limits from obj.arm.JOINT_LIMITS
                jl = [];
                if isprop(obj.arm, 'JOINT_LIMITS') || isfield(obj.arm, 'JOINT_LIMITS')
                    jl = obj.arm.JOINT_LIMITS;
                end
                if isstruct(jl)
                    if is_m1
                        if isfield(jl, 'm1_min')
                            if is_deg, pos_val = round(jl.m1_min * (180 / pi), 1);
                            else, pos_val = jl.m1_min; end
                            try
                                if pos_val < obj.m1_pos_min_field.Limits(1) || pos_val > obj.m1_pos_min_field.Limits(2)
                                    obj.m1_pos_min_field.Limits = [-Inf, Inf];
                                end
                                obj.m1_pos_min_field.Value = pos_val;
                            catch
                            end
                        end
                        if isfield(jl, 'm1_max')
                            if is_deg, pos_val = round(jl.m1_max * (180 / pi), 1);
                            else, pos_val = jl.m1_max; end
                            try
                                if pos_val < obj.m1_pos_max_field.Limits(1) || pos_val > obj.m1_pos_max_field.Limits(2)
                                    obj.m1_pos_max_field.Limits = [-Inf, Inf];
                                end
                                obj.m1_pos_max_field.Value = pos_val;
                            catch
                            end
                        end
                    else
                        if isfield(jl, 'm2_min')
                            if is_deg, pos_val = round(jl.m2_min * (180 / pi), 1);
                            else, pos_val = jl.m2_min; end
                            try
                                if pos_val < obj.m2_pos_min_field.Limits(1) || pos_val > obj.m2_pos_min_field.Limits(2)
                                    obj.m2_pos_min_field.Limits = [-Inf, Inf];
                                end
                                obj.m2_pos_min_field.Value = pos_val;
                            catch
                            end
                        end
                        if isfield(jl, 'm2_max')
                            if is_deg, pos_val = round(jl.m2_max * (180 / pi), 1);
                            else, pos_val = jl.m2_max; end
                            try
                                if pos_val < obj.m2_pos_max_field.Limits(1) || pos_val > obj.m2_pos_max_field.Limits(2)
                                    obj.m2_pos_max_field.Limits = [-Inf, Inf];
                                end
                                obj.m2_pos_max_field.Value = pos_val;
                            catch
                            end
                        end
                    end
                end

                % Read velocity, current, and torque limits from motor
                has_read_limits = ismethod(obj.arm, 'read_limits') || ...
                    (isfield(obj.arm, 'read_limits') && isa(obj.arm.read_limits, 'function_handle'));
                if has_read_limits
                    limits = obj.arm.read_limits(motor_id);
                    vel_val = NaN;
                    cur_val = NaN;
                    tor_val = NaN;
                    if isstruct(limits)
                        if isfield(limits, 'limit_spd') && ~isnan(limits.limit_spd)
                            vel_val = limits.limit_spd;
                        elseif isfield(limits, 'vel_lim') && ~isnan(limits.vel_lim)
                            vel_val = limits.vel_lim;
                        elseif isfield(limits, 'max_vel') && ~isnan(limits.max_vel)
                            vel_val = limits.max_vel;
                        end
                        if isfield(limits, 'limit_cur') && ~isnan(limits.limit_cur)
                            cur_val = limits.limit_cur;
                        elseif isfield(limits, 'cur_lim') && ~isnan(limits.cur_lim)
                            cur_val = limits.cur_lim;
                        elseif isfield(limits, 'max_cur') && ~isnan(limits.max_cur)
                            cur_val = limits.max_cur;
                        end
                        if isfield(limits, 'limit_torque') && ~isnan(limits.limit_torque)
                            tor_val = limits.limit_torque;
                        elseif isfield(limits, 'torque_lim') && ~isnan(limits.torque_lim)
                            tor_val = limits.torque_lim;
                        elseif isfield(limits, 'max_torque') && ~isnan(limits.max_torque)
                            tor_val = limits.max_torque;
                        end
                    elseif isnumeric(limits) && length(limits) >= 3
                        vel_val = limits(1);
                        cur_val = limits(2);
                        tor_val = limits(3);
                    elseif isnumeric(limits) && length(limits) >= 2
                        vel_val = limits(1);
                        cur_val = limits(2);
                    end

                    % If deg mode, convert motor rad/s to deg/s
                    if is_deg && ~isnan(vel_val)
                        vel_val = round(vel_val * (180 / pi), 1);
                    end

                    if is_m1
                        if ~isnan(vel_val)
                            try
                                if vel_val < obj.m1_vel_lim_field.Limits(1) || vel_val > obj.m1_vel_lim_field.Limits(2)
                                    obj.m1_vel_lim_field.Limits = [-Inf, Inf];
                                end
                                obj.m1_vel_lim_field.Value = vel_val;
                            catch
                            end
                        end
                        if ~isnan(cur_val)
                            try
                                if cur_val < obj.m1_cur_lim_field.Limits(1) || cur_val > obj.m1_cur_lim_field.Limits(2)
                                    obj.m1_cur_lim_field.Limits = [-Inf, Inf];
                                end
                                obj.m1_cur_lim_field.Value = cur_val;
                            catch
                            end
                        end
                        if ~isnan(tor_val)
                            try
                                if tor_val < obj.m1_tor_lim_field.Limits(1) || tor_val > obj.m1_tor_lim_field.Limits(2)
                                    obj.m1_tor_lim_field.Limits = [-Inf, Inf];
                                end
                                obj.m1_tor_lim_field.Value = tor_val;
                            catch
                            end
                        end
                    else
                        if ~isnan(vel_val)
                            try
                                if vel_val < obj.m2_vel_lim_field.Limits(1) || vel_val > obj.m2_vel_lim_field.Limits(2)
                                    obj.m2_vel_lim_field.Limits = [-Inf, Inf];
                                end
                                obj.m2_vel_lim_field.Value = vel_val;
                            catch
                            end
                        end
                        if ~isnan(cur_val)
                            try
                                if cur_val < obj.m2_cur_lim_field.Limits(1) || cur_val > obj.m2_cur_lim_field.Limits(2)
                                    obj.m2_cur_lim_field.Limits = [-Inf, Inf];
                                end
                                obj.m2_cur_lim_field.Value = cur_val;
                            catch
                            end
                        end
                        if ~isnan(tor_val)
                            try
                                if tor_val < obj.m2_tor_lim_field.Limits(1) || tor_val > obj.m2_tor_lim_field.Limits(2)
                                    obj.m2_tor_lim_field.Limits = [-Inf, Inf];
                                end
                                obj.m2_tor_lim_field.Value = tor_val;
                            catch
                            end
                        end
                    end
                end
            catch e
                warning('ArmMonitor:readLimits', 'Could not read limits: %s', e.message);
            end
        end

        function write_limits_from_panel(obj, motor_id)
            try
                if isempty(obj.arm)
                    return;
                end

                is_m1 = (motor_id == 1);
                if isprop(obj.arm, 'MOTOR_1_ID') || isfield(obj.arm, 'MOTOR_1_ID')
                    is_m1 = (motor_id == obj.arm.MOTOR_1_ID);
                end

                if is_m1
                    min_val = obj.m1_pos_min_field.Value;
                    max_val = obj.m1_pos_max_field.Value;
                    vel_val = obj.m1_vel_lim_field.Value;
                    cur_val = obj.m1_cur_lim_field.Value;
                    tor_val = obj.m1_tor_lim_field.Value;
                else
                    min_val = obj.m2_pos_min_field.Value;
                    max_val = obj.m2_pos_max_field.Value;
                    vel_val = obj.m2_vel_lim_field.Value;
                    cur_val = obj.m2_cur_lim_field.Value;
                    tor_val = obj.m2_tor_lim_field.Value;
                end

                % Clamp safety limits
                if min_val > max_val
                    tmp = min_val;
                    min_val = max_val;
                    max_val = tmp;
                end

                unit = 'deg';
                if ~isempty(obj.unit_dropdown) && isvalid(obj.unit_dropdown)
                    unit = obj.unit_dropdown.Value;
                end
                is_deg = strcmp(unit, 'deg');

                % Convert to radians for ArmControl
                if is_deg
                    min_rad = min_val * (pi / 180);
                    max_rad = max_val * (pi / 180);
                    vel_rad = vel_val * (pi / 180);
                    vel_rad = max(0, min(33, vel_rad));
                    vel_val = round(vel_rad * (180 / pi), 1); % Clamped display value in deg/s
                else
                    min_rad = min_val;
                    max_rad = max_val;
                    vel_rad = max(0, min(33, vel_val));
                    vel_val = vel_rad;
                end

                cur_val = max(0, min(16, cur_val));
                tor_val = max(0, min(17, tor_val));

                % Update UI fields with clamped values
                if is_m1
                    obj.m1_pos_min_field.Value = min_val;
                    obj.m1_pos_max_field.Value = max_val;
                    obj.m1_vel_lim_field.Value = vel_val;
                    obj.m1_cur_lim_field.Value = cur_val;
                    obj.m1_tor_lim_field.Value = tor_val;
                else
                    obj.m2_pos_min_field.Value = min_val;
                    obj.m2_pos_max_field.Value = max_val;
                    obj.m2_vel_lim_field.Value = vel_val;
                    obj.m2_cur_lim_field.Value = cur_val;
                    obj.m2_tor_lim_field.Value = tor_val;
                end

                obj.arm.set_joint_limits(motor_id, min_rad, max_rad);
                obj.arm.set_velocity_limit(motor_id, vel_rad);
                obj.arm.set_current_limit(motor_id, cur_val);
                obj.arm.set_torque_limit(motor_id, tor_val);
                fprintf('Limits written to Motor %d (Max Vel = %.2f rad/s).\n', motor_id, vel_rad);
            catch e
                warning('ArmMonitor:writeLimits', 'Could not write limits: %s', e.message);
            end
        end

        function read_pid_to_panel(obj, motor_id)
            try
                if isempty(obj.arm)
                    return;
                end
                pid = obj.arm.read_pid(motor_id);
                if ~isstruct(pid)
                    return;
                end

                is_m1 = (motor_id == 1);
                if isprop(obj.arm, 'MOTOR_1_ID') || isfield(obj.arm, 'MOTOR_1_ID')
                    is_m1 = (motor_id == obj.arm.MOTOR_1_ID);
                end

                % Extract 7 values with fallbacks
                val_pos_kp = NaN;
                if isfield(pid, 'loc_kp') && ~isnan(pid.loc_kp)
                    val_pos_kp = pid.loc_kp;
                elseif isfield(pid, 'kp_pos') && ~isnan(pid.kp_pos)
                    val_pos_kp = pid.kp_pos;
                end

                val_vel_kp = NaN;
                if isfield(pid, 'spd_kp') && ~isnan(pid.spd_kp)
                    val_vel_kp = pid.spd_kp;
                elseif isfield(pid, 'kp_vel') && ~isnan(pid.kp_vel)
                    val_vel_kp = pid.kp_vel;
                end

                val_vel_ki = NaN;
                if isfield(pid, 'spd_ki') && ~isnan(pid.spd_ki)
                    val_vel_ki = pid.spd_ki;
                elseif isfield(pid, 'ki_vel') && ~isnan(pid.ki_vel)
                    val_vel_ki = pid.ki_vel;
                end

                val_vel_filt = NaN;
                if isfield(pid, 'spd_filt') && ~isnan(pid.spd_filt)
                    val_vel_filt = pid.spd_filt;
                elseif isfield(pid, 'kd_vel') && ~isnan(pid.kd_vel)
                    val_vel_filt = pid.kd_vel;
                end

                val_cur_kp = NaN;
                if isfield(pid, 'cur_kp') && ~isnan(pid.cur_kp)
                    val_cur_kp = pid.cur_kp;
                end

                val_cur_ki = NaN;
                if isfield(pid, 'cur_ki') && ~isnan(pid.cur_ki)
                    val_cur_ki = pid.cur_ki;
                end

                val_cur_filt = NaN;
                if isfield(pid, 'cur_filt') && ~isnan(pid.cur_filt)
                    val_cur_filt = pid.cur_filt;
                end

                if is_m1
                    if ~isnan(val_pos_kp),   obj.m1_kp_pos_field.Value   = val_pos_kp; end
                    if ~isnan(val_vel_kp),   obj.m1_kp_vel_field.Value   = val_vel_kp; end
                    if ~isnan(val_vel_ki),   obj.m1_ki_vel_field.Value   = val_vel_ki; end
                    if ~isnan(val_vel_filt), obj.m1_kd_vel_field.Value   = val_vel_filt; end
                    if ~isnan(val_cur_kp),   obj.m1_kp_cur_field.Value   = val_cur_kp; end
                    if ~isnan(val_cur_ki),   obj.m1_ki_cur_field.Value   = val_cur_ki; end
                    if ~isnan(val_cur_filt), obj.m1_filt_cur_field.Value = val_cur_filt; end
                else
                    if ~isnan(val_pos_kp),   obj.m2_kp_pos_field.Value   = val_pos_kp; end
                    if ~isnan(val_vel_kp),   obj.m2_kp_vel_field.Value   = val_vel_kp; end
                    if ~isnan(val_vel_ki),   obj.m2_ki_vel_field.Value   = val_vel_ki; end
                    if ~isnan(val_vel_filt), obj.m2_kd_vel_field.Value   = val_vel_filt; end
                    if ~isnan(val_cur_kp),   obj.m2_kp_cur_field.Value   = val_cur_kp; end
                    if ~isnan(val_cur_ki),   obj.m2_ki_cur_field.Value   = val_cur_ki; end
                    if ~isnan(val_cur_filt), obj.m2_filt_cur_field.Value = val_cur_filt; end
                end
                fprintf('PID read from Motor %d.\n', motor_id);
            catch e
                warning('ArmMonitor:readPID', 'Could not read PID: %s', e.message);
            end
        end

        function write_pid_from_panel(obj, motor_id)
            try
                if isempty(obj.arm)
                    return;
                end

                is_m1 = (motor_id == 1);
                if isprop(obj.arm, 'MOTOR_1_ID') || isfield(obj.arm, 'MOTOR_1_ID')
                    is_m1 = (motor_id == obj.arm.MOTOR_1_ID);
                end

                if is_m1
                    pos_kp   = obj.m1_kp_pos_field.Value;
                    vel_kp   = obj.m1_kp_vel_field.Value;
                    vel_ki   = obj.m1_ki_vel_field.Value;
                    vel_filt = obj.m1_kd_vel_field.Value;
                    cur_kp   = obj.m1_kp_cur_field.Value;
                    cur_ki   = obj.m1_ki_cur_field.Value;
                    cur_filt = obj.m1_filt_cur_field.Value;
                else
                    pos_kp   = obj.m2_kp_pos_field.Value;
                    vel_kp   = obj.m2_kp_vel_field.Value;
                    vel_ki   = obj.m2_ki_vel_field.Value;
                    vel_filt = obj.m2_kd_vel_field.Value;
                    cur_kp   = obj.m2_kp_cur_field.Value;
                    cur_ki   = obj.m2_ki_cur_field.Value;
                    cur_filt = obj.m2_filt_cur_field.Value;
                end

                % Safety clamps
                pos_kp   = max(0, min(200, pos_kp));
                vel_kp   = max(0, min(50, vel_kp));
                vel_ki   = max(0, min(5, vel_ki));
                vel_filt = max(0.001, min(1.0, vel_filt));
                cur_kp   = max(0, min(10, cur_kp));
                cur_ki   = max(0, min(5, cur_ki));
                cur_filt = max(0.001, min(1.0, cur_filt));

                % Write clamped values back to edit fields
                if is_m1
                    obj.m1_kp_pos_field.Value   = pos_kp;
                    obj.m1_kp_vel_field.Value   = vel_kp;
                    obj.m1_ki_vel_field.Value   = vel_ki;
                    obj.m1_kd_vel_field.Value   = vel_filt;
                    obj.m1_kp_cur_field.Value   = cur_kp;
                    obj.m1_ki_cur_field.Value   = cur_ki;
                    obj.m1_filt_cur_field.Value = cur_filt;
                else
                    obj.m2_kp_pos_field.Value   = pos_kp;
                    obj.m2_kp_vel_field.Value   = vel_kp;
                    obj.m2_ki_vel_field.Value   = vel_ki;
                    obj.m2_kd_vel_field.Value   = vel_filt;
                    obj.m2_kp_cur_field.Value   = cur_kp;
                    obj.m2_ki_cur_field.Value   = cur_ki;
                    obj.m2_filt_cur_field.Value = cur_filt;
                end

                % Apply parameters to arm
                obj.arm.set_pos_kp(motor_id, pos_kp);
                obj.arm.set_vel_kp(motor_id, vel_kp);
                obj.arm.set_vel_ki(motor_id, vel_ki);
                has_set_vel_filt = ismethod(obj.arm, 'set_vel_filt') || ...
                    (isstruct(obj.arm) && isfield(obj.arm, 'set_vel_filt'));
                if has_set_vel_filt
                    obj.arm.set_vel_filt(motor_id, vel_filt);
                elseif ismethod(obj.arm, 'set_vel_kd') || (isstruct(obj.arm) && isfield(obj.arm, 'set_vel_kd'))
                    obj.arm.set_vel_kd(motor_id, vel_filt);
                end
                if ismethod(obj.arm, 'set_cur_kp') || (isstruct(obj.arm) && isfield(obj.arm, 'set_cur_kp'))
                    obj.arm.set_cur_kp(motor_id, cur_kp);
                end
                if ismethod(obj.arm, 'set_cur_ki') || (isstruct(obj.arm) && isfield(obj.arm, 'set_cur_ki'))
                    obj.arm.set_cur_ki(motor_id, cur_ki);
                end
                if ismethod(obj.arm, 'set_cur_filt') || (isstruct(obj.arm) && isfield(obj.arm, 'set_cur_filt'))
                    obj.arm.set_cur_filt(motor_id, cur_filt);
                end

                fprintf('PID written to Motor %d (pos_kp=%.2f, vel_kp=%.2f, vel_ki=%.3f, vel_filt=%.3f, cur_kp=%.3f, cur_ki=%.3f, cur_filt=%.3f).\n', ...
                    motor_id, pos_kp, vel_kp, vel_ki, vel_filt, cur_kp, cur_ki, cur_filt);
            catch e
                warning('ArmMonitor:writePID', 'Could not write PID: %s', e.message);
            end
        end

        function read_pid_both(obj, mid1, mid2)
            % Convenience: read PID gains from both motors into the panel
            obj.read_pid_to_panel(mid1);
            pause(0.03);
            obj.read_pid_to_panel(mid2);
        end

        function write_pid_both(obj, mid1, mid2)
            % Convenience: write PID gains from panel to both motors
            obj.write_pid_from_panel(mid1);
            pause(0.03);
            obj.write_pid_from_panel(mid2);
        end
    end
    
    methods (Access = private)
        function on_scroll_resize(~, scroll_panel, canvas_panel, canvas_h)
            % Keep canvas_panel width locked to the scroll_panel's current width.
            % This prevents a horizontal scrollbar while preserving the fixed vertical height
            % that forces the global vertical scrollbar to appear.
            try
                if ~isempty(scroll_panel) && isgraphics(scroll_panel) && ...
                   ~isempty(canvas_panel) && isgraphics(canvas_panel)
                    sp_pos = scroll_panel.Position;
                    w = max(sp_pos(3) - 20, 800);  % 20px gutter for scrollbar
                    canvas_panel.Position = [0, 0, w, canvas_h];
                end
            catch
            end
        end

        function build_motor_widgets(obj, motor_idx)
            % Helper to create vertical telemetry labels in motor panels
            if motor_idx == 1
                parent_panel = obj.m1_panel;
            else
                parent_panel = obj.m2_panel;
            end
            
            grid = uigridlayout(parent_panel, [6, 3]);
            grid.ColumnWidth = {95, '1x', '1x'};
            grid.RowHeight = {36, 36, 36, 36, 36, 36};
            grid.Padding = [8, 8, 8, 8];
            grid.RowSpacing = 6;
            grid.ColumnSpacing = 8;
            
            % Row 1: Position (rad + deg)
            lbl_pos_title = uilabel(grid);
            lbl_pos_title.Layout.Row = 1;
            lbl_pos_title.Layout.Column = 1;
            lbl_pos_title.Text = 'Position:';
            lbl_pos_title.FontColor = [0.8, 0.8, 0.8];
            lbl_pos_title.FontSize = 13;
            lbl_pos_title.FontWeight = 'bold';
            lbl_pos_title.VerticalAlignment = 'center';
            
            pos_rad_lbl = uilabel(grid);
            pos_rad_lbl.Layout.Row = 1;
            pos_rad_lbl.Layout.Column = 2;
            pos_rad_lbl.Text = '0.000 rad';
            pos_rad_lbl.FontName = 'Courier New';
            pos_rad_lbl.FontSize = 14;
            pos_rad_lbl.FontColor = [1.0, 1.0, 1.0];
            pos_rad_lbl.BackgroundColor = [0.18, 0.18, 0.22];
            pos_rad_lbl.HorizontalAlignment = 'center';
            pos_rad_lbl.VerticalAlignment = 'center';
            
            pos_deg_lbl = uilabel(grid);
            pos_deg_lbl.Layout.Row = 1;
            pos_deg_lbl.Layout.Column = 3;
            pos_deg_lbl.Text = '0.0 deg';
            pos_deg_lbl.FontName = 'Courier New';
            pos_deg_lbl.FontSize = 14;
            pos_deg_lbl.FontColor = [1.0, 1.0, 1.0];
            pos_deg_lbl.BackgroundColor = [0.18, 0.18, 0.22];
            pos_deg_lbl.HorizontalAlignment = 'center';
            pos_deg_lbl.VerticalAlignment = 'center';
            
            % Row 2: Velocity
            lbl_vel_title = uilabel(grid);
            lbl_vel_title.Layout.Row = 2;
            lbl_vel_title.Layout.Column = 1;
            lbl_vel_title.Text = 'Velocity:';
            lbl_vel_title.FontColor = [0.8, 0.8, 0.8];
            lbl_vel_title.FontSize = 13;
            lbl_vel_title.FontWeight = 'bold';
            lbl_vel_title.VerticalAlignment = 'center';
            
            vel_lbl = uilabel(grid);
            vel_lbl.Layout.Row = 2;
            vel_lbl.Layout.Column = [2, 3];
            vel_lbl.Text = '0.00 rad/s';
            vel_lbl.FontName = 'Courier New';
            vel_lbl.FontSize = 14;
            vel_lbl.FontColor = [1.0, 1.0, 1.0];
            vel_lbl.BackgroundColor = [0.18, 0.18, 0.22];
            vel_lbl.HorizontalAlignment = 'center';
            vel_lbl.VerticalAlignment = 'center';
            
            % Row 3: Current
            lbl_cur_title = uilabel(grid);
            lbl_cur_title.Layout.Row = 3;
            lbl_cur_title.Layout.Column = 1;
            lbl_cur_title.Text = 'Phase Current:';
            lbl_cur_title.FontColor = [0.8, 0.8, 0.8];
            lbl_cur_title.FontSize = 13;
            lbl_cur_title.FontWeight = 'bold';
            lbl_cur_title.VerticalAlignment = 'center';
            
            cur_lbl = uilabel(grid);
            cur_lbl.Layout.Row = 3;
            cur_lbl.Layout.Column = [2, 3];
            cur_lbl.Text = '0.00 A';
            cur_lbl.FontName = 'Courier New';
            cur_lbl.FontSize = 14;
            cur_lbl.FontColor = [1.0, 1.0, 1.0];
            cur_lbl.BackgroundColor = [0.18, 0.18, 0.22];
            cur_lbl.HorizontalAlignment = 'center';
            cur_lbl.VerticalAlignment = 'center';
            
            % Row 4: Voltage
            lbl_volt_title = uilabel(grid);
            lbl_volt_title.Layout.Row = 4;
            lbl_volt_title.Layout.Column = 1;
            lbl_volt_title.Text = 'Voltage:';
            lbl_volt_title.FontColor = [0.8, 0.8, 0.8];
            lbl_volt_title.FontSize = 13;
            lbl_volt_title.FontWeight = 'bold';
            lbl_volt_title.VerticalAlignment = 'center';
            
            volt_lbl = uilabel(grid);
            volt_lbl.Layout.Row = 4;
            volt_lbl.Layout.Column = [2, 3];
            volt_lbl.Text = '0.0 V';
            volt_lbl.FontName = 'Courier New';
            volt_lbl.FontSize = 14;
            volt_lbl.FontColor = [1.0, 1.0, 1.0];
            volt_lbl.BackgroundColor = [0.18, 0.18, 0.22];
            volt_lbl.HorizontalAlignment = 'center';
            volt_lbl.VerticalAlignment = 'center';
            
            % Row 5: Temperature
            lbl_temp_title = uilabel(grid);
            lbl_temp_title.Layout.Row = 5;
            lbl_temp_title.Layout.Column = 1;
            lbl_temp_title.Text = 'Temperature:';
            lbl_temp_title.FontColor = [0.8, 0.8, 0.8];
            lbl_temp_title.FontSize = 13;
            lbl_temp_title.FontWeight = 'bold';
            lbl_temp_title.VerticalAlignment = 'center';
            
            temp_lbl = uilabel(grid);
            temp_lbl.Layout.Row = 5;
            temp_lbl.Layout.Column = [2, 3];
            temp_lbl.Text = '0.0 deg C';
            temp_lbl.FontName = 'Courier New';
            temp_lbl.FontSize = 14;
            temp_lbl.FontColor = [1.0, 1.0, 1.0];
            temp_lbl.BackgroundColor = [0.18, 0.18, 0.22];
            temp_lbl.HorizontalAlignment = 'center';
            temp_lbl.VerticalAlignment = 'center';
            
            % Row 6: Fault
            lbl_fault_title = uilabel(grid);
            lbl_fault_title.Layout.Row = 6;
            lbl_fault_title.Layout.Column = 1;
            lbl_fault_title.Text = 'Fault:';
            lbl_fault_title.FontColor = [0.8, 0.8, 0.8];
            lbl_fault_title.FontSize = 13;
            lbl_fault_title.FontWeight = 'bold';
            lbl_fault_title.VerticalAlignment = 'center';
            
            fault_lbl = uilabel(grid);
            fault_lbl.Layout.Row = 6;
            fault_lbl.Layout.Column = [2, 3];
            fault_lbl.Text = 'OK';
            fault_lbl.FontName = 'Courier New';
            fault_lbl.FontSize = 14;
            fault_lbl.FontColor = [0.4, 1.0, 0.4];
            fault_lbl.BackgroundColor = [0.18, 0.18, 0.22];
            fault_lbl.HorizontalAlignment = 'center';
            fault_lbl.VerticalAlignment = 'center';
            
            % Assign to object properties
            if motor_idx == 1
                obj.m1_pos_rad_lbl = pos_rad_lbl;
                obj.m1_pos_deg_lbl = pos_deg_lbl;
                obj.m1_vel_lbl     = vel_lbl;
                obj.m1_cur_lbl     = cur_lbl;
                obj.m1_volt_lbl    = volt_lbl;
                obj.m1_temp_lbl    = temp_lbl;
                obj.m1_fault_lbl   = fault_lbl;
            else
                obj.m2_pos_rad_lbl = pos_rad_lbl;
                obj.m2_pos_deg_lbl = pos_deg_lbl;
                obj.m2_vel_lbl     = vel_lbl;
                obj.m2_cur_lbl     = cur_lbl;
                obj.m2_volt_lbl    = volt_lbl;
                obj.m2_temp_lbl    = temp_lbl;
                obj.m2_fault_lbl   = fault_lbl;
            end
        end
        
        function redraw_arm(obj, th1, th2)
            % Redraws the 2-link robotic arm by deleting old lines and replotting
            try
                if isempty(obj.ax) || ~isgraphics(obj.ax)
                    return;
                end
                
                % Query arm geometry
                l1 = obj.L1;
                l2 = obj.L2;
                if ~isempty(obj.arm)
                    if isprop(obj.arm, 'L1') && ~isempty(obj.arm.L1)
                        l1 = obj.arm.L1;
                    end
                    if isprop(obj.arm, 'L2') && ~isempty(obj.arm.L2)
                        l2 = obj.arm.L2;
                    end
                end
                
                % Compute joint coordinates (zero position pointing straight down)
                elbow_x = -l1 * sin(th1);
                elbow_y = -l1 * cos(th1);
                
                % End-effector from FK
                ee_x = elbow_x - l2 * sin(th1 + th2);
                ee_y = elbow_y - l2 * cos(th1 + th2);
                if ~isempty(obj.arm) && ismethod(obj.arm, 'forward_kinematics')
                    try
                        [fk_x, fk_y] = obj.arm.forward_kinematics(th1, th2);
                        ee_x = fk_x;
                        ee_y = fk_y;
                    catch
                    end
                end
                
                % Update link lines and joint markers in-place
                if ~isempty(obj.h_base_link) && isgraphics(obj.h_base_link)
                    set(obj.h_base_link, 'XData', [0, elbow_x], 'YData', [0, elbow_y]);
                else
                    obj.h_base_link = plot(obj.ax, [0, elbow_x], [0, elbow_y], '-', ...
                        'Color', [1.0, 1.0, 1.0], 'LineWidth', 4);
                end
                
                if ~isempty(obj.h_fore_link) && isgraphics(obj.h_fore_link)
                    set(obj.h_fore_link, 'XData', [elbow_x, ee_x], 'YData', [elbow_y, ee_y]);
                else
                    obj.h_fore_link = plot(obj.ax, [elbow_x, ee_x], [elbow_y, ee_y], '-', ...
                        'Color', [0.35, 0.75, 1.0], 'LineWidth', 4);
                end
                
                if ~isempty(obj.h_elbow_joint) && isgraphics(obj.h_elbow_joint)
                    set(obj.h_elbow_joint, 'XData', elbow_x, 'YData', elbow_y);
                else
                    obj.h_elbow_joint = plot(obj.ax, elbow_x, elbow_y, 'o', ...
                        'MarkerFaceColor', [0.2, 0.6, 1.0], ...
                        'MarkerEdgeColor', [1.0, 1.0, 1.0], ...
                        'MarkerSize', 8);
                end
                
                if ~isempty(obj.h_ee_joint) && isgraphics(obj.h_ee_joint)
                    set(obj.h_ee_joint, 'XData', ee_x, 'YData', ee_y);
                else
                    obj.h_ee_joint = plot(obj.ax, ee_x, ee_y, 'o', ...
                        'MarkerFaceColor', [1.0, 0.4, 0.2], ...
                        'MarkerEdgeColor', [1.0, 1.0, 1.0], ...
                        'MarkerSize', 9);
                end
                
                drawnow limitrate;
            catch
                return;
            end
        end
        
        function build_pid_panel(obj)
            % Grid content: 28 + 7*42 + 46 + 46 + pad(20) + spacing(9*6) = 488px
            % Panel title+border overhead: ~26px. Total needed: 514px.
            % sidebar_grid row 3 = 640px (generous buffer). Sidebar scrolling reveals full panel.
            pg = uigridlayout(obj.pid_panel, [9, 3]);
            pg.ColumnWidth = {80, '1x', '1x'};
            pg.RowHeight = {24, 26, 26, 26, 26, 26, 26, 26, 32};
            pg.Padding = [6, 8, 6, 8];
            pg.RowSpacing = 4;
            pg.ColumnSpacing = 6;
            pg.BackgroundColor = [0.13, 0.13, 0.16];

            % Row 1: Header row
            hdr_lbl = uilabel(pg); hdr_lbl.Layout.Row = 1; hdr_lbl.Layout.Column = 1;
            hdr_lbl.Text = 'Gain'; hdr_lbl.FontColor = [0.7, 0.7, 0.7]; hdr_lbl.FontWeight = 'bold';

            m1_hdr = uilabel(pg); m1_hdr.Layout.Row = 1; m1_hdr.Layout.Column = 2;
            m1_hdr.Text = 'Motor 1'; m1_hdr.FontColor = [0.35, 0.75, 1.0]; m1_hdr.FontWeight = 'bold'; m1_hdr.HorizontalAlignment = 'center';

            m2_hdr = uilabel(pg); m2_hdr.Layout.Row = 1; m2_hdr.Layout.Column = 3;
            m2_hdr.Text = 'Motor 2'; m2_hdr.FontColor = [1.0, 0.65, 0.2]; m2_hdr.FontWeight = 'bold'; m2_hdr.HorizontalAlignment = 'center';

            % 7 parameter rows per RS02 manual:
            % Row 2: Pos Kp (default 40.0)
            % Row 3: Vel Kp (default 6.0)
            % Row 4: Vel Ki (default 0.02)
            % Row 5: Vel Filt (default 0.1)
            % Row 6: Cur Kp (default 0.17)
            % Row 7: Cur Ki (default 0.012)
            % Row 8: Cur Filt (default 0.1)
            gain_labels = {'Pos Kp', 'Vel Kp', 'Vel Ki', 'Vel Filt', 'Cur Kp', 'Cur Ki', 'Cur Filt'};
            default_gains = [40.0, 6.0, 0.02, 0.1, 0.17, 0.012, 0.1];
            m1_fields = cell(1, 7);
            m2_fields = cell(1, 7);

            for r = 1:7
                lbl = uilabel(pg); lbl.Layout.Row = r + 1; lbl.Layout.Column = 1;
                lbl.Text = gain_labels{r}; lbl.FontColor = [0.8, 0.8, 0.8]; lbl.FontSize = 11;
                lbl.VerticalAlignment = 'center';

                ef1 = uieditfield(pg, 'numeric');
                ef1.Layout.Row = r + 1; ef1.Layout.Column = 2;
                ef1.Value = default_gains(r); ef1.FontName = 'Courier New'; ef1.FontSize = 12;
                ef1.BackgroundColor = [0.18, 0.18, 0.22]; ef1.FontColor = [1, 1, 1];
                m1_fields{r} = ef1;

                ef2 = uieditfield(pg, 'numeric');
                ef2.Layout.Row = r + 1; ef2.Layout.Column = 3;
                ef2.Value = default_gains(r); ef2.FontName = 'Courier New'; ef2.FontSize = 12;
                ef2.BackgroundColor = [0.18, 0.18, 0.22]; ef2.FontColor = [1, 1, 1];
                m2_fields{r} = ef2;
            end

            % Store field handles into obj.m1_* and obj.m2_*
            obj.m1_kp_pos_field   = m1_fields{1};
            obj.m1_kp_vel_field   = m1_fields{2};
            obj.m1_ki_vel_field   = m1_fields{3};
            obj.m1_kd_vel_field   = m1_fields{4};
            obj.m1_kp_cur_field   = m1_fields{5};
            obj.m1_ki_cur_field   = m1_fields{6};
            obj.m1_filt_cur_field = m1_fields{7};

            obj.m2_kp_pos_field   = m2_fields{1};
            obj.m2_kp_vel_field   = m2_fields{2};
            obj.m2_ki_vel_field   = m2_fields{3};
            obj.m2_kd_vel_field   = m2_fields{4};
            obj.m2_kp_cur_field   = m2_fields{5};
            obj.m2_ki_cur_field   = m2_fields{6};
            obj.m2_filt_cur_field = m2_fields{7};

            % Row 9: Button grid with Read M1, Write M1, Read M2, Write M2
            btn_grid = uigridlayout(pg, [1, 4]);
            btn_grid.Layout.Row = 9;
            btn_grid.Layout.Column = [1, 3];
            btn_grid.ColumnWidth = {'1x', '1x', '1x', '1x'};
            btn_grid.RowHeight = {'1x'};
            btn_grid.Padding = [0, 0, 0, 0];

            mid1 = 1;
            mid2 = 2;
            if ~isempty(obj.arm) && (isprop(obj.arm, 'MOTOR_1_ID') || isfield(obj.arm, 'MOTOR_1_ID'))
                mid1 = obj.arm.MOTOR_1_ID;
            end
            if ~isempty(obj.arm) && (isprop(obj.arm, 'MOTOR_2_ID') || isfield(obj.arm, 'MOTOR_2_ID'))
                mid2 = obj.arm.MOTOR_2_ID;
            end

            br1 = uibutton(btn_grid, 'push'); br1.Layout.Row = 1; br1.Layout.Column = 1;
            br1.Text = 'Read M1'; br1.BackgroundColor = [0.2, 0.35, 0.55]; br1.FontColor = [1, 1, 1]; br1.FontSize = 11;
            br1.ButtonPushedFcn = @(~,~) obj.read_pid_to_panel(mid1);

            bw1 = uibutton(btn_grid, 'push'); bw1.Layout.Row = 1; bw1.Layout.Column = 2;
            bw1.Text = 'Write M1'; bw1.BackgroundColor = [0.2, 0.5, 0.3]; bw1.FontColor = [1, 1, 1]; bw1.FontSize = 11;
            bw1.ButtonPushedFcn = @(~,~) obj.write_pid_from_panel(mid1);

            br2 = uibutton(btn_grid, 'push'); br2.Layout.Row = 1; br2.Layout.Column = 3;
            br2.Text = 'Read M2'; br2.BackgroundColor = [0.2, 0.35, 0.55]; br2.FontColor = [1, 1, 1]; br2.FontSize = 11;
            br2.ButtonPushedFcn = @(~,~) obj.read_pid_to_panel(mid2);

            bw2 = uibutton(btn_grid, 'push'); bw2.Layout.Row = 1; bw2.Layout.Column = 4;
            bw2.Text = 'Write M2'; bw2.BackgroundColor = [0.2, 0.5, 0.3]; bw2.FontColor = [1, 1, 1]; bw2.FontSize = 11;
            bw2.ButtonPushedFcn = @(~,~) obj.write_pid_from_panel(mid2);
        end
        
        function build_limits_panel(obj)
            lg = uigridlayout(obj.limits_panel, [7, 3]);
            lg.ColumnWidth = {110, '1x', '1x'};
            lg.RowHeight = {24, 25, 25, 25, 25, 25, 28};
            lg.Padding = [6, 8, 6, 8];
            lg.RowSpacing = 4;
            lg.ColumnSpacing = 6;
            lg.BackgroundColor = [0.13, 0.13, 0.16];

            % Header row
            hdr_lbl = uilabel(lg); hdr_lbl.Layout.Row=1; hdr_lbl.Layout.Column=1;
            hdr_lbl.Text='Limit'; hdr_lbl.FontColor=[0.7,0.7,0.7]; hdr_lbl.FontWeight='bold';

            m1_hdr = uilabel(lg); m1_hdr.Layout.Row=1; m1_hdr.Layout.Column=2;
            m1_hdr.Text='Motor 1'; m1_hdr.FontColor=[0.35,0.75,1.0]; m1_hdr.FontWeight='bold'; m1_hdr.HorizontalAlignment='center';

            m2_hdr = uilabel(lg); m2_hdr.Layout.Row=1; m2_hdr.Layout.Column=3;
            m2_hdr.Text='Motor 2'; m2_hdr.FontColor=[1.0,0.65,0.2]; m2_hdr.FontWeight='bold'; m2_hdr.HorizontalAlignment='center';

            % 5 limit rows: Pos Min, Pos Max, Max Vel, Max Phase Cur, Max Torque
            limit_labels = {'Pos Min (deg)', 'Pos Max (deg)', 'Max Vel (deg/s)', 'Max Phase Cur (A)', 'Max Torque (Nm)'};
            m1_fields = cell(1, 5);
            m2_fields = cell(1, 5);
            lbl_handles = cell(1, 5);

            for r = 1:5
                lbl = uilabel(lg); lbl.Layout.Row=r+1; lbl.Layout.Column=1;
                lbl.Text=limit_labels{r}; lbl.FontColor=[0.8,0.8,0.8]; lbl.FontSize=11;
                lbl.VerticalAlignment='center';
                lbl_handles{r} = lbl;

                ef1 = uieditfield(lg, 'numeric');
                ef1.Layout.Row=r+1; ef1.Layout.Column=2;
                ef1.Value=0; ef1.FontName='Courier New'; ef1.FontSize=12;
                ef1.BackgroundColor=[0.18,0.18,0.22]; ef1.FontColor=[1,1,1];
                m1_fields{r} = ef1;

                ef2 = uieditfield(lg, 'numeric');
                ef2.Layout.Row=r+1; ef2.Layout.Column=3;
                ef2.Value=0; ef2.FontName='Courier New'; ef2.FontSize=12;
                ef2.BackgroundColor=[0.18,0.18,0.22]; ef2.FontColor=[1,1,1];
                m2_fields{r} = ef2;
            end

            % Store label handles for dynamic unit switching
            obj.lbl_lim_pos_min = lbl_handles{1};
            obj.lbl_lim_pos_max = lbl_handles{2};
            obj.lbl_lim_vel     = lbl_handles{3};

            % Store field handles with unconstrained limits to accept any motor value safely
            obj.m1_pos_min_field = m1_fields{1}; obj.m1_pos_min_field.Limits = [-Inf, Inf];
            obj.m1_pos_max_field = m1_fields{2}; obj.m1_pos_max_field.Limits = [-Inf, Inf];
            obj.m1_vel_lim_field = m1_fields{3}; obj.m1_vel_lim_field.Limits = [-Inf, Inf];
            obj.m1_cur_lim_field = m1_fields{4}; obj.m1_cur_lim_field.Limits = [-Inf, Inf];
            obj.m1_tor_lim_field = m1_fields{5}; obj.m1_tor_lim_field.Limits = [-Inf, Inf];
            obj.m2_pos_min_field = m2_fields{1}; obj.m2_pos_min_field.Limits = [-Inf, Inf];
            obj.m2_pos_max_field = m2_fields{2}; obj.m2_pos_max_field.Limits = [-Inf, Inf];
            obj.m2_vel_lim_field = m2_fields{3}; obj.m2_vel_lim_field.Limits = [-Inf, Inf];
            obj.m2_cur_lim_field = m2_fields{4}; obj.m2_cur_lim_field.Limits = [-Inf, Inf];
            obj.m2_tor_lim_field = m2_fields{5}; obj.m2_tor_lim_field.Limits = [-Inf, Inf];

            % Default position limits to -360 to +360 deg
            obj.m1_pos_min_field.Value = -360.0;
            obj.m1_pos_max_field.Value = 360.0;
            obj.m2_pos_min_field.Value = -360.0;
            obj.m2_pos_max_field.Value = 360.0;

            % Default velocity limit to 1718 deg/s (30 rad/s)
            obj.m1_vel_lim_field.Value = 1718.0;
            obj.m2_vel_lim_field.Value = 1718.0;
            obj.m1_cur_lim_field.Value = 10.0;
            obj.m2_cur_lim_field.Value = 10.0;
            obj.m1_tor_lim_field.Value = 12.0;
            obj.m2_tor_lim_field.Value = 12.0;

            % Populate initial joint limit values if arm exists (converted to deg)
            if ~isempty(obj.arm)
                jl = [];
                if isprop(obj.arm, 'JOINT_LIMITS') || isfield(obj.arm, 'JOINT_LIMITS')
                    jl = obj.arm.JOINT_LIMITS;
                end
                if isstruct(jl)
                    try
                        if isfield(jl, 'm1_min'), obj.m1_pos_min_field.Value = round(jl.m1_min * (180 / pi), 1); end
                        if isfield(jl, 'm1_max'), obj.m1_pos_max_field.Value = round(jl.m1_max * (180 / pi), 1); end
                        if isfield(jl, 'm2_min'), obj.m2_pos_min_field.Value = round(jl.m2_min * (180 / pi), 1); end
                        if isfield(jl, 'm2_max'), obj.m2_pos_max_field.Value = round(jl.m2_max * (180 / pi), 1); end
                    catch
                    end
                end
            end

            % Row 7: Read/Write buttons
            btn_grid = uigridlayout(lg, [1,4]);
            btn_grid.Layout.Row = 7;
            btn_grid.Layout.Column = [1,3];
            btn_grid.ColumnWidth = {'1x','1x','1x','1x'};
            btn_grid.RowHeight = {'1x'};
            btn_grid.Padding = [0,0,0,0];

            mid1 = 1;
            mid2 = 2;
            if ~isempty(obj.arm) && (isprop(obj.arm, 'MOTOR_1_ID') || isfield(obj.arm, 'MOTOR_1_ID'))
                mid1 = obj.arm.MOTOR_1_ID;
            end
            if ~isempty(obj.arm) && (isprop(obj.arm, 'MOTOR_2_ID') || isfield(obj.arm, 'MOTOR_2_ID'))
                mid2 = obj.arm.MOTOR_2_ID;
            end

            br1 = uibutton(btn_grid,'push'); br1.Layout.Row=1; br1.Layout.Column=1;
            br1.Text='Read M1'; br1.BackgroundColor=[0.2,0.35,0.55]; br1.FontColor=[1,1,1]; br1.FontSize=11;
            br1.ButtonPushedFcn = @(~,~) obj.read_limits_to_panel(mid1);


            bw1 = uibutton(btn_grid,'push'); bw1.Layout.Row=1; bw1.Layout.Column=2;
            bw1.Text='Write M1'; bw1.BackgroundColor=[0.2,0.5,0.3]; bw1.FontColor=[1,1,1]; bw1.FontSize=11;
            bw1.ButtonPushedFcn = @(~,~) obj.write_limits_from_panel(mid1);

            br2 = uibutton(btn_grid,'push'); br2.Layout.Row=1; br2.Layout.Column=3;
            br2.Text='Read M2'; br2.BackgroundColor=[0.2,0.35,0.55]; br2.FontColor=[1,1,1]; br2.FontSize=11;
            br2.ButtonPushedFcn = @(~,~) obj.read_limits_to_panel(mid2);

            bw2 = uibutton(btn_grid,'push'); bw2.Layout.Row=1; bw2.Layout.Column=4;
            bw2.Text='Write M2'; bw2.BackgroundColor=[0.2,0.5,0.3]; bw2.FontColor=[1,1,1]; bw2.FontSize=11;
            bw2.ButtonPushedFcn = @(~,~) obj.write_limits_from_panel(mid2);
        end
        
        function build_command_panel(obj)
            cg = uigridlayout(obj.cmd_panel, [11, 2]);
            cg.ColumnWidth = {'1x', '1x'};
            cg.RowHeight = {22, 22, 20, 22, 22, 22, 22, 22, 22, 24, 26};
            cg.Padding = [6, 8, 6, 8];
            cg.RowSpacing = 3;
            cg.ColumnSpacing = 8;
            
            % Row 1: Modes
            btn_pos = uibutton(cg, 'push', 'Text', 'Pos Mode');
            btn_pos.Layout.Row = 1; btn_pos.Layout.Column = 1;
            btn_pos.ButtonPushedFcn = @(~,~) obj.set_control_mode('position');
            
            btn_vel = uibutton(cg, 'push', 'Text', 'Vel Mode');
            btn_vel.Layout.Row = 1; btn_vel.Layout.Column = 2;
            btn_vel.ButtonPushedFcn = @(~,~) obj.set_control_mode('velocity');
            
            % Row 2: Units
            lbl_u = uilabel(cg, 'Text', 'Units:', 'FontColor', [0.8,0.8,0.8]);
            lbl_u.Layout.Row = 2; lbl_u.Layout.Column = 1;
            obj.unit_dropdown = uidropdown(cg, 'Items', {'deg', 'rad'}, 'Value', 'deg');
            obj.unit_dropdown.Layout.Row = 2; obj.unit_dropdown.Layout.Column = 2;
            obj.unit_dropdown.ValueChangedFcn = @(src, ~) obj.update_unit_labels(src.Value);
            
            % Row 3: Shortest Path checkbox spanning cols 1-2
            obj.shortest_path_chk = uicheckbox(cg, 'Text', 'Shortest Path Routing', 'Value', true, ...
                'FontColor', [0.35, 0.85, 0.45], 'FontSize', 10, 'FontWeight', 'bold');
            obj.shortest_path_chk.Layout.Row = 3;
            obj.shortest_path_chk.Layout.Column = [1 2];

            % Row 4: M1 Target
            obj.lbl_m1 = uilabel(cg, 'Text', 'M1 Target:', 'FontColor', [0.8,0.8,0.8]);
            obj.lbl_m1.Layout.Row = 4; obj.lbl_m1.Layout.Column = 1;
            obj.m1_target_field = uieditfield(cg, 'numeric', 'Value', 0, 'Limits', [-360, 360]);
            obj.m1_target_field.Layout.Row = 4; obj.m1_target_field.Layout.Column = 2;
            obj.m1_angle_field = obj.m1_target_field;
            
            % Row 5: M1 Speed
            lbl_s1 = uilabel(cg, 'Text', 'Speed:', 'FontColor', [0.8,0.8,0.8]);
            lbl_s1.Layout.Row = 5; lbl_s1.Layout.Column = 1;
            obj.m1_speed_field = uieditfield(cg, 'numeric', 'Value', 180.0);
            obj.m1_speed_field.Layout.Row = 5; obj.m1_speed_field.Layout.Column = 2;
            obj.lbl_m1_speed = lbl_s1;
            
            % Row 6: M1 Accel
            lbl_a1 = uilabel(cg, 'Text', 'Accel:', 'FontColor', [0.8,0.8,0.8]);
            lbl_a1.Layout.Row = 6; lbl_a1.Layout.Column = 1;
            obj.m1_accel_field = uieditfield(cg, 'numeric', 'Value', 50.0);
            obj.m1_accel_field.Layout.Row = 6; obj.m1_accel_field.Layout.Column = 2;
            obj.lbl_m1_accel = lbl_a1;
            
            % Row 7: M2 Target
            obj.lbl_m2 = uilabel(cg, 'Text', 'M2 Target:', 'FontColor', [0.8,0.8,0.8]);
            obj.lbl_m2.Layout.Row = 7; obj.lbl_m2.Layout.Column = 1;
            obj.m2_target_field = uieditfield(cg, 'numeric', 'Value', 0, 'Limits', [-360, 360]);
            obj.m2_target_field.Layout.Row = 7; obj.m2_target_field.Layout.Column = 2;
            obj.m2_angle_field = obj.m2_target_field;
            
            % Row 8: M2 Speed
            lbl_s2 = uilabel(cg, 'Text', 'Speed:', 'FontColor', [0.8,0.8,0.8]);
            lbl_s2.Layout.Row = 8; lbl_s2.Layout.Column = 1;
            obj.m2_speed_field = uieditfield(cg, 'numeric', 'Value', 180.0);
            obj.m2_speed_field.Layout.Row = 8; obj.m2_speed_field.Layout.Column = 2;
            obj.lbl_m2_speed = lbl_s2;
            
            % Row 9: M2 Accel
            lbl_a2 = uilabel(cg, 'Text', 'Accel:', 'FontColor', [0.8,0.8,0.8]);
            lbl_a2.Layout.Row = 9; lbl_a2.Layout.Column = 1;
            obj.m2_accel_field = uieditfield(cg, 'numeric', 'Value', 50.0);
            obj.m2_accel_field.Layout.Row = 9; obj.m2_accel_field.Layout.Column = 2;
            obj.lbl_m2_accel = lbl_a2;
            
            % Row 10: Individual Sends
            btn_m1_send = uibutton(cg, 'push', 'Text', 'Send M1', 'BackgroundColor', [0.18, 0.45, 0.65], 'FontColor', [1,1,1]);
            btn_m1_send.Layout.Row = 10; btn_m1_send.Layout.Column = 1;
            btn_m1_send.ButtonPushedFcn = @(~,~) obj.send_angle(1, obj.m1_target_field.Value, obj.m1_speed_field.Value, obj.m1_accel_field.Value);
            
            btn_m2_send = uibutton(cg, 'push', 'Text', 'Send M2', 'BackgroundColor', [0.18, 0.45, 0.65], 'FontColor', [1,1,1]);
            btn_m2_send.Layout.Row = 10; btn_m2_send.Layout.Column = 2;
            btn_m2_send.ButtonPushedFcn = @(~,~) obj.send_angle(2, obj.m2_target_field.Value, obj.m2_speed_field.Value, obj.m2_accel_field.Value);
            
            % Row 11: Send Both
            obj.btn_send_both = uibutton(cg, 'push', 'Text', 'SEND BOTH', 'BackgroundColor', [0.85, 0.4, 0.15], 'FontColor', [1,1,1], 'FontWeight', 'bold');
            obj.btn_send_both.Layout.Row = 11; obj.btn_send_both.Layout.Column = [1 2];
            obj.btn_send_both.ButtonPushedFcn = @(~,~) obj.send_both();
        end

        function build_ik_panel(obj)
            % Build IK input panel in obj.ik_panel
            ig = uigridlayout(obj.ik_panel, [8, 4]);
            ig.ColumnWidth = {45, '1x', 50, '1x'};
            ig.RowHeight = {24, 24, 0, 24, 34, 22, 26, 26};
            ig.Padding = [6, 8, 6, 8];
            ig.RowSpacing = 4;
            ig.ColumnSpacing = 6;
            ig.BackgroundColor = [0.13, 0.13, 0.16];

            % Row 1: X (mm) and Y (mm)
            lbl_x = uilabel(ig, 'Text', 'X (mm):', 'FontColor', [0.8, 0.8, 0.8], 'FontSize', 11);
            lbl_x.Layout.Row = 1;
            lbl_x.Layout.Column = 1;
            obj.ik_x_field = uieditfield(ig, 'numeric', 'Value', 0, 'Limits', [-700, 700]);
            obj.ik_x_field.Layout.Row = 1;
            obj.ik_x_field.Layout.Column = 2;
            obj.ik_x_field.BackgroundColor = [0.18, 0.18, 0.22];
            obj.ik_x_field.FontColor = [1, 1, 1];
            obj.ik_x_field.ValueChangedFcn = @(~,~) obj.solve_ik_preview();

            lbl_y = uilabel(ig, 'Text', 'Y (mm):', 'FontColor', [0.8, 0.8, 0.8], 'FontSize', 11);
            lbl_y.Layout.Row = 1;
            lbl_y.Layout.Column = 3;
            obj.ik_y_field = uieditfield(ig, 'numeric', 'Value', -500, 'Limits', [-700, 700]);
            obj.ik_y_field.Layout.Row = 1;
            obj.ik_y_field.Layout.Column = 4;
            obj.ik_y_field.BackgroundColor = [0.18, 0.18, 0.22];
            obj.ik_y_field.FontColor = [1, 1, 1];
            obj.ik_y_field.ValueChangedFcn = @(~,~) obj.solve_ik_preview();

            % Row 2: Elbow Config and Trajectory Type
            obj.ik_elbow_dropdown = uidropdown(ig, 'Items', {'Elbow Up', 'Elbow Down'}, 'Value', 'Elbow Up');
            obj.ik_elbow_dropdown.Layout.Row = 2;
            obj.ik_elbow_dropdown.Layout.Column = [1, 2];
            obj.ik_elbow_dropdown.BackgroundColor = [0.18, 0.18, 0.22];
            obj.ik_elbow_dropdown.FontColor = [1, 1, 1];
            obj.ik_elbow_dropdown.ValueChangedFcn = @(~,~) obj.solve_ik_preview();

            obj.ik_traj_dropdown = uidropdown(ig, 'Items', {'Linear', 'Joint Curve', 'Arch'}, 'Value', 'Linear');
            obj.ik_traj_dropdown.Layout.Row = 2;
            obj.ik_traj_dropdown.Layout.Column = [3, 4];
            obj.ik_traj_dropdown.BackgroundColor = [0.18, 0.18, 0.22];
            obj.ik_traj_dropdown.FontColor = [1, 1, 1];
            obj.ik_traj_dropdown.ValueChangedFcn = @(~,~) obj.solve_ik_preview();

            % Row 3: Speed and Acceleration (Hidden per user request)
            lbl_spd = uilabel(ig, 'Text', 'Spd:', 'FontColor', [0.8, 0.8, 0.8], 'FontSize', 11, 'Visible', 'off');
            lbl_spd.Layout.Row = 3;
            lbl_spd.Layout.Column = 1;
            obj.ik_spd_field = uieditfield(ig, 'numeric', 'Value', 180, 'Limits', [10, 1000], 'Visible', 'off');
            obj.ik_spd_field.Layout.Row = 3;
            obj.ik_spd_field.Layout.Column = 2;
            obj.ik_spd_field.BackgroundColor = [0.18, 0.18, 0.22];
            obj.ik_spd_field.FontColor = [1, 1, 1];
            obj.ik_spd_field.ValueChangedFcn = @(~,~) obj.solve_ik_preview();

            lbl_acc = uilabel(ig, 'Text', 'Acc:', 'FontColor', [0.8, 0.8, 0.8], 'FontSize', 11, 'Visible', 'off');
            lbl_acc.Layout.Row = 3;
            lbl_acc.Layout.Column = 3;
            obj.ik_acc_field = uieditfield(ig, 'numeric', 'Value', 100, 'Limits', [10, 3000], 'Visible', 'off');
            obj.ik_acc_field.Layout.Row = 3;
            obj.ik_acc_field.Layout.Column = 4;
            obj.ik_acc_field.BackgroundColor = [0.18, 0.18, 0.22];
            obj.ik_acc_field.FontColor = [1, 1, 1];
            obj.ik_acc_field.ValueChangedFcn = @(~,~) obj.solve_ik_preview();

            % Row 4: Preview Checkbox and FK Readback
            obj.ik_preview_chk = uicheckbox(ig, 'Text', 'Preview Path', 'Value', true, 'FontColor', [0.8, 0.8, 0.8]);
            obj.ik_preview_chk.Layout.Row = 4;
            obj.ik_preview_chk.Layout.Column = [1, 2];
            obj.ik_preview_chk.ValueChangedFcn = @(~,~) obj.solve_ik_preview();

            obj.ik_lbl_fk = uilabel(ig, 'Text', 'FK: ---', 'FontColor', [0.5, 0.85, 0.5], 'FontSize', 10);
            obj.ik_lbl_fk.Layout.Row = 4;
            obj.ik_lbl_fk.Layout.Column = [3, 4];

            % Row 5: Status Label
            obj.ik_lbl_status = uilabel(ig, 'Text', 'Ready', 'FontWeight', 'bold', ...
                'HorizontalAlignment', 'center', 'FontColor', [0.8, 0.8, 0.8], 'WordWrap', 'on');
            obj.ik_lbl_status.Layout.Row = 5;
            obj.ik_lbl_status.Layout.Column = [1, 4];

            % Row 6: Result Label
            obj.ik_lbl_result = uilabel(ig, 'Text', '', 'FontColor', [0.6, 0.6, 0.7], ...
                'FontSize', 10, 'FontName', 'Courier New', 'WordWrap', 'on');
            obj.ik_lbl_result.Layout.Row = 6;
            obj.ik_lbl_result.Layout.Column = [1, 4];

            % Row 7: Preview Path and Solve (Jump) Buttons
            obj.btn_ik_preview = uibutton(ig, 'push', 'Text', 'Preview Path', 'BackgroundColor', [0.2, 0.4, 0.55], 'FontColor', [1, 1, 1]);
            obj.btn_ik_preview.Layout.Row = 7;
            obj.btn_ik_preview.Layout.Column = [1, 2];
            obj.btn_ik_preview.ButtonPushedFcn = @(~,~) obj.solve_ik_preview();

            btn_ik = uibutton(ig, 'push', 'Text', 'Solve (Jump)', 'BackgroundColor', [0.25, 0.35, 0.45], 'FontColor', [1, 1, 1]);
            btn_ik.Layout.Row = 7;
            btn_ik.Layout.Column = [3, 4];
            btn_ik.ButtonPushedFcn = @(~,~) obj.solve_and_send_ik();

            % Row 8: Execute Path and Abort Buttons
            obj.btn_ik_exec = uibutton(ig, 'push', 'Text', 'EXECUTE PATH', 'BackgroundColor', [0.15, 0.55, 0.3], 'FontColor', [1, 1, 1], 'FontWeight', 'bold');
            obj.btn_ik_exec.Layout.Row = 8;
            obj.btn_ik_exec.Layout.Column = [1, 3];
            obj.btn_ik_exec.ButtonPushedFcn = @(~,~) obj.execute_trajectory();

            obj.btn_ik_abort = uibutton(ig, 'push', 'Text', 'ABORT', 'BackgroundColor', [0.75, 0.15, 0.15], 'FontColor', [1, 1, 1], 'FontWeight', 'bold');
            obj.btn_ik_abort.Layout.Row = 8;
            obj.btn_ik_abort.Layout.Column = 4;
            obj.btn_ik_abort.ButtonPushedFcn = @(~,~) obj.abort_trajectory();
        end
    end

    methods
        function update_unit_labels(obj, unit_str)
            if strcmp(unit_str, 'deg')
                if ~isempty(obj.lbl_m1) && isvalid(obj.lbl_m1)
                    obj.lbl_m1.Text       = 'M1 Angle (deg)';
                    obj.lbl_m2.Text       = 'M2 Angle (deg)';
                end
                if ~isempty(obj.m1_target_field) && isvalid(obj.m1_target_field)
                    obj.m1_target_field.Limits = [-360, 360];
                end
                if ~isempty(obj.m2_target_field) && isvalid(obj.m2_target_field)
                    obj.m2_target_field.Limits = [-360, 360];
                end
                if ~isempty(obj.lbl_m1_speed) && isvalid(obj.lbl_m1_speed)
                    obj.lbl_m1_speed.Text = 'Spd (deg/s)';
                    obj.lbl_m2_speed.Text = 'Spd (deg/s)';
                    obj.m1_speed_field.Limits = [0, 1800];
                    obj.m2_speed_field.Limits = [0, 1800];
                end
                if ~isempty(obj.lbl_m1_accel) && isvalid(obj.lbl_m1_accel)
                    obj.lbl_m1_accel.Text = 'Acc (deg/s^2)';
                    obj.lbl_m2_accel.Text = 'Acc (deg/s^2)';
                    obj.m1_accel_field.Limits = [0, 28648];
                    obj.m2_accel_field.Limits = [0, 28648];
                end
                if ~isempty(obj.lbl_lim_pos_min) && isvalid(obj.lbl_lim_pos_min)
                    obj.lbl_lim_pos_min.Text = 'Pos Min (deg)';
                    obj.lbl_lim_pos_max.Text = 'Pos Max (deg)';
                    obj.lbl_lim_vel.Text     = 'Max Vel (deg/s)';
                    
                    % Convert Limits panel values rad -> deg
                    obj.m1_pos_min_field.Limits = [-Inf, Inf];
                    obj.m1_pos_max_field.Limits = [-Inf, Inf];
                    obj.m2_pos_min_field.Limits = [-Inf, Inf];
                    obj.m2_pos_max_field.Limits = [-Inf, Inf];
                    obj.m1_vel_lim_field.Limits = [-Inf, Inf];
                    obj.m2_vel_lim_field.Limits = [-Inf, Inf];

                    obj.m1_pos_min_field.Value = round(obj.m1_pos_min_field.Value * (180 / pi), 1);
                    obj.m1_pos_max_field.Value = round(obj.m1_pos_max_field.Value * (180 / pi), 1);
                    obj.m2_pos_min_field.Value = round(obj.m2_pos_min_field.Value * (180 / pi), 1);
                    obj.m2_pos_max_field.Value = round(obj.m2_pos_max_field.Value * (180 / pi), 1);
                    obj.m1_vel_lim_field.Value = round(obj.m1_vel_lim_field.Value * (180 / pi), 1);
                    obj.m2_vel_lim_field.Value = round(obj.m2_vel_lim_field.Value * (180 / pi), 1);
                end
            else
                if ~isempty(obj.lbl_m1) && isvalid(obj.lbl_m1)
                    obj.lbl_m1.Text       = 'M1 Angle (rad)';
                    obj.lbl_m2.Text       = 'M2 Angle (rad)';
                end
                if ~isempty(obj.m1_target_field) && isvalid(obj.m1_target_field)
                    obj.m1_target_field.Limits = [-6.283, 6.283];
                end
                if ~isempty(obj.m2_target_field) && isvalid(obj.m2_target_field)
                    obj.m2_target_field.Limits = [-6.283, 6.283];
                end
                if ~isempty(obj.lbl_m1_speed) && isvalid(obj.lbl_m1_speed)
                    obj.lbl_m1_speed.Text = 'Spd (rad/s)';
                    obj.lbl_m2_speed.Text = 'Spd (rad/s)';
                    obj.m1_speed_field.Limits = [0, 33];
                    obj.m2_speed_field.Limits = [0, 33];
                end
                if ~isempty(obj.lbl_m1_accel) && isvalid(obj.lbl_m1_accel)
                    obj.lbl_m1_accel.Text = 'Acc (rad/s^2)';
                    obj.lbl_m2_accel.Text = 'Acc (rad/s^2)';
                    obj.m1_accel_field.Limits = [0, 500];
                    obj.m2_accel_field.Limits = [0, 500];
                end
                if ~isempty(obj.lbl_lim_pos_min) && isvalid(obj.lbl_lim_pos_min)
                    obj.lbl_lim_pos_min.Text = 'Pos Min (rad)';
                    obj.lbl_lim_pos_max.Text = 'Pos Max (rad)';
                    obj.lbl_lim_vel.Text     = 'Max Vel (rad/s)';

                    % Convert Limits panel values deg -> rad
                    obj.m1_pos_min_field.Limits = [-Inf, Inf];
                    obj.m1_pos_max_field.Limits = [-Inf, Inf];
                    obj.m2_pos_min_field.Limits = [-Inf, Inf];
                    obj.m2_pos_max_field.Limits = [-Inf, Inf];
                    obj.m1_vel_lim_field.Limits = [-Inf, Inf];
                    obj.m2_vel_lim_field.Limits = [-Inf, Inf];

                    obj.m1_pos_min_field.Value = round(obj.m1_pos_min_field.Value * (pi / 180), 3);
                    obj.m1_pos_max_field.Value = round(obj.m1_pos_max_field.Value * (pi / 180), 3);
                    obj.m2_pos_min_field.Value = round(obj.m2_pos_min_field.Value * (pi / 180), 3);
                    obj.m2_pos_max_field.Value = round(obj.m2_pos_max_field.Value * (pi / 180), 3);
                    obj.m1_vel_lim_field.Value = round(obj.m1_vel_lim_field.Value * (pi / 180), 3);
                    obj.m2_vel_lim_field.Value = round(obj.m2_vel_lim_field.Value * (pi / 180), 3);
                end
            end
        end

        function send_angle(obj, motor_id, angle_val, speed_val, accel_val)
            if nargin < 5, accel_val = 0; end
            if isempty(angle_val) || ~isnumeric(angle_val) || isnan(angle_val), return; end
            if isempty(speed_val) || ~isnumeric(speed_val) || isnan(speed_val), return; end
            if isempty(accel_val) || ~isnumeric(accel_val) || isnan(accel_val), return; end
            try
                unit = 'deg';
                if ~isempty(obj.unit_dropdown) && isvalid(obj.unit_dropdown)
                    unit = obj.unit_dropdown.Value;
                end
                if strcmp(unit, 'deg')
                    angle_rad = angle_val * (pi / 180);
                    speed_rads = speed_val * (pi / 180);
                    accel_rad  = accel_val * (pi / 180);
                else
                    angle_rad = angle_val;
                    speed_rads = speed_val;
                    accel_rad  = accel_val;
                end
                if ~isempty(obj.shortest_path_chk) && isvalid(obj.shortest_path_chk) && obj.shortest_path_chk.Value
                    if ~isempty(obj.arm)
                        unwrapped = obj.arm.calculate_shortest_path(motor_id, angle_rad);
                        % Check against joint limits
                        if motor_id == obj.arm.MOTOR_1_ID
                            lo = obj.arm.JOINT_LIMITS.m1_min; hi = obj.arm.JOINT_LIMITS.m1_max;
                        else
                            lo = obj.arm.JOINT_LIMITS.m2_min; hi = obj.arm.JOINT_LIMITS.m2_max;
                        end
                        if unwrapped >= lo && unwrapped <= hi
                            angle_rad = unwrapped;
                        end
                    end
                end
                % Clamp
                accel_rad = max(0, min(500, accel_rad));
                speed_rads = max(0, min(30, speed_rads));
                % Apply acceleration
                if accel_rad > 0 && ~isempty(obj.arm)
                    obj.arm.set_acceleration(motor_id, accel_rad);
                end
                % Apply speed limit
                if speed_rads > 0 && ~isempty(obj.arm)
                    obj.arm.set_velocity_limit(motor_id, speed_rads);
                end
                % Send position
                if ~isempty(obj.arm)
                    obj.arm.set_target_position(motor_id, angle_rad);
                end
                fprintf('Motor %d   %.3f rad | spd %.2f rad/s | acc %.2f rad/s \n', motor_id, angle_rad, speed_rads, accel_rad);
            catch e
                warning('ArmMonitor:sendAngle', '%s', e.message);
            end
        end

        function send_both(obj)
            try
                mid1 = 1;
                mid2 = 2;
                if ~isempty(obj.arm) && (isprop(obj.arm, 'MOTOR_1_ID') || isfield(obj.arm, 'MOTOR_1_ID'))
                    mid1 = obj.arm.MOTOR_1_ID;
                end
                if ~isempty(obj.arm) && (isprop(obj.arm, 'MOTOR_2_ID') || isfield(obj.arm, 'MOTOR_2_ID'))
                    mid2 = obj.arm.MOTOR_2_ID;
                end
                val1 = 0;
                if ~isempty(obj.m1_target_field) && isvalid(obj.m1_target_field)
                    val1 = obj.m1_target_field.Value;
                elseif ~isempty(obj.m1_angle_field) && isvalid(obj.m1_angle_field)
                    val1 = obj.m1_angle_field.Value;
                end
                val2 = 0;
                if ~isempty(obj.m2_target_field) && isvalid(obj.m2_target_field)
                    val2 = obj.m2_target_field.Value;
                elseif ~isempty(obj.m2_angle_field) && isvalid(obj.m2_angle_field)
                    val2 = obj.m2_angle_field.Value;
                end

                spd1 = obj.m1_speed_field.Value;
                spd2 = obj.m2_speed_field.Value;
                acc1 = obj.m1_accel_field.Value;
                acc2 = obj.m2_accel_field.Value;

                unit = 'deg';
                if ~isempty(obj.unit_dropdown) && isvalid(obj.unit_dropdown)
                    unit = obj.unit_dropdown.Value;
                end
                if strcmp(unit, 'deg')
                    ang1_rad = val1 * (pi/180); ang2_rad = val2 * (pi/180);
                    spd1_rad = max(0, min(30, spd1 * (pi/180)));
                    spd2_rad = max(0, min(30, spd2 * (pi/180)));
                    acc1_rad = max(0, min(500, acc1 * (pi/180)));
                    acc2_rad = max(0, min(500, acc2 * (pi/180)));
                else
                    ang1_rad = val1; ang2_rad = val2;
                    spd1_rad = max(0, min(30, spd1));
                    spd2_rad = max(0, min(30, spd2));
                    acc1_rad = max(0, min(500, acc1));
                    acc2_rad = max(0, min(500, acc2));
                end

                if ~isempty(obj.shortest_path_chk) && isvalid(obj.shortest_path_chk) && obj.shortest_path_chk.Value
                    if ~isempty(obj.arm)
                        ang1_rad = obj.arm.calculate_shortest_path(mid1, ang1_rad);
                        ang2_rad = obj.arm.calculate_shortest_path(mid2, ang2_rad);
                    end
                end

                if ~isempty(obj.arm)
                    % Phase 1: write motion parameters for both motors
                    if acc1_rad > 0, obj.arm.set_acceleration(mid1, acc1_rad); end
                    if acc2_rad > 0, obj.arm.set_acceleration(mid2, acc2_rad); end
                    if spd1_rad > 0, obj.arm.set_velocity_limit(mid1, spd1_rad); end
                    if spd2_rad > 0, obj.arm.set_velocity_limit(mid2, spd2_rad); end
                    % Phase 2: fire position commands simultaneously
                    if ismethod(obj.arm, 'set_both_targets')
                        obj.arm.set_both_targets(ang1_rad, ang2_rad);
                    else
                        obj.arm.set_target_position(mid1, ang1_rad);
                        obj.arm.set_target_position(mid2, ang2_rad);
                    end
                end
            catch e
                warning('ArmMonitor:sendBoth', '%s', e.message);
            end
        end

        function solve_ik_preview(obj)
            % Computes trajectory preview for target XY fields, updates labels, path, and ghost overlay
            try
                if isempty(obj.ik_x_field) || ~isvalid(obj.ik_x_field) || isempty(obj.arm)
                    return;
                end
                
                % Query start position from FK of current joint angles
                th1_c = obj.arm.Telemetry.m1.position;
                th2_c = obj.arm.Telemetry.m2.position;
                [x0, y0] = obj.arm.forward_kinematics(th1_c, th2_c);
                
                xt = obj.ik_x_field.Value;
                yt = obj.ik_y_field.Value;
                spd = obj.ik_spd_field.Value;
                acc = obj.ik_acc_field.Value;
                
                traj_type = lower(obj.ik_traj_dropdown.Value);
                if contains(traj_type, 'joint')
                    traj_type = 'joint';
                elseif contains(traj_type, 'arch')
                    traj_type = 'arch';
                else
                    traj_type = 'linear';
                end
                
                elbow_config = 'up';
                if ~isempty(obj.ik_elbow_dropdown) && isvalid(obj.ik_elbow_dropdown)
                    if contains(lower(obj.ik_elbow_dropdown.Value), 'down')
                        elbow_config = 'down';
                    end
                end
                
                traj = obj.arm.plan_trajectory([x0, y0], [xt, yt], spd, acc, traj_type, elbow_config);
                if traj.valid
                    D = sqrt((xt - x0)^2 + (yt - y0)^2);
                    obj.ik_lbl_status.Text = sprintf('Path Valid (%s, %.1f mm, %.2f s)', traj.traj_type, D, traj.t(end));
                    obj.ik_lbl_status.Tooltip = '';
                    obj.ik_lbl_status.FontColor = [0.3, 1.0, 0.4];
                    obj.ik_lbl_result.Text = sprintf('th1 = %.3f rad (%.1f deg)   th2 = %.3f rad (%.1f deg)', ...
                        traj.th1(end), traj.th1(end)*(180/pi), traj.th2(end), traj.th2(end)*(180/pi));
                    
                    if isvalid(obj.ik_preview_chk) && obj.ik_preview_chk.Value
                        obj.draw_trajectory_path(traj.x, traj.y, traj.traj_type);
                        obj.draw_ik_ghost(traj.th1(end), traj.th2(end), xt, yt);
                    else
                        obj.clear_trajectory_path();
                        obj.clear_ik_ghost();
                    end
                else
                    obj.ik_lbl_status.Text = traj.error_msg;
                    obj.ik_lbl_status.Tooltip = traj.error_msg;
                    obj.ik_lbl_status.FontColor = [1.0, 0.3, 0.3];
                    obj.ik_lbl_result.Text = '';
                    obj.clear_trajectory_path();
                    obj.clear_ik_ghost();
                end
            catch
                obj.clear_trajectory_path();
                obj.clear_ik_ghost();
            end
        end

        function draw_trajectory_path(obj, px, py, traj_type)
            try
                color_map = struct('linear', [0.2, 0.8, 1.0], 'joint', [1.0, 0.4, 0.9], 'arch', [1.0, 0.85, 0.2]);
                c = [0.2, 0.8, 1.0];
                if isfield(color_map, lower(traj_type)), c = color_map.(lower(traj_type)); end
                if ~isempty(obj.h_traj_plot) && isgraphics(obj.h_traj_plot)
                    set(obj.h_traj_plot, 'XData', px, 'YData', py, 'Color', c);
                else
                    obj.h_traj_plot = plot(obj.ax, px, py, ':', 'Color', c, 'LineWidth', 2.0);
                end
            catch
            end
        end

        function clear_trajectory_path(obj)
            try
                if ~isempty(obj.h_traj_plot) && isgraphics(obj.h_traj_plot)
                    delete(obj.h_traj_plot);
                    obj.h_traj_plot = [];
                end
            catch
            end
        end

        function execute_trajectory(obj)
            try
                if isempty(obj.arm), return; end
                obj.abort_trajectory(); % Stop any ongoing run
                
                mid1 = 1; mid2 = 2;
                if isprop(obj.arm, 'MOTOR_1_ID') || isfield(obj.arm, 'MOTOR_1_ID')
                    mid1 = obj.arm.MOTOR_1_ID;
                end
                if isprop(obj.arm, 'MOTOR_2_ID') || isfield(obj.arm, 'MOTOR_2_ID')
                    mid2 = obj.arm.MOTOR_2_ID;
                end
                
                % Current Cartesian position from telemetry
                th1_c = obj.arm.Telemetry.m1.position;
                th2_c = obj.arm.Telemetry.m2.position;
                [x0, y0] = obj.arm.forward_kinematics(th1_c, th2_c);
                
                xt = obj.ik_x_field.Value;
                yt = obj.ik_y_field.Value;
                spd = 180.0; % Hardcoded as requested
                acc = 100.0; % Hardcoded as requested
                traj_type = lower(obj.ik_traj_dropdown.Value);
                if contains(traj_type, 'joint')
                    traj_type = 'joint';
                elseif contains(traj_type, 'arch')
                    traj_type = 'arch';
                else
                    traj_type = 'linear';
                end
                elbow = 'up';
                if contains(lower(obj.ik_elbow_dropdown.Value), 'down'), elbow = 'down'; end
                
                if strcmpi(traj_type, 'joint')
                    % Native 20kHz DSP execution
                    try
                        [th1_t, th2_t] = obj.arm.inverse_kinematics(xt, yt, elbow);
                    catch ik_err
                        obj.ik_lbl_status.Text = ik_err.message;
                        obj.ik_lbl_status.Tooltip = ik_err.message;
                        obj.ik_lbl_status.FontColor = [1.0, 0.3, 0.3];
                        obj.ik_lbl_result.Text = '';
                        return;
                    end
                    
                    % Apply shortest-path unwrapping relative to current positions
                    th1_t = obj.arm.calculate_shortest_path(mid1, th1_t);
                    th2_t = obj.arm.calculate_shortest_path(mid2, th2_t);
                    
                    if isprop(obj.arm, 'JOINT_LIMITS') && ~isempty(obj.arm.JOINT_LIMITS)
                        if th1_t < obj.arm.JOINT_LIMITS.m1_min || th1_t > obj.arm.JOINT_LIMITS.m1_max || ...
                           th2_t < obj.arm.JOINT_LIMITS.m2_min || th2_t > obj.arm.JOINT_LIMITS.m2_max
                            obj.ik_lbl_status.Text = 'Trajectory violates joint angle software limits.';
                            obj.ik_lbl_status.Tooltip = obj.ik_lbl_status.Text;
                            obj.ik_lbl_status.FontColor = [1.0, 0.3, 0.3];
                            obj.ik_lbl_result.Text = '';
                            return;
                        end
                    end
                    
                    % Determine joint velocity and acceleration limits
                    d1 = abs(th1_t - th1_c);
                    d2 = abs(th2_t - th2_c);
                    d_max = max(d1, d2);
                    
                    % User requested exact 180 deg/s and 100 deg/s^2 limits
                    joint_spd = 180.0 * (pi / 180.0); % 3.14 rad/s
                    joint_acc = 100.0 * (pi / 180.0); % 1.74 rad/s^2
                    
                    if d_max > 1e-3
                        spd1 = max(0.1, joint_spd * (d1 / d_max));
                        spd2 = max(0.1, joint_spd * (d2 / d_max));
                    else
                        spd1 = joint_spd;
                        spd2 = joint_spd;
                    end
                    
                    % Pre-program motor motion parameters
                    obj.arm.set_acceleration(mid1, joint_acc);
                    obj.arm.set_acceleration(mid2, joint_acc);
                    obj.arm.set_velocity_limit(mid1, spd1);
                    obj.arm.set_velocity_limit(mid2, spd2);
                    
                    % Transmit target positions directly
                    if ismethod(obj.arm, 'set_both_targets')
                        obj.arm.set_both_targets(th1_t, th2_t);
                    else
                        obj.arm.set_target_position(mid1, th1_t);
                        obj.arm.set_target_position(mid2, th2_t);
                    end
                    
                    % Draw predicted curve on axes using forward kinematics of joint path
                    N_pts = 50;
                    th1_path = linspace(th1_c, th1_t, N_pts);
                    th2_path = linspace(th2_c, th2_t, N_pts);
                    px = zeros(1, N_pts);
                    py = zeros(1, N_pts);
                    for i = 1:N_pts
                        [px(i), py(i)] = obj.arm.forward_kinematics(th1_path(i), th2_path(i));
                    end
                    obj.draw_trajectory_path(px, py, 'joint');
                    
                    % Update UI labels
                    obj.ik_lbl_status.Text = 'Moving (Native 20kHz DSP)...';
                    obj.ik_lbl_status.Tooltip = '';
                    obj.ik_lbl_status.FontColor = [0.3, 0.9, 0.4];
                    obj.ik_lbl_result.Text = sprintf('th1: %.1f deg, th2: %.1f deg (spd: %.1f rad/s)', th1_t*(180/pi), th2_t*(180/pi), joint_spd);
                else
                    % Linear and Arch trajectory streaming (Pre-calculated at 50Hz, 0.02s intervals)
                    traj = obj.arm.plan_trajectory([x0, y0], [xt, yt], spd, acc, traj_type, elbow, 0.02, [th1_c, th2_c]);
                    if ~traj.valid
                        obj.ik_lbl_status.Text = traj.error_msg;
                        obj.ik_lbl_status.Tooltip = traj.error_msg;
                        obj.ik_lbl_status.FontColor = [1.0, 0.3, 0.3];
                        obj.ik_lbl_result.Text = '';
                        return;
                    end
                    
                    obj.draw_trajectory_path(traj.x, traj.y, traj.traj_type);
                    obj.active_traj = traj;
                    obj.traj_step_idx = 1;
                    
                    % Set motor acceleration to high tracking bandwidth
                    obj.arm.set_acceleration(mid1, 200.0);
                    obj.arm.set_acceleration(mid2, 200.0);
                    
                    % Set velocity limits with adequate headroom so motors track incoming waypoints instantly
                    % Increased to 40.0 rad/s (near physical max) to prevent the motor from falling behind
                    % high-acceleration Cartesian paths. If it falls behind by >180 deg, the internal
                    % shortest-path firmware causes a violent 1-rev backward spin.
                    obj.arm.set_velocity_limit(mid1, 40.0);
                    obj.arm.set_velocity_limit(mid2, 40.0);
                    
                    % Create continuous streaming timer (50Hz / 0.02s period)
                    obj.traj_timer = timer(...
                        'ExecutionMode', 'fixedSpacing', ...
                        'Period', 0.02, ...
                        'BusyMode', 'drop', ...
                        'TimerFcn', @(~,~) obj.traj_stream_step());
                    start(obj.traj_timer);
                    obj.ik_lbl_status.Text = 'Moving...';
                    obj.ik_lbl_status.Tooltip = '';
                    obj.ik_lbl_status.FontColor = [0.3, 0.9, 0.4];
                end
            catch e
                warning('ArmMonitor:execTraj', '%s', e.message);
            end
        end

        function traj_stream_step(obj)
            try
                if isempty(obj.active_traj) || ~obj.active_traj.valid
                    obj.abort_trajectory();
                    return;
                end
                k = obj.traj_step_idx;
                N = length(obj.active_traj.t);
                if k > N
                    obj.abort_trajectory();
                    obj.ik_lbl_status.Text = 'Trajectory Complete';
                    obj.ik_lbl_status.Tooltip = '';
                    obj.ik_lbl_status.FontColor = [0.3, 1.0, 0.4];
                    return;
                end
                
                mid1 = 1; mid2 = 2;
                if isprop(obj.arm, 'MOTOR_1_ID') || isfield(obj.arm, 'MOTOR_1_ID')
                    mid1 = obj.arm.MOTOR_1_ID;
                end
                if isprop(obj.arm, 'MOTOR_2_ID') || isfield(obj.arm, 'MOTOR_2_ID')
                    mid2 = obj.arm.MOTOR_2_ID;
                end
                
                % Atomically send joint waypoints to both motors in single serial packet
                th1 = obj.active_traj.th1(k);
                th2 = obj.active_traj.th2(k);
                if ismethod(obj.arm, 'set_both_targets')
                    obj.arm.set_both_targets(th1, th2);
                else
                    obj.arm.set_target_position(mid1, th1);
                    obj.arm.set_target_position(mid2, th2);
                end
                
                % Throttle UI progress text update to every 5 ticks (10Hz) to prevent GUI lag
                if mod(k, 5) == 0 || k == N
                    pct = round((k / N) * 100);
                    obj.ik_lbl_result.Text = sprintf('Moving: %d%% (t=%.2fs/%.2fs)', pct, obj.active_traj.t(k), obj.active_traj.t(end));
                end
                obj.traj_step_idx = k + 1;
            catch
                obj.abort_trajectory();
            end
        end

        function abort_trajectory(obj)
            try
                if ~isempty(obj.traj_timer) && isvalid(obj.traj_timer)
                    stop(obj.traj_timer);
                    delete(obj.traj_timer);
                end
                obj.traj_timer = [];
                obj.active_traj = [];
                obj.ik_lbl_status.Text = 'Halted / Idle';
                obj.ik_lbl_status.Tooltip = '';
                obj.ik_lbl_status.FontColor = [0.8, 0.8, 0.8];
            catch
            end
        end

        function solve_and_send_ik(obj)
            % Computes IK and commands both motors to the solution
            try
                if isempty(obj.ik_x_field) || ~isvalid(obj.ik_x_field)
                    return;
                end
                x = obj.ik_x_field.Value;
                y = obj.ik_y_field.Value;

                L1 = obj.L1; L2 = obj.L2;
                if ~isempty(obj.arm) && isprop(obj.arm, 'L1'), L1 = obj.arm.L1; end
                if ~isempty(obj.arm) && isprop(obj.arm, 'L2'), L2 = obj.arm.L2; end

                r = sqrt(x^2 + y^2);
                max_reach = L1 + L2;
                min_reach = abs(L1 - L2);
                if r > max_reach + 0.5 || r < min_reach - 0.5
                    if ~isempty(obj.fig) && isgraphics(obj.fig)
                        uialert(obj.fig, sprintf('Target (%.1f, %.1f) mm is out of reach.\nMax reach: %.0f mm', x, y, max_reach), ...
                            'Out of Range', 'Icon', 'warning');
                    end
                    return;
                end

                % Solve IK
                D = (x^2 + y^2 - L1^2 - L2^2) / (2 * L1 * L2);
                D = max(-1, min(1, D));

                % Read elbow config dropdown
                use_elbow_up = true;
                if ~isempty(obj.ik_elbow_dropdown) && isvalid(obj.ik_elbow_dropdown)
                    use_elbow_up = strcmp(obj.ik_elbow_dropdown.Value, 'Elbow Up');
                end
                if use_elbow_up
                    th2 = atan2(+sqrt(1 - D^2), D);
                else
                    th2 = atan2(-sqrt(1 - D^2), D);
                end
                th1 = atan2(-x, -y) - atan2(L2 * sin(th2), L1 + L2 * cos(th2));
                th1 = mod(th1 + pi, 2*pi) - pi;
                th2 = mod(th2 + pi, 2*pi) - pi;

                mid1 = 1; mid2 = 2;
                if ~isempty(obj.arm) && (isprop(obj.arm, 'MOTOR_1_ID') || isfield(obj.arm, 'MOTOR_1_ID'))
                    mid1 = obj.arm.MOTOR_1_ID;
                end
                if ~isempty(obj.arm) && (isprop(obj.arm, 'MOTOR_2_ID') || isfield(obj.arm, 'MOTOR_2_ID'))
                    mid2 = obj.arm.MOTOR_2_ID;
                end

                % Get speed and accel from the control bar fields
                spd = 180.0; acc = 50.0;
                unit = 'deg';
                if ~isempty(obj.unit_dropdown) && isvalid(obj.unit_dropdown)
                    unit = obj.unit_dropdown.Value;
                end
                if ~isempty(obj.m1_speed_field) && isvalid(obj.m1_speed_field)
                    spd = obj.m1_speed_field.Value;
                end
                if ~isempty(obj.m1_accel_field) && isvalid(obj.m1_accel_field)
                    acc = obj.m1_accel_field.Value;
                end


                % Send both motors SIMULTANEOUSLY:
                % Write accel + speed limits for both first, then fire position commands
                % back-to-back to minimise inter-motor delay (<1 CAN frame apart).
                if strcmp(unit, 'deg')
                    spd_rad = spd * (pi / 180);
                    acc_rad = acc * (pi / 180);
                else
                    spd_rad = spd;
                    acc_rad = acc;
                end
                spd_rad = max(0, min(30, spd_rad));
                acc_rad = max(0, min(500, acc_rad));

                if ~isempty(obj.arm)
                    % Phase 1: write motion parameters for both motors
                    if acc_rad > 0
                        obj.arm.set_acceleration(mid1, acc_rad);
                        obj.arm.set_acceleration(mid2, acc_rad);
                    end
                    if spd_rad > 0
                        obj.arm.set_velocity_limit(mid1, spd_rad);
                        obj.arm.set_velocity_limit(mid2, spd_rad);
                    end
                    if ~isempty(obj.shortest_path_chk) && isvalid(obj.shortest_path_chk) && obj.shortest_path_chk.Value
                        if ~isempty(obj.arm)
                            th1 = obj.arm.calculate_shortest_path(mid1, th1);
                            th2 = obj.arm.calculate_shortest_path(mid2, th2);
                        end
                    end
                    % Phase 2: fire position commands back-to-back (no calls between them)
                    obj.arm.set_target_position(mid1, th1);
                    obj.arm.set_target_position(mid2, th2);
                end

                fprintf('IK: Target=(%.1f, %.1f) mm -> th1=%.3f rad, th2=%.3f rad\n', x, y, th1, th2);
            catch e
                warning('ArmMonitor:IK', 'IK solve/send failed: %s', e.message);
            end
        end

        function update_ik_fk_readback(obj, th1, th2)
            % Updates FK-derived live coordinates shown in IK panel
            try
                if isempty(obj.ik_lbl_fk) || ~isvalid(obj.ik_lbl_fk)
                    return;
                end
                L1 = obj.L1; L2 = obj.L2;
                if ~isempty(obj.arm) && isprop(obj.arm, 'L1'), L1 = obj.arm.L1; end
                if ~isempty(obj.arm) && isprop(obj.arm, 'L2'), L2 = obj.arm.L2; end
                ee_x = -L1 * sin(th1) - L2 * sin(th1 + th2);
                ee_y = -L1 * cos(th1) - L2 * cos(th1 + th2);
                obj.ik_lbl_fk.Text = sprintf('X = %+7.1f mm   Y = %+7.1f mm', ee_x, ee_y);
            catch
            end
        end

        function draw_ik_ghost(obj, th1, ~, ee_x, ee_y)
            % Draw dashed ghost arm at IK solution angles
            try
                L1 = obj.L1;
                if ~isempty(obj.arm) && isprop(obj.arm, 'L1'), L1 = obj.arm.L1; end

                ex = -L1 * sin(th1);
                ey = -L1 * cos(th1);

                if ~isempty(obj.h_ik_ghost1) && isgraphics(obj.h_ik_ghost1)
                    set(obj.h_ik_ghost1, 'XData', [0, ex], 'YData', [0, ey]);
                    set(obj.h_ik_ghost2, 'XData', [ex, ee_x], 'YData', [ey, ee_y]);
                else
                    obj.h_ik_ghost1 = plot(obj.ax, [0, ex], [0, ey], '--', ...
                        'Color', [0.85, 0.85, 0.3, 0.6], 'LineWidth', 2.0);
                    obj.h_ik_ghost2 = plot(obj.ax, [ex, ee_x], [ey, ee_y], '--', ...
                        'Color', [0.3, 0.85, 0.85, 0.6], 'LineWidth', 2.0);
                end

                if ~isempty(obj.h_ik_target) && isgraphics(obj.h_ik_target)
                    set(obj.h_ik_target, 'XData', ee_x, 'YData', ee_y);
                else
                    obj.h_ik_target = plot(obj.ax, ee_x, ee_y, 'x', ...
                        'MarkerSize', 14, 'LineWidth', 2.5, 'Color', [1.0, 0.4, 0.1]);
                end
            catch
            end
        end

        function clear_ik_ghost(obj)
            % Remove ghost arm and target marker from axes
            try
                if ~isempty(obj.h_ik_ghost1) && isgraphics(obj.h_ik_ghost1)
                    delete(obj.h_ik_ghost1); obj.h_ik_ghost1 = [];
                end
                if ~isempty(obj.h_ik_ghost2) && isgraphics(obj.h_ik_ghost2)
                    delete(obj.h_ik_ghost2); obj.h_ik_ghost2 = [];
                end
                if ~isempty(obj.h_ik_target) && isgraphics(obj.h_ik_target)
                    delete(obj.h_ik_target); obj.h_ik_target = [];
                end
            catch
            end
        end

        function set_control_mode(obj, mode_str)
            try
                if ~isempty(obj.arm)
                    mid1 = 1; mid2 = 2;
                    if isprop(obj.arm, 'MOTOR_1_ID') || isfield(obj.arm, 'MOTOR_1_ID')
                        mid1 = obj.arm.MOTOR_1_ID;
                    end
                    if isprop(obj.arm, 'MOTOR_2_ID') || isfield(obj.arm, 'MOTOR_2_ID')
                        mid2 = obj.arm.MOTOR_2_ID;
                    end
                    for mid = [mid1, mid2]
                        switch lower(mode_str)
                            case {'position', 'pos'}
                                obj.arm.set_position_mode(mid);
                            case {'velocity', 'vel'}
                                obj.arm.set_velocity_mode(mid);
                            case {'current', 'cur'}
                                obj.arm.set_current_mode(mid);
                        end
                    end
                end
                fprintf('Control mode set to: %s\n', mode_str);
            catch e
                warning('ArmMonitor:setMode','%s', e.message);
            end
        end

        function build_log_panel(obj)
            lg = uigridlayout(obj.log_panel, [12, 2]);
            lg.ColumnWidth = {90, '1x'};
            lg.RowHeight = {20, 24, 26, 24, 24, 24, 34, 22, 22, 50, 28, '1x'};
            lg.Padding = [8, 8, 8, 8];
            lg.RowSpacing = 6;
            lg.ColumnSpacing = 6;

            % Row 1: Save Directory label
            lbl_dir = uilabel(lg, 'Text', 'Save Directory:', 'FontColor', [0.85, 0.85, 0.85], 'FontWeight', 'bold');
            lbl_dir.Layout.Row = 1;
            lbl_dir.Layout.Column = [1 2];

            % Row 2: Directory edit field
            obj.log_dir_field = uieditfield(lg, 'text', 'Value', fullfile(pwd, 'logs'));
            obj.log_dir_field.Layout.Row = 2;
            obj.log_dir_field.Layout.Column = [1 2];
            obj.log_dir_field.BackgroundColor = [0.18, 0.18, 0.22];
            obj.log_dir_field.FontColor = [1.0, 1.0, 1.0];
            obj.log_dir_field.Tooltip = 'Directory where CSV logs are saved';

            % Row 3: Browse button
            obj.btn_log_browse = uibutton(lg, 'push', 'Text', 'Browse Folder...');
            obj.btn_log_browse.Layout.Row = 3;
            obj.btn_log_browse.Layout.Column = [1 2];
            obj.btn_log_browse.BackgroundColor = [0.22, 0.22, 0.28];
            obj.btn_log_browse.FontColor = [1.0, 1.0, 1.0];
            obj.btn_log_browse.ButtonPushedFcn = @(~,~) obj.browse_log_dir();

            % Row 4: File Prefix
            lbl_pre = uilabel(lg, 'Text', 'File Prefix:', 'FontColor', [0.85, 0.85, 0.85]);
            lbl_pre.Layout.Row = 4;
            lbl_pre.Layout.Column = 1;
            obj.log_prefix_field = uieditfield(lg, 'text', 'Value', 'arm_telemetry');
            obj.log_prefix_field.Layout.Row = 4;
            obj.log_prefix_field.Layout.Column = 2;
            obj.log_prefix_field.BackgroundColor = [0.18, 0.18, 0.22];
            obj.log_prefix_field.FontColor = [1.0, 1.0, 1.0];

            % Row 5: Log Mode
            lbl_mode = uilabel(lg, 'Text', 'Mode:', 'FontColor', [0.85, 0.85, 0.85]);
            lbl_mode.Layout.Row = 5;
            lbl_mode.Layout.Column = 1;
            obj.log_mode_dropdown = uidropdown(lg, 'Items', {'Manual (Until Stopped)', 'Timed Duration'}, 'Value', 'Manual (Until Stopped)');
            obj.log_mode_dropdown.Layout.Row = 5;
            obj.log_mode_dropdown.Layout.Column = 2;
            obj.log_mode_dropdown.BackgroundColor = [0.18, 0.18, 0.22];
            obj.log_mode_dropdown.FontColor = [1.0, 1.0, 1.0];

            % Row 6: Duration
            lbl_dur = uilabel(lg, 'Text', 'Duration (s):', 'FontColor', [0.85, 0.85, 0.85]);
            lbl_dur.Layout.Row = 6;
            lbl_dur.Layout.Column = 1;
            obj.log_duration_field = uieditfield(lg, 'numeric', 'Value', 10.0, 'Limits', [0.1, 86400]);
            obj.log_duration_field.Layout.Row = 6;
            obj.log_duration_field.Layout.Column = 2;
            obj.log_duration_field.BackgroundColor = [0.18, 0.18, 0.22];
            obj.log_duration_field.FontColor = [1.0, 1.0, 1.0];

            % Row 7: Toggle Button
            obj.btn_log_toggle = uibutton(lg, 'push', 'Text', 'START LOGGING');
            obj.btn_log_toggle.Layout.Row = 7;
            obj.btn_log_toggle.Layout.Column = [1 2];
            obj.btn_log_toggle.BackgroundColor = [0.18, 0.55, 0.25];
            obj.btn_log_toggle.FontColor = [1.0, 1.0, 1.0];
            obj.btn_log_toggle.FontSize = 13;
            obj.btn_log_toggle.FontWeight = 'bold';
            obj.btn_log_toggle.ButtonPushedFcn = @(~,~) obj.toggle_logging();

            % Row 8: Status
            obj.lbl_log_status = uilabel(lg, 'Text', 'Status: Idle', 'FontColor', [0.4, 1.0, 0.4], 'FontWeight', 'bold');
            obj.lbl_log_status.Layout.Row = 8;
            obj.lbl_log_status.Layout.Column = [1 2];

            % Row 9: Samples & Elapsed
            obj.lbl_log_samples = uilabel(lg, 'Text', 'Samples: 0', 'FontColor', [0.85, 0.85, 0.85]);
            obj.lbl_log_samples.Layout.Row = 9;
            obj.lbl_log_samples.Layout.Column = 1;
            obj.lbl_log_elapsed = uilabel(lg, 'Text', 'Elapsed: 0.0 s', 'FontColor', [0.85, 0.85, 0.85]);
            obj.lbl_log_elapsed.Layout.Row = 9;
            obj.lbl_log_elapsed.Layout.Column = 2;

            % Row 10: File path display
            obj.lbl_log_file = uilabel(lg, 'Text', 'File: ---', 'WordWrap', 'on', 'FontColor', [0.75, 0.75, 0.75], 'FontSize', 10);
            obj.lbl_log_file.Layout.Row = 10;
            obj.lbl_log_file.Layout.Column = [1 2];

            % Row 11: Open Log Folder
            obj.btn_log_open_folder = uibutton(lg, 'push', 'Text', 'Open Log Folder');
            obj.btn_log_open_folder.Layout.Row = 11;
            obj.btn_log_open_folder.Layout.Column = [1 2];
            obj.btn_log_open_folder.BackgroundColor = [0.22, 0.22, 0.28];
            obj.btn_log_open_folder.FontColor = [1.0, 1.0, 1.0];
            obj.btn_log_open_folder.ButtonPushedFcn = @(~,~) obj.open_log_folder();
        end

        function browse_log_dir(obj)
            try
                current_dir = '';
                if ~isempty(obj.log_dir_field) && isvalid(obj.log_dir_field)
                    current_dir = obj.log_dir_field.Value;
                end
                if isempty(current_dir) || ~exist(current_dir, 'dir')
                    current_dir = pwd;
                end
                sel_dir = uigetdir(current_dir, 'Select Log Save Directory');
                if ischar(sel_dir) && ~isequal(sel_dir, 0)
                    obj.log_dir_field.Value = sel_dir;
                end
            catch e
                warning('ArmMonitor:browse_log_dir', 'Failed to browse directory: %s', e.message);
            end
        end

        function open_log_folder(obj)
            try
                log_dir = '';
                if ~isempty(obj.log_dir_field) && isvalid(obj.log_dir_field)
                    log_dir = obj.log_dir_field.Value;
                end
                if isempty(log_dir)
                    log_dir = fullfile(pwd, 'logs');
                end
                if ~exist(log_dir, 'dir')
                    mkdir(log_dir);
                end
                if ispc
                    winopen(log_dir);
                elseif ismac
                    system(sprintf('open "%s" &', log_dir));
                else
                    system(sprintf('xdg-open "%s" &', log_dir));
                end
            catch e
                warning('ArmMonitor:open_log_folder', 'Failed to open log folder: %s', e.message);
            end
        end

        function toggle_logging(obj)
            if ~obj.is_logging
                obj.start_csv_logging();
            else
                obj.stop_csv_logging();
            end
        end

        function start_csv_logging(obj)
            if obj.is_logging
                obj.stop_csv_logging();
            end
            
            % Resolve save directory
            save_dir = '';
            if ~isempty(obj.log_dir_field) && isvalid(obj.log_dir_field)
                save_dir = strtrim(obj.log_dir_field.Value);
            end
            if isempty(save_dir)
                save_dir = fullfile(pwd, 'logs');
            end
            if ~exist(save_dir, 'dir')
                [ok, ~] = mkdir(save_dir);
                if ~ok
                    if ~isempty(obj.lbl_log_status) && isvalid(obj.lbl_log_status)
                        obj.lbl_log_status.Text = 'Status: Cannot create dir';
                        obj.lbl_log_status.FontColor = [1.0, 0.25, 0.25];
                    end
                    return;
                end
            end

            % Resolve prefix
            prefix = 'arm_telemetry';
            if ~isempty(obj.log_prefix_field) && isvalid(obj.log_prefix_field) && ~isempty(obj.log_prefix_field.Value)
                prefix = strtrim(obj.log_prefix_field.Value);
                prefix = regexprep(prefix, '[^a-zA-Z0-9_\-]', '_');
            end
            if isempty(prefix)
                prefix = 'arm_telemetry';
            end

            % Resolve mode & duration
            if ~isempty(obj.log_mode_dropdown) && isvalid(obj.log_mode_dropdown) && contains(obj.log_mode_dropdown.Value, 'Timed', 'IgnoreCase', true)
                obj.is_timed_logging = true;
            else
                obj.is_timed_logging = false;
            end

            if ~isempty(obj.log_duration_field) && isvalid(obj.log_duration_field) && ~isempty(obj.log_duration_field.Value) && obj.log_duration_field.Value > 0
                obj.log_duration = obj.log_duration_field.Value;
            else
                obj.log_duration = 10.0;
            end

            % Form filename and full path
            ts_file = char(datetime('now', 'Format', 'yyyyMMdd_HHmmss'));
            filename = sprintf('%s_%s.csv', prefix, ts_file);
            full_path = fullfile(save_dir, filename);

            % Open CSV file
            fid = fopen(full_path, 'w');
            if fid < 0
                obj.is_logging = false;
                if ~isempty(obj.lbl_log_status) && isvalid(obj.lbl_log_status)
                    obj.lbl_log_status.Text = 'Status: File Open Error';
                    obj.lbl_log_status.FontColor = [1.0, 0.25, 0.25];
                end
                return;
            end

            % Extract static motor and arm parameters (Limits, PID gains, filter constants, geometry)
            % Motor 1 Limits
            m1_pmin = -360.0; m1_pmax = 360.0; m1_vlim = 1718.0; m1_clim = 10.0; m1_tlim = 12.0;
            if ~isempty(obj.m1_pos_min_field) && isvalid(obj.m1_pos_min_field), m1_pmin = obj.m1_pos_min_field.Value; end
            if ~isempty(obj.m1_pos_max_field) && isvalid(obj.m1_pos_max_field), m1_pmax = obj.m1_pos_max_field.Value; end
            if ~isempty(obj.m1_vel_lim_field) && isvalid(obj.m1_vel_lim_field), m1_vlim = obj.m1_vel_lim_field.Value; end
            if ~isempty(obj.m1_cur_lim_field) && isvalid(obj.m1_cur_lim_field), m1_clim = obj.m1_cur_lim_field.Value; end
            if ~isempty(obj.m1_tor_lim_field) && isvalid(obj.m1_tor_lim_field), m1_tlim = obj.m1_tor_lim_field.Value; end

            % Motor 2 Limits
            m2_pmin = -360.0; m2_pmax = 360.0; m2_vlim = 1718.0; m2_clim = 10.0; m2_tlim = 12.0;
            if ~isempty(obj.m2_pos_min_field) && isvalid(obj.m2_pos_min_field), m2_pmin = obj.m2_pos_min_field.Value; end
            if ~isempty(obj.m2_pos_max_field) && isvalid(obj.m2_pos_max_field), m2_pmax = obj.m2_pos_max_field.Value; end
            if ~isempty(obj.m2_vel_lim_field) && isvalid(obj.m2_vel_lim_field), m2_vlim = obj.m2_vel_lim_field.Value; end
            if ~isempty(obj.m2_cur_lim_field) && isvalid(obj.m2_cur_lim_field), m2_clim = obj.m2_cur_lim_field.Value; end
            if ~isempty(obj.m2_tor_lim_field) && isvalid(obj.m2_tor_lim_field), m2_tlim = obj.m2_tor_lim_field.Value; end

            % Normalize limits to degrees and deg/s if currently displayed in rad
            if ~isempty(obj.unit_dropdown) && isvalid(obj.unit_dropdown) && strcmp(obj.unit_dropdown.Value, 'rad')
                m1_pmin = m1_pmin * (180 / pi);
                m1_pmax = m1_pmax * (180 / pi);
                m1_vlim = m1_vlim * (180 / pi);
                m2_pmin = m2_pmin * (180 / pi);
                m2_pmax = m2_pmax * (180 / pi);
                m2_vlim = m2_vlim * (180 / pi);
            end

            % Motor 1 PID Gains & Filter Constants
            m1_pos_kp = 40.0; m1_vel_kp = 6.0; m1_vel_ki = 0.02; m1_vel_filt = 0.1;
            m1_cur_kp = 0.17; m1_cur_ki = 0.012; m1_cur_filt = 0.1;
            if ~isempty(obj.m1_kp_pos_field) && isvalid(obj.m1_kp_pos_field), m1_pos_kp = obj.m1_kp_pos_field.Value; end
            if ~isempty(obj.m1_kp_vel_field) && isvalid(obj.m1_kp_vel_field), m1_vel_kp = obj.m1_kp_vel_field.Value; end
            if ~isempty(obj.m1_ki_vel_field) && isvalid(obj.m1_ki_vel_field), m1_vel_ki = obj.m1_ki_vel_field.Value; end
            if ~isempty(obj.m1_kd_vel_field) && isvalid(obj.m1_kd_vel_field), m1_vel_filt = obj.m1_kd_vel_field.Value; end
            if ~isempty(obj.m1_kp_cur_field) && isvalid(obj.m1_kp_cur_field), m1_cur_kp = obj.m1_kp_cur_field.Value; end
            if ~isempty(obj.m1_ki_cur_field) && isvalid(obj.m1_ki_cur_field), m1_cur_ki = obj.m1_ki_cur_field.Value; end
            if ~isempty(obj.m1_filt_cur_field) && isvalid(obj.m1_filt_cur_field), m1_cur_filt = obj.m1_filt_cur_field.Value; end

            % Motor 2 PID Gains & Filter Constants
            m2_pos_kp = 40.0; m2_vel_kp = 6.0; m2_vel_ki = 0.02; m2_vel_filt = 0.1;
            m2_cur_kp = 0.17; m2_cur_ki = 0.012; m2_cur_filt = 0.1;
            if ~isempty(obj.m2_kp_pos_field) && isvalid(obj.m2_kp_pos_field), m2_pos_kp = obj.m2_kp_pos_field.Value; end
            if ~isempty(obj.m2_kp_vel_field) && isvalid(obj.m2_kp_vel_field), m2_vel_kp = obj.m2_kp_vel_field.Value; end
            if ~isempty(obj.m2_ki_vel_field) && isvalid(obj.m2_ki_vel_field), m2_vel_ki = obj.m2_ki_vel_field.Value; end
            if ~isempty(obj.m2_kd_vel_field) && isvalid(obj.m2_kd_vel_field), m2_vel_filt = obj.m2_kd_vel_field.Value; end
            if ~isempty(obj.m2_kp_cur_field) && isvalid(obj.m2_kp_cur_field), m2_cur_kp = obj.m2_kp_cur_field.Value; end
            if ~isempty(obj.m2_ki_cur_field) && isvalid(obj.m2_ki_cur_field), m2_cur_ki = obj.m2_ki_cur_field.Value; end
            if ~isempty(obj.m2_filt_cur_field) && isvalid(obj.m2_filt_cur_field), m2_cur_filt = obj.m2_filt_cur_field.Value; end

            % Arm Kinematic Link Lengths (mm)
            l1_val = 400.0; l2_val = 300.0;
            if isprop(obj, 'L1') && ~isempty(obj.L1), l1_val = obj.L1; end
            if isprop(obj, 'L2') && ~isempty(obj.L2), l2_val = obj.L2; end

            % Pre-cache static parameter string to ensure sub-millisecond execution in telemetry loop
            obj.log_static_params_str = sprintf('%.1f,%.1f,%.1f,%.2f,%.2f,%.2f,%.2f,%.4f,%.4f,%.4f,%.4f,%.4f,%.1f,%.1f,%.1f,%.2f,%.2f,%.2f,%.2f,%.4f,%.4f,%.4f,%.4f,%.4f,%.1f,%.1f', ...
                m1_pmin, m1_pmax, m1_vlim, m1_clim, m1_tlim, ...
                m1_pos_kp, m1_vel_kp, m1_vel_ki, m1_vel_filt, m1_cur_kp, m1_cur_ki, m1_cur_filt, ...
                m2_pmin, m2_pmax, m2_vlim, m2_clim, m2_tlim, ...
                m2_pos_kp, m2_vel_kp, m2_vel_ki, m2_vel_filt, m2_cur_kp, m2_cur_ki, m2_cur_filt, ...
                l1_val, l2_val);

            % Write CSV header row (24 dynamic telemetry + 26 static parameter columns)
            header = 'Timestamp,Elapsed_s,M1_Position_rad,M1_Position_deg,M1_Velocity_rad_s,M1_Velocity_deg_s,M1_Current_A,M1_Torque_Nm,M1_Voltage_V,M1_Temp_C,M1_Fault_Code,M1_Fault_Str,M2_Position_rad,M2_Position_deg,M2_Velocity_rad_s,M2_Velocity_deg_s,M2_Current_A,M2_Torque_Nm,M2_Voltage_V,M2_Temp_C,M2_Fault_Code,M2_Fault_Str,EE_X_mm,EE_Y_mm,M1_Pos_Min_deg,M1_Pos_Max_deg,M1_Vel_Lim_deg_s,M1_Cur_Lim_A,M1_Tor_Lim_Nm,M1_Pos_Kp,M1_Vel_Kp,M1_Vel_Ki,M1_Vel_Filt,M1_Cur_Kp,M1_Cur_Ki,M1_Cur_Filt,M2_Pos_Min_deg,M2_Pos_Max_deg,M2_Vel_Lim_deg_s,M2_Cur_Lim_A,M2_Tor_Lim_Nm,M2_Pos_Kp,M2_Vel_Kp,M2_Vel_Ki,M2_Vel_Filt,M2_Cur_Kp,M2_Cur_Ki,M2_Cur_Filt,L1_mm,L2_mm';
            fprintf(fid, '%s\n', header);

            obj.log_fid = fid;
            obj.log_current_file = full_path;
            obj.log_sample_count = 0;
            obj.log_start_time = tic;
            obj.is_logging = true;

            % Update UI controls
            if ~isempty(obj.btn_log_toggle) && isvalid(obj.btn_log_toggle)
                obj.btn_log_toggle.Text = 'STOP LOGGING';
                obj.btn_log_toggle.BackgroundColor = [0.85, 0.15, 0.15];
            end
            if ~isempty(obj.log_mode_dropdown) && isvalid(obj.log_mode_dropdown)
                obj.log_mode_dropdown.Enable = 'off';
            end
            if ~isempty(obj.log_duration_field) && isvalid(obj.log_duration_field)
                obj.log_duration_field.Enable = 'off';
            end
            if ~isempty(obj.log_dir_field) && isvalid(obj.log_dir_field)
                obj.log_dir_field.Enable = 'off';
            end
            if ~isempty(obj.log_prefix_field) && isvalid(obj.log_prefix_field)
                obj.log_prefix_field.Enable = 'off';
            end
            if ~isempty(obj.btn_log_browse) && isvalid(obj.btn_log_browse)
                obj.btn_log_browse.Enable = 'off';
            end
            if ~isempty(obj.lbl_log_status) && isvalid(obj.lbl_log_status)
                if obj.is_timed_logging
                    obj.lbl_log_status.Text = sprintf('Status: Logging (Timed %.1fs)', obj.log_duration);
                else
                    obj.lbl_log_status.Text = 'Status: Logging (Manual)';
                end
                obj.lbl_log_status.FontColor = [1.0, 0.85, 0.2];
            end
            if ~isempty(obj.lbl_log_samples) && isvalid(obj.lbl_log_samples)
                obj.lbl_log_samples.Text = 'Samples: 0';
            end
            if ~isempty(obj.lbl_log_elapsed) && isvalid(obj.lbl_log_elapsed)
                obj.lbl_log_elapsed.Text = 'Elapsed: 0.0 s';
            end
            if ~isempty(obj.lbl_log_file) && isvalid(obj.lbl_log_file)
                obj.lbl_log_file.Text = sprintf('File: %s', filename);
                obj.lbl_log_file.Tooltip = full_path;
            end
        end

        function stop_csv_logging(obj)
            if obj.log_fid > 0
                try
                    fclose(obj.log_fid);
                catch
                end
                obj.log_fid = -1;
            end
            obj.is_logging = false;
            if ~isempty(obj.btn_log_toggle) && isvalid(obj.btn_log_toggle)
                obj.btn_log_toggle.Text = 'START LOGGING';
                obj.btn_log_toggle.BackgroundColor = [0.18, 0.55, 0.25];
            end
            if ~isempty(obj.log_mode_dropdown) && isvalid(obj.log_mode_dropdown)
                obj.log_mode_dropdown.Enable = 'on';
            end
            if ~isempty(obj.log_duration_field) && isvalid(obj.log_duration_field)
                obj.log_duration_field.Enable = 'on';
            end
            if ~isempty(obj.log_dir_field) && isvalid(obj.log_dir_field)
                obj.log_dir_field.Enable = 'on';
            end
            if ~isempty(obj.log_prefix_field) && isvalid(obj.log_prefix_field)
                obj.log_prefix_field.Enable = 'on';
            end
            if ~isempty(obj.btn_log_browse) && isvalid(obj.btn_log_browse)
                obj.btn_log_browse.Enable = 'on';
            end
            if ~isempty(obj.lbl_log_status) && isvalid(obj.lbl_log_status)
                obj.lbl_log_status.Text = 'Status: Stopped / Saved';
                obj.lbl_log_status.FontColor = [0.4, 1.0, 0.4];
            end
        end

        function log_telemetry_sample(obj, telem, th1, th2)
            if ~obj.is_logging || obj.log_fid <= 0
                return;
            end
            elapsed = toc(obj.log_start_time);
            if obj.is_timed_logging && elapsed >= obj.log_duration
                obj.stop_csv_logging();
                if ~isempty(obj.lbl_log_status) && isvalid(obj.lbl_log_status)
                    obj.lbl_log_status.Text = 'Status: Timed Done / Saved';
                end
                return;
            end
            
            try
                % Timestamp
                ts = char(datetime('now', 'Format', 'yyyy-MM-dd HH:mm:ss.SSS'));
                
                % Extract Motor 1 telemetry
                m1_vel = 0; m1_cur = 0; m1_tor = 0; m1_volt = 0; m1_temp = 0; m1_fc = 0; m1_fstr = 'OK';
                if isfield(telem, 'm1') && ~isempty(telem.m1)
                    if isfield(telem.m1, 'velocity'), m1_vel = telem.m1.velocity; end
                    if isfield(telem.m1, 'current'), m1_cur = telem.m1.current; end
                    if isfield(telem.m1, 'torque'), m1_tor = telem.m1.torque; end
                    if isfield(telem.m1, 'voltage'), m1_volt = telem.m1.voltage; end
                    if isfield(telem.m1, 'temperature'), m1_temp = telem.m1.temperature; end
                    if isfield(telem.m1, 'fault_code'), m1_fc = telem.m1.fault_code; end
                    if isfield(telem.m1, 'fault_str'), m1_fstr = telem.m1.fault_str; end
                end
                
                % Extract Motor 2 telemetry
                m2_vel = 0; m2_cur = 0; m2_tor = 0; m2_volt = 0; m2_temp = 0; m2_fc = 0; m2_fstr = 'OK';
                if isfield(telem, 'm2') && ~isempty(telem.m2)
                    if isfield(telem.m2, 'velocity'), m2_vel = telem.m2.velocity; end
                    if isfield(telem.m2, 'current'), m2_cur = telem.m2.current; end
                    if isfield(telem.m2, 'torque'), m2_tor = telem.m2.torque; end
                    if isfield(telem.m2, 'voltage'), m2_volt = telem.m2.voltage; end
                    if isfield(telem.m2, 'temperature'), m2_temp = telem.m2.temperature; end
                    if isfield(telem.m2, 'fault_code'), m2_fc = telem.m2.fault_code; end
                    if isfield(telem.m2, 'fault_str'), m2_fstr = telem.m2.fault_str; end
                end
                
                % Sanitize fault strings
                f1_str = regexprep(char(string(m1_fstr)), '[,"]', ';');
                f2_str = regexprep(char(string(m2_fstr)), '[,"]', ';');
                
                % Calculate Forward Kinematics End-Effector XY
                if ~isempty(obj.arm) && ismethod(obj.arm, 'forward_kinematics')
                    try
                        [ee_x, ee_y] = obj.arm.forward_kinematics(th1, th2);
                    catch
                        elbow_x = -obj.L1 * sin(th1);
                        elbow_y = -obj.L1 * cos(th1);
                        ee_x = elbow_x - obj.L2 * sin(th1 + th2);
                        ee_y = elbow_y - obj.L2 * cos(th1 + th2);
                    end
                else
                    elbow_x = -obj.L1 * sin(th1);
                    elbow_y = -obj.L1 * cos(th1);
                    ee_x = elbow_x - obj.L2 * sin(th1 + th2);
                    ee_y = elbow_y - obj.L2 * cos(th1 + th2);
                end
                
                % Write row: 24 dynamic telemetry + 26 static parameters
                fprintf(obj.log_fid, '%s,%.3f,%.4f,%.2f,%.3f,%.2f,%.3f,%.3f,%.2f,%.1f,%d,%s,%.4f,%.2f,%.3f,%.2f,%.3f,%.3f,%.2f,%.1f,%d,%s,%.2f,%.2f,%s\n', ...
                    ts, elapsed, ...
                    th1, th1 * (180 / pi), m1_vel, m1_vel * (180 / pi), m1_cur, m1_tor, m1_volt, m1_temp, m1_fc, f1_str, ...
                    th2, th2 * (180 / pi), m2_vel, m2_vel * (180 / pi), m2_cur, m2_tor, m2_volt, m2_temp, m2_fc, f2_str, ...
                    ee_x, ee_y, ...
                    obj.log_static_params_str);
                
                obj.log_sample_count = obj.log_sample_count + 1;
                if ~isempty(obj.lbl_log_samples) && isvalid(obj.lbl_log_samples)
                    obj.lbl_log_samples.Text = sprintf('Samples: %d', obj.log_sample_count);
                end
                if ~isempty(obj.lbl_log_elapsed) && isvalid(obj.lbl_log_elapsed)
                    obj.lbl_log_elapsed.Text = sprintf('Elapsed: %.1f s', elapsed);
                end
            catch
            end
        end
    end

    methods (Access = private)

        function build_oscilloscope(obj)
            % Construct 2-column layout: left column for uiaxes ('1x'), right column for channel controls (150px)
            og = uigridlayout(obj.osc_panel, [1, 2]);
            og.ColumnWidth = {'1x', 150};
            og.RowHeight = {'1x'};
            og.Padding = [8, 6, 8, 6];
            og.ColumnSpacing = 8;
            og.BackgroundColor = [0.13, 0.13, 0.16];

            % --- Left Column: Oscilloscope Axes ---
            obj.osc_ax = uiaxes(og);
            obj.osc_ax.Layout.Row = 1;
            obj.osc_ax.Layout.Column = 1;
            obj.osc_ax.Color = [0.10, 0.10, 0.10];
            obj.osc_ax.XColor = [0.65, 0.65, 0.65];
            obj.osc_ax.YColor = [0.65, 0.65, 0.65];
            obj.osc_ax.GridColor = [0.35, 0.35, 0.35];
            obj.osc_ax.GridAlpha = 0.5;
            grid(obj.osc_ax, 'on');
            hold(obj.osc_ax, 'on');
            xlabel(obj.osc_ax, 'Samples (200 @ 25Hz, -8s to 0s)', 'Color', [0.8, 0.8, 0.8], 'FontSize', 10);
            ylabel(obj.osc_ax, 'Value', 'Color', [0.8, 0.8, 0.8], 'FontSize', 10);
            obj.osc_ax.XLim = [1, 200];
            obj.osc_ax.XLimMode = 'manual';
            obj.osc_ax.XTick = [1, 50, 100, 150, 200];
            obj.osc_ax.XTickLabel = {'-8s', '-6s', '-4s', '-2s', '0s'};

            % Restrict mouse scroll zoom and drag pan strictly to Y axis (X axis constant)
            obj.osc_ax.Interactions = [zoomInteraction('Dimensions', 'y'), panInteraction('Dimensions', 'y')];
            axtoolbar(obj.osc_ax, {'zoomin', 'zoomout', 'pan', 'restoreview'});

            % Enforce constant X limits via post-set listener
            obj.osc_xlim_listener = addlistener(obj.osc_ax, 'XLim', 'PostSet', @(~,~) obj.enforce_osc_xlim());

            % Distinct bright colors for 6 channels
            colors = [
                0.00, 0.85, 1.00; ... % Ch 1: Bright Cyan
                1.00, 0.55, 0.10; ... % Ch 2: Bright Orange
                0.25, 1.00, 0.40; ... % Ch 3: Lime Green
                1.00, 0.95, 0.20; ... % Ch 4: Bright Yellow
                1.00, 0.35, 0.85; ... % Ch 5: Magenta Pink
                1.00, 0.40, 0.40      % Ch 6: Coral Red
            ];

            % Initialize 6x200 history buffer and 6 line plots
            obj.osc_buffers = zeros(6, 200);
            obj.osc_buffer_idx = 200;
            obj.osc_lines = gobjects(1, 6);
            for ch = 1:6
                obj.osc_lines(ch) = plot(obj.osc_ax, 1:200, obj.osc_buffers(ch, :), ...
                    '-', 'Color', colors(ch, :), 'LineWidth', 1.5, ...
                    'DisplayName', sprintf('CH%d', ch));
            end

            % --- Right Column: 6 Channel Selectors ---
            ctrl_grid = uigridlayout(og, [6, 2]);
            ctrl_grid.Layout.Row = 1;
            ctrl_grid.Layout.Column = 2;
            ctrl_grid.ColumnWidth = {36, '1x'};
            ctrl_grid.RowHeight = {'1x', '1x', '1x', '1x', '1x', '1x'};
            ctrl_grid.Padding = [2, 4, 2, 4];
            ctrl_grid.RowSpacing = 4;
            ctrl_grid.ColumnSpacing = 4;
            ctrl_grid.BackgroundColor = [0.13, 0.13, 0.16];

            channel_options = { ...
                'None', ...
                'M1 Position', 'M1 Velocity', 'M1 Current', 'M1 Torque', 'M1 Voltage', 'M1 Temp', ...
                'M2 Position', 'M2 Velocity', 'M2 Current', 'M2 Torque', 'M2 Voltage', 'M2 Temp' ...
            };

            defaults = { ...
                'M1 Position', ...
                'M2 Position', ...
                'M1 Velocity', ...
                'M2 Velocity', ...
                'M1 Current', ...
                'M2 Current' ...
            };

            obj.osc_dropdowns = gobjects(1, 6);
            for ch = 1:6
                lbl = uilabel(ctrl_grid);
                lbl.Layout.Row = ch;
                lbl.Layout.Column = 1;
                lbl.Text = sprintf('CH%d', ch);
                lbl.FontColor = colors(ch, :);
                lbl.FontWeight = 'bold';
                lbl.FontSize = 10;
                lbl.VerticalAlignment = 'center';

                dd = uidropdown(ctrl_grid);
                dd.Layout.Row = ch;
                dd.Layout.Column = 2;
                dd.Items = channel_options;
                dd.Value = defaults{ch};
                dd.BackgroundColor = [0.18, 0.18, 0.22];
                dd.FontColor = [1.0, 1.0, 1.0];
                dd.FontSize = 10;
                obj.osc_dropdowns(ch) = dd;
            end
        end

        function enforce_osc_xlim(obj)
            try
                if ~isempty(obj.osc_ax) && isgraphics(obj.osc_ax)
                    if ~isequal(obj.osc_ax.XLim, [1, 200])
                        obj.osc_ax.XLim = [1, 200];
                    end
                end
            catch
            end
        end
    end

    methods
        function update_oscilloscope(obj, telem)
            try
                if isempty(obj.osc_lines) || isempty(obj.osc_dropdowns)
                    return;
                end
                
                for ch = 1:6
                    if ch > length(obj.osc_dropdowns) || ~isgraphics(obj.osc_dropdowns(ch))
                        continue;
                    end
                    if ch > length(obj.osc_lines) || ~isgraphics(obj.osc_lines(ch))
                        continue;
                    end
                    
                    sel = obj.osc_dropdowns(ch).Value;
                    val = NaN;
                    
                    switch sel
                        case 'M1 Position'
                            if isfield(telem, 'm1') && isfield(telem.m1, 'position')
                                val = telem.m1.position;
                            end
                        case 'M1 Velocity'
                            if isfield(telem, 'm1') && isfield(telem.m1, 'velocity')
                                val = telem.m1.velocity;
                            end
                        case 'M1 Current'
                            if isfield(telem, 'm1') && isfield(telem.m1, 'current')
                                val = telem.m1.current;
                            end
                        case 'M1 Torque'
                            if isfield(telem, 'm1') && isfield(telem.m1, 'torque')
                                val = telem.m1.torque;
                            end
                        case 'M1 Voltage'
                            if isfield(telem, 'm1') && isfield(telem.m1, 'voltage')
                                val = telem.m1.voltage;
                            end
                        case 'M1 Temp'
                            if isfield(telem, 'm1') && isfield(telem.m1, 'temperature')
                                val = telem.m1.temperature;
                            end
                        case 'M2 Position'
                            if isfield(telem, 'm2') && isfield(telem.m2, 'position')
                                val = telem.m2.position;
                            end
                        case 'M2 Velocity'
                            if isfield(telem, 'm2') && isfield(telem.m2, 'velocity')
                                val = telem.m2.velocity;
                            end
                        case 'M2 Current'
                            if isfield(telem, 'm2') && isfield(telem.m2, 'current')
                                val = telem.m2.current;
                            end
                        case 'M2 Torque'
                            if isfield(telem, 'm2') && isfield(telem.m2, 'torque')
                                val = telem.m2.torque;
                            end
                        case 'M2 Voltage'
                            if isfield(telem, 'm2') && isfield(telem.m2, 'voltage')
                                val = telem.m2.voltage;
                            end
                        case 'M2 Temp'
                            if isfield(telem, 'm2') && isfield(telem.m2, 'temperature')
                                val = telem.m2.temperature;
                            end
                        case 'None'
                            val = NaN;
                    end
                    
                    % Append to history buffer: shift left by 1, insert at end
                    obj.osc_buffers(ch, 1:end-1) = obj.osc_buffers(ch, 2:end);
                    obj.osc_buffers(ch, end) = val;
                    
                    % Update YData of corresponding osc_lines
                    set(obj.osc_lines(ch), 'YData', obj.osc_buffers(ch, :));
                    if strcmp(sel, 'None')
                        set(obj.osc_lines(ch), 'Visible', 'off');
                    else
                        set(obj.osc_lines(ch), 'Visible', 'on');
                    end
                end
                
                obj.osc_buffer_idx = mod(obj.osc_buffer_idx, 200) + 1;
            catch
                return;
            end
        end
    end
end

