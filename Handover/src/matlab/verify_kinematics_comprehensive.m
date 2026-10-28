function verify_kinematics_comprehensive()
    % Comprehensive verification script for Robstride Kinematics Engine
    disp('--- Kinematics Verification Started ---');
    
    % Initialize pseudo-arm object for testing (mocking serial port)
    arm = ArmControl('COM_MOCK');
    L1 = arm.L1;
    L2 = arm.L2;
    
    %% 1. Kinematics Equations & Coordinate Frame Definition
    disp('1. Testing Zero-Position...');
    [x0, y0] = arm.forward_kinematics(0, 0);
    assert(abs(x0) < 1e-6 && abs(y0 - (- (L1 + L2))) < 1e-6, 'Zero-position test failed');
    
    disp('1. Testing Chirality (Clockwise Rotation)...');
    % 90 degrees (pi/2) should point to -X (9 o'clock)
    [x90, y90] = arm.forward_kinematics(pi/2, 0);
    assert(abs(x90 - (-(L1 + L2))) < 1e-6 && abs(y90) < 1e-6, 'Chirality test failed (90 deg CW)');
    
    %% 2. Full Workspace & Quadrant Numerical Stress Test
    disp('2. Running Full Workspace Stress Test (1000+ points)...');
    N_points = 1500;
    pass_count = 0;
    
    % Generate random points in annular workspace
    theta = 2*pi * rand(N_points, 1);
    r = (L1 - L2) + 1 + ((L1 + L2 - 2) - ((L1 - L2) + 1)) * sqrt(rand(N_points, 1)); % avoiding exact boundaries
    
    X_test = r .* cos(theta);
    Y_test = r .* sin(theta);
    
    for i = 1:N_points
        xt = X_test(i);
        yt = Y_test(i);
        
        % Test Elbow Up
        [th1_up, th2_up] = arm.inverse_kinematics(xt, yt, 'up');
        [x_up, y_up] = arm.forward_kinematics(th1_up, th2_up);
        err_up = norm([x_up - xt, y_up - yt]);
        assert(err_up < 1e-4, 'IK->FK mismatch for Elbow Up at (%.2f, %.2f). Err: %e', xt, yt, err_up);
        
        % Test Elbow Down
        [th1_dn, th2_dn] = arm.inverse_kinematics(xt, yt, 'down');
        [x_dn, y_dn] = arm.forward_kinematics(th1_dn, th2_dn);
        err_dn = norm([x_dn - xt, y_dn - yt]);
        assert(err_dn < 1e-4, 'IK->FK mismatch for Elbow Down at (%.2f, %.2f). Err: %e', xt, yt, err_dn);
        
        % Ensure Up and Down give different joint angles but same cartesian
        % Check that th2 has opposite signs (or one is exactly 0 but avoiding boundaries here)
        if abs(th2_up) > 1e-4
            assert(abs(th2_up - th2_dn) > 1e-4, 'Elbow Up and Down yielded same angles for inner point');
            assert(sign(th2_up) ~= sign(th2_dn), 'Elbow Up and Down should have opposite signs for th2');
        end
        pass_count = pass_count + 1;
    end
    fprintf('Stress Test Passed: %d/%d points.\n', pass_count, N_points);
    
    %% 3. Workspace Boundary & Singularity Verification
    disp('3. Testing Workspace Boundaries...');
    
    % Outer boundary
    R_max = L1 + L2;
    boundary_pts = [0, -R_max; R_max, 0; 0, R_max; -R_max, 0];
    for i = 1:size(boundary_pts, 1)
        [t1, t2] = arm.inverse_kinematics(boundary_pts(i,1), boundary_pts(i,2), 'up');
        assert(abs(t2) < 1e-4, 'Expected th2=0 at outer boundary');
        [xb, yb] = arm.forward_kinematics(t1, t2);
        assert(norm([xb - boundary_pts(i,1), yb - boundary_pts(i,2)]) < 1e-4, 'Outer boundary FK mismatch');
    end
    
    % Inner boundary
    R_min = abs(L1 - L2);
    [t1, t2] = arm.inverse_kinematics(0, -R_min, 'up');
    assert(abs(abs(t2) - pi) < 1e-4, 'Expected |th2|=pi at inner boundary');
    [xb, yb] = arm.forward_kinematics(t1, t2);
    assert(norm([xb - 0, yb - (-R_min)]) < 1e-4, 'Inner boundary FK mismatch');
    
    % Boundary rejection
    try
        arm.inverse_kinematics(0, -(R_max + 5), 'up');
        error('IK did not reject R > max');
    catch ME
        assert(strcmp(ME.identifier, 'ArmControl:IKOutOfReach'), 'Unexpected error ID for R > max');
    end
    try
        arm.inverse_kinematics(0, -(R_min - 10), 'up');
        error('IK did not reject R < min');
    catch ME
        assert(strcmp(ME.identifier, 'ArmControl:IKOutOfReach'), 'Unexpected error ID for R < min');
    end
    
    %% 4. Shortest-Path & Multi-Turn Navigation
    disp('4. Testing Shortest-Path Calculation...');
    % Manually set telemetry to test calculate_shortest_path
    arm.Telemetry.m1.position = 180 * pi/180; % Current +180
    res = arm.calculate_shortest_path(1, -90 * pi/180); % Target -90
    % wrap +180 to -90 -> delta is -270 -> unwrapped +90 CW -> +270
    assert(abs(res - 270 * pi/180) < 1e-4, 'Shortest path +180 to -90 failed');
    
    arm.Telemetry.m1.position = -180 * pi/180; % Current -180
    res = arm.calculate_shortest_path(1, 90 * pi/180); % Target +90
    % wrap -180 to +90 -> delta is +270 -> unwrapped -90 CCW -> -270
    assert(abs(res - (-270 * pi/180)) < 1e-4, 'Shortest path -180 to +90 failed');
    
    arm.Telemetry.m1.position = 0; 
    res = arm.calculate_shortest_path(1, 90 * pi/180);
    assert(abs(res - 90 * pi/180) < 1e-4, 'Shortest path 0 to +90 failed');
    
    arm.Telemetry.m1.position = 0; 
    res = arm.calculate_shortest_path(1, -90 * pi/180);
    assert(abs(res - (-90 * pi/180)) < 1e-4, 'Shortest path 0 to -90 failed');
    
    %% 5. Trajectory Planner Kinematics
    disp('5. Testing Trajectory Planner...');
    start_pt = [0, -500];
    target_pt = [200, -500];
    
    % Linear trajectory
    traj_lin = arm.plan_trajectory(start_pt, target_pt, 100, 100, 'linear', 'up', 0.04);
    assert(traj_lin.valid, 'Linear trajectory failed to plan: %s', traj_lin.error_msg);
    % Verify straight line
    max_y_dev = max(abs(traj_lin.y - (-500)));
    assert(max_y_dev < 1e-4, 'Linear trajectory deviated from straight line (max dev: %e)', max_y_dev);
    
    % Joint trajectory
    traj_jnt = arm.plan_trajectory(start_pt, target_pt, 100, 100, 'joint', 'up', 0.04);
    assert(traj_jnt.valid, 'Joint trajectory failed to plan');
    dth1 = diff(traj_jnt.th1);
    dth2 = diff(traj_jnt.th2);
    % Should be monotonic or no jumps > pi
    assert(max(abs(dth1)) < pi, 'Jump in th1 in joint trajectory');
    assert(max(abs(dth2)) < pi, 'Jump in th2 in joint trajectory');
    
    % Arch trajectory
    traj_arch = arm.plan_trajectory(start_pt, target_pt, 100, 100, 'arch', 'up', 0.04);
    assert(traj_arch.valid, 'Arch trajectory failed to plan');
    % Apex should reach +80 clearance height relative to linear interpolation
    y_apex = max(traj_arch.y);
    assert(abs(y_apex - (-420)) < 1e-1, 'Arch trajectory did not reach apex correctly. Apex: %e', y_apex);
    
    disp('--- ALL TESTS PASSED SUCCESSFULLY ---');
end
