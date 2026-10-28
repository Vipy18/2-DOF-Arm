function test_armmonitor_layout()
    disp('Starting ArmMonitor layout test...');

    % 1. Create dummy/mock ArmControl
    arm = ArmControl('COM_TEST_OFFLINE');

    % 2. Instantiate ArmMonitor
    monitor = ArmMonitor(arm);

    % 3. Check figure validity
    assert(isvalid(monitor.fig), 'Figure is not valid');

    % 4. Check property existence
    assert(isprop(monitor, 'cmd_panel'), 'cmd_panel property missing');
    assert(isprop(monitor, 'ik_panel'), 'ik_panel property missing');
    assert(~isprop(monitor, 'ctrl_panel'), 'ctrl_panel property should be removed');
    assert(isprop(monitor, 'm1_target_field'), 'm1_target_field missing');
    assert(isprop(monitor, 'm2_target_field'), 'm2_target_field missing');
    assert(isprop(monitor, 'shortest_path_chk'), 'shortest_path_chk property missing');
    assert(isprop(monitor, 'ik_traj_dropdown'), 'ik_traj_dropdown property missing');
    assert(isprop(monitor, 'ik_spd_field'), 'ik_spd_field property missing');
    assert(isprop(monitor, 'ik_acc_field'), 'ik_acc_field property missing');
    assert(isprop(monitor, 'btn_ik_preview'), 'btn_ik_preview property missing');
    assert(isprop(monitor, 'btn_ik_exec'), 'btn_ik_exec property missing');
    assert(isprop(monitor, 'btn_ik_abort'), 'btn_ik_abort property missing');
    assert(isprop(monitor, 'h_traj_plot'), 'h_traj_plot property missing');
    assert(isprop(monitor, 'traj_timer'), 'traj_timer property missing');
    assert(isprop(monitor, 'active_traj'), 'active_traj property missing');
    assert(isprop(monitor, 'traj_step_idx'), 'traj_step_idx property missing');
    assert(isprop(monitor, 'log_panel'), 'log_panel property missing');
    assert(isprop(monitor, 'log_dir_field'), 'log_dir_field property missing');
    assert(isprop(monitor, 'btn_log_browse'), 'btn_log_browse property missing');
    assert(isprop(monitor, 'log_prefix_field'), 'log_prefix_field property missing');
    assert(isprop(monitor, 'log_mode_dropdown'), 'log_mode_dropdown property missing');
    assert(isprop(monitor, 'log_duration_field'), 'log_duration_field property missing');
    assert(isprop(monitor, 'btn_log_toggle'), 'btn_log_toggle property missing');
    assert(isprop(monitor, 'lbl_log_status'), 'lbl_log_status property missing');
    assert(isprop(monitor, 'lbl_log_samples'), 'lbl_log_samples property missing');
    assert(isprop(monitor, 'lbl_log_elapsed'), 'lbl_log_elapsed property missing');
    assert(isprop(monitor, 'lbl_log_file'), 'lbl_log_file property missing');
    assert(isprop(monitor, 'btn_log_open_folder'), 'btn_log_open_folder property missing');
    disp('Properties verified.');

    % 5. Check UI panel validity & scrollable
    assert(isvalid(monitor.cmd_panel), 'cmd_panel handle invalid');
    assert(isvalid(monitor.ik_panel), 'ik_panel handle invalid');
    assert(isvalid(monitor.osc_panel), 'osc_panel handle invalid');
    assert(isvalid(monitor.pid_panel), 'pid_panel handle invalid');
    assert(isvalid(monitor.limits_panel), 'limits_panel handle invalid');
    assert(isvalid(monitor.viz_panel), 'viz_panel handle invalid');
    assert(isvalid(monitor.m1_panel), 'm1_panel handle invalid');
    assert(isvalid(monitor.m2_panel), 'm2_panel handle invalid');
    assert(isvalid(monitor.log_panel), 'log_panel handle invalid');

    main_grid = monitor.osc_panel.Parent;
    assert(strcmpi(monitor.cmd_panel.Scrollable, 'off'), 'cmd_panel should not be scrollable');
    assert(strcmpi(monitor.ik_panel.Scrollable, 'off'), 'ik_panel should not be scrollable');
    assert(strcmpi(monitor.pid_panel.Scrollable, 'off'), 'pid_panel should not be scrollable');
    assert(strcmpi(monitor.limits_panel.Scrollable, 'off'), 'limits_panel should not be scrollable');
    assert(strcmpi(monitor.log_panel.Scrollable, 'off'), 'log_panel should not be scrollable');
    assert(isequal(monitor.m1_panel.Parent.RowHeight, {320, 290}), 'body_grid RowHeight should be {320, 290}');
    assert(isequal(monitor.m1_panel.Parent.ColumnWidth, {240, '1x', 270, 290, 260}), 'body_grid ColumnWidth should be {240, ''1x'', 270, 290, 260}');
    disp('Panels verified.');

    % 6. Check layout positions
    assert(monitor.m1_panel.Layout.Row == 1 && monitor.m1_panel.Layout.Column == 1, 'm1_panel should be in Row 1, Column 1');
    assert(monitor.m2_panel.Layout.Row == 2 && monitor.m2_panel.Layout.Column == 1, 'm2_panel should be in Row 2, Column 1');
    assert(isequal(monitor.viz_panel.Layout.Row, [1 2]) && monitor.viz_panel.Layout.Column == 2, 'viz_panel should be in Row [1 2], Column 2');
    assert(monitor.cmd_panel.Layout.Row == 1 && monitor.cmd_panel.Layout.Column == 3, 'cmd_panel should be in Row 1, Column 3');
    assert(monitor.ik_panel.Layout.Row == 2 && monitor.ik_panel.Layout.Column == 3, 'ik_panel should be in Row 2, Column 3');
    assert(monitor.pid_panel.Layout.Row == 1 && monitor.pid_panel.Layout.Column == 4, 'pid_panel should be in Row 1, Column 4');
    assert(monitor.limits_panel.Layout.Row == 2 && monitor.limits_panel.Layout.Column == 4, 'limits_panel should be in Row 2, Column 4');
    assert(isequal(monitor.log_panel.Layout.Row, [1 2]) && monitor.log_panel.Layout.Column == 5, 'log_panel should be in Row [1 2], Column 5');
    assert(monitor.osc_panel.Layout.Row == 3 && monitor.osc_panel.Layout.Column == 1 && monitor.osc_panel.Parent == main_grid, 'osc_panel should be in Row 3 in main_grid');
    disp('Layout positions verified.');

    % Oscilloscope Y-only scrolling and constant X-axis verification
    assert(isvalid(monitor.osc_ax), 'osc_ax invalid');
    assert(isequal(monitor.osc_ax.XLim, [1, 200]), 'osc_ax XLim should be [1, 200]');
    assert(strcmp(monitor.osc_ax.XLimMode, 'manual'), 'osc_ax XLimMode should be manual');
    assert(strcmp(monitor.osc_ax.Interactions(1).Dimensions, 'y'), 'Zoom interaction should be restricted to y');
    assert(strcmp(monitor.osc_ax.Interactions(2).Dimensions, 'y'), 'Pan interaction should be restricted to y');
    monitor.osc_ax.XLim = [50, 150];
    assert(isequal(monitor.osc_ax.XLim, [1, 200]), 'osc_ax XLim should automatically stay constant at [1, 200]');
    disp('Oscilloscope Y-only scrolling verified.');

    % 7. Check cmd_panel elements and property aliases
    assert(monitor.m1_angle_field == monitor.m1_target_field, 'm1_angle_field should alias m1_target_field');
    assert(monitor.m2_angle_field == monitor.m2_target_field, 'm2_angle_field should alias m2_target_field');
    assert(isvalid(monitor.m1_speed_field), 'm1_speed_field invalid');
    assert(isvalid(monitor.m1_accel_field), 'm1_accel_field invalid');
    assert(isvalid(monitor.m2_speed_field), 'm2_speed_field invalid');
    assert(isvalid(monitor.m2_accel_field), 'm2_accel_field invalid');
    assert(isvalid(monitor.unit_dropdown), 'unit_dropdown invalid');
    assert(isvalid(monitor.btn_send_both), 'btn_send_both invalid');
    assert(isvalid(monitor.shortest_path_chk), 'shortest_path_chk invalid');
    assert(monitor.shortest_path_chk.Value == true, 'shortest_path_chk should default to true');
    disp('Command panel elements verified.');

    % 8. Check ik_panel elements
    assert(isvalid(monitor.ik_x_field), 'ik_x_field invalid');
    assert(isvalid(monitor.ik_y_field), 'ik_y_field invalid');
    assert(isvalid(monitor.ik_elbow_dropdown), 'ik_elbow_dropdown invalid');
    assert(isvalid(monitor.ik_traj_dropdown), 'ik_traj_dropdown invalid');
    assert(isvalid(monitor.ik_spd_field), 'ik_spd_field invalid');
    assert(isvalid(monitor.ik_acc_field), 'ik_acc_field invalid');
    assert(isvalid(monitor.ik_preview_chk), 'ik_preview_chk invalid');
    assert(isvalid(monitor.ik_lbl_status), 'ik_lbl_status invalid');
    assert(isvalid(monitor.ik_lbl_result), 'ik_lbl_result invalid');
    assert(isvalid(monitor.ik_lbl_fk), 'ik_lbl_fk invalid');
    assert(isvalid(monitor.btn_ik_preview), 'btn_ik_preview invalid');
    assert(isvalid(monitor.btn_ik_exec), 'btn_ik_exec invalid');
    assert(isvalid(monitor.btn_ik_abort), 'btn_ik_abort invalid');
    disp('IK panel elements verified.');

    % 8B. Check log_panel elements
    assert(isvalid(monitor.btn_log_toggle), 'btn_log_toggle invalid');
    assert(isvalid(monitor.log_dir_field), 'log_dir_field invalid');
    assert(isvalid(monitor.log_duration_field), 'log_duration_field invalid');
    assert(isvalid(monitor.btn_log_browse), 'btn_log_browse invalid');
    assert(isvalid(monitor.log_prefix_field), 'log_prefix_field invalid');
    assert(isvalid(monitor.log_mode_dropdown), 'log_mode_dropdown invalid');
    assert(isvalid(monitor.lbl_log_status), 'lbl_log_status invalid');
    assert(isvalid(monitor.lbl_log_samples), 'lbl_log_samples invalid');
    assert(isvalid(monitor.lbl_log_elapsed), 'lbl_log_elapsed invalid');
    assert(isvalid(monitor.lbl_log_file), 'lbl_log_file invalid');
    assert(isvalid(monitor.btn_log_open_folder), 'btn_log_open_folder invalid');
    disp('Log panel elements verified.');

    % 9. Test unit toggle callback
    monitor.unit_dropdown.Value = 'rad';
    monitor.update_unit_labels('rad');
    assert(contains(monitor.lbl_m1.Text, 'rad'), 'lbl_m1 unit not rad');
    monitor.unit_dropdown.Value = 'deg';
    monitor.update_unit_labels('deg');
    assert(contains(monitor.lbl_m1.Text, 'deg'), 'lbl_m1 unit not deg');
    disp('Unit label switching verified.');

    % 10. Test IK preview and trajectory planning calculation
    [init_th1, init_th2] = arm.inverse_kinematics(0, -500);
    arm.Telemetry.m1.position = init_th1;
    arm.Telemetry.m2.position = init_th2;
    monitor.ik_x_field.Value = 200;
    monitor.ik_y_field.Value = -400;
    monitor.solve_ik_preview();
    assert(contains(monitor.ik_lbl_status.Text, 'Path Valid'), 'Target (200, -400) should be a valid trajectory path');
    
    % Test out-of-reach target rejection in preview (within field limits [-700, 700], r = 919 mm > 700 mm)
    monitor.ik_x_field.Value = 650;
    monitor.ik_y_field.Value = 650;
    monitor.solve_ik_preview();
    assert(contains(monitor.ik_lbl_status.Text, 'out of reach') || contains(monitor.ik_lbl_status.Text, 'violates') || ...
           contains(monitor.ik_lbl_status.Text, 'failure') || contains(monitor.ik_lbl_status.Text, 'limit exceeded'), 'Target (650, 650) should fail preview');
    assert(isequal(monitor.ik_lbl_status.Tooltip, monitor.ik_lbl_status.Text), 'Tooltip should match error status text');
    assert(isempty(monitor.ik_lbl_result.Text), 'Result label should be empty on error');
    disp('IK preview calculation verified.');

    % 11. Test native DSP joint execution and streaming execution
    monitor.ik_x_field.Value = 200;
    monitor.ik_y_field.Value = -400;
    monitor.ik_traj_dropdown.Value = 'Joint Curve';
    monitor.execute_trajectory();
    assert(contains(monitor.ik_lbl_status.Text, 'Moving (Native 20kHz DSP)'), 'Joint execute should indicate Native 20kHz DSP');
    assert(isempty(monitor.traj_timer) || ~isvalid(monitor.traj_timer) || strcmp(monitor.traj_timer.Running, 'off'), 'Joint execute should not launch streaming timer');
    assert(~isempty(monitor.h_traj_plot) && isgraphics(monitor.h_traj_plot), 'Trajectory path should be plotted');
    
    % Test linear trajectory execution (launches streaming timer)
    monitor.ik_traj_dropdown.Value = 'Linear';
    monitor.execute_trajectory();
    assert(strcmp(monitor.ik_lbl_status.Text, 'Moving...'), 'Linear execute should indicate Moving...');
    assert(~isempty(monitor.traj_timer) && isvalid(monitor.traj_timer), 'Linear execute should launch traj_timer');
    monitor.abort_trajectory();
    assert(strcmp(monitor.ik_lbl_status.Text, 'Halted / Idle'), 'Abort should halt trajectory');
    disp('Trajectory execution verified.');

    % 12. Test control mode setting
    monitor.set_control_mode('position');
    disp('set_control_mode verified.');

    % 13. Test CSV Data Logging
    test_log_dir = fullfile(tempdir, sprintf('test_robstride_log_%s', char(datetime('now', 'Format', 'yyyyMMdd_HHmmss'))));
    monitor.log_dir_field.Value = test_log_dir;
    monitor.log_prefix_field.Value = 'test_telem';
    monitor.log_mode_dropdown.Value = 'Manual (Until Stopped)';
    monitor.start_csv_logging();

    assert(monitor.is_logging == true, 'is_logging should be true after start_csv_logging');
    assert(monitor.log_fid > 0, 'log_fid should be valid open file handle');
    assert(contains(monitor.btn_log_toggle.Text, 'STOP LOGGING'), 'Button text should change to STOP LOGGING');
    assert(exist(test_log_dir, 'dir') > 0, 'Log directory should be created');

    % Simulate telemetry updates to write samples
    for step = 1:5
        arm.Telemetry.m1.position = 0.1 * step;
        arm.Telemetry.m2.position = -0.1 * step;
        monitor.update();
    end

    assert(monitor.log_sample_count >= 5, 'Sample count should be at least 5 after updates');
    logged_file = monitor.log_current_file;
    assert(exist(logged_file, 'file') > 0, 'CSV log file should exist on disk');

    monitor.stop_csv_logging();
    assert(monitor.is_logging == false, 'is_logging should be false after stop');
    assert(monitor.log_fid == -1, 'log_fid should be -1 after stop');
    assert(contains(monitor.btn_log_toggle.Text, 'START LOGGING'), 'Button text should reset to START LOGGING');

    % Verify file content
    fid = fopen(logged_file, 'r');
    assert(fid > 0, 'Failed to open logged CSV file for verification');
    header_line = fgetl(fid);
    first_data_line = fgetl(fid);
    fclose(fid);

    expected_header_prefix = 'Timestamp,Elapsed_s,M1_Position_rad,M1_Position_deg';
    assert(startsWith(header_line, expected_header_prefix), 'CSV header does not match expected format');
    assert(contains(header_line, 'M1_Pos_Min_deg'), 'CSV header should contain M1_Pos_Min_deg');
    assert(contains(header_line, 'M1_Pos_Kp'), 'CSV header should contain M1_Pos_Kp');
    assert(contains(header_line, 'M2_Pos_Min_deg'), 'CSV header should contain M2_Pos_Min_deg');
    assert(contains(header_line, 'M2_Cur_Lim_A'), 'CSV header should contain M2_Cur_Lim_A');
    assert(contains(header_line, 'L1_mm,L2_mm'), 'CSV header should end with L1_mm,L2_mm');
    assert(ischar(first_data_line) && ~isempty(first_data_line), 'CSV file contains no data rows');
    cols = strsplit(first_data_line, ',');
    assert(numel(cols) == 50, sprintf('Expected 50 CSV columns (24 dynamic + 26 static), found %d', numel(cols)));
    assert(abs(str2double(cols{49}) - 400.0) < 1e-3, 'Expected L1_mm to be 400.0');
    assert(abs(str2double(cols{50}) - 300.0) < 1e-3, 'Expected L2_mm to be 300.0');
    assert(abs(str2double(cols{25}) - (-360.0)) < 1e-3, 'Expected M1_Pos_Min_deg to be -360.0');
    assert(abs(str2double(cols{26}) - 360.0) < 1e-3, 'Expected M1_Pos_Max_deg to be 360.0');
    assert(abs(str2double(cols{30}) - 40.0) < 1e-3, 'Expected M1_Pos_Kp to be 40.0');

    % Test Timed Logging mode trigger
    monitor.log_mode_dropdown.Value = 'Timed Duration';
    monitor.log_duration_field.Value = 0.1;
    monitor.start_csv_logging();
    assert(monitor.is_timed_logging == true, 'is_timed_logging should be true');
    pause(0.15);
    monitor.update();
    assert(monitor.is_logging == false, 'Timed logging should automatically stop after duration');
    assert(contains(monitor.lbl_log_status.Text, 'Saved'), 'Status should indicate Saved after timed duration');

    % Cleanup test directory
    if exist(test_log_dir, 'dir')
        rmdir(test_log_dir, 's');
    end
    disp('CSV logging verification passed.');

    % 14. Clean close
    monitor.close_cb();
    arm.delete();
    disp('ALL TESTS PASSED SUCCESSFULLY!');
end
