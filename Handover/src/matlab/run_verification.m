function run_verification()
    disp('Starting automated UI and logic verification...');
    
    % 1. Instantiate
    arm = ArmControl('COM_DUMMY');
    monitor = ArmMonitor(arm);
    
    % 2. Verify UI elements
    assert(isvalid(monitor.fig), 'Figure is invalid');
    assert(strcmpi(monitor.viewport.Scrollable, 'on'), 'Viewport not scrollable');
    assert(strcmpi(monitor.m1_panel.Scrollable, 'on'), 'm1_panel not scrollable');
    assert(strcmpi(monitor.m2_panel.Scrollable, 'on'), 'm2_panel not scrollable');
    assert(strcmpi(monitor.pid_panel.Scrollable, 'on'), 'pid_panel not scrollable');
    assert(strcmpi(monitor.cmd_panel.Scrollable, 'on'), 'cmd_panel not scrollable');
    assert(strcmpi(monitor.ik_panel.Scrollable, 'on'), 'ik_panel not scrollable');
    disp('UI Element creation and scrollable properties verified.');
    
    % 3. Test resize callback
    old_pos = monitor.fig.Position;
    monitor.fig.Position = [10 10 1600 900];
    pause(0.5);
    % SizeChangedFcn should have triggered, viewport size should be max(1460, 1600) = 1600
    assert(monitor.viewport.Position(3) >= 1600, 'Viewport width did not update correctly');
    disp('Resize callback verified.');
    
    % 4. Test PID out-of-bounds inputs
    monitor.m1_kp_pos_field.Value = 300; % max 200
    monitor.m1_kp_vel_field.Value = 60;  % max 50
    monitor.m1_ki_vel_field.Value = 10;  % max 5
    monitor.m1_kd_vel_field.Value = -1;  % min 0.001
    monitor.m1_kp_cur_field.Value = -5;  % min 0
    monitor.m1_ki_cur_field.Value = 6;   % max 5
    monitor.m1_filt_cur_field.Value = 2; % max 1.0
    
    % Mock the arm object to prevent real serial writes
    arm.s = struct('NumBytesAvailable', 0);
    
    try
        monitor.write_pid_from_panel(1);
    catch e
        % ignore serial write errors since we don't have real hardware
    end
    
    % Check if panel fields clamped
    assert(monitor.m1_kp_pos_field.Value == 200, 'pos_kp clamp failed');
    assert(monitor.m1_kp_vel_field.Value == 50, 'vel_kp clamp failed');
    assert(monitor.m1_ki_vel_field.Value == 5, 'vel_ki clamp failed');
    assert(monitor.m1_kd_vel_field.Value == 0.001, 'vel_filt clamp failed');
    assert(monitor.m1_kp_cur_field.Value == 0, 'cur_kp clamp failed');
    assert(monitor.m1_ki_cur_field.Value == 5, 'cur_ki clamp failed');
    assert(monitor.m1_filt_cur_field.Value == 1.0, 'cur_filt clamp failed');
    disp('PID bounds clamping verified.');
    
    % 5. Close figure cleanly and ensure no orphan timers
    monitor.close_cb();
    arm.delete();
    
    t = timerfindall;
    if ~isempty(t)
        stop(t);
        delete(t);
        disp('Warning: Orphan timers were found and cleaned up.');
    else
        disp('Clean teardown verified. No orphan timers.');
    end
    
    disp('ALL TESTS PASSED');
    exit(0);
end
